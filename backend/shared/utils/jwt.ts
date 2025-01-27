import jwt, { JsonWebTokenError, TokenExpiredError } from "jsonwebtoken";
import logger from "./logger";

const JWT_SECRET = process.env.JWT_SECRET ?? 'your-secret-key';
const JWT_ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN ?? '1h';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN ?? '7d';

export interface TokenPayload {
    id: string;
    userId?: string;
    email?: string;
    roles?: string[];
    type?: 'access' | 'refresh';
    iat?: number;
    exp?: number;
}

/**
 * Generates a JSON Web Token for a given payload
 */
export const generateToken = (payload: TokenPayload, expiresIn?: string): string => {
    try {
        let tokenExpiry = expiresIn;
        if (!tokenExpiry) {
            tokenExpiry = payload.type === 'refresh' ? JWT_REFRESH_EXPIRES_IN : JWT_ACCESS_EXPIRES_IN;
        }
        
        return jwt.sign(payload, JWT_SECRET, { 
            algorithm: "HS512",
            expiresIn: tokenExpiry 
        });
    } catch (error) {
        logger.error('Error generating JWT token:', error);
        throw error;
    }
}

/**
 * Verifies a JSON Web Token and returns the decoded payload
 */
export const verifyToken = (token: string): TokenPayload => {
    try {
        return jwt.verify(token, JWT_SECRET) as TokenPayload;
    } catch (error) {
        logger.error('Error verifying JWT token:', error);
        throw error;
    }
}

/**
 * Decodes a token without verification
 */
export const decodeToken = (token: string): TokenPayload | null => {
    try {
        return jwt.decode(token) as TokenPayload;
    } catch (error) {
        logger.error('Error decoding JWT token:', error);
        return null;
    }
}

/**
 * Gets token expiration time in seconds
 */
export const getTokenExpiryInSeconds = (token: string): number => {
    const decoded = jwt.decode(token) as { exp?: number } | null;
    if (!decoded?.exp) return 0;
    return Math.max(0, decoded.exp - Math.floor(Date.now() / 1000));
}

export { JsonWebTokenError, TokenExpiredError };
