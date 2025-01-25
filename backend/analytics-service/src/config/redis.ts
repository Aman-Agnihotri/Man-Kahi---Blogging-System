import Redis from 'ioredis';
import { logger } from '@utils/logger';

const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
};

export const redis = new Redis(REDIS_CONFIG);

// Analytics-specific Redis keys/prefixes
export const REDIS_KEYS = {
  BLOG_VIEWS: 'analytics:views:blog:',
  BLOG_READS: 'analytics:reads:blog:',
  BLOG_UNIQUE_VIEWS: 'analytics:unique_views:blog:',
  LINK_CLICKS: 'analytics:clicks:blog:',
  VISITOR_HISTORY: 'analytics:visitors:blog:',
  READ_PROGRESS: 'analytics:progress:blog:',
  CACHE_ANALYTICS: 'analytics:cache:',
  REAL_TIME_STREAM: 'analytics:stream:events'
};

export const CACHE_TTL = {
  VISITOR_HISTORY: 86400, // 24 hours
  ANALYTICS_CACHE: 300,   // 5 minutes
  AGGREGATED_DATA: 1800   // 30 minutes
};

// Initialize Redis connection
redis.on('connect', () => {
  logger.info('Redis connected successfully');
});

redis.on('error', (error) => {
  logger.error('Redis connection error:', error);
});

// Helper functions for analytics operations
export const analyticsRedis = {
  // Increment view count and store unique visitor
  async trackView(blogId: string, visitorId: string): Promise<void> {
    const multi = redis.multi();
    const visitorKey = `${REDIS_KEYS.VISITOR_HISTORY}${blogId}`;
    const viewKey = `${REDIS_KEYS.BLOG_VIEWS}${blogId}`;

    multi
      .incr(viewKey)
      .sadd(visitorKey, visitorId)
      .expire(visitorKey, CACHE_TTL.VISITOR_HISTORY);

    await multi.exec();
  },

  // Track read progress for a blog
  async trackReadProgress(blogId: string, progress: number): Promise<void> {
    const key = `${REDIS_KEYS.READ_PROGRESS}${blogId}`;
    await redis.zadd(key, progress, Date.now().toString());
  },

  // Track link click
  async trackLinkClick(blogId: string, linkUrl: string): Promise<void> {
    const key = `${REDIS_KEYS.LINK_CLICKS}${blogId}`;
    await redis.hincrby(key, linkUrl, 1);
  },

  // Get real-time analytics for a blog
  async getRealTimeStats(blogId: string): Promise<{
    views: number;
    uniqueViews: number;
    readProgress: number;
  }> {
    const [views, uniqueVisitors, progressData] = await Promise.all([
      redis.get(`${REDIS_KEYS.BLOG_VIEWS}${blogId}`),
      redis.scard(`${REDIS_KEYS.VISITOR_HISTORY}${blogId}`),
      redis.zrange(`${REDIS_KEYS.READ_PROGRESS}${blogId}`, 0, -1, 'WITHSCORES')
    ]);

    // Calculate average read progress
    const progress = progressData.length > 0
      ? progressData.reduce((acc, curr, idx) => {
          return idx % 2 === 0 ? acc : acc + parseFloat(curr);
        }, 0) / (progressData.length / 2)
      : 0;

    return {
      views: parseInt(views || '0'),
      uniqueViews: uniqueVisitors || 0,
      readProgress: progress
    };
  },

  // Stream real-time analytics event
  async streamEvent(eventData: {
    blogId: string;
    type: string;
    data: Record<string, any>;
  }): Promise<void> {
    await redis.xadd(
      REDIS_KEYS.REAL_TIME_STREAM,
      '*',
      'event', JSON.stringify(eventData)
    );
  }
};
