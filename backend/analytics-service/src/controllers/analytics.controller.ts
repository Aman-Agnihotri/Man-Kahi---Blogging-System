import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '@shared/utils/prismaClient';
import logger from '@shared/utils/logger';
import { redactSensitiveFields } from '@shared/utils/redact';
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

const blogIdParamSchema = z.object({
  blogId: z.string().min(1),
});

// timeframe/start/end are accepted (admin-service forwards them) but are not
// currently used to filter the response: BlogAnalytics is a single
// cumulative row per blog, not a time-bucketed series, so there is nothing
// to filter by yet. Kept as an optional, validated no-op for forward
// compatibility and so malformed values still surface as 400s.
const blogAnalyticsQuerySchema = z.object({
  timeframe: z.enum(['1h', '24h', '7d', '30d', 'all']).optional(),
  start: z.string().optional(),
  end: z.string().optional(),
});

const multiBlogAnalyticsQuerySchema = z.object({
  blogIds: z.union([z.array(z.string()), z.string()]),
});

// Field set matching the real Prisma BlogAnalytics columns that the admin
// service (and its BaseAnalytics TypeScript contract) actually consumes.
// Deliberately excludes recentVisitors/interactionEvents - those are large
// internal JSON blobs, not part of the public analytics contract.
const BLOG_ANALYTICS_SELECT = {
  id: true,
  blogId: true,
  views: true,
  uniqueViews: true,
  reads: true,
  readProgress: true,
  linkClicks: true,
  shareCount: true,
  likes: true,
  comments: true,
  shares: true,
  engagement: true,
  deviceStats: true,
  referrerStats: true,
  timeSpentStats: true,
  lastUpdated: true,
} as const;

type BlogAnalyticsRow = {
  id: string;
  blogId: string;
  views: number;
  uniqueViews: number;
  reads: number;
  readProgress: number;
  linkClicks: number;
  shareCount: number;
  likes: number;
  comments: number;
  shares: number;
  engagement: number;
  deviceStats: unknown;
  referrerStats: unknown;
  timeSpentStats: unknown;
  lastUpdated: Date;
};

function zeroedBlogAnalytics(blogId: string): BlogAnalyticsRow {
  return {
    id: '',
    blogId,
    views: 0,
    uniqueViews: 0,
    reads: 0,
    readProgress: 0,
    linkClicks: 0,
    shareCount: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    engagement: 0,
    deviceStats: null,
    referrerStats: null,
    timeSpentStats: null,
    lastUpdated: new Date(0),
  };
}

