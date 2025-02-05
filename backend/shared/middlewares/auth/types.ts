import { Request } from 'express';

// Express module augmentation
declare global {
    namespace Express {
        interface Request {
            user?: AuthenticatedUser;
            isAuthenticated(): this is { user: AuthenticatedUser };
        }
    }
}

// Authenticated request with guaranteed user property
export interface AuthenticatedRequest extends Request {
    user: AuthenticatedUser;
}

// Type guard to check if request is authenticated
export function isAuthenticatedRequest(req: Request): req is AuthenticatedRequest {
    return req.isAuthenticated() && req.user !== undefined;
}

export interface AuthenticatedUser {
    id: string;
    email: string;
    username: string;
    roles: string[];
    createdAt: Date;
    updatedAt: Date;
    // Support dynamic properties
    [key: string]: unknown;
}

export interface TokenPayload {
    id: string;
    email: string;
    roles?: string[];
    type: 'access' | 'refresh';
    iat?: number;
    exp?: number;
}

export type AuthStrategy = 'jwt' | 'oauth';

export interface AuthOptions {
    strategy?: AuthStrategy[];
    requireAllStrategies?: boolean;
    roles?: string[];
    permissions?: string[];
    rateLimit?: {
        windowMs: number;
        max: number;
    };
}

export interface RateLimitInfo {
    windowMs: number;
    max: number;
    remaining: number;
    resetTime: Date;
}
