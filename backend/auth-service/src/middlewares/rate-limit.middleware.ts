import { Request, Response, NextFunction } from 'express'
import { RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible'
import { redis } from '../config/redis'
import { logger } from '../utils/logger'

// Different rate limit configurations
const rateLimitConfigs = {
  auth: {
    points: 5, // Number of attempts
    duration: 60 * 15, // 15 minutes
    blockDuration: 60 * 30, // 30 minutes block
  },
  api: {
    points: 30, // Number of requests
    duration: 60, // Per minute
    blockDuration: 60 * 15, // 15 minutes block
  },
}

// Create rate limiters
const authLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl:auth',
  points: rateLimitConfigs.auth.points,
  duration: rateLimitConfigs.auth.duration,
  blockDuration: rateLimitConfigs.auth.blockDuration,
})

const apiLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl:api',
  points: rateLimitConfigs.api.points,
  duration: rateLimitConfigs.api.duration,
  blockDuration: rateLimitConfigs.api.blockDuration,
})

// Helper function to get client IP
const getClientIp = (req: Request): string => {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
    req.socket.remoteAddress ||
    'unknown'
  )
}

interface RateLimitError {
  msBeforeNext: number;
  remainingPoints: number;
  consumedPoints: number;
}

// Middleware for authentication endpoints (login, register)
export const authRateLimit = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const clientIp = getClientIp(req)
    await authLimiter.consume(clientIp)
    next()
  } catch (rejRes: unknown) {
    const error = rejRes as RateLimiterRes
    logger.warn(`Rate limit exceeded for IP: ${getClientIp(req)}`)
    if (error.msBeforeNext) {
      res.set('Retry-After', String(Math.round(error.msBeforeNext / 1000)))
    }
    res.status(429).json({
      message: 'Too many attempts, please try again later',
      retryAfter: error.msBeforeNext ? Math.round(error.msBeforeNext / 1000) : undefined,
    })
  }
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
  } catch (rejRes: unknown) {
    const error = rejRes as RateLimiterRes
    logger.warn(`API rate limit exceeded for IP: ${getClientIp(req)}`)
    if (error.msBeforeNext) {
      res.set('Retry-After', String(Math.round(error.msBeforeNext / 1000)))
    }
    res.status(429).json({
      message: 'Too many requests, please try again later',
      retryAfter: error.msBeforeNext ? Math.round(error.msBeforeNext / 1000) : undefined,
    })
  }
}

// Reset rate limit for an IP (useful for testing or manual intervention)
export const resetRateLimit = async (ip: string, type: 'auth' | 'api'): Promise<void> => {
  try {
    const limiter = type === 'auth' ? authLimiter : apiLimiter
    await limiter.delete(ip)
    logger.info(`Rate limit reset for IP: ${ip}, type: ${type}`)
  } catch (error) {
    if (error instanceof Error) {
      logger.error(`Error resetting rate limit for IP: ${ip}`, error)
    } else {
      logger.error(`Unknown error resetting rate limit for IP: ${ip}`)
    }
    throw error
  }
}
