import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import { BlogController } from '@controllers/blog.controller';
import { authenticate } from '@shared/middlewares/auth';
import { createServiceRateLimit, createEndpointRateLimit } from '@shared/middlewares/rateLimit';
import { upload } from '@config/upload';
import {
  trackBlogView,
  trackReadProgress,
  trackLinkClick,
  addAnalyticsHeaders
} from '@middlewares/analytics.middleware';
import { trackBlogOperation } from '@middlewares/metrics.middleware';
import { metricsHandler } from '@config/metrics';

const router = Router();
const blogController = new BlogController();

// Analytics Headers Middleware
const analyticsMiddleware: RequestHandler = (req, res, next) => {
  addAnalyticsHeaders(req, res, next);
  next();
};

// Service Rate Limit Middleware
const serviceRateLimit = createServiceRateLimit('blog');

// Initialize routes
router.use(analyticsMiddleware);
router.use(serviceRateLimit);

// Metrics endpoint
router.get('/metrics', metricsHandler as RequestHandler);

// Track reading progress
router.post(
  '/analytics/progress',
  createEndpointRateLimit('blog:progress') as RequestHandler,
  trackBlogOperation('track_progress') as RequestHandler,
  trackReadProgress as RequestHandler,
  ((req: Request, res: Response) => {
    res.json({ success: true });
  }) as RequestHandler
);

// Track link clicks
router.post(
  '/analytics/link',
  createEndpointRateLimit('blog:link') as RequestHandler,
  trackBlogOperation('track_link') as RequestHandler,
  trackLinkClick as RequestHandler,
  ((req: Request, res: Response) => {
    res.json({ success: true });
  }) as RequestHandler
);

// Search blogs
router.get(
  '/search',
  createEndpointRateLimit('blog:search') as RequestHandler,
  trackBlogOperation('search') as RequestHandler,
  ((req: Request, res: Response, next: NextFunction) => {
    blogController.search(req, res).catch(next);
  }) as RequestHandler
);

// Get popular tags
router.get(
  '/tags/popular',
  trackBlogOperation('get_popular_tags') as RequestHandler,
  ((req: Request, res: Response, next: NextFunction) => {
    blogController.getPopularTags(req, res).catch(next);
  }) as RequestHandler
);

// Get suggested blogs
router.get(
  '/suggested/:blogId',
  trackBlogOperation('get_suggested_blogs') as RequestHandler,
  trackBlogView as RequestHandler,
  ((req: Request, res: Response, next: NextFunction) => {
    blogController.getSuggestedBlogs(req, res).catch(next);
  }) as RequestHandler
);

// Get blog by slug
router.get(
  '/:slug',
  trackBlogOperation('get_blog') as RequestHandler,
  trackBlogView as RequestHandler,
  ((req: Request, res: Response, next: NextFunction) => {
    blogController.getBySlug(req, res).catch(next);
  }) as RequestHandler
);

// Create new blog
router.post(
  '/',
  authenticate() as RequestHandler,
  createEndpointRateLimit('blog:create') as RequestHandler,
  upload.single('image'),
  trackBlogOperation('create_blog') as RequestHandler,
  ((req: Request, res: Response, next: NextFunction) => {
    blogController.create(req, res).catch(next);
  }) as RequestHandler
);

// Update blog
router.put(
  '/:id',
  authenticate() as RequestHandler,
  createEndpointRateLimit('blog:update') as RequestHandler,
  upload.single('image'),
  trackBlogOperation('update_blog') as RequestHandler,
  ((req: Request, res: Response, next: NextFunction) => {
    blogController.update(req, res).catch(next);
  }) as RequestHandler
);

// Delete blog
router.delete(
  '/:id',
  authenticate() as RequestHandler,
  createEndpointRateLimit('blog:delete') as RequestHandler,
  trackBlogOperation('delete_blog') as RequestHandler,
  ((req: Request, res: Response, next: NextFunction) => {
    blogController.delete(req, res).catch(next);
  }) as RequestHandler
);

// Get user's blogs
router.get(
  '/user',
  trackBlogOperation('get_user_blogs') as RequestHandler,
  ((req: Request, res: Response, next: NextFunction) => {
    blogController.getUserBlogs(req, res).catch(next);
  }) as RequestHandler
);

// Get specific user's blogs
router.get(
  '/user/:userId',
  trackBlogOperation('get_user_blogs') as RequestHandler,
  ((req: Request, res: Response, next: NextFunction) => {
    blogController.getUserBlogs(req, res).catch(next);
  }) as RequestHandler
);

// Get blog analytics
router.get(
  '/:id/analytics',
  authenticate() as RequestHandler,
  createEndpointRateLimit('blog:analytics') as RequestHandler,
  trackBlogOperation('get_blog_analytics') as RequestHandler,
  (async (req: Request, res: Response) => {
    const { analyticsClient } = await import('../utils/analytics');
    try {
      const id = req.params['id'];
      if (!id) {
        res.status(400).json({ error: 'Blog id is missing' });
        return;
      }
      const data = await analyticsClient.getBlogAnalytics(id);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  }) as RequestHandler
);

// Update blog visibility (admin only)
router.put(
  '/:id/visibility',
  authenticate({ roles: ['admin'] }) as RequestHandler,
  createServiceRateLimit('admin') as RequestHandler,
  trackBlogOperation('update_blog_visibility') as RequestHandler,
  ((req: Request, res: Response, next: NextFunction) => {
    blogController.update(req, res).catch(next);
  }) as RequestHandler
);

export default router;
