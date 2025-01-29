import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '@shared/utils/prismaClient';
import logger from '@shared/utils/logger';
import { analytics as analyticsRedis } from '@shared/config/redis';
import crypto from 'crypto';
import { analyticsMetrics } from '../config/metrics';

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
    try {
      const startTime = process.hrtime();
      const validatedInput = trackEventSchema.parse(req.body);
      const { blogId, type, metadata, deviceId, path } = validatedInput;

      // Generate device ID if not provided
      const device = deviceId ?? this.generateDeviceId(req);

      // Increment queue size
      analyticsMetrics.queueSize.inc({ queue_type: 'events' });
      
      // Store event in database
      const dbStartTime = process.hrtime();
      await prisma.analyticsEvent.create({
        data: {
          blogId,
          type,
          metadata: metadata || {},
          deviceId: device,
          path,
        },
      });
      
      const [dbSecs, dbNanos] = process.hrtime(dbStartTime);
      analyticsMetrics.dataStorageOperations.inc({ operation: 'create', status: 'success' });
      analyticsMetrics.eventProcessingTime.observe({ event_type: type }, dbSecs + dbNanos / 1e9);

      // Update real-time stats in Redis
      const redisStartTime = process.hrtime();
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

      const [redisSecs, redisNanos] = process.hrtime(redisStartTime);
      analyticsMetrics.queueLatency.observe({ queue_type: 'redis' }, redisSecs + redisNanos / 1e9);

      // Decrement queue size
      analyticsMetrics.queueSize.dec({ queue_type: 'events' });

      const [totalSecs, totalNanos] = process.hrtime(startTime);
      analyticsMetrics.eventProcessingTime.observe({ event_type: 'total' }, totalSecs + totalNanos / 1e9);

      return res.status(200).json({ success: true });
    } catch (error) {
      analyticsMetrics.errorCount.inc({ error_type: error instanceof z.ZodError ? 'validation' : 'processing' });
      analyticsMetrics.eventProcessed.inc({ event_type: req.body.type || 'unknown', status: 'error' });
      logger.error('Error tracking event:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Track read progress
  async trackProgress(req: Request, res: Response): Promise<Response> {
    try {
      const startTime = process.hrtime();
      const validatedInput = trackProgressSchema.parse(req.body);
      const { blogId, progress, deviceId, path } = validatedInput;

      // Increment queue size
      analyticsMetrics.queueSize.inc({ queue_type: 'progress' });

      // Store progress in Redis for real-time tracking
      const redisStartTime = process.hrtime();
      await analyticsRedis.trackReadProgress(blogId, progress);
      const [redisSecs, redisNanos] = process.hrtime(redisStartTime);
      analyticsMetrics.queueLatency.observe({ queue_type: 'redis' }, redisSecs + redisNanos / 1e9);
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
      analyticsMetrics.queueSize.dec({ queue_type: 'progress' });

      return res.status(200).json({ success: true });
    } catch (error) {
      analyticsMetrics.errorCount.inc({ error_type: error instanceof z.ZodError ? 'validation' : 'processing' });
      analyticsMetrics.eventProcessed.inc({ event_type: 'progress', status: 'error' });
      logger.error('Error tracking progress:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      return res.status(500).json({ error: 'Internal server error' });
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
      analyticsMetrics.queueSize.inc({ queue_type: 'links' });

      // Store event in Redis for real-time tracking
      const redisStartTime = process.hrtime();
      await analyticsRedis.trackLinkClick(blogId, url);
      const [redisSecs, redisNanos] = process.hrtime(redisStartTime);
      analyticsMetrics.queueLatency.observe({ queue_type: 'redis' }, redisSecs + redisNanos / 1e9);
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
      analyticsMetrics.queueSize.dec({ queue_type: 'links' });

      return res.status(200).json({ success: true });
    } catch (error) {
      analyticsMetrics.errorCount.inc({ error_type: error instanceof z.ZodError ? 'validation' : 'processing' });
      analyticsMetrics.eventProcessed.inc({ event_type: 'click', status: 'error' });
      logger.error('Error tracking link click:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Get blog analyticsRedis
  async getBlogAnalytics(req: Request, res: Response): Promise<Response> {
    try {
      const validatedInput = getAnalyticsSchema.parse(req.query);
      const { blogId, timeframe = '24h' } = validatedInput;

      const startTime = process.hrtime();
      analyticsMetrics.queueSize.inc({ queue_type: 'aggregation' });

      // Get real-time stats from Redis
      const realtimeStats = await analyticsRedis.getRealTimeStats(blogId);
      analyticsMetrics.aggregationOperations.inc({ operation_type: 'realtime', status: 'success' });

      // Get historical data from database
      const historicalData = await this.getHistoricalData(blogId, timeframe);
      analyticsMetrics.aggregationOperations.inc({ operation_type: 'historical', status: 'success' });

      const [secs, nanos] = process.hrtime(startTime);
      analyticsMetrics.aggregationDuration.observe({ operation_type: 'total' }, secs + nanos / 1e9);
      analyticsMetrics.queueSize.dec({ queue_type: 'aggregation' });

      return res.status(200).json({
        realtime: realtimeStats,
        historical: historicalData,
      });
    } catch (error) {
      analyticsMetrics.errorCount.inc({ error_type: error instanceof z.ZodError ? 'validation' : 'aggregation' });
      analyticsMetrics.aggregationOperations.inc({ operation_type: 'total', status: 'error' });
      logger.error('Error fetching analyticsRedis:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      return res.status(500).json({ error: 'Internal server error' });
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
