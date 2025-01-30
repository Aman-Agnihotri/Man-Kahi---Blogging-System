import { Router, Request, Response, NextFunction } from 'express';
import { passport } from '../controllers/passport.controller';
import { AuthService } from '../services/auth.service';
import logger from '@shared/utils/logger';
import { authenticate, AuthenticatedRequest } from '@shared/middlewares/auth';
import { createEndpointRateLimit } from '@shared/middlewares/rateLimit';
import type { RequestHandler } from 'express';
import { 
    trackAuthMetrics,
    trackAuthError,
    trackDbOperation,
    updateActiveTokens
} from '../middlewares/metrics.middleware';

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
    user?: OAuthUser;
    authInfo?: {
        token?: string;
    };
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
    createEndpointRateLimit('auth:oauth') as unknown as RequestHandler,
    trackAuthMetrics('oauth_initiate', 'google'),
    (req: Request, res: Response, next: NextFunction) => {
        const state = req.query.linkToken as string | undefined;
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
    createEndpointRateLimit('auth:oauth') as unknown as RequestHandler,
    passport.authenticate('google', { session: false }) as RequestHandler,
    ((async (req: OAuthRequest, res: Response) => {
        try {
            if (!req.user) {
                throw new Error('Authentication failed');
            }

            const dbTimer = trackDbOperation('select', 'oauth_users');
            const accessToken = await authService.generateToken(req.user.id);
            const refreshToken = await authService.generateRefreshToken(req.user.id);
            dbTimer.end();

            updateActiveTokens(1);

            const linkToken = req.authInfo?.token;
            const frontendURL = process.env.FRONTEND_URL ?? 'http://localhost:3000';
            const params = new URLSearchParams({
                accessToken,
                refreshToken,
                ...(linkToken && { linkToken }),
            });

            res.redirect(`${frontendURL}/auth/callback?${params.toString()}`);
        } catch (error) {
            logger.error('OAuth callback error:', error);
            trackAuthError('oauth_callback', 'google');
            const frontendURL = process.env.FRONTEND_URL ?? 'http://localhost:3000';
            res.redirect(
                `${frontendURL}/auth/callback?error=Authentication failed`
            );
        }
    }) as unknown) as RequestHandler
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
            const { provider } = req.params;
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
            logger.error('Link provider error:', error);
            trackAuthError('oauth_link', provider);
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
            const { provider } = req.params;
            trackAuthMetrics('oauth_unlink', provider);
            const userId = req.user.id;

            await authService.unlinkProvider(userId, provider);
            res.json({ message: 'Provider unlinked successfully' });
        } catch (error) {
            const { provider } = req.params;
            logger.error('Unlink provider error:', error);
            trackAuthError('oauth_unlink', provider);
            res.status(500).json({ message: 'Failed to unlink provider' });
        }
    }) as unknown as RequestHandler
);

export { router as oauthRoutes };
