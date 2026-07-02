import { Router } from 'express';
import { AdminController } from '@controllers/admin.controller';
import { authenticate } from '@shared/middlewares/auth';
import { createServiceRateLimit } from '@shared/middlewares/rateLimit';
import type { RequestHandler } from 'express';
import { 
    trackAdminOperation,
    trackDashboardAccess,
    trackAdminSession
} from '@middlewares/metrics.middleware';

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
 *           description: Passthrough of analytics-service's GET /api/analytics/stats/overall response.
 *           properties:
 *             views:
 *               type: integer
 *             uniqueViews:
 *               type: integer
 *             reads:
 *               type: integer
 *             linkClicks:
 *               type: integer
 *             avgReadProgress:
 *               type: number
 *             avgEngagement:
 *               type: number
 *             trackedBlogs:
 *               type: integer
 *     BlogAnalytics:
 *       type: object
 *       description: Flat shape matching the Prisma BlogAnalytics row exactly.
 *       properties:
 *         id:
 *           type: string
 *         blogId:
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
 *         shares:
 *           type: integer
 *         engagement:
 *           type: number
 *         deviceStats:
 *           type: object
 *           nullable: true
 *         referrerStats:
 *           type: object
 *           nullable: true
 *         timeSpentStats:
 *           type: object
 *           nullable: true
 *         lastUpdated:
 *           type: string
 *           format: date-time
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
// Track admin authentication and session
const adminAuthMiddleware: RequestHandler = (req, res, next) => {
    const session = trackAdminSession();
    res.on('finish', () => {
        if (res.statusCode >= 400) {
            session.end();
        }
    });
    // Handle connection termination
    req.on('close', () => {
        session.end();
    });
    next();
};

// Apply rate limiting with built-in metrics tracking
const adminRateLimitMiddleware = createServiceRateLimit('admin');

const adminMiddleware = [
    adminAuthMiddleware,
    authenticate({ roles: ['admin'] }) as unknown as RequestHandler,
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
    (req, res, next) => {
        adminController.getDashboardStats(req, res).catch(next);
    }
);

/**
 * @swagger
 * /admin/blogs:
 *   get:
 *     tags:
 *       - Admin
 *     summary: List blogs for moderation
 *     description: Lists blogs regardless of published state, for moderation purposes.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: published
 *         schema:
 *           type: string
 *           enum: [true, false]
 *         description: Filter by publish state; omit to return both.
 *     responses:
 *       200:
 *         description: Blogs retrieved successfully
 */
router.get(
    '/blogs',
    trackAdminOperation('list_blogs'),
    (req, res, next) => {
        adminController.listBlogs(req, res).catch(next);
    }
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
    (req, res, next) => {
        adminController.getBlogAnalytics(req, res).catch(next);
    }
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
    (req, res, next) => {
        adminController.getUserAnalytics(req, res).catch(next);
    }
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
    (req, res, next) => {
        adminController.getTrendingContent(req, res).catch(next);
    }
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
    (req, res, next) => {
        adminController.getTagAnalytics(req, res).catch(next);
    }
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
    (req, res, next) => {
        adminController.updateBlogVisibility(req, res).catch(next);
    }
);

/**
 * @swagger
 * /admin/blog/{blogId}:
 *   delete:
 *     tags:
 *       - Admin
 *     summary: Delete abusive content (hard takedown)
 *     description: Delegates to blog-service's DELETE /api/blogs/:blogId/moderate to permanently remove a blog.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: blogId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Blog deleted successfully
 *       404:
 *         description: Blog not found
 *       502:
 *         description: Blog service unavailable
 */
router.delete(
    '/blog/:blogId',
    trackAdminOperation('delete_blog'),
    (req, res, next) => {
        adminController.deleteBlog(req, res).catch(next);
    }
);

/**
 * @swagger
 * /admin/users:
 *   get:
 *     tags:
 *       - Admin
 *     summary: List users for management
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Matches against username or email (case-insensitive contains).
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, suspended, deleted]
 *     responses:
 *       200:
 *         description: Users retrieved successfully
 */
router.get(
    '/users',
    trackAdminOperation('list_users'),
    (req, res, next) => {
        adminController.listUsers(req, res).catch(next);
    }
);

