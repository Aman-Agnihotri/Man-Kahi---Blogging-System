import { Router } from 'express';
import { AnalyticsController } from '@controllers/analytics.controller';
import { authenticate, rateLimit } from '@shared/middlewares/auth';
import type { Request, Response, NextFunction, RequestHandler } from 'express-serve-static-core';
import { trackEventProcessing, trackAggregation } from '@middlewares/metrics.middleware';
import logger from '@shared/utils/logger';
import { redactSensitiveFields } from '@shared/utils/redact';

// Enhanced request logging middleware
const logRequest = (routeName: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = process.hrtime();
    const requestId = req.headers['x-request-id'] || Math.random().toString(36).substring(7);
    
    logger.info({
      reqId: requestId,
      method: req.method,
      path: req.path,
      query: req.query,
      body: redactSensitiveFields(req.body),
      headers: redactSensitiveFields(req.headers)
    }, `[${requestId}] Starting ${routeName}`);

    res.on('finish', () => {
      const [seconds, nanoseconds] = process.hrtime(start);
      const duration = seconds * 1000 + nanoseconds / 1000000;

      logger.info({
        reqId: requestId,
        duration: `${duration.toFixed(2)}ms`,
        statusCode: res.statusCode,
        headers: res.getHeaders()
      }, `[${requestId}] Completed ${routeName}`);
    });

    next();
  };
};

/**
 * @swagger
 * components:
 *   schemas:
 *     TrackEventInput:
 *       type: object
 *       required:
 *         - blogId
 *         - type
 *         - path
 *       properties:
 *         blogId:
 *           type: string
 *           description: ID of the blog post
 *         type:
 *           type: string
 *           enum: [view, read, click]
 *           description: Type of event to track
 *         metadata:
 *           type: object
 *           description: Additional metadata for the event
 *         deviceId:
 *           type: string
 *           description: Optional unique identifier for the device
 *         path:
 *           type: string
 *           description: Current page path where event occurred
 *     TrackProgressInput:
 *       type: object
 *       required:
 *         - blogId
 *         - progress
 *         - deviceId
 *         - path
 *       properties:
 *         blogId:
 *           type: string
 *           description: ID of the blog post
 *         progress:
 *           type: number
 *           minimum: 0
 *           maximum: 100
 *           description: Reading progress percentage
 *         deviceId:
 *           type: string
 *           description: Unique identifier for the device
 *         path:
 *           type: string
 *           description: Current page path
 *     TrackLinkInput:
 *       type: object
 *       required:
 *         - blogId
 *         - url
 *         - path
 *       properties:
 *         blogId:
 *           type: string
 *           description: ID of the blog post
 *         url:
 *           type: string
 *           format: uri
 *           description: Clicked URL
 *         path:
 *           type: string
 *           description: Current page path
 *     AnalyticsResponse:
 *       type: object
 *       properties:
 *         realtime:
 *           type: object
 *           properties:
 *             activeVisitors:
 *               type: integer
 *             currentProgress:
 *               type: number
 *             recentClicks:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   url:
 *                     type: string
 *                   count:
 *                     type: integer
 *         historical:
 *           type: object
 *           properties:
 *             views:
 *               type: integer
 *             reads:
 *               type: integer
 *             clicks:
 *               type: integer
 *             avgReadTime:
 *               type: number
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *         details:
 *           type: string
 *         errors:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               field:
 *                 type: string
 *               message:
 *                 type: string
 *     BlogAnalyticsRow:
 *       type: object
 *       description: Flat snapshot matching the Prisma BlogAnalytics row, optionally refreshed with live Redis counters.
 *       properties:
 *         id:
 *           type: string
 *         blogId:
 *           type: string
 *         views:
 *           type: integer
 *         uniqueViews:
 *           type: integer
 *         reads:
 *           type: integer
 *         readProgress:
 *           type: number
 *         linkClicks:
 *           type: integer
 *         shareCount:
 *           type: integer
 *         likes:
 *           type: integer
 *         comments:
 *           type: integer
 *         shares:
 *           type: integer
 *         engagement:
 *           type: number
 *         deviceStats:
 *           type: object
 *           nullable: true
 *         referrerStats:
 *           type: object
 *           nullable: true
 *         timeSpentStats:
 *           type: object
 *           nullable: true
 *         lastUpdated:
 *           type: string
 *           format: date-time
 *     OverallStats:
 *       type: object
 *       properties:
 *         views:
 *           type: integer
 *         uniqueViews:
 *           type: integer
 *         reads:
 *           type: integer
 *         linkClicks:
 *           type: integer
 *         avgReadProgress:
 *           type: number
 *         avgEngagement:
 *           type: number
 *         trackedBlogs:
 *           type: integer
 */

