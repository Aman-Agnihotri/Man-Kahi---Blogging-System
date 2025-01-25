import { Router } from 'express';
import { AnalyticsController } from '@controllers/analytics.controller';
import { rateLimit } from 'express-rate-limit';

const router = Router();
const analyticsController = new AnalyticsController();

// Rate limiting configuration
const analyticsLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// Routes with rate limiting
router.post(
  '/event',
  analyticsLimiter,
  analyticsController.trackEvent.bind(analyticsController)
);

router.post(
  '/progress',
  analyticsLimiter,
  analyticsController.trackProgress.bind(analyticsController)
);

router.post(
  '/link',
  analyticsLimiter,
  analyticsController.trackLink.bind(analyticsController)
);

// Analytics retrieval routes (higher rate limit for admin dashboard)
const dashboardLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 300, // 300 requests per minute
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

router.get(
  '/blog/:blogId',
  dashboardLimiter,
  analyticsController.getBlogAnalytics.bind(analyticsController)
);

export default router;
