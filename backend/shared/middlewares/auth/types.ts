import { Request } from 'express';
import { User, Role } from '@prisma/client';

// Extend Express Request to include isAuthenticated for Passport
declare global {
    namespace Express {
        interface Request {
            isAuthenticated(): boolean;
        }
    }
}

export interface AuthenticatedRequest extends Request {
    user: AuthenticatedUser;
}

export interface AuthenticatedUser {
    id: string;
    email: string;
    username: string;
    roles: Role[];
    createdAt: Date;
    updatedAt: Date;
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
