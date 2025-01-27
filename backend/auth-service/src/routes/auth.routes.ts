import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { authenticate } from '@shared/middlewares/auth';
import { createEndpointRateLimit, createServiceRateLimit } from '@shared/middlewares/rateLimit';
import type { RequestHandler } from 'express';

const router = Router();
const authController = new AuthController();

// Base rate limit for auth service
router.use(createServiceRateLimit('auth') as unknown as RequestHandler);

// Public routes with specific rate limiting
router.post(
    '/register',
    createEndpointRateLimit('auth:register') as unknown as RequestHandler,
    authController.register
);

router.post(
    '/login',
    createEndpointRateLimit('auth:login') as unknown as RequestHandler,
    authController.login
);

// Protected routes
router.post(
    '/logout',
    authenticate({ strategy: ['jwt'] }) as unknown as RequestHandler,
    createEndpointRateLimit('auth:logout') as unknown as RequestHandler,
    authController.logout
);

// Admin only routes
router.post(
    '/roles',
    authenticate({ strategy: ['jwt'], roles: ['admin'] }) as unknown as RequestHandler,
    createServiceRateLimit('admin') as unknown as RequestHandler,
    authController.addRole as RequestHandler
);

// Health check endpoint
router.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'auth' });
});

export default router;
