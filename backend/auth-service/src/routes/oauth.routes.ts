import { Router, Request, Response, NextFunction } from 'express';
import { passport } from '../controllers/passport.controller';
import { AuthService } from '../services/auth.service';
import logger from '@shared/utils/logger';
import { authenticate, AuthenticatedRequest } from '@shared/middlewares/auth';
import { createEndpointRateLimit } from '@shared/middlewares/rateLimit';
import type { RequestHandler } from 'express';

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

// Google OAuth routes with rate limiting
router.get(
    '/google',
    createEndpointRateLimit('auth:oauth') as unknown as RequestHandler,
    (req: Request, res: Response, next: NextFunction) => {
        const state = req.query.linkToken as string | undefined; // For account linking
        passport.authenticate('google', {
            scope: ['profile', 'email'],
            ...(state && { state }), // Pass token as state if linking account
        })(req, res, next);
    }
);

router.get(
    '/google/callback',
    createEndpointRateLimit('auth:oauth') as unknown as RequestHandler,
    passport.authenticate('google', { session: false }) as RequestHandler,
    ((async (req: OAuthRequest, res: Response) => {
        try {
            if (!req.user) {
                throw new Error('Authentication failed');
            }

            // Generate tokens
            const accessToken = await authService.generateToken(req.user.id);
            const refreshToken = await authService.generateRefreshToken(req.user.id);

            // For account linking, token is in authInfo
            const linkToken = req.authInfo?.token;

            // Redirect URL with tokens
            const frontendURL = process.env.FRONTEND_URL ?? 'http://localhost:3000';
            const params = new URLSearchParams({
                accessToken,
                refreshToken,
                ...(linkToken && { linkToken }),
            });

            res.redirect(`${frontendURL}/auth/callback?${params.toString()}`);
        } catch (error) {
            logger.error('OAuth callback error:', error);
            const frontendURL = process.env.FRONTEND_URL ?? 'http://localhost:3000';
            res.redirect(
                `${frontendURL}/auth/callback?error=Authentication failed`
            );
        }
    }) as unknown) as RequestHandler
);

// Link OAuth provider to existing account
router.post(
    '/link/:provider',
    authenticate({ strategy: ['jwt'] }) as unknown as RequestHandler,
    createEndpointRateLimit('auth:oauth:link') as unknown as RequestHandler,
    (async (req: AuthenticatedRequest, res: Response) => {
        try {
            const { provider } = req.params;
            const { token } = req.body;

            if (!token) {
                res.status(400).json({ message: 'Token is required' });
                return;
            }

            // Redirect to OAuth provider with token in state
            const authURL = `/auth/${provider}?linkToken=${token}`;
            res.json({ url: authURL });
        } catch (error) {
            logger.error('Link provider error:', error);
            res.status(500).json({ message: 'Failed to initiate provider linking' });
        }
    }) as unknown as RequestHandler
);

// Unlink OAuth provider from account
router.delete(
    '/unlink/:provider',
    authenticate({ strategy: ['jwt'] }) as unknown as RequestHandler,
    createEndpointRateLimit('auth:oauth:unlink') as unknown as RequestHandler,
    (async (req: AuthenticatedRequest, res: Response) => {
        try {
            const { provider } = req.params;
            const userId = req.user.id;

            await authService.unlinkProvider(userId, provider);
            res.json({ message: 'Provider unlinked successfully' });
        } catch (error) {
            logger.error('Unlink provider error:', error);
            res.status(500).json({ message: 'Failed to unlink provider' });
        }
    }) as unknown as RequestHandler
);

export { router as oauthRoutes };
