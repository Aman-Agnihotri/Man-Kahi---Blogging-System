import { Router, RequestHandler } from 'express';
import { BlogController } from '../controllers/blog.controller';
import { authenticate } from '@shared/middlewares/auth';
import { createServiceRateLimit, createEndpointRateLimit } from '@shared/middlewares/rateLimit';
import { upload } from '../config/upload';
import {
  trackBlogView,
  trackReadProgress,
  trackLinkClick,
  addAnalyticsHeaders
} from '../middlewares/analytics.middleware';

const router = Router();
const blogController = new BlogController();

// Apply analytics headers and service-wide rate limiting
router.use(addAnalyticsHeaders);
router.use(createServiceRateLimit('blog') as unknown as RequestHandler);

// Analytics tracking routes
router.post(
  '/analytics/progress',
  createEndpointRateLimit('blog:progress') as unknown as RequestHandler,
  trackReadProgress,
  ((_req, res) => { res.json({ success: true }); }) as RequestHandler
);

router.post(
  '/analytics/link',
  createEndpointRateLimit('blog:progress') as unknown as RequestHandler,
  trackLinkClick,
  ((_req, res) => { res.json({ success: true }); }) as RequestHandler
);

// Public routes with analytics and search-specific rate limiting
router.get(
  '/search',
  createEndpointRateLimit('blog:search') as unknown as RequestHandler,
  blogController.search
);

router.get('/tags/popular', blogController.getPopularTags);
router.get(
  '/suggested/:blogId',
  trackBlogView,
  blogController.getSuggestedBlogs
);
router.get(
  '/:slug',
  trackBlogView,
  blogController.getBySlug
);

// Auth required routes
router.post(
  '/',
  authenticate() as unknown as RequestHandler,
  createEndpointRateLimit('blog:create') as unknown as RequestHandler,
  upload.single('image'),
  blogController.create
);

router.put(
  '/:id',
  authenticate() as unknown as RequestHandler,
  createEndpointRateLimit('blog:update') as unknown as RequestHandler,
  upload.single('image'),
  blogController.update
);

router.delete(
  '/:id',
  authenticate() as unknown as RequestHandler,
  createEndpointRateLimit('blog:delete') as unknown as RequestHandler,
  blogController.delete
);

// Get user's blogs (auth optional) with analytics
router.get(
  '/user/:userId?',
  blogController.getUserBlogs
);

// Get blog analytics (auth required)
router.get(
  '/:id/analytics',
  authenticate() as unknown as RequestHandler,
  createEndpointRateLimit('blog:analytics') as unknown as RequestHandler,
  (async (req, res) => {
    const { analyticsClient } = await import('../utils/analytics');
    try {
      const data = await analyticsClient.getBlogAnalytics(req.params.id);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  }) as RequestHandler
);

// Admin routes with admin-specific rate limiting
router.put(
  '/:id/visibility',
  authenticate({ roles: ['admin'] }) as unknown as RequestHandler,
  createServiceRateLimit('admin') as unknown as RequestHandler,
  blogController.update
);

export default router;
