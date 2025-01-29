import { Router } from 'express';
import { AnalyticsController } from '../controllers/analytics.controller';
import { authenticate } from '@shared/middlewares/auth';
import type { RequestHandler } from 'express-serve-static-core';
import { trackEventProcessing, trackAggregation } from '../middlewares/metrics.middleware';

const router = Router();
const analyticsController = new AnalyticsController();

// Public analytics tracking routes with built-in rate limiting
router.post(
  '/event',
  authenticate({
    rateLimit: { windowMs: 1 * 60 * 1000, max: 60 }
  }) as unknown as RequestHandler,
  trackEventProcessing('track_event'),
  analyticsController.trackEvent.bind(analyticsController)
);

router.post(
  '/progress',
  authenticate({
    rateLimit: { windowMs: 1 * 60 * 1000, max: 60 }
  }) as unknown as RequestHandler,
  trackEventProcessing('track_progress'),
  analyticsController.trackProgress.bind(analyticsController)
);

router.post(
  '/link',
  authenticate({
    rateLimit: { windowMs: 1 * 60 * 1000, max: 60 }
  }) as unknown as RequestHandler,
  trackEventProcessing('track_link'),
  analyticsController.trackLink.bind(analyticsController)
);

// Protected analytics retrieval routes with different rate limits
// Requires authentication and higher rate limits for admin dashboard
router.get(
  '/blog/:blogId',
  authenticate({
    strategy: ['jwt'],
    roles: ['admin', 'analyst'],
    rateLimit: { windowMs: 1 * 60 * 1000, max: 300 }
  }) as unknown as RequestHandler,
  trackAggregation('get_blog_analytics'),
  analyticsController.getBlogAnalytics.bind(analyticsController)
);

export default router;
