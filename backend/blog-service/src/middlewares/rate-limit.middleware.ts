import { Request, Response, NextFunction } from 'express'
import { RateLimiterRedis } from 'rate-limiter-flexible'
import { redis } from '../config/redis'
import { logger } from '../utils/logger'

// Different rate limit configurations
const rateLimitConfigs = {
  api: {
    points: 30, // Number of requests
    duration: 60, // Per minute
    blockDuration: 60 * 15, // 15 minutes block
  },
  search: {
    points: 10, // Number of searches
    duration: 60, // Per minute
    blockDuration: 60 * 5, // 5 minutes block
  },
}

// Create rate limiters
const apiLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl:blog:api',
  points: rateLimitConfigs.api.points,
  duration: rateLimitConfigs.api.duration,
  blockDuration: rateLimitConfigs.api.blockDuration,
})

const searchLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl:blog:search',
  points: rateLimitConfigs.search.points,
  duration: rateLimitConfigs.search.duration,
  blockDuration: rateLimitConfigs.search.blockDuration,
})

// Helper function to get client IP
const getClientIp = (req: Request): string => {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
    req.socket.remoteAddress ||
    'unknown'
  )
}

// Middleware for general API endpoints
export const apiRateLimit = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const clientIp = getClientIp(req)
    await apiLimiter.consume(clientIp)
    next()
  } catch (error) {
    if (error instanceof Error) {
      logger.warn(`API rate limit exceeded for IP: ${getClientIp(req)}`)
      const retryAfter = (error as any).msBeforeNext
        ? Math.round((error as any).msBeforeNext / 1000)
        : undefined
      if (retryAfter) {
        res.set('Retry-After', String(retryAfter))
      }
      res.status(429).json({
        message: 'Too many requests, please try again later',
        retryAfter,
      })
    } else {
      logger.error('Unknown rate limit error:', error)
      res.status(500).json({ message: 'Internal server error' })
    }
  }
}

// Middleware for search endpoints
export const searchRateLimit = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const clientIp = getClientIp(req)
    await searchLimiter.consume(clientIp)
    next()
  } catch (error) {
    if (error instanceof Error) {
      logger.warn(`Search rate limit exceeded for IP: ${getClientIp(req)}`)
      const retryAfter = (error as any).msBeforeNext
        ? Math.round((error as any).msBeforeNext / 1000)
        : undefined
      if (retryAfter) {
        res.set('Retry-After', String(retryAfter))
      }
      res.status(429).json({
        message: 'Search limit reached, please try again later',
        retryAfter,
      })
    } else {
      logger.error('Unknown rate limit error:', error)
      res.status(500).json({ message: 'Internal server error' })
    }
  }
}

// Reset rate limit for an IP (useful for testing or manual intervention)
export const resetRateLimit = async (ip: string, type: 'api' | 'search'): Promise<void> => {
  try {
    const limiter = type === 'api' ? apiLimiter : searchLimiter
    await limiter.delete(ip)
    logger.info(`Rate limit reset for IP: ${ip}, type: ${type}`)
  } catch (error) {
    logger.error(`Error resetting rate limit for IP: ${ip}`, error)
    throw error
  }
}
