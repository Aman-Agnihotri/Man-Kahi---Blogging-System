import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller';
import { authenticate } from '@shared/middlewares/auth';
import { createServiceRateLimit } from '@shared/middlewares/rateLimit';
import type { RequestHandler } from 'express';
import { 
    trackAdminOperation,
    trackDashboardAccess,
    updateAdminSessions,
    trackRateLimit
} from '../middlewares/metrics.middleware';

/**
 * @swagger
 * components:
 *   schemas:
 *     DashboardStats:
 *       type: object
 *       properties:
 *         totalBlogs:
 *           type: integer
 *         totalUsers:
 *           type: integer
 *         analytics:
 *           type: object
 *           properties:
 *             views:
 *               type: integer
 *             uniqueVisitors:
 *               type: integer
 *             avgTimeOnSite:
 *               type: number
 *             bounceRate:
 *               type: number
 *     BlogAnalytics:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         views:
 *           type: integer
 *         uniqueViews:
 *           type: integer
 *         reads:
 *           type: integer
 *         readProgress:
 *           type: number
 *         linkClicks:
 *           type: integer
 *         shareCount:
 *           type: integer
 *         likes:
 *           type: integer
 *         comments:
 *           type: integer
 *         engagement:
 *           type: number
 *         deviceStats:
 *           type: object
 *         referrerStats:
 *           type: object
 *         timeSpentStats:
 *           type: object
 *     UserAnalytics:
 *       type: object
 *       properties:
 *         blogs:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *               title:
 *                 type: string
 *               analytics:
 *                 $ref: '#/components/schemas/BlogAnalytics'
 *     TrendingContent:
 *       type: array
 *       items:
 *         type: object
 *         properties:
 *           id:
 *             type: string
 *           title:
 *             type: string
 *           author:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *               username:
 *                 type: string
 *           analytics:
 *             $ref: '#/components/schemas/BlogAnalytics'
 *     TagAnalytics:
 *       type: array
 *       items:
 *         type: object
 *         properties:
 *           tag:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *               name:
 *                 type: string
 *           analytics:
 *             type: object
 *             properties:
 *               totalViews:
 *                 type: integer
 *               totalReads:
 *                 type: integer
 *               blogs:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/BlogAnalytics'
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *         details:
 *           type: string
 *         errors:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               field:
 *                 type: string
 *               message:
 *                 type: string
 */

const router = Router();
const adminController = new AdminController();

// Apply admin auth and rate limiting
// Track admin authentication
const adminAuthMiddleware: RequestHandler = (req, res, next) => {
    updateAdminSessions(1);
    res.on('finish', () => {
        if (res.statusCode >= 400) {
            updateAdminSessions(-1);
        }
    });
    next();
};

// Track rate limiting
const adminRateLimitMiddleware = createServiceRateLimit('admin');
const rateLimitMetricsMiddleware: RequestHandler = (req, res, next) => {
    res.on('finish', () => {
        if (res.statusCode === 429) {
            trackRateLimit('admin_service');
        }
    });
    next();
};

const adminMiddleware = [
    adminAuthMiddleware,
    authenticate({ roles: ['admin'] }) as unknown as RequestHandler,
    rateLimitMetricsMiddleware,
    adminRateLimitMiddleware as unknown as RequestHandler
];

router.use(adminMiddleware);

/**
 * @swagger
 * /admin/dashboard:
 *   get:
 *     tags:
 *       - Admin
 *     summary: Get dashboard statistics
 *     description: Retrieve overview statistics for the admin dashboard
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: timeframe
 *         schema:
 *           type: string
 *           enum: [1h, 24h, 7d, 30d, all]
 *           default: 24h
 *       - in: query
 *         name: dateRange
 *         schema:
 *           type: object
 *           properties:
 *             start:
 *               type: string
 *               format: date-time
 *             end:
 *               type: string
 *               format: date-time
 *     responses:
 *       200:
 *         description: Dashboard statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DashboardStats'
 *       401:
 *         description: Unauthorized - Not an admin
 *       502:
 *         description: Analytics service unavailable
 */
router.get(
    '/dashboard',
    trackDashboardAccess('overview'),
    adminController.getDashboardStats.bind(adminController)
);

/**
 * @swagger
 * /admin/analytics/blog/{blogId}:
 *   get:
 *     tags:
 *       - Admin
 *     summary: Get blog analytics
 *     description: Retrieve detailed analytics for a specific blog
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: blogId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: timeframe
 *         schema:
 *           type: string
 *           enum: [1h, 24h, 7d, 30d, all]
 *           default: 24h
 *     responses:
 *       200:
 *         description: Blog analytics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BlogAnalytics'
 *       404:
 *         description: Blog not found
 */
router.get(
    '/analytics/blog/:blogId',
    trackAdminOperation('get_blog_analytics'),
    adminController.getBlogAnalytics.bind(adminController)
);

/**
 * @swagger
 * /admin/analytics/user/{userId}:
 *   get:
 *     tags:
 *       - Admin
 *     summary: Get user analytics
 *     description: Retrieve analytics for all blogs of a specific user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: timeframe
 *         schema:
 *           type: string
 *           enum: [1h, 24h, 7d, 30d, all]
 *           default: 24h
 *     responses:
 *       200:
 *         description: User analytics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserAnalytics'
 *       404:
 *         description: User not found
 */
router.get(
    '/analytics/user/:userId',
    trackAdminOperation('get_user_analytics'),
    adminController.getUserAnalytics.bind(adminController)
);

/**
 * @swagger
 * /admin/analytics/trending:
 *   get:
 *     tags:
 *       - Admin
 *     summary: Get trending content
 *     description: Retrieve analytics for trending blog posts
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: timeframe
 *         schema:
 *           type: string
 *           enum: [1h, 24h, 7d, 30d, all]
 *           default: 24h
 *     responses:
 *       200:
 *         description: Trending content retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TrendingContent'
 */
router.get(
    '/analytics/trending',
    trackAdminOperation('get_trending_content'),
    adminController.getTrendingContent.bind(adminController)
);

/**
 * @swagger
 * /admin/analytics/tags:
 *   get:
 *     tags:
 *       - Admin
 *     summary: Get tag analytics
 *     description: Retrieve analytics grouped by tags
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: timeframe
 *         schema:
 *           type: string
 *           enum: [1h, 24h, 7d, 30d, all]
 *           default: 24h
 *     responses:
 *       200:
 *         description: Tag analytics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TagAnalytics'
 */
router.get(
    '/analytics/tags',
    trackAdminOperation('get_tag_analytics'),
    adminController.getTagAnalytics.bind(adminController)
);

/**
 * @swagger
 * /admin/blog/{blogId}/visibility:
 *   put:
 *     tags:
 *       - Admin
 *     summary: Update blog visibility
 *     description: Change the visibility status of a blog post
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: blogId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               visible:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Blog visibility updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 published:
 *                   type: boolean
 *                 author:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     username:
 *                       type: string
 *       404:
 *         description: Blog not found
 */
router.put(
    '/blog/:blogId/visibility',
    trackAdminOperation('update_blog_visibility'),
    adminController.updateBlogVisibility.bind(adminController)
);

export default router;
