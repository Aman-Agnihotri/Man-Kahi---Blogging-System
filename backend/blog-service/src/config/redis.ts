import Redis from 'ioredis';
import { logger } from '../utils/logger';

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
    scaleReads: 'slave' as const,
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

// Cache keys and TTLs
const CACHE_KEYS = {
  BLOG: 'blog:',
  BLOG_VIEWS: 'blog:views:',
  BLOG_LIST: 'blog:list:',
  SEARCH: 'search:',
  HOT_BLOGS: 'hot:blogs',
  TAGS: 'tags:popular',
  SUGGESTED: 'suggested:'
};

const CACHE_TTL = {
  BLOG: 7 * 24 * 60 * 60,      // 7 days for blog content
  BLOG_VIEWS: 15 * 60,         // 15 minutes for view counts
  BLOG_LIST: 10 * 60,          // 10 minutes for blog lists
  SEARCH: 30 * 60,             // 30 minutes for search results
  HOT_BLOGS: 5 * 60,           // 5 minutes for hot blogs
  TAGS: 60 * 60,               // 1 hour for popular tags
  SUGGESTED: 2 * 60 * 60       // 2 hours for suggested blogs
};

// Batch size for operations
const BATCH_SIZE = 1000;

redis.on('error', (err) => {
  logger.error('Redis Cluster Error:', err);
});

redis.on('connect', () => {
  logger.info('Successfully connected to Redis Cluster');
});

// Enhanced blog caching helper functions
export const getBlogFromCache = async (slug: string): Promise<string | null> => {
  try {
    const key = `${CACHE_KEYS.BLOG}${slug}`;
    return await redis.get(key);
  } catch (error) {
    logger.error('Error getting blog from cache:', error);
    return null;
  }
};

export const cacheBlog = async (
  slug: string,
  content: string,
): Promise<void> => {
  try {
    const key = `${CACHE_KEYS.BLOG}${slug}`;
    await redis
      .multi()
      .set(key, content)
      .expire(key, CACHE_TTL.BLOG)
      .zadd(CACHE_KEYS.HOT_BLOGS, 0, slug)
      .exec();
  } catch (error) {
    logger.error('Error caching blog:', error);
  }
};

export const invalidateBlogCache = async (slug: string): Promise<void> => {
  try {
    const multi = redis.multi();
    const keys = [
      `${CACHE_KEYS.BLOG}${slug}`,
      `${CACHE_KEYS.BLOG_VIEWS}${slug}`,
      `${CACHE_KEYS.SUGGESTED}${slug}`
    ];
    
    keys.forEach(key => multi.del(key));
    // Remove from hot blogs
    multi.zrem(CACHE_KEYS.HOT_BLOGS, slug);
    
    await multi.exec();
  } catch (error) {
    logger.error('Error invalidating blog cache:', error);
  }
};

// Enhanced analytics helpers with batching
export const incrementBlogViews = async (blogId: string): Promise<number> => {
  const key = `${CACHE_KEYS.BLOG_VIEWS}${blogId}`;
  try {
    const multi = redis.multi();
    multi
      .incr(key)
      .expire(key, CACHE_TTL.BLOG_VIEWS)
      .zincrby(CACHE_KEYS.HOT_BLOGS, 1, blogId);
    
    const results = await multi.exec();
    return results?.[0]?.[1] as number || 0;
  } catch (error) {
    logger.error('Error incrementing blog views:', error);
    return 0;
  }
};

export const getBlogViews = async (blogId: string): Promise<number> => {
  try {
    const key = `${CACHE_KEYS.BLOG_VIEWS}${blogId}`;
    const views = await redis.get(key);
    return views ? parseInt(views, 10) : 0;
  } catch (error) {
    logger.error('Error getting blog views:', error);
    return 0;
  }
};

// Enhanced search cache with pagination support
export const cacheSearchResults = async (
  query: string,
  results: string,
): Promise<void> => {
  try {
    const key = `${CACHE_KEYS.SEARCH}${query}`;
    await redis
      .multi()
      .set(key, results)
      .expire(key, CACHE_TTL.SEARCH)
      .exec();
  } catch (error) {
    logger.error('Error caching search results:', error);
  }
};

export const getSearchFromCache = async (query: string): Promise<string | null> => {
  try {
    const key = `${CACHE_KEYS.SEARCH}${query}`;
    return await redis.get(key);
  } catch (error) {
    logger.error('Error getting search results from cache:', error);
    return null;
  }
};

// New helper functions for improved caching

export const cachePopularTags = async (tags: string): Promise<void> => {
  try {
    await redis
      .multi()
      .set(CACHE_KEYS.TAGS, tags)
      .expire(CACHE_KEYS.TAGS, CACHE_TTL.TAGS)
      .exec();
  } catch (error) {
    logger.error('Error caching popular tags:', error);
  }
};

export const getPopularTagsFromCache = async (): Promise<string | null> => {
  try {
    return await redis.get(CACHE_KEYS.TAGS);
  } catch (error) {
    logger.error('Error getting popular tags from cache:', error);
    return null;
  }
};

export const cacheSuggestedBlogs = async (
  blogId: string,
  suggestions: string
): Promise<void> => {
  try {
    const key = `${CACHE_KEYS.SUGGESTED}${blogId}`;
    await redis
      .multi()
      .set(key, suggestions)
      .expire(key, CACHE_TTL.SUGGESTED)
      .exec();
  } catch (error) {
    logger.error('Error caching suggested blogs:', error);
  }
};

export const getSuggestedBlogsFromCache = async (
  blogId: string
): Promise<string | null> => {
  try {
    const key = `${CACHE_KEYS.SUGGESTED}${blogId}`;
    return await redis.get(key);
  } catch (error) {
    logger.error('Error getting suggested blogs from cache:', error);
    return null;
  }
};

export const getHotBlogs = async (limit: number = 10): Promise<string[]> => {
  try {
    return await redis.zrevrange(CACHE_KEYS.HOT_BLOGS, 0, limit - 1);
  } catch (error) {
    logger.error('Error getting hot blogs:', error);
    return [];
  }
};
