import IORedis from 'ioredis';
import logger from '../utils/logger';

/**
 * Redis Configuration Types
 */
interface RedisNode {
  host: string;
  port: number;
}

interface RedisConfig {
  nodes: RedisNode[];
  options: {
    scaleReads: 'slave';
    maxRedirections: number;
    retryDelayOnFailover: number;
    retryDelayOnClusterDown: number;
    retryDelayOnTryAgain: number;
    password?: string;
    enableOfflineQueue: boolean;
    enableReadyCheck: boolean;
    redisOptions: {
      connectTimeout: number;
      maxRetriesPerRequest: number;
      retryStrategy: (times: number) => number;
    };
  };
}

/**
 * Redis Keys and TTL Configuration
 */
export const REDIS_KEYS = {
  // Auth Service Keys
  TOKEN_BLACKLIST: 'bl:',
  RATE_LIMIT: 'rl:',

  // Blog Service Keys
  BLOG: 'blog:',
  BLOG_VIEWS: 'blog:views:',
  BLOG_LIST: 'blog:list:',
  SEARCH: 'search:',
  HOT_BLOGS: 'hot:blogs',
  TAGS: 'tags:popular',
  SUGGESTED: 'suggested:',

  // Analytics Service Keys
  ANALYTICS_VIEWS: 'analytics:views:blog:',
  ANALYTICS_READS: 'analytics:reads:blog:',
  ANALYTICS_UNIQUE_VIEWS: 'analytics:unique_views:blog:',
  ANALYTICS_LINK_CLICKS: 'analytics:clicks:blog:',
  ANALYTICS_VISITOR_HISTORY: 'analytics:visitors:blog:',
  ANALYTICS_READ_PROGRESS: 'analytics:progress:blog:',
  ANALYTICS_CACHE: 'analytics:cache:',
  ANALYTICS_STREAM: 'analytics:stream:events',
  ANALYTICS_AGGREGATED: 'analytics:aggregated:',
  ANALYTICS_HOT_BLOGS: 'analytics:hot:blogs'
};

export const CACHE_TTL = {
  // Auth TTLs
  TOKEN_BLACKLIST: 24 * 60 * 60, // 24 hours

  // Blog TTLs
  BLOG: 7 * 24 * 60 * 60,      // 7 days for blog content
  BLOG_VIEWS: 15 * 60,          // 15 minutes for view counts
  BLOG_LIST: 10 * 60,           // 10 minutes for blog lists
  SEARCH: 30 * 60,              // 30 minutes for search results
  HOT_BLOGS: 5 * 60,            // 5 minutes for hot blogs
  TAGS: 60 * 60,                // 1 hour for popular tags
  SUGGESTED: 2 * 60 * 60,       // 2 hours for suggested blogs

  // Analytics TTLs
  VISITOR_HISTORY: 86400,       // 24 hours
  ANALYTICS_CACHE: 300,         // 5 minutes
  AGGREGATED_DATA: 1800,        // 30 minutes
  REAL_TIME: 60                 // 1 minute
};

// Batch size for bulk operations
const BATCH_SIZE = 1000;

/**
 * Redis Configuration
 */
const REDIS_NODES = (process.env.REDIS_NODES ?? 'localhost:6379')
  .split(',')
  .map(node => {
    const [host, port] = node.split(':');
    return { host, port: parseInt(port) };
  });

const REDIS_CONFIG: RedisConfig = {
  nodes: REDIS_NODES,
  options: {
    scaleReads: 'slave',
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
      retryStrategy: (times: number) => Math.min(times * 50, 2000)
    }
  }
};

/**
 * Redis Client Factory
 */
export class RedisClient {
  private static instance: any;
  private static isCluster: boolean;

  static getInstance(): any {
    if (!RedisClient.instance) {
      RedisClient.isCluster = REDIS_NODES.length > 1;
      
      if (RedisClient.isCluster) {
        RedisClient.instance = new IORedis.Cluster(REDIS_CONFIG.nodes, REDIS_CONFIG.options);
      } else {
        RedisClient.instance = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
          retryStrategy: REDIS_CONFIG.options.redisOptions.retryStrategy,
          maxRetriesPerRequest: REDIS_CONFIG.options.redisOptions.maxRetriesPerRequest
        });
      }

