import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { authenticate } from '@shared/middlewares/auth';
import { createEndpointRateLimit, createServiceRateLimit } from '@shared/middlewares/rateLimit';
import { 
    trackAuthMetrics, 
    trackAuthError,
    trackRedisOperation
} from '../middlewares/metrics.middleware';
import { authMetrics } from '../config/metrics';
import type { RequestHandler } from 'express';

const router = Router();
const authController = new AuthController();

// Base rate limit for auth service with tracking
router.use((req, res, next) => {
    const serviceLimiter = createServiceRateLimit('auth');
    const redisTimer = trackRedisOperation('rate_limit');
    serviceLimiter(req, res, (err: any) => {
        redisTimer.end();
        if (err) {
            authMetrics.rateLimitHits.inc({ endpoint: 'service' });
            trackAuthError('rate_limit', 'service');
        }
        next(err);
    });
});

// Public routes with specific rate limiting
router.post(
    '/register',
    createEndpointRateLimit('auth:register') as unknown as RequestHandler,
    trackAuthMetrics('register'),
    authController.register
);

router.post(
    '/login',
    createEndpointRateLimit('auth:login') as unknown as RequestHandler,
    trackAuthMetrics('login'),
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
// Health check endpoint with metrics
router.get('/health', (req, res) => {
    // Track resource usage
    const used = process.memoryUsage();
    authMetrics.resourceUsage.set({ resource: 'memory', type: 'heapUsed' }, used.heapUsed);
    authMetrics.resourceUsage.set({ resource: 'memory', type: 'heapTotal' }, used.heapTotal);
    authMetrics.resourceUsage.set({ resource: 'memory', type: 'rss' }, used.rss);

    // Track Redis health
    const redisTimer = trackRedisOperation('health_check');
    const redis = require('@shared/config/redis').redis;
    redis.ping()
        .then(() => {
            redisTimer.end();
            res.json({ 
                status: 'ok', 
                service: 'auth',
                timestamp: new Date().toISOString(),
                metrics: {
                    memory: used,
                    redis: 'connected'
                }
            });
        })
        .catch((error: Error) => {
            redisTimer.end();
            trackAuthError('redis_health', 'health_check');
            res.status(500).json({ 
                status: 'error', 
                service: 'auth',
                error: 'Redis connection failed',
                timestamp: new Date().toISOString()
            });
        });
});

export default router;