export class AnalyticsController {
  // Track generic analyticsRedis event
  async trackEvent(req: Request, res: Response): Promise<Response> {
    const requestId = req.headers['x-request-id'] || Math.random().toString(36).substring(7);
    logger.info(`[${requestId}] Starting event tracking`);

    try {
      const startTime = process.hrtime();
      logger.debug({ body: redactSensitiveFields(req.body) }, `[${requestId}] Validating event input`);
      const validatedInput = trackEventSchema.parse(req.body);
      logger.debug(`[${requestId}] Input validation successful`);
      const { blogId, type, metadata, deviceId, path } = validatedInput;

      // Generate device ID if not provided
      const device = deviceId ?? this.generateDeviceId(req);
      logger.debug({ deviceId: device }, `[${requestId}] Generated device ID`);

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
      logger.debug({
        eventId: event.id,
        duration: `${dbSecs + dbNanos / 1e9}s`
      }, `[${requestId}] Database operation completed`);

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

      logger.info({
        type,
        blogId,
        duration: `${totalDuration}s`
      }, `[${requestId}] Event tracking completed successfully`);

      return res.status(200).json({ success: true });
    } catch (error) {
      const errorType = error instanceof z.ZodError ? 'validation' : 'processing';
      const errorMessage = error instanceof Error ? error.message : 'unknown';

      logger.error({
        errorType,
        errorMessage,
        error: error instanceof Error ? error.stack : String(error),
        body: redactSensitiveFields(req.body)
      }, `[${requestId}] Error tracking event`);

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
      
      logger.error({ err: error }, 'Unexpected error in event tracking');
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
      logger.error({ err: error }, 'Error tracking progress');
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
      
      logger.error({ err: error }, 'Unexpected error in progress tracking');
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
      logger.error({ err: error }, 'Error tracking link click');
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
      
      logger.error({ err: error }, 'Unexpected error in link tracking');
      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to track link click'
      });
    }
  }

  // Get blog analytics: a flat snapshot matching the Prisma BlogAnalytics
  // row, refreshed with live Redis counters where that improves freshness.
  async getBlogAnalytics(req: Request, res: Response): Promise<Response> {
    try {
      const { blogId } = blogIdParamSchema.parse(req.params);
      blogAnalyticsQuerySchema.parse(req.query);

      const startTime = process.hrtime();
      const queueTracker = metrics.trackQueue('aggregation');
      queueTracker.setSize(1);

      // Get real-time stats from Redis
      const realtimeStats = await analyticsRedis.getRealTimeStats(blogId);
      analyticsMetrics.aggregationOperations.inc({ operation_type: 'realtime', status: 'success' });

      // Get the persisted analytics row, if any. A blog with no analytics
      // yet is a normal state (e.g. brand new blog), not an error.
      const row = await prisma.blogAnalytics.findUnique({
        where: { blogId },
        select: BLOG_ANALYTICS_SELECT,
      });
      analyticsMetrics.aggregationOperations.inc({ operation_type: 'historical', status: 'success' });

      const base: BlogAnalyticsRow = row ?? zeroedBlogAnalytics(blogId);

      // Merge in live Redis counters where they improve freshness - the DB
      // row is only updated periodically, while Redis tracks views in
      // real time.
      const merged: BlogAnalyticsRow = {
        ...base,
        views: Math.max(base.views, realtimeStats.views),
        uniqueViews: Math.max(base.uniqueViews, realtimeStats.uniqueViews),
      };

      const [secs, nanos] = process.hrtime(startTime);
      analyticsMetrics.aggregationDuration.observe({ operation_type: 'total' }, secs + nanos / 1e9);
      queueTracker.setSize(0);

      return res.status(200).json(merged);
    } catch (error) {
      metrics.trackError(
        error instanceof z.ZodError ? 'validation' : 'aggregation',
        error instanceof Error ? error.message : 'unknown',
        'analytics_aggregation'
      );
      analyticsMetrics.aggregationOperations.inc({ operation_type: 'total', status: 'error' });
      logger.error({ err: error }, 'Error fetching analyticsRedis');
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

      logger.error({ err: error }, 'Unexpected error fetching analytics');
      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to fetch analytics data'
      });
    }
  }

  // Platform-wide aggregate stats across all blogs
  async getOverallStats(_req: Request, res: Response): Promise<Response> {
    try {
      const [aggregate, trackedBlogs] = await Promise.all([
        prisma.blogAnalytics.aggregate({
          _sum: { views: true, uniqueViews: true, reads: true, linkClicks: true },
          _avg: { readProgress: true, engagement: true },
        }),
        prisma.blogAnalytics.count(),
      ]);
      analyticsMetrics.aggregationOperations.inc({ operation_type: 'overall_stats', status: 'success' });

      return res.status(200).json({
        views: aggregate._sum.views ?? 0,
        uniqueViews: aggregate._sum.uniqueViews ?? 0,
        reads: aggregate._sum.reads ?? 0,
        linkClicks: aggregate._sum.linkClicks ?? 0,
        avgReadProgress: aggregate._avg.readProgress ?? 0,
        avgEngagement: aggregate._avg.engagement ?? 0,
        trackedBlogs,
      });
    } catch (error) {
      analyticsMetrics.aggregationOperations.inc({ operation_type: 'overall_stats', status: 'error' });
      logger.error({ err: error }, 'Error fetching overall stats');
      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to fetch overall analytics stats'
      });
    }
  }

  // Top blogs by views descending
  async getTrending(_req: Request, res: Response): Promise<Response> {
    try {
      const rows = await prisma.blogAnalytics.findMany({
        orderBy: { views: 'desc' },
        take: 10,
        select: BLOG_ANALYTICS_SELECT,
      });
      analyticsMetrics.aggregationOperations.inc({ operation_type: 'trending', status: 'success' });

      return res.status(200).json(rows);
    } catch (error) {
      analyticsMetrics.aggregationOperations.inc({ operation_type: 'trending', status: 'error' });
      logger.error({ err: error }, 'Error fetching trending blogs');
      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to fetch trending blogs'
      });
    }
  }

  // Batch analytics for a set of blogs
  async getMultiBlogAnalytics(req: Request, res: Response): Promise<Response> {
    try {
      const validatedInput = multiBlogAnalyticsQuerySchema.parse(req.query);
      const blogIds = (
        Array.isArray(validatedInput.blogIds)
          ? validatedInput.blogIds
          : validatedInput.blogIds.split(',')
      )
        .map(id => id.trim())
        .filter(Boolean);

      if (blogIds.length === 0) {
        return res.status(400).json({
          message: 'Invalid input data',
          details: 'blogIds query parameter is required'
        });
      }

      const rows = await prisma.blogAnalytics.findMany({
        where: { blogId: { in: blogIds } },
        select: BLOG_ANALYTICS_SELECT,
      });
      analyticsMetrics.aggregationOperations.inc({ operation_type: 'multi', status: 'success' });

      return res.status(200).json(rows);
    } catch (error) {
      analyticsMetrics.aggregationOperations.inc({ operation_type: 'multi', status: 'error' });
      logger.error({ err: error }, 'Error fetching multi blog analytics');
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: 'Invalid input data',
          errors: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        });
      }
      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to fetch analytics for the requested blogs'
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

}
