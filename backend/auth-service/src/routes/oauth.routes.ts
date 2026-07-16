import { Router, Request, Response, NextFunction } from 'express';
import { passport } from '@controllers/passport.controller';
import { AuthService } from '@services/auth.service';
import logger from '@shared/utils/logger';
import { authenticate, AuthenticatedRequest, AuthenticatedUser } from '@shared/middlewares/auth';
import { createEndpointRateLimit } from '@shared/middlewares/rateLimit';
import { requireProviderConfigured } from '@config/oauth';
import type { RequestHandler } from 'express';
import {
    trackAuthMetrics,
    trackError
} from '@middlewares/metrics.middleware';
import { REFRESH_COOKIE_MAX_AGE_MS } from '@config/cookies';

/**
 * @swagger
 * components:
 *   schemas:
 *     OAuthUser:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         email:
 *           type: string
 *         profile:
 *           type: object
 *           properties:
 *             name:
 *               type: string
 *             picture:
 *               type: string
 *         provider:
 *           type: string
 *     OAuthLinkRequest:
 *       type: object
 *       required:
 *         - token
 *       properties:
 *         token:
 *           type: string
 *     OAuthLinkResponse:
 *       type: object
 *       properties:
 *         url:
 *           type: string
 *           description: URL to redirect to for OAuth provider authentication
 *     OAuthCallbackResponse:
 *       type: object
 *       properties:
 *         accessToken:
 *           type: string
 *         refreshToken:
 *           type: string
 *         linkToken:
 *           type: string
 *           description: Only present when linking accounts
 */

interface OAuthUser {
    id: string;
    email: string;
    profile: {
        name?: string;
        picture?: string;
    };
    provider: string;
}

interface OAuthRequest extends Request {
    user?: AuthenticatedUser;
    authInfo?: {
        token?: string;
        refreshToken?: string;
        oauthProfile?: OAuthUser;
    };
}

/**
 * Maps a strategy-thrown error (see passport.controller.ts) to a stable,
 * frontend-facing error code. Unknown/unmapped messages fall back to
 * 'oauth_failed' so the frontend never has to render a raw error string.
 */
function mapOAuthErrorToCode(err: unknown): string {
    const message = err instanceof Error ? err.message : undefined;
    switch (message) {
        case 'Account exists with different credentials':
            return 'email_exists';
        case 'Email mismatch between accounts':
            return 'email_mismatch';
        case 'Provider already linked to this account':
            return 'provider_already_linked';
        case 'Invalid token':
            return 'invalid_link_token';
        case 'User not found':
            return 'user_not_found';
        case 'Email not provided by OAuth provider':
            return 'email_missing';
        default:
            return 'oauth_failed';
    }
}

const router = Router();
const authService = new AuthService();

/**
 * @swagger
 * /oauth/google:
 *   get:
 *     tags:
 *       - OAuth
 *     summary: Initiate Google OAuth flow
 *     description: Redirects to Google login page for authentication
 *     parameters:
 *       - in: query
 *         name: linkToken
 *         schema:
 *           type: string
 *         description: Optional token for linking existing account
 *     responses:
 *       302:
 *         description: Redirects to Google authentication page
 */
router.get(
    '/google',
    requireProviderConfigured('google'),
    createEndpointRateLimit('auth:oauth') as unknown as RequestHandler,
    trackAuthMetrics('oauth_initiate', 'google'),
    (req: Request, res: Response, next: NextFunction) => {
        const state = req.query['linkToken'] as string | undefined;
        passport.authenticate('google', {
            scope: ['profile', 'email'],
            ...(state && { state }),
        })(req, res, next);
    }
);

