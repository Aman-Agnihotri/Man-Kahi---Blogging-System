import { Router, RequestHandler } from 'express';
import { BlogController } from '../controllers/blog.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { upload } from '../config/upload';
import { apiRateLimit } from '../middlewares/rate-limit.middleware';
import {
  trackBlogView,
  trackReadProgress,
  trackLinkClick,
  addAnalyticsHeaders
} from '../middlewares/analytics.middleware'

const router = Router()
const blogController = new BlogController()

// Public routes
// Apply analytics headers to all routes
router.use(addAnalyticsHeaders)

// Analytics tracking routes
router.post(
  '/analytics/progress',
  apiRateLimit,
  trackReadProgress,
  ((_req, res) => { res.json({ success: true }); }) as RequestHandler
);

router.post(
  '/analytics/link',
  apiRateLimit,
  trackLinkClick,
  ((_req, res) => { res.json({ success: true }); }) as RequestHandler
);

// Public routes with analytics
router.get('/search', apiRateLimit, blogController.search)
router.get('/tags/popular', apiRateLimit, blogController.getPopularTags)
router.get('/suggested/:blogId', apiRateLimit, trackBlogView, blogController.getSuggestedBlogs)
router.get('/:slug', apiRateLimit, trackBlogView, blogController.getBySlug)

// Auth required routes
router.post(
  '/',
  authenticate,
  apiRateLimit,
  upload.single('image'),
  blogController.create
)

router.put(
  '/:id',
  authenticate,
  apiRateLimit,
  upload.single('image'),
  blogController.update
)

router.delete(
  '/:id',
  authenticate,
  apiRateLimit,
  blogController.delete
)

// Get user's blogs (auth optional) with analytics
router.get(
  '/user/:userId?',
  apiRateLimit,
  blogController.getUserBlogs
)

// Get blog analytics (auth required)
router.get(
  '/:id/analytics',
  authenticate,
  apiRateLimit,
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

// Admin routes
router.put(
  '/:id/visibility',
  authenticate,
  authorize(['admin']),
  apiRateLimit,
  blogController.update
)

export default router
