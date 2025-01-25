import { Request, Response, NextFunction } from 'express'
import axios from 'axios'
import { logger } from '../utils/logger'

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? 'http://auth-service:3001'

interface AuthUser {
  id: string;
  userId: string;
  roles: string[];
  [key: string]: unknown;
}

interface VerifyResponse {
  user: AuthUser;
}

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const authenticate = async (
  req: Request,
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

    // Verify token with auth service
    try {
      const response = await axios.get<VerifyResponse>(`${AUTH_SERVICE_URL}/api/auth/verify`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      req.user = response.data.user
      next()
    } catch (err) {
      const error = err as { response?: { status: number } }
      if (error.response?.status === 401) {
        res.status(401).json({ message: 'Invalid or expired token' })
        return
      }
      throw err
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Unknown error')
    logger.error('Authentication error:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
}

export const authorize = (requiredRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
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

// Optional authentication middleware
export const optionalAuth = async (
  req: Request,
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

    try {
      const response = await axios.get<VerifyResponse>(`${AUTH_SERVICE_URL}/api/auth/verify`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      req.user = response.data.user
    } catch (error) {
      // Ignore token verification errors in optional auth
      logger.debug('Optional auth token verification failed:', error instanceof Error ? error.message : String(error))
    }

    next()
  } catch (error) {
    logger.error('Optional authentication error:', error instanceof Error ? error.message : String(error))
    next()
  }
}
