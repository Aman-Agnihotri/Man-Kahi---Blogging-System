import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller';
import { authenticate } from '@shared/middlewares/auth';
import { createServiceRateLimit } from '@shared/middlewares/rateLimit';
import type { RequestHandler } from 'express';

const router = Router();
const adminController = new AdminController();

// Apply admin auth and rate limiting
const adminMiddleware = [
    authenticate({ roles: ['admin'] }) as unknown as RequestHandler,
    createServiceRateLimit('admin') as unknown as RequestHandler
];

router.use(adminMiddleware);

// Dashboard overview
router.get(
    '/dashboard',
    adminController.getDashboardStats.bind(adminController)
);

// Blog analytics routes
router.get(
    '/analytics/blog/:blogId',
    adminController.getBlogAnalytics.bind(adminController)
);

// User analytics routes
router.get(
    '/analytics/user/:userId',
    adminController.getUserAnalytics.bind(adminController)
);

// Trending content
router.get(
    '/analytics/trending',
    adminController.getTrendingContent.bind(adminController)
);

// Tag analytics
router.get(
    '/analytics/tags',
    adminController.getTagAnalytics.bind(adminController)
);

// Blog visibility control
router.put(
    '/blog/:blogId/visibility',
    adminController.updateBlogVisibility.bind(adminController)
);

export default router;
