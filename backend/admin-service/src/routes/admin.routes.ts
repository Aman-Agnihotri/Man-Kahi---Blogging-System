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

const router = Router();
const adminController = new AdminController();

// Apply admin auth and rate limiting
// Track admin authentication
const adminAuthMiddleware: RequestHandler = (req, res, next) => {
    updateAdminSessions(1); // Increment active sessions
    res.on('finish', () => {
        if (res.statusCode >= 400) {
            updateAdminSessions(-1); // Decrement on auth failure
        }
    });
    next();
};

// Track rate limiting
const adminRateLimitMiddleware = createServiceRateLimit('admin');
const rateLimitMetricsMiddleware: RequestHandler = (req, res, next) => {
    res.on('finish', () => {
        if (res.statusCode === 429) { // Rate limit exceeded
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

// Dashboard overview
router.get(
    '/dashboard',
    trackDashboardAccess('overview'),
    adminController.getDashboardStats.bind(adminController)
);

// Blog analytics routes
router.get(
    '/analytics/blog/:blogId',
    trackAdminOperation('get_blog_analytics'),
    adminController.getBlogAnalytics.bind(adminController)
);

// User analytics routes
router.get(
    '/analytics/user/:userId',
    trackAdminOperation('get_user_analytics'),
    adminController.getUserAnalytics.bind(adminController)
);

// Trending content
router.get(
    '/analytics/trending',
    trackAdminOperation('get_trending_content'),
    adminController.getTrendingContent.bind(adminController)
);

// Tag analytics
router.get(
    '/analytics/tags',
    trackAdminOperation('get_tag_analytics'),
    adminController.getTagAnalytics.bind(adminController)
);

// Blog visibility control
router.put(
    '/blog/:blogId/visibility',
    trackAdminOperation('update_blog_visibility'),
    adminController.updateBlogVisibility.bind(adminController)
);

export default router;
