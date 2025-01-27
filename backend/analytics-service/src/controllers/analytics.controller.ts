import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '@shared/utils/prismaClient';
import logger from '@shared/utils/logger';
import { analytics as analyticsRedis } from '@shared/config/redis';
import crypto from 'crypto';

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
      const validatedInput = trackEventSchema.parse(req.body);
      const { blogId, type, metadata, deviceId, path } = validatedInput;

      // Generate device ID if not provided
      const device = deviceId ?? this.generateDeviceId(req);

      // Store event in database
      await prisma.analyticsEvent.create({
        data: {
          blogId,
          type,
          metadata: metadata || {},
          deviceId: device,
          path,
        },
      });

      // Update real-time stats in Redis
      switch (type) {
        case 'view':
          await analyticsRedis.trackView(blogId, device);
          break;
        case 'read':
          await this.updateBlogAnalytics(blogId, 'reads');
          break;
      }

      return res.status(200).json({ success: true });
    } catch (error) {
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
      const validatedInput = trackProgressSchema.parse(req.body);
      const { blogId, progress, deviceId, path } = validatedInput;

      // Store progress in Redis for real-time tracking
      await analyticsRedis.trackReadProgress(blogId, progress);

      // If progress is 90% or more, count it as a read and store with visitor info
      if (progress >= 90) {
        await prisma.analyticsEvent.create({
          data: {
            blogId,
            type: 'read',
            metadata: { progress },
            deviceId,
            path,
          },
        });
        await this.updateBlogAnalytics(blogId, 'reads');
      }

      return res.status(200).json({ success: true });
    } catch (error) {
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

      // Store event in Redis for real-time tracking
      await analyticsRedis.trackLinkClick(blogId, url);
      
      // Store in database for historical tracking with visitor info
      await prisma.analyticsEvent.create({
        data: {
          blogId,
          type: 'click',
          metadata: { url },
          deviceId,
          path,
        },
      });
      
      await this.updateBlogAnalytics(blogId, 'linkClicks');

      return res.status(200).json({ success: true });
    } catch (error) {
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

      // Get real-time stats from Redis
      const realtimeStats = await analyticsRedis.getRealTimeStats(blogId);

      // Get historical data from database
      const historicalData = await this.getHistoricalData(blogId, timeframe);

      return res.status(200).json({
        realtime: realtimeStats,
        historical: historicalData,
      });
    } catch (error) {
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

    if (timeframe === 'all') {
      return prisma.blogAnalytics.findUnique({
        where: { blogId },
      });
    }

    const since = new Date(Date.now() - timeframeMap[timeframe as keyof typeof timeframeMap]);

    return prisma.analyticsEvent.groupBy({
      by: ['type'],
      where: {
        blogId,
        timestamp: { gte: since },
      },
      _count: true,
    });
  }
}
