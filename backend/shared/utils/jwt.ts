import jwt, { JsonWebTokenError, TokenExpiredError } from "jsonwebtoken";
import logger from "./logger";
import { JWT_ACCESS_EXPIRES_IN, JWT_REFRESH_EXPIRES_IN, JWT_SECRET } from "./constants";

export interface TokenPayload {
    id: string;
    userId?: string;
    email?: string;
    roles?: string[];
    type?: 'access' | 'refresh';
    iat?: number;
    exp?: number;
}

// Custom error types for better error handling
export class TokenGenerationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'TokenGenerationError';
    }
}

export class TokenValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'TokenValidationError';
    }
}

/**
 * Generates a JSON Web Token for a given payload
 */
export const generateToken = (payload: TokenPayload, expiresIn?: string): string => {
    try {
        // Validate required payload fields
        if (!payload.id) {
            throw new TokenGenerationError('Token payload must include an ID');
        }

        // Ensure payload doesn't contain sensitive data
        const sanitizedPayload: TokenPayload = {
            id: payload.id,
            userId: payload.userId,
            email: payload.email,
            roles: payload.roles,
            type: payload.type
        };

        let tokenExpiry = expiresIn;
        if (!tokenExpiry) {
            tokenExpiry = payload.type === 'refresh' ? JWT_REFRESH_EXPIRES_IN : JWT_ACCESS_EXPIRES_IN;
        }
        
        // Cast expiresIn to appropriate type for jsonwebtoken
        return jwt.sign(sanitizedPayload, JWT_SECRET as jwt.Secret, {
            algorithm: "HS512",
            expiresIn: tokenExpiry as jwt.SignOptions["expiresIn"],
            notBefore: 0 // Token is valid immediately
        });
    } catch (error) {
        logger.error('Error generating JWT token:', {
            error,
            payload: { ...payload, id: '[REDACTED]' }
        });
        if (error instanceof TokenGenerationError) {
            throw error;
        }
        throw new TokenGenerationError('Failed to generate token');
    }
}

/**
 * Verifies a JSON Web Token and returns the decoded payload
 */
export const verifyToken = (token: string): TokenPayload => {
    try {
        if (!token || typeof token !== 'string') {
            throw new TokenValidationError('Invalid token format');
        }

        if (token.split('.').length !== 3) {
            throw new TokenValidationError('Invalid token structure');
        }

        const decoded = jwt.verify(token, JWT_SECRET as jwt.Secret, {
            algorithms: ['HS512'] // Explicitly specify allowed algorithms
        }) as TokenPayload;

        // Validate decoded token structure
        if (!decoded || typeof decoded !== 'object' || !decoded.id) {
            throw new TokenValidationError('Invalid token payload structure');
        }

        return decoded;
    } catch (error) {
        if (error instanceof JsonWebTokenError) {
            throw new TokenValidationError('Invalid token signature');
        }
        if (error instanceof TokenExpiredError) {
            throw new TokenValidationError('Token has expired');
        }
        logger.error('Error verifying JWT token:', error);
        throw error;
    }
}

/**
 * Decodes a token without verification
 * WARNING: This should only be used for non-security-critical operations
 */
export const decodeToken = (token: string): TokenPayload | null => {
    try {
        if (!token || typeof token !== 'string') {
            logger.warn('Invalid token format passed to decodeToken');
            return null;
        }

        const decoded = jwt.decode(token) as TokenPayload;
        
        // Basic structure validation
        if (!decoded || typeof decoded !== 'object') {
            logger.warn('Invalid token structure in decodeToken');
            return null;
        }

        // Sanitize the decoded payload
        return {
            id: decoded.id,
            userId: decoded.userId,
            email: decoded.email,
            roles: decoded.roles,
            type: decoded.type,
            iat: decoded.iat,
            exp: decoded.exp
        };
    } catch (error) {
        logger.error('Error decoding JWT token:', {
            error,
            token: token.substring(0, 10) + '...' // Log only token prefix
        });
        return null;
    }
}

/**
 * Gets token expiration time in seconds
 */
export const getTokenExpiryInSeconds = (token: string): number => {
    try {
        if (!token || typeof token !== 'string') {
            throw new TokenValidationError('Invalid token format');
        }

        const decoded = jwt.decode(token) as { exp?: number } | null;
        if (!decoded?.exp) {
            throw new TokenValidationError('Token missing expiration');
        }

        const now = Math.floor(Date.now() / 1000);
        if (decoded.exp <= now) {
            return 0; // Token has already expired
        }

        return decoded.exp - now;
    } catch (error) {
        logger.error('Error getting token expiry:', error);
        return 0;
    }
}

export { JsonWebTokenError, TokenExpiredError };