const router = Router();
const analyticsController = new AnalyticsController();

/**
 * @swagger
 * /analytics/event:
 *   post:
 *     tags:
 *       - Analytics
 *     summary: Track analytics event
 *     description: >
 *       Track a generic analytics event (view, read, click). Open to anonymous
 *       readers as well as authenticated users - the product supports
 *       account-free browsing/reading, and anonymous visitors are identified
 *       via the deviceId fingerprint instead of a JWT. Still rate limited.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TrackEventInput'
 *     responses:
 *       200:
 *         description: Event tracked successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       400:
 *         description: Invalid input data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       503:
 *         description: Service temporarily unavailable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  '/event',
  rateLimit(1 * 60 * 1000, 60) as unknown as RequestHandler,
  logRequest('Track Event'),
  trackEventProcessing('track_event'),
  (req, res, next) => {
    logger.debug({
      blogId: req.body.blogId,
      type: req.body.type,
      deviceId: req.body.deviceId
    }, 'Processing event tracking request');
    analyticsController.trackEvent(req, res).catch(next);
  }
);

/**
 * @swagger
 * /analytics/progress:
 *   post:
 *     tags:
 *       - Analytics
 *     summary: Track reading progress
 *     description: >
 *       Track a user's reading progress through a blog post. Open to
 *       anonymous and authenticated readers alike; still rate limited.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TrackProgressInput'
 *     responses:
 *       200:
 *         description: Progress tracked successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       400:
 *         description: Invalid input data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       503:
 *         description: Service temporarily unavailable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  '/progress',
  rateLimit(1 * 60 * 1000, 60) as unknown as RequestHandler,
  logRequest('Track Progress'),
  trackEventProcessing('track_progress'),
  (req, res, next) => {
    logger.debug({
      blogId: req.body.blogId,
      progress: req.body.progress,
      deviceId: req.body.deviceId
    }, 'Processing progress tracking request');
    analyticsController.trackProgress(req, res).catch(next);
  }
);

/**
 * @swagger
 * /analytics/link:
 *   post:
 *     tags:
 *       - Analytics
 *     summary: Track link click
 *     description: >
 *       Track when a user clicks a link within a blog post. Open to
 *       anonymous and authenticated readers alike; still rate limited.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TrackLinkInput'
 *     responses:
 *       200:
 *         description: Link click tracked successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       400:
 *         description: Invalid input data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       503:
 *         description: Service temporarily unavailable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  '/link',
  rateLimit(1 * 60 * 1000, 60) as unknown as RequestHandler,
  logRequest('Track Link'),
  trackEventProcessing('track_link'),
  (req, res, next) => {
    logger.debug({
      blogId: req.body.blogId,
      url: req.body.url
    }, 'Processing link tracking request');
    analyticsController.trackLink(req, res).catch(next);
  }
);

/**
 * @swagger
 * /analytics/blog/{blogId}:
 *   get:
 *     tags:
 *       - Analytics
 *     summary: Get blog analytics
 *     description: >
 *       Get the current analytics snapshot for a specific blog post
 *       (Admin/Analyst only). Returns a flat object matching the Prisma
 *       BlogAnalytics row; if the blog has no analytics yet, returns a
 *       zeroed-out object with the same shape rather than a 404, since a
 *       brand-new blog simply has no analytics yet.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: blogId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: timeframe
 *         schema:
 *           type: string
 *           enum: [1h, 24h, 7d, 30d, all]
 *           default: 24h
 *         description: Reserved for future historical breakdowns; BlogAnalytics is currently a single cumulative row, so this has no filtering effect yet.
 *     responses:
 *       200:
 *         description: Analytics data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BlogAnalyticsRow'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - Requires admin or analyst role
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       503:
 *         description: Service temporarily unavailable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  '/blog/:blogId',
  authenticate({
    strategy: ['jwt'],
    roles: ['admin', 'analyst'],
    rateLimit: { windowMs: 1 * 60 * 1000, max: 300 }
  }) as unknown as RequestHandler,
  logRequest('Get Blog Analytics'),
  trackAggregation('get_blog_analytics'),
  (req, res, next) => {
    logger.debug({
      blogId: req.params['blogId'],
      timeframe: req.query['timeframe'],
      userId: (req as any).user?.id
    }, 'Processing blog analytics request');
    analyticsController.getBlogAnalytics(req, res).catch(next);
  }
);

/**
 * @swagger
 * /analytics/stats/overall:
 *   get:
 *     tags:
 *       - Analytics
 *     summary: Get platform-wide analytics overview
 *     description: Aggregate view/read/click totals across all blogs (Admin/Analyst only).
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Aggregate stats retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OverallStats'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - Requires admin or analyst role
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  '/stats/overall',
  authenticate({
    strategy: ['jwt'],
    roles: ['admin', 'analyst'],
    rateLimit: { windowMs: 1 * 60 * 1000, max: 300 }
  }) as unknown as RequestHandler,
  logRequest('Get Overall Stats'),
  trackAggregation('get_overall_stats'),
  (req, res, next) => {
    analyticsController.getOverallStats(req, res).catch(next);
  }
);

/**
 * @swagger
 * /analytics/trending:
 *   get:
 *     tags:
 *       - Analytics
 *     summary: Get trending blogs
 *     description: Top blogs ordered by views descending (Admin/Analyst only).
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Trending blogs retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/BlogAnalyticsRow'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - Requires admin or analyst role
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  '/trending',
  authenticate({
    strategy: ['jwt'],
    roles: ['admin', 'analyst'],
    rateLimit: { windowMs: 1 * 60 * 1000, max: 300 }
  }) as unknown as RequestHandler,
  logRequest('Get Trending Blogs'),
  trackAggregation('get_trending'),
  (req, res, next) => {
    analyticsController.getTrending(req, res).catch(next);
  }
);

/**
 * @swagger
 * /analytics/multi:
 *   get:
 *     tags:
 *       - Analytics
 *     summary: Get analytics for multiple blogs
 *     description: >
 *       Batch-fetch analytics rows for a set of blogs (Admin/Analyst only).
 *       Accepts `blogIds` as a comma-separated string or as repeated/array
 *       query params.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: blogIds
 *         required: true
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *         style: form
 *         explode: true
 *     responses:
 *       200:
 *         description: Analytics rows retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/BlogAnalyticsRow'
 *       400:
 *         description: Invalid input data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - Requires admin or analyst role
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  '/multi',
  authenticate({
    strategy: ['jwt'],
    roles: ['admin', 'analyst'],
    rateLimit: { windowMs: 1 * 60 * 1000, max: 300 }
  }) as unknown as RequestHandler,
  logRequest('Get Multi Blog Analytics'),
  trackAggregation('get_multi_blog_analytics'),
  (req, res, next) => {
    analyticsController.getMultiBlogAnalytics(req, res).catch(next);
  }
);

export default router;
