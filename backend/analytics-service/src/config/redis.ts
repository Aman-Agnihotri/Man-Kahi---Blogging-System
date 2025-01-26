import Redis from 'ioredis';
import { logger } from '@utils/logger';

// Redis Cluster Configuration
const REDIS_NODES = (process.env.REDIS_NODES ?? 'localhost:6379')
  .split(',')
  .map(node => {
    const [host, port] = node.split(':');
    return { host, port: parseInt(port) };
  });

const REDIS_CONFIG = {
  nodes: REDIS_NODES,
  options: {
    scaleReads: 'slave' as const, // Read from slave nodes
    maxRedirections: 16,
    retryDelayOnFailover: 100,
    retryDelayOnClusterDown: 100,
    retryDelayOnTryAgain: 100,
    password: process.env.REDIS_PASSWORD,
    enableOfflineQueue: true,
    enableReadyCheck: true,
    redisOptions: {
      connectTimeout: 10000,
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      }
    }
  }
};

// Initialize Redis Cluster
export const redis = new Redis.Cluster(REDIS_CONFIG.nodes, REDIS_CONFIG.options);

// Analytics-specific Redis keys/prefixes with TTL management
export const REDIS_KEYS = {
  BLOG_VIEWS: 'analytics:views:blog:',
  BLOG_READS: 'analytics:reads:blog:',
  BLOG_UNIQUE_VIEWS: 'analytics:unique_views:blog:',
  LINK_CLICKS: 'analytics:clicks:blog:',
  VISITOR_HISTORY: 'analytics:visitors:blog:',
  READ_PROGRESS: 'analytics:progress:blog:',
  CACHE_ANALYTICS: 'analytics:cache:',
  REAL_TIME_STREAM: 'analytics:stream:events',
  AGGREGATED_STATS: 'analytics:aggregated:',
  HOT_BLOGS: 'analytics:hot:blogs'
};

export const CACHE_TTL = {
  VISITOR_HISTORY: 86400,    // 24 hours
  ANALYTICS_CACHE: 300,      // 5 minutes
  AGGREGATED_DATA: 1800,     // 30 minutes
  HOT_BLOGS: 600,           // 10 minutes
  REAL_TIME: 60             // 1 minute
};

// Batch size for bulk operations
const BATCH_SIZE = 1000;

// Initialize Redis Cluster connection
redis.on('connect', () => {
  logger.info('Redis Cluster connected successfully');
});

redis.on('error', (error) => {
  logger.error('Redis Cluster connection error:', error);
});

// Enhanced helper functions for analytics operations
export const analyticsRedis = {
  // Track view with batching and error handling
  async trackView(blogId: string, visitorId: string): Promise<void> {
    try {
      const multi = redis.multi();
      const visitorKey = `${REDIS_KEYS.VISITOR_HISTORY}${blogId}`;
      const viewKey = `${REDIS_KEYS.BLOG_VIEWS}${blogId}`;
      const hotBlogsKey = REDIS_KEYS.HOT_BLOGS;

      multi
        .incr(viewKey)
        .sadd(visitorKey, visitorId)
        .expire(visitorKey, CACHE_TTL.VISITOR_HISTORY)
        .zincrby(hotBlogsKey, 1, blogId)
        .expire(hotBlogsKey, CACHE_TTL.HOT_BLOGS);

      await multi.exec();
    } catch (error) {
      logger.error('Error tracking view:', error);
      // Implement fallback mechanism or retry logic
    }
  },

  // Enhanced read progress tracking with aggregation
  async trackReadProgress(blogId: string, progress: number): Promise<void> {
    try {
      const key = `${REDIS_KEYS.READ_PROGRESS}${blogId}`;
      const timestamp = Date.now().toString();

      await redis
        .multi()
        .zadd(key, progress, timestamp)
        .zremrangebyrank(key, 0, -BATCH_SIZE) // Keep only recent entries
        .expire(key, CACHE_TTL.ANALYTICS_CACHE)
        .exec();
    } catch (error) {
      logger.error('Error tracking read progress:', error);
    }
  },

  // Enhanced link click tracking with batching
  async trackLinkClick(blogId: string, linkUrl: string): Promise<void> {
    try {
      const key = `${REDIS_KEYS.LINK_CLICKS}${blogId}`;
      await redis
        .multi()
        .hincrby(key, linkUrl, 1)
        .expire(key, CACHE_TTL.ANALYTICS_CACHE)
        .exec();
    } catch (error) {
      logger.error('Error tracking link click:', error);
    }
  },

  // Get real-time stats with caching
  async getRealTimeStats(blogId: string): Promise<{
    views: number;
    uniqueViews: number;
    readProgress: number;
    isHot: boolean;
  }> {
    const cacheKey = `${REDIS_KEYS.CACHE_ANALYTICS}${blogId}`;
    
    try {
      // Try to get cached data first
      const cachedData = await redis.get(cacheKey);
      if (cachedData) {
        return JSON.parse(cachedData);
      }

      // If no cached data, fetch fresh stats
      const [views, uniqueVisitors, progressData, hotScore] = await Promise.all([
        redis.get(`${REDIS_KEYS.BLOG_VIEWS}${blogId}`),
        redis.scard(`${REDIS_KEYS.VISITOR_HISTORY}${blogId}`),
        redis.zrange(`${REDIS_KEYS.READ_PROGRESS}${blogId}`, 0, -1, 'WITHSCORES'),
        redis.zscore(REDIS_KEYS.HOT_BLOGS, blogId)
      ]);

      // Calculate average read progress
      const progress = progressData.length > 0
        ? progressData.reduce((acc, curr, idx) => {
            return idx % 2 === 0 ? acc : acc + parseFloat(curr);
          }, 0) / (progressData.length / 2)
        : 0;

      const stats = {
        views: parseInt(views ?? '0'),
        uniqueViews: uniqueVisitors || 0,
        readProgress: progress,
        isHot: parseInt(hotScore ?? '0') > 100
      };

      // Cache the results
      await redis.setex(
        cacheKey,
        CACHE_TTL.REAL_TIME,
        JSON.stringify(stats)
      );

      return stats;
    } catch (error) {
      logger.error('Error getting real-time stats:', error);
      return {
        views: 0,
        uniqueViews: 0,
        readProgress: 0,
        isHot: false
      };
    }
  },

  // Stream real-time analytics with rate limiting
  async streamEvent(eventData: {
    blogId: string;
    type: string;
    data: Record<string, any>;
  }): Promise<void> {
    try {
      await redis.xadd(
        REDIS_KEYS.REAL_TIME_STREAM,
        'MAXLEN', '~', BATCH_SIZE, // Limit stream length
        '*',
        'event',
        JSON.stringify(eventData)
      );
    } catch (error) {
      logger.error('Error streaming event:', error);
    }
  },

  // Get hot blogs
  async getHotBlogs(limit: number = 10): Promise<string[]> {
    return redis.zrevrange(REDIS_KEYS.HOT_BLOGS, 0, limit - 1)
      .catch(error => {
        logger.error('Error getting hot blogs:', error);
        return [];
      });
  }
};
