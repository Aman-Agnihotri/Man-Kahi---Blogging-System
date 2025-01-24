import jwt from 'jsonwebtoken'
import { logger } from './logger'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h'

interface JwtPayload {
  userId: string
  roles: string[]
  [key: string]: unknown
}

export const generateToken = (payload: JwtPayload): string => {
  try {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
  } catch (error) {
    logger.error('Error generating JWT token:', error)
    throw error
  }
}

export const verifyToken = (token: string): JwtPayload => {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload
  } catch (error) {
    logger.error('Error verifying JWT token:', error)
    throw error
  }
}

export const decodeToken = (token: string): JwtPayload | null => {
  try {
    return jwt.decode(token) as JwtPayload
  } catch (error) {
    logger.error('Error decoding JWT token:', error)
    return null
  }
}

// Get token expiration time in seconds
export const getTokenExpiryInSeconds = (token: string): number => {
  const decoded = jwt.decode(token) as { exp?: number } | null
  if (!decoded?.exp) return 0
  return Math.max(0, decoded.exp - Math.floor(Date.now() / 1000))
}