/**
 * @swagger
 * /admin/users/{userId}/suspend:
 *   put:
 *     tags:
 *       - Admin
 *     summary: Suspend a user
 *     description: Admin-initiated, reversible account suspension.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
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
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: User suspended successfully
 *       400:
 *         description: User already suspended
 *       404:
 *         description: User not found
 */
router.put(
    '/users/:userId/suspend',
    trackAdminOperation('suspend_user'),
    (req, res, next) => {
        adminController.suspendUser(req, res).catch(next);
    }
);

/**
 * @swagger
 * /admin/users/{userId}/unsuspend:
 *   put:
 *     tags:
 *       - Admin
 *     summary: Reverse a user suspension
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User unsuspended successfully
 *       400:
 *         description: User is not suspended
 *       404:
 *         description: User not found
 */
router.put(
    '/users/:userId/unsuspend',
    trackAdminOperation('unsuspend_user'),
    (req, res, next) => {
        adminController.unsuspendUser(req, res).catch(next);
    }
);

/**
 * @swagger
 * /admin/roles:
 *   get:
 *     tags:
 *       - Admin
 *     summary: List all roles with their permissions
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Roles retrieved successfully
 */
router.get(
    '/roles',
    trackAdminOperation('list_roles'),
    (req, res, next) => {
        adminController.listRoles(req, res).catch(next);
    }
);

/**
 * @swagger
 * /admin/users/{userId}/roles:
 *   post:
 *     tags:
 *       - Admin
 *     summary: Assign a role to a user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
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
 *               roleId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Role assigned successfully
 *       404:
 *         description: User or role not found
 *       409:
 *         description: User already has this role
 */
router.post(
    '/users/:userId/roles',
    trackAdminOperation('assign_role'),
    (req, res, next) => {
        adminController.assignRole(req, res).catch(next);
    }
);

/**
 * @swagger
 * /admin/users/{userId}/roles/{roleId}:
 *   delete:
 *     tags:
 *       - Admin
 *     summary: Revoke a role from a user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: roleId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Role revoked successfully
 *       404:
 *         description: The user does not have this role
 */
router.delete(
    '/users/:userId/roles/:roleId',
    trackAdminOperation('revoke_role'),
    (req, res, next) => {
        adminController.revokeRole(req, res).catch(next);
    }
);

/**
 * @swagger
 * /admin/reports:
 *   get:
 *     tags:
 *       - Admin
 *     summary: List reported content
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [open, resolved, dismissed]
 *           default: open
 *     responses:
 *       200:
 *         description: Reports retrieved successfully
 */
router.get(
    '/reports',
    trackAdminOperation('list_reports'),
    (req, res, next) => {
        adminController.listReports(req, res).catch(next);
    }
);

/**
 * @swagger
 * /admin/reports/{reportId}/resolve:
 *   put:
 *     tags:
 *       - Admin
 *     summary: Resolve an open report
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reportId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               actionTaken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Report resolved successfully
 *       400:
 *         description: Report is not open
 *       404:
 *         description: Report not found
 */
router.put(
    '/reports/:reportId/resolve',
    trackAdminOperation('resolve_report'),
    (req, res, next) => {
        adminController.resolveReport(req, res).catch(next);
    }
);

/**
 * @swagger
 * /admin/reports/{reportId}/dismiss:
 *   put:
 *     tags:
 *       - Admin
 *     summary: Dismiss an open report
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reportId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Report dismissed successfully
 *       400:
 *         description: Report is not open
 *       404:
 *         description: Report not found
 */
router.put(
    '/reports/:reportId/dismiss',
    trackAdminOperation('dismiss_report'),
    (req, res, next) => {
        adminController.dismissReport(req, res).catch(next);
    }
);

/**
 * @swagger
 * /admin/audit-log:
 *   get:
 *     tags:
 *       - Admin
 *     summary: List admin audit log entries
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *       - in: query
 *         name: actorId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Audit log entries retrieved successfully
 */
router.get(
    '/audit-log',
    trackAdminOperation('list_audit_log'),
    (req, res, next) => {
        adminController.getAuditLog(req, res).catch(next);
    }
);

export default router;
