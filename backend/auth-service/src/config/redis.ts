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

// Token blacklist management
export const addToBlacklist = async (token: string, expiryInSeconds: number) => {
  try {
    await redis.set(`bl:${token}`, '1', 'EX', expiryInSeconds)
  } catch (error) {
    logger.error('Error adding token to blacklist:', error)
    throw error
  }
}

export const isBlacklisted = async (token: string): Promise<boolean> => {
  try {
    const result = await redis.get(`bl:${token}`)
    return result !== null
  } catch (error) {
    logger.error('Error checking token blacklist:', error)
    throw error
  }
}

// Rate limiting helper
export const incrementRateLimit = async (
  key: string,
  windowSizeInSeconds: number
): Promise<number> => {
  const multi = redis.multi()
  multi.incr(key)
  multi.expire(key, windowSizeInSeconds)
  const results = await multi.exec()
  return results?.[0]?.[1] as number
}
