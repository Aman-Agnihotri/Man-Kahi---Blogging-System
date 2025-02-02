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

/**
 * @swagger
 * components:
 *   schemas:
 *     RegisterInput:
 *       type: object
 *       required:
 *         - username
 *         - email
 *         - password
 *       properties:
 *         username:
 *           type: string
 *           minLength: 3
 *           maxLength: 50
 *           description: User's display name
 *         email:
 *           type: string
 *           format: email
 *           maxLength: 100
 *           description: User's email address
 *         password:
 *           type: string
 *           format: password
 *           minLength: 8
 *           maxLength: 100
 *           description: User's password (must contain uppercase, lowercase, and number)
 *     LoginInput:
 *       type: object
 *       required:
 *         - email
 *         - password
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *         password:
 *           type: string
 *           format: password
 *     AuthUser:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         username:
 *           type: string
 *         email:
 *           type: string
 *         roles:
 *           type: array
 *           items:
 *             type: string
 *     LoginResponse:
 *       type: object
 *       properties:
 *         token:
 *           type: string
 *         refreshToken:
 *           type: string
 *         user:
 *           $ref: '#/components/schemas/AuthUser'
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *         errors:
 *           type: array
 *           items:
 *             type: string
 *     AddRoleInput:
 *       type: object
 *       required:
 *         - userId
 *         - roleName
 *       properties:
 *         userId:
 *           type: string
 *         roleName:
 *           type: string
 */

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

/**
 * @swagger
 * /auth/register:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Register a new user
 *     description: Creates a new user account with the provided credentials
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterInput'
 *     responses:
 *       201:
 *         description: User successfully registered
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 username:
 *                   type: string
 *                 email:
 *                   type: string
 *       400:
 *         description: Invalid input data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: User already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
    '/register',
    createEndpointRateLimit('auth:register') as unknown as RequestHandler,
    trackAuthMetrics('register'),
    authController.register
);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Login user
 *     description: Authenticate user and return tokens
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginInput'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       400:
 *         description: Invalid input data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
    '/login',
    createEndpointRateLimit('auth:login') as unknown as RequestHandler,
    trackAuthMetrics('login'),
    authController.login
);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Logout user
 *     description: Invalidate the user's token
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully logged out
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: No token provided
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Invalid or expired token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
    '/logout',
    authenticate({ strategy: ['jwt'] }) as unknown as RequestHandler,
    createEndpointRateLimit('auth:logout') as unknown as RequestHandler,
    authController.logout
);

/**
 * @swagger
 * /auth/roles:
 *   post:
 *     tags:
 *       - Authorization
 *     summary: Add role to user
 *     description: Add a role to an existing user (Admin only)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AddRoleInput'
 *     responses:
 *       200:
 *         description: Role successfully added
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/AuthUser'
 *       400:
 *         description: Invalid input data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - Not an admin
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
    '/roles',
    authenticate({ strategy: ['jwt'], roles: ['admin'] }) as unknown as RequestHandler,
    createServiceRateLimit('admin') as unknown as RequestHandler,
    authController.addRole as RequestHandler
);

/**
 * @swagger
 * /auth/health:
 *   get:
 *     tags:
 *       - System
 *     summary: Health check endpoint
 *     description: Check the health status of the auth service
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 service:
 *                   type: string
 *                   example: auth
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 metrics:
 *                   type: object
 *                   properties:
 *                     memory:
 *                       type: object
 *                     redis:
 *                       type: string
 *       500:
 *         description: Service is unhealthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: error
 *                 service:
 *                   type: string
 *                   example: auth
 *                 error:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
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
