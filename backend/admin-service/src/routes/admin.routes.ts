import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { rateLimit } from 'express-rate-limit';

const router = Router();
const adminController = new AdminController();

// Rate limiting for admin endpoints
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply admin auth middleware to all routes
router.use(authenticate);
router.use(authorize(['admin']));
router.use(adminLimiter);

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
