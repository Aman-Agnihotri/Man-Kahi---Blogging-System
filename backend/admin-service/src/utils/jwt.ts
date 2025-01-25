import jwt from 'jsonwebtoken';
import { logger } from './logger';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';

interface JWTPayload {
  id: string;
  email: string;
  iat?: number;
  exp?: number;
}

export const verifyJWT = async (token: string): Promise<JWTPayload | string> => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded as JWTPayload;
  } catch (error) {
    logger.error('JWT verification error:', error);
    throw new Error('Invalid token');
  }
};

export const decodeJWT = (token: string): JWTPayload | null => {
  try {
    return jwt.decode(token) as JWTPayload;
  } catch (error) {
    logger.error('JWT decode error:', error);
    return null;
  }
};
