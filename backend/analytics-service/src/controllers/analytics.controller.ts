import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '@shared/utils/prismaClient';
import logger from '@shared/utils/logger';
import { analytics as analyticsRedis } from '@shared/config/redis';
import crypto from 'crypto';
import { metrics, analyticsMetrics } from '@config/metrics';

// Input validation schemas
const trackEventSchema = z.object({
  blogId: z.string(),
  type: z.enum(['view', 'read', 'click']),
  metadata: z.record(z.any()).optional(),
  deviceId: z.string().optional(),
  path: z.string(),
});

const trackProgressSchema = z.object({
  blogId: z.string(),
  progress: z.number().min(0).max(100),
  deviceId: z.string(),
  path: z.string(),
});

const trackLinkSchema = z.object({
  blogId: z.string(),
  url: z.string().url(),
  path: z.string(),
});

const getAnalyticsSchema = z.object({
  blogId: z.string(),
  timeframe: z.enum(['1h', '24h', '7d', '30d', 'all']).optional(),
});

export class AnalyticsController {
  // Track generic analyticsRedis event
  async trackEvent(req: Request, res: Response): Promise<Response> {
    const requestId = req.headers['x-request-id'] || Math.random().toString(36).substring(7);
    logger.info(`[${requestId}] Starting event tracking`);

    try {
      const startTime = process.hrtime();
      logger.debug(`[${requestId}] Validating event input`, { body: req.body });
      const validatedInput = trackEventSchema.parse(req.body);
      logger.debug(`[${requestId}] Input validation successful`);
      const { blogId, type, metadata, deviceId, path } = validatedInput;

      // Generate device ID if not provided
      const device = deviceId ?? this.generateDeviceId(req);
      logger.debug(`[${requestId}] Generated device ID`, { deviceId: device });

      // Track queue metrics
      const queueTracker = metrics.trackQueue('events');
      queueTracker.setSize(1);
      logger.debug(`[${requestId}] Queue metrics initialized`);
      
      // Store event in database
      const dbStartTime = process.hrtime();
      logger.debug(`[${requestId}] Starting database operation`);
      const event = await prisma.analyticsEvent.create({
        data: {
          blogId,
          type,
          metadata: metadata || {},
          deviceId: device,
          path,
        },
      });
      
      const [dbSecs, dbNanos] = process.hrtime(dbStartTime);
      logger.debug(`[${requestId}] Database operation completed`, { 
        eventId: event.id,
        duration: `${dbSecs + dbNanos / 1e9}s` 
      });

      analyticsMetrics.dataStorageOperations.inc({ operation: 'create', status: 'success' });
      analyticsMetrics.eventProcessingTime.observe({ event_type: type }, dbSecs + dbNanos / 1e9);

      // Update real-time stats in Redis
      logger.debug(`[${requestId}] Starting Redis operations`);
      const redisTimer = metrics.trackQueue('redis').trackLatency();
      switch (type) {
        case 'view':
          await analyticsRedis.trackView(blogId, device);
          analyticsMetrics.eventProcessed.inc({ event_type: 'view', status: 'success' });
          break;
        case 'read':
          await this.updateBlogAnalytics(blogId, 'reads');
          analyticsMetrics.eventProcessed.inc({ event_type: 'read', status: 'success' });
          break;
      }
      redisTimer.end();

      // Update queue metrics
      queueTracker.setSize(0);

      const [totalSecs, totalNanos] = process.hrtime(startTime);
      const totalDuration = totalSecs + totalNanos / 1e9;
      analyticsMetrics.eventProcessingTime.observe({ event_type: 'total' }, totalDuration);

      logger.info(`[${requestId}] Event tracking completed successfully`, {
        type,
        blogId,
        duration: `${totalDuration}s`
      });

      return res.status(200).json({ success: true });
    } catch (error) {
      const errorType = error instanceof z.ZodError ? 'validation' : 'processing';
      const errorMessage = error instanceof Error ? error.message : 'unknown';

      logger.error(`[${requestId}] Error tracking event:`, {
        errorType,
        errorMessage,
        error: error instanceof Error ? error.stack : String(error),
        body: req.body
      });

      metrics.trackError(
        errorType,
        errorMessage,
        'analytics_event_tracking'
      );
      analyticsMetrics.eventProcessed.inc({ event_type: req.body.type || 'unknown', status: 'error' });
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: 'Invalid input data',
          errors: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        });
      }
      
      if (error instanceof Error) {
        switch (error.message) {
          case 'Blog not found':
            return res.status(404).json({
              message: 'Blog not found',
              details: 'The specified blog does not exist'
            });
          case 'Redis connection failed':
            return res.status(503).json({
              message: 'Service temporarily unavailable',
              details: 'Unable to connect to analytics storage'
            });
          case 'Queue full':
            return res.status(503).json({
              message: 'Service busy',
              details: 'Analytics queue is full, please try again later'
            });
        }
      }
      
      logger.error('Unexpected error in event tracking:', error);
      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to process analytics event'
      });
    }
  }

  // Track read progress
  async trackProgress(req: Request, res: Response): Promise<Response> {
    try {
      const startTime = process.hrtime();
      const validatedInput = trackProgressSchema.parse(req.body);
      const { blogId, progress, deviceId, path } = validatedInput;

      // Track queue metrics
      const queueTracker = metrics.trackQueue('progress');
      queueTracker.setSize(1);

      // Store progress in Redis for real-time tracking
      const redisTimer = metrics.trackQueue('redis').trackLatency();
      await analyticsRedis.trackReadProgress(blogId, progress);
      redisTimer.end();
      analyticsMetrics.eventProcessed.inc({ event_type: 'progress', status: 'success' });

      // If progress is 90% or more, count it as a read and store with visitor info
      if (progress >= 90) {
        const dbStartTime = process.hrtime();
        await prisma.analyticsEvent.create({
          data: {
            blogId,
            type: 'read',
            metadata: { progress },
            deviceId,
            path,
          },
        });
        const [dbSecs, dbNanos] = process.hrtime(dbStartTime);
        analyticsMetrics.dataStorageOperations.inc({ operation: 'create', status: 'success' });
        analyticsMetrics.eventProcessingTime.observe({ event_type: 'read' }, dbSecs + dbNanos / 1e9);
        
        await this.updateBlogAnalytics(blogId, 'reads');
      }

      const [totalSecs, totalNanos] = process.hrtime(startTime);
      analyticsMetrics.eventProcessingTime.observe({ event_type: 'progress' }, totalSecs + totalNanos / 1e9);
      queueTracker.setSize(0);

      return res.status(200).json({ success: true });
    } catch (error) {
      metrics.trackError(
        error instanceof z.ZodError ? 'validation' : 'processing',
        error instanceof Error ? error.message : 'unknown',
        'analytics_progress_tracking'
      );
      analyticsMetrics.eventProcessed.inc({ event_type: 'progress', status: 'error' });
      logger.error('Error tracking progress:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: 'Invalid input data',
          errors: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        });
      }
      
      if (error instanceof Error) {
        switch (error.message) {
          case 'Blog not found':
            return res.status(404).json({
              message: 'Blog not found',
              details: 'The specified blog does not exist'
            });
          case 'Invalid progress value':
            return res.status(400).json({
              message: 'Invalid progress value',
              details: 'Progress must be between 0 and 100'
            });
          case 'Storage error':
            return res.status(503).json({
              message: 'Service temporarily unavailable',
              details: 'Unable to store analytics data'
            });
        }
      }
      
      logger.error('Unexpected error in progress tracking:', error);
      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to track reading progress'
      });
    }
  }

  // Track link clicks
  async trackLink(req: Request, res: Response): Promise<Response> {
    try {
      const validatedInput = trackLinkSchema.parse(req.body);
      const { blogId, url, path } = validatedInput;

      // Generate visitor ID for link clicks
      const deviceId = this.generateDeviceId(req);

      const startTime = process.hrtime();
      // Track queue metrics
      const queueTracker = metrics.trackQueue('links');
      queueTracker.setSize(1);

      // Store event in Redis for real-time tracking
      const redisTimer = metrics.trackQueue('redis').trackLatency();
      await analyticsRedis.trackLinkClick(blogId, url);
      redisTimer.end();
      analyticsMetrics.eventProcessed.inc({ event_type: 'click', status: 'success' });
      
      // Store in database for historical tracking with visitor info
      const dbStartTime = process.hrtime();
      await prisma.analyticsEvent.create({
        data: {
          blogId,
          type: 'click',
          metadata: { url },
          deviceId,
          path,
        },
      });
      const [dbSecs, dbNanos] = process.hrtime(dbStartTime);
      analyticsMetrics.dataStorageOperations.inc({ operation: 'create', status: 'success' });
      analyticsMetrics.eventProcessingTime.observe({ event_type: 'click' }, dbSecs + dbNanos / 1e9);
      
      await this.updateBlogAnalytics(blogId, 'linkClicks');

      const [secs, nanos] = process.hrtime(startTime);
      analyticsMetrics.eventProcessingTime.observe({ event_type: 'click' }, secs + nanos / 1e9);
      queueTracker.setSize(0);

      return res.status(200).json({ success: true });
    } catch (error) {
      metrics.trackError(
        error instanceof z.ZodError ? 'validation' : 'processing',
        error instanceof Error ? error.message : 'unknown',
        'analytics_link_tracking'
      );
      analyticsMetrics.eventProcessed.inc({ event_type: 'click', status: 'error' });
      logger.error('Error tracking link click:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: 'Invalid input data',
          errors: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        });
      }
      
      if (error instanceof Error) {
        switch (error.message) {
          case 'Blog not found':
            return res.status(404).json({
              message: 'Blog not found',
              details: 'The specified blog does not exist'
            });
          case 'Invalid URL':
            return res.status(400).json({
              message: 'Invalid URL',
              details: 'The provided URL is not valid'
            });
          case 'Storage error':
            return res.status(503).json({
              message: 'Service temporarily unavailable',
              details: 'Unable to store analytics data'
            });
        }
      }
      
      logger.error('Unexpected error in link tracking:', error);
      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to track link click'
      });
    }
  }

  // Get blog analyticsRedis
  async getBlogAnalytics(req: Request, res: Response): Promise<Response> {
    try {
      const validatedInput = getAnalyticsSchema.parse(req.query);
      const { blogId, timeframe = '24h' } = validatedInput;

      const startTime = process.hrtime();
      // Track queue metrics
      const queueTracker = metrics.trackQueue('aggregation');
      queueTracker.setSize(1);

      // Get real-time stats from Redis
      const realtimeStats = await analyticsRedis.getRealTimeStats(blogId);
      analyticsMetrics.aggregationOperations.inc({ operation_type: 'realtime', status: 'success' });

      // Get historical data from database
      const historicalData = await this.getHistoricalData(blogId, timeframe);
      analyticsMetrics.aggregationOperations.inc({ operation_type: 'historical', status: 'success' });

      const [secs, nanos] = process.hrtime(startTime);
      analyticsMetrics.aggregationDuration.observe({ operation_type: 'total' }, secs + nanos / 1e9);
      queueTracker.setSize(0);

      return res.status(200).json({
        realtime: realtimeStats,
        historical: historicalData,
      });
    } catch (error) {
      metrics.trackError(
        error instanceof z.ZodError ? 'validation' : 'aggregation',
        error instanceof Error ? error.message : 'unknown',
        'analytics_aggregation'
      );
      analyticsMetrics.aggregationOperations.inc({ operation_type: 'total', status: 'error' });
      logger.error('Error fetching analyticsRedis:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: 'Invalid input data',
          errors: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        });
      }
      
      if (error instanceof Error) {
        switch (error.message) {
          case 'Blog not found':
            return res.status(404).json({
              message: 'Blog not found',
              details: 'The specified blog does not exist'
            });
          case 'Invalid timeframe':
            return res.status(400).json({
              message: 'Invalid timeframe',
              details: 'The specified timeframe is not supported'
            });
          case 'Data unavailable':
            return res.status(503).json({
              message: 'Service temporarily unavailable',
              details: 'Analytics data is currently unavailable'
            });
        }
      }
      
      logger.error('Unexpected error fetching analytics:', error);
      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to fetch analytics data'
      });
    }
  }

  // Private helper methods
  private generateDeviceId(req: Request): string {
    const ip = req.ip;
    const userAgent = req.headers['user-agent'] ?? '';
    return crypto
      .createHash('sha256')
      .update(`${ip}-${userAgent}`)
      .digest('hex');
  }

  private async updateBlogAnalytics(
    blogId: string,
    field: 'reads' | 'linkClicks'
  ): Promise<void> {
    const startTime = process.hrtime();
    await prisma.blogAnalytics.upsert({
      where: { blogId },
      create: {
        blogId,
        [field]: 1,
      },
      update: {
        [field]: { increment: 1 },
      },
    });
    
    const [secs, nanos] = process.hrtime(startTime);
    analyticsMetrics.dataStorageOperations.inc({ operation: 'upsert', status: 'success' });
    analyticsMetrics.eventProcessingTime.observe({ event_type: field }, secs + nanos / 1e9);
  }

  private async getHistoricalData(
    blogId: string,
    timeframe: string
  ): Promise<any> {
    const timeframeMap = {
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
    };

    const startTime = process.hrtime();
    try {
      if (timeframe === 'all') {
        const result = await prisma.blogAnalytics.findUnique({
          where: { blogId },
        });
        const [secs, nanos] = process.hrtime(startTime);
        analyticsMetrics.dataStorageOperations.inc({ operation: 'read', status: 'success' });
        analyticsMetrics.eventProcessingTime.observe({ event_type: 'historical_query' }, secs + nanos / 1e9);
        return result;
      }

      const since = new Date(Date.now() - timeframeMap[timeframe as keyof typeof timeframeMap]);

      const result = await prisma.analyticsEvent.groupBy({
        by: ['type'],
        where: {
          blogId,
          timestamp: { gte: since },
        },
        _count: true,
      });
      const [secs, nanos] = process.hrtime(startTime);
      analyticsMetrics.dataStorageOperations.inc({ operation: 'read', status: 'success' });
      analyticsMetrics.eventProcessingTime.observe({ event_type: 'historical_query' }, secs + nanos / 1e9);
      return result;
    } catch (error) {
      const [secs, nanos] = process.hrtime(startTime);
      analyticsMetrics.dataStorageOperations.inc({ operation: 'read', status: 'error' });
      analyticsMetrics.eventProcessingTime.observe({ event_type: 'historical_query' }, secs + nanos / 1e9);
      throw error;
    }
  }
}
