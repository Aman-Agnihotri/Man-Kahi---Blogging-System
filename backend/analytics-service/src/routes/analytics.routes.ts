import { Router } from 'express';
import { AnalyticsController } from '../controllers/analytics.controller';
import { authenticate } from '@shared/middlewares/auth';
import type { RequestHandler } from 'express-serve-static-core';
import { trackEventProcessing, trackAggregation } from '../middlewares/metrics.middleware';

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
 *     description: Track a generic analytics event (view, read, click)
 *     security:
 *       - bearerAuth: []
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
  authenticate({
    rateLimit: { windowMs: 1 * 60 * 1000, max: 60 }
  }) as unknown as RequestHandler,
  trackEventProcessing('track_event'),
  analyticsController.trackEvent.bind(analyticsController)
);

/**
 * @swagger
 * /analytics/progress:
 *   post:
 *     tags:
 *       - Analytics
 *     summary: Track reading progress
 *     description: Track a user's reading progress through a blog post
 *     security:
 *       - bearerAuth: []
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
  authenticate({
    rateLimit: { windowMs: 1 * 60 * 1000, max: 60 }
  }) as unknown as RequestHandler,
  trackEventProcessing('track_progress'),
  analyticsController.trackProgress.bind(analyticsController)
);

/**
 * @swagger
 * /analytics/link:
 *   post:
 *     tags:
 *       - Analytics
 *     summary: Track link click
 *     description: Track when a user clicks a link within a blog post
 *     security:
 *       - bearerAuth: []
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
  authenticate({
    rateLimit: { windowMs: 1 * 60 * 1000, max: 60 }
  }) as unknown as RequestHandler,
  trackEventProcessing('track_link'),
  analyticsController.trackLink.bind(analyticsController)
);

/**
 * @swagger
 * /analytics/blog/{blogId}:
 *   get:
 *     tags:
 *       - Analytics
 *     summary: Get blog analytics
 *     description: Get analytics data for a specific blog post (Admin/Analyst only)
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
 *     responses:
 *       200:
 *         description: Analytics data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AnalyticsResponse'
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
  trackAggregation('get_blog_analytics'),
  analyticsController.getBlogAnalytics.bind(analyticsController)
);

export default router;