      RedisClient.instance.on('error', (error: Error) => {
        logger.error(`Redis ${RedisClient.isCluster ? 'Cluster' : ''} Error:`, error);
      });

      RedisClient.instance.on('connect', () => {
        logger.info(`Successfully connected to Redis ${RedisClient.isCluster ? 'Cluster' : ''}`);
      });
    }

    return RedisClient.instance;
  }
}

// Initialize Redis client
export const redis = RedisClient.getInstance();

/**
 * Auth Service Helpers
 */
export const tokenBlacklist = {
  add: async (token: string, expiryInSeconds: number): Promise<void> => {
    try {
      await redis.set(
        `${REDIS_KEYS.TOKEN_BLACKLIST}${token}`,
        '1',
        'EX',
        expiryInSeconds
      );
    } catch (error) {
      logger.error('Error adding token to blacklist:', error);
      throw error;
    }
  },

  check: async (token: string): Promise<boolean> => {
    try {
      const result = await redis.get(`${REDIS_KEYS.TOKEN_BLACKLIST}${token}`);
      return result !== null;
    } catch (error) {
      logger.error('Error checking token blacklist:', error);
      throw error;
    }
  }
};

/**
 * Blog Service Helpers
 */
export const blogCache = {
  get: async (slug: string): Promise<string | null> => {
    try {
      return await redis.get(`${REDIS_KEYS.BLOG}${slug}`);
    } catch (error) {
      logger.error('Error getting blog from cache:', error);
      return null;
    }
  },

  set: async (slug: string, content: string): Promise<void> => {
    try {
      await redis
        .multi()
        .set(`${REDIS_KEYS.BLOG}${slug}`, content)
        .expire(`${REDIS_KEYS.BLOG}${slug}`, CACHE_TTL.BLOG)
        .zadd(REDIS_KEYS.HOT_BLOGS, 0, slug)
        .exec();
    } catch (error) {
      logger.error('Error caching blog:', error);
    }
  },

  invalidate: async (slug: string): Promise<void> => {
    try {
      const multi = redis.multi();
      const keys = [
        `${REDIS_KEYS.BLOG}${slug}`,
        `${REDIS_KEYS.BLOG_VIEWS}${slug}`,
        `${REDIS_KEYS.SUGGESTED}${slug}`
      ];
      
      keys.forEach(key => multi.del(key));
      multi.zrem(REDIS_KEYS.HOT_BLOGS, slug);
      
      await multi.exec();
    } catch (error) {
      logger.error('Error invalidating blog cache:', error);
    }
  },

  incrementViews: async (blogId: string): Promise<number> => {
    try {
      const multi = redis.multi();
      const key = `${REDIS_KEYS.BLOG_VIEWS}${blogId}`;

      multi
        .incr(key)
        .expire(key, CACHE_TTL.BLOG_VIEWS)
        .zincrby(REDIS_KEYS.HOT_BLOGS, 1, blogId);
      
      const results = await multi.exec();
      return results?.[0]?.[1] as number || 0;
    } catch (error) {
      logger.error('Error incrementing blog views:', error);
      return 0;
    }
  }
};

/**
 * Analytics Service Helpers
 */
