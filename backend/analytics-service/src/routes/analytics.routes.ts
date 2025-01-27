import { Router } from 'express';
import { AnalyticsController } from '../controllers/analytics.controller';
import { authenticate } from '@shared/middlewares/auth';
import type { RequestHandler } from 'express-serve-static-core';

const router = Router();
const analyticsController = new AnalyticsController();

// Public analytics tracking routes with built-in rate limiting
router.post(
  '/event',
  authenticate({
    rateLimit: { windowMs: 1 * 60 * 1000, max: 60 }
  }) as unknown as RequestHandler,
  analyticsController.trackEvent.bind(analyticsController)
);

router.post(
  '/progress',
  authenticate({
    rateLimit: { windowMs: 1 * 60 * 1000, max: 60 }
  }) as unknown as RequestHandler,
  analyticsController.trackProgress.bind(analyticsController)
);

router.post(
  '/link',
  authenticate({
    rateLimit: { windowMs: 1 * 60 * 1000, max: 60 }
  }) as unknown as RequestHandler,
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
  analyticsController.getBlogAnalytics.bind(analyticsController)
);

export default router;
