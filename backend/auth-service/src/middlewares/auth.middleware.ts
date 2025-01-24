import { Request, Response, NextFunction } from 'express'
import { verifyToken } from '../utils/jwt'
import { isBlacklisted } from '../config/redis'
import { logger } from '../utils/logger'

export interface AuthRequest extends Request {
  user?: {
    userId: string
    roles: string[]
    [key: string]: unknown
  }
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ message: 'No token provided' })
      return
    }

    const token = authHeader.split(' ')[1]

    // Check if token is blacklisted (logged out)
    const isTokenBlacklisted = await isBlacklisted(token)
    if (isTokenBlacklisted) {
      res.status(401).json({ message: 'Token is no longer valid' })
      return
    }

    // Verify the token
    const decoded = verifyToken(token)
    req.user = decoded

    next()
  } catch (error) {
    logger.error('Authentication error:', error)
    res.status(401).json({ message: 'Invalid or expired token' })
  }
}

// Middleware to check if user has required roles
export const authorize = (requiredRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: 'User not authenticated' })
      return
    }

    const hasRequiredRole = req.user.roles.some(role => 
      requiredRoles.includes(role)
    )

    if (!hasRequiredRole) {
      res.status(403).json({ 
        message: 'You do not have permission to access this resource' 
      })
      return
    }

    next()
  }
}

// Optional authentication middleware that doesn't require auth but attaches user if token exists
export const optionalAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      next()
      return
    }

    const token = authHeader.split(' ')[1]

    // Check if token is blacklisted
    const isTokenBlacklisted = await isBlacklisted(token)
    if (isTokenBlacklisted) {
      next()
      return
    }

    // Verify and attach user
    const decoded = verifyToken(token)
    req.user = decoded

    next()
  } catch (error) {
    // On any error, just proceed without user
    next()
  }
}
