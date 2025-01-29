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
import { trackOperationMetrics } from '../middlewares/metrics.middleware';
import { metricsHandler } from '../config/metrics';

const router = Router();
const blogController = new BlogController();

// Apply analytics headers and service-wide rate limiting
router.use(addAnalyticsHeaders);
router.use(createServiceRateLimit('blog') as unknown as RequestHandler);

// Metrics endpoint
router.get('/metrics', metricsHandler);

// Analytics tracking routes
router.post(
  '/analytics/progress',
  createEndpointRateLimit('blog:progress') as unknown as RequestHandler,
  trackOperationMetrics('blog', 'track_progress'),
  trackReadProgress,
  ((_req, res) => { res.json({ success: true }); }) as RequestHandler
);

router.post(
  '/analytics/link',
  createEndpointRateLimit('blog:progress') as unknown as RequestHandler,
  trackOperationMetrics('blog', 'track_link'),
  trackLinkClick,
  ((_req, res) => { res.json({ success: true }); }) as RequestHandler
);

// Public routes with analytics and search-specific rate limiting
router.get(
  '/search',
  createEndpointRateLimit('blog:search') as unknown as RequestHandler,
  trackOperationMetrics('search', 'search'),
  (req, res, next) => {
    blogController.search(req, res).catch(next);
  }
);

router.get(
  '/tags/popular',
  trackOperationMetrics('search', 'get_popular_tags'),
  (req, res, next) => {
    blogController.getPopularTags(req, res).catch(next);
  }
);

router.get(
  '/suggested/:blogId',
  trackOperationMetrics('search', 'get_suggested_blogs'),
  trackBlogView,
  (req, res, next) => {
    blogController.getSuggestedBlogs(req, res).catch(next);
  }
);

router.get(
  '/:slug',
  trackOperationMetrics('blog', 'get_blog'),
  trackBlogView,
  (req, res, next) => {
    blogController.getBySlug(req, res).catch(next);
  }
);

// Auth required routes
router.post(
  '/',
  authenticate() as unknown as RequestHandler,
  createEndpointRateLimit('blog:create') as unknown as RequestHandler,
  upload.single('image'),
  trackOperationMetrics('blog', 'create_blog'),
  (req, res, next) => {
    blogController.create(req, res).catch(next);
  }
);

router.put(
  '/:id',
  authenticate() as unknown as RequestHandler,
  createEndpointRateLimit('blog:update') as unknown as RequestHandler,
  upload.single('image'),
  trackOperationMetrics('blog', 'update_blog'),
  (req, res, next) => {
    blogController.update(req, res).catch(next);
  }
);

router.delete(
  '/:id',
  authenticate() as unknown as RequestHandler,
  createEndpointRateLimit('blog:delete') as unknown as RequestHandler,
  trackOperationMetrics('blog', 'delete_blog'),
  (req, res, next) => {
    blogController.delete(req, res).catch(next);
  }
);

// Get user's blogs (auth optional) with analytics
router.get(
  '/user/:userId?',
  trackOperationMetrics('blog', 'get_user_blogs'),
  (req, res, next) => {
    blogController.getUserBlogs(req, res).catch(next);
  }
);

// Get blog analytics (auth required)
router.get(
  '/:id/analytics',
  authenticate() as unknown as RequestHandler,
  createEndpointRateLimit('blog:analytics') as unknown as RequestHandler,
  trackOperationMetrics('blog', 'get_blog_analytics'),
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
  trackOperationMetrics('blog', 'update_blog_visibility'),
  (req, res, next) => {
    blogController.update(req, res).catch(next);
  }
);

export default router;
