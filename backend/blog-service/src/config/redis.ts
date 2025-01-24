import Redis from 'ioredis'
import { logger } from '../utils/logger'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

// Create Redis client with retry strategy
export const redis = new Redis(REDIS_URL, {
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000)
    logger.info(`Retrying Redis connection in ${delay}ms...`)
    return delay
  },
  maxRetriesPerRequest: 3,
})

redis.on('error', (err) => {
  logger.error('Redis Client Error:', err)
})

redis.on('connect', () => {
  logger.info('Successfully connected to Redis')
})

// Blog caching helper functions
export const getBlogFromCache = async (slug: string): Promise<string | null> => {
  try {
    return await redis.get(`blog:${slug}`)
  } catch (error) {
    logger.error('Error getting blog from cache:', error)
    return null
  }
}

export const cacheBlog = async (
  slug: string,
  content: string,
  expiryInSeconds: number = 60 * 60 * 24 * 7 // 7 days
): Promise<void> => {
  try {
    await redis.set(`blog:${slug}`, content, 'EX', expiryInSeconds)
  } catch (error) {
    logger.error('Error caching blog:', error)
  }
}

export const invalidateBlogCache = async (slug: string): Promise<void> => {
  try {
    await redis.del(`blog:${slug}`)
  } catch (error) {
    logger.error('Error invalidating blog cache:', error)
  }
}

// Analytics helpers
export const incrementBlogViews = async (blogId: string): Promise<number> => {
  const key = `blog:${blogId}:views`
  try {
    const views = await redis.incr(key)
    // Set expiry if key is new
    if (views === 1) {
      await redis.expire(key, 60 * 15) // 15 minutes
    }
    return views
  } catch (error) {
    logger.error('Error incrementing blog views:', error)
    return 0
  }
}

export const getBlogViews = async (blogId: string): Promise<number> => {
  try {
    const views = await redis.get(`blog:${blogId}:views`)
    return views ? parseInt(views, 10) : 0
  } catch (error) {
    logger.error('Error getting blog views:', error)
    return 0
  }
}

// Search cache helpers
export const cacheSearchResults = async (
  query: string,
  results: string,
  expiryInSeconds: number = 60 * 30 // 30 minutes
): Promise<void> => {
  try {
    await redis.set(`search:${query}`, results, 'EX', expiryInSeconds)
  } catch (error) {
    logger.error('Error caching search results:', error)
  }
}

export const getSearchFromCache = async (query: string): Promise<string | null> => {
  try {
    return await redis.get(`search:${query}`)
  } catch (error) {
    logger.error('Error getting search results from cache:', error)
    return null
  }
}
