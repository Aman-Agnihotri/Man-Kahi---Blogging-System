import jwt from 'jsonwebtoken'
import { logger } from './logger'
import { TokenPayload } from '../types/auth.types'

const JWT_SECRET = process.env.JWT_SECRET ?? 'your-secret-key'
const JWT_ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN ?? '1h'
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN ?? '7d'

export const generateToken = (payload: TokenPayload, expiresIn?: string): string => {
  try {
    let tokenExpiry = expiresIn
    if (!tokenExpiry) {
      tokenExpiry = payload.type === 'refresh' ? JWT_REFRESH_EXPIRES_IN : JWT_ACCESS_EXPIRES_IN
    }
    
    return jwt.sign(payload, JWT_SECRET, { expiresIn: tokenExpiry })
  } catch (error) {
    logger.error('Error generating JWT token:', error)
    throw error
  }
}

export const verifyToken = (token: string): TokenPayload => {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload
  } catch (error) {
    logger.error('Error verifying JWT token:', error)
    throw error
  }
}

export const decodeToken = (token: string): TokenPayload | null => {
  try {
    return jwt.decode(token) as TokenPayload
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