export const analytics = {
  trackView: async (blogId: string, visitorId: string): Promise<void> => {
    try {
      const multi = redis.multi();
      const visitorKey = `${REDIS_KEYS.ANALYTICS_VISITOR_HISTORY}${blogId}`;
      const viewKey = `${REDIS_KEYS.ANALYTICS_VIEWS}${blogId}`;
      const hotBlogsKey = REDIS_KEYS.ANALYTICS_HOT_BLOGS;

      multi
        .incr(viewKey)
        .sadd(visitorKey, visitorId)
        .expire(visitorKey, CACHE_TTL.VISITOR_HISTORY)
        .zincrby(hotBlogsKey, 1, blogId)
        .expire(hotBlogsKey, CACHE_TTL.HOT_BLOGS);

      await multi.exec();
    } catch (error) {
      logger.error('Error tracking view:', error);
    }
  },

  trackReadProgress: async (blogId: string, progress: number): Promise<void> => {
    try {
      const key = `${REDIS_KEYS.ANALYTICS_READ_PROGRESS}${blogId}`;
      const timestamp = Date.now().toString();

      await redis
        .multi()
        .zadd(key, progress, timestamp)
        .zremrangebyrank(key, 0, -BATCH_SIZE)
        .expire(key, CACHE_TTL.ANALYTICS_CACHE)
        .exec();
    } catch (error) {
      logger.error('Error tracking read progress:', error);
    }
  },

  trackLinkClick: async (blogId: string, linkUrl: string): Promise<void> => {
    try {
      const key = `${REDIS_KEYS.ANALYTICS_LINK_CLICKS}${blogId}`;
      await redis
        .multi()
        .hincrby(key, linkUrl, 1)
        .expire(key, CACHE_TTL.ANALYTICS_CACHE)
        .exec();
    } catch (error) {
      logger.error('Error tracking link click:', error);
    }
  },

  getRealTimeStats: async (blogId: string): Promise<{
    views: number;
    uniqueViews: number;
    readProgress: number;
    isHot: boolean;
  }> => {
    const cacheKey = `${REDIS_KEYS.ANALYTICS_CACHE}${blogId}`;
    try {
      const cachedData = await redis.get(cacheKey);
      if (cachedData) {
        return JSON.parse(cachedData);
      }

      const [views, uniqueVisitors, progressData, hotScore] = await Promise.all([
        redis.get(`${REDIS_KEYS.ANALYTICS_VIEWS}${blogId}`),
        redis.scard(`${REDIS_KEYS.ANALYTICS_VISITOR_HISTORY}${blogId}`),
        redis.zrange(`${REDIS_KEYS.ANALYTICS_READ_PROGRESS}${blogId}`, 0, -1, 'WITHSCORES'),
        redis.zscore(REDIS_KEYS.ANALYTICS_HOT_BLOGS, blogId)
      ]);

      const progress = progressData.length > 0
        ? progressData.reduce((acc: number, curr: string, idx: number) => {
            return idx % 2 === 0 ? acc : acc + parseFloat(curr);
          }, 0) / (progressData.length / 2)
        : 0;

      const stats = {
        views: parseInt(views ?? '0'),
        uniqueViews: uniqueVisitors || 0,
        readProgress: progress,
        isHot: parseInt(hotScore ?? '0') > 100
      };

      await redis.setex(
        cacheKey,
        CACHE_TTL.ANALYTICS_CACHE,
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

  getHotBlogs: async (limit: number = 10): Promise<string[]> => {
    try {
      return await redis.zrevrange(REDIS_KEYS.ANALYTICS_HOT_BLOGS, 0, limit - 1);
    } catch (error) {
      logger.error('Error getting hot blogs:', error);
      return [];
    }
  },

  streamEvent: async (eventData: {
    blogId: string;
    type: string;
    data: Record<string, any>;
  }): Promise<void> => {
    try {
      await redis.xadd(
        REDIS_KEYS.ANALYTICS_STREAM,
        'MAXLEN',
        '~',
        BATCH_SIZE,
        '*',
        'event',
        JSON.stringify(eventData)
      );
    } catch (error) {
      logger.error('Error streaming event:', error);
    }
  }
};

/**
 * Search Cache Helpers
 */
export const searchCache = {
  set: async (query: string, results: string): Promise<void> => {
    try {
      await redis
        .multi()
        .set(`${REDIS_KEYS.SEARCH}${query}`, results)
        .expire(`${REDIS_KEYS.SEARCH}${query}`, CACHE_TTL.SEARCH)
        .exec();
    } catch (error) {
      logger.error('Error caching search results:', error);
    }
  },

  get: async (query: string): Promise<string | null> => {
    try {
      return await redis.get(`${REDIS_KEYS.SEARCH}${query}`);
    } catch (error) {
      logger.error('Error getting search results from cache:', error);
      return null;
    }
  }
};

/**
 * Rate Limiting Helper
 */
export const rateLimit = {
  increment: async (key: string, windowSizeInSeconds: number): Promise<number> => {
    const multi = redis.multi();
    multi.incr(`${REDIS_KEYS.RATE_LIMIT}${key}`);
    multi.expire(`${REDIS_KEYS.RATE_LIMIT}${key}`, windowSizeInSeconds);
    const results = await multi.exec();
    return results?.[0]?.[1] as number;
  }
};