/**
 * @swagger
 * /oauth/google/callback:
 *   get:
 *     tags:
 *       - OAuth
 *     summary: Google OAuth callback
 *     description: Handles the callback from Google OAuth and creates/updates user
 *     responses:
 *       302:
 *         description: Redirects to frontend with tokens
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OAuthCallbackResponse'
 *       500:
 *         description: Authentication failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
    '/google/callback',
    requireProviderConfigured('google'),
    createEndpointRateLimit('auth:oauth') as unknown as RequestHandler,
    (req: Request, res: Response, next: NextFunction) =>
        (
            passport.authenticate(
                'google',
                { session: false },
                (async (err: unknown, user: any, info: OAuthRequest['authInfo']) => {
                    if (err) {
                        logger.error({ err }, 'OAuth strategy error');
                        trackError('oauth', 'callback_failed', 'google');
                        const frontendURL = process.env['FRONTEND_URL'] ?? 'http://localhost:3000';
                        res.redirect(`${frontendURL}/auth/callback?error=${mapOAuthErrorToCode(err)}`);
                        return;
                    }

                    if (!user) {
                        const frontendURL = process.env['FRONTEND_URL'] ?? 'http://localhost:3000';
                        res.redirect(`${frontendURL}/auth/callback?error=oauth_failed`);
                        return;
                    }

                    try {
                        const oauthProfile = info?.oauthProfile;
                        const refreshToken = info?.refreshToken;

                        if (!oauthProfile || !user.id || !refreshToken) {
                            logger.error('OAuth callback missing profile or token');
                            trackError('oauth', 'callback_failed', 'google');
                            const frontendURL = process.env['FRONTEND_URL'] ?? 'http://localhost:3000';
                            res.redirect(`${frontendURL}/auth/callback?error=oauth_failed`);
                            return;
                        }

                        // Strategy already found-or-created the user and minted the token
                        // pair (single mint owner - passport.controller.ts). The callback
                        // only persists the OAuthProvider record and updates last login.
                        await authService.handleOAuthCallback(oauthProfile, {
                            accessToken: info?.token,
                            expiresAt: new Date(Date.now() + 3600 * 1000), // 1 hour from now
                            tokenType: 'Bearer',
                            scope: 'profile email',
                        }, user.id);

                        res.cookie('refresh_token', refreshToken, {
                            httpOnly: true,
                            secure: process.env['NODE_ENV'] === 'production',
                            sameSite: 'lax',
                            path: '/api/auth',
                            maxAge: REFRESH_COOKIE_MAX_AGE_MS,
                        });

                        const frontendURL = process.env['FRONTEND_URL'] ?? 'http://localhost:3000';
                        const isLink = Boolean(req.query['state']);
                        res.redirect(`${frontendURL}/auth/callback${isLink ? '?linked=google' : ''}`);
                    } catch (error) {
                        logger.error({ err: error }, 'OAuth callback error');
                        trackError('oauth', 'callback_failed', 'google');
                        const frontendURL = process.env['FRONTEND_URL'] ?? 'http://localhost:3000';
                        res.redirect(
                            `${frontendURL}/auth/callback?error=oauth_failed`
                        );
                    }
                }) as unknown as (err: unknown, user?: unknown, info?: unknown) => void
            ) as unknown as (req: Request, res: Response, next: NextFunction) => void
        )(req, res, next)
);

/**
 * @swagger
 * /oauth/link/{provider}:
 *   post:
 *     tags:
 *       - OAuth
 *     summary: Link OAuth provider to existing account
 *     description: Initiates the process of linking an OAuth provider to an existing account
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: provider
 *         required: true
 *         schema:
 *           type: string
 *           enum: [google]
 *         description: OAuth provider to link
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/OAuthLinkRequest'
 *     responses:
 *       200:
 *         description: Successfully initiated linking process
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OAuthLinkResponse'
 *       400:
 *         description: Token is required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
    '/link/:provider',
    authenticate({ strategy: ['jwt'] }) as unknown as RequestHandler,
    createEndpointRateLimit('auth:oauth:link') as unknown as RequestHandler,
    (async (req: AuthenticatedRequest, res: Response) => {
        try {
            const { provider } = req.params as { provider: string };
            trackAuthMetrics('oauth_link', provider);
            const { token } = req.body;

            if (!token) {
                res.status(400).json({ message: 'Token is required' });
                return;
            }

            const authURL = `/auth/${provider}?linkToken=${token}`;
            res.json({ url: authURL });
        } catch (error) {
            const { provider } = req.params;
            logger.error({ err: error }, 'Link provider error');
            trackError('oauth', 'link_failed', provider ?? 'unknown');
            res.status(500).json({ message: 'Failed to initiate provider linking' });
        }
    }) as unknown as RequestHandler
);

/**
 * @swagger
 * /oauth/unlink/{provider}:
 *   delete:
 *     tags:
 *       - OAuth
 *     summary: Unlink OAuth provider from account
 *     description: Removes the connection between an OAuth provider and the user's account
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: provider
 *         required: true
 *         schema:
 *           type: string
 *           enum: [google]
 *         description: OAuth provider to unlink
 *     responses:
 *       200:
 *         description: Provider successfully unlinked
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Failed to unlink provider
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete(
    '/unlink/:provider',
    authenticate({ strategy: ['jwt'] }) as unknown as RequestHandler,
    createEndpointRateLimit('auth:oauth:unlink') as unknown as RequestHandler,
    (async (req: AuthenticatedRequest, res: Response) => {
        try {
            const { provider } = req.params as { provider: string };
            trackAuthMetrics('oauth_unlink', provider);
            const userId = req.user.id;

            await authService.unlinkProvider(userId, provider);
            res.json({ message: 'Provider unlinked successfully' });
        } catch (error) {
            const { provider } = req.params;
            logger.error({ err: error }, 'Unlink provider error');
            trackError('oauth', 'unlink_failed', provider ?? 'unknown');
            if (error instanceof Error && error.message === 'Cannot unlink the only authentication method') {
                res.status(409).json({ message: 'Cannot unlink your only sign-in method. Set a password first.' });
                return;
            }
            res.status(500).json({ message: 'Failed to unlink provider' });
        }
    }) as unknown as RequestHandler
);

/**
 * @swagger
 * /oauth/providers:
 *   get:
 *     tags:
 *       - OAuth
 *     summary: List linked OAuth providers
 *     description: Returns the list of OAuth providers linked to the authenticated user's account
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of linked providers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 providers:
 *                   type: array
 *                   items:
 *                     type: string
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Failed to list linked providers
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
    '/providers',
    authenticate({ strategy: ['jwt'] }) as unknown as RequestHandler,
    createEndpointRateLimit('auth:oauth') as unknown as RequestHandler,
    (async (req: AuthenticatedRequest, res: Response) => {
        try {
            const providers = await authService.getLinkedProviders(req.user.id);
            res.json({ providers });
        } catch (error) {
            logger.error({ err: error }, 'List providers error');
            res.status(500).json({ message: 'Failed to list linked providers' });
        }
    }) as unknown as RequestHandler
);

export { router as oauthRoutes, mapOAuthErrorToCode };
