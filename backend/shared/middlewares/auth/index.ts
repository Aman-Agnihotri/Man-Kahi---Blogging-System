import { authenticate } from './authenticate';
import { rateLimit } from './rateLimit';
import {
    AuthOptions,
    AuthenticatedRequest,
    AuthenticatedUser,
    TokenPayload,
    RateLimitInfo
} from './types';

/**
 * Authentication and Authorization Middleware
 * 
 * This module provides a comprehensive solution for handling authentication,
 * authorization, and rate limiting in Express applications.
 * 
 * Features:
 * - JWT and OAuth authentication strategies
 * - Role-based access control
 * - Token blacklisting
 * - Rate limiting
 * - TypeScript support
 * 
 * Basic Usage:
 * ```typescript
 * import { authenticate } from '@shared/middlewares/auth';
 * 
 * // Simple JWT authentication
 * router.get('/protected', authenticate(), handler);
 * 
 * // With role-based access control
 * router.get('/admin', authenticate({ roles: ['admin'] }), handler);
 * 
 * // With rate limiting
 * router.post('/login', authenticate({
 *   rateLimit: { windowMs: 15 * 60 * 1000, max: 5 }
 * }), handler);
 * 
 * // Multiple authentication strategies
 * router.get('/oauth', authenticate({
 *   strategy: ['jwt', 'oauth'],
 *   requireAllStrategies: false
 * }), handler);
 * ```
 * 
 * Configuration Options:
 * - strategy: Array of authentication strategies to use ('jwt' | 'oauth')
 * - requireAllStrategies: Whether all strategies must succeed (default: false)
 * - roles: Array of required roles for access
 * - rateLimit: Rate limiting configuration { windowMs: number, max: number }
 */

export {
    authenticate,
    rateLimit,
    // Types
    AuthOptions,
    AuthenticatedRequest,
    AuthenticatedUser,
    TokenPayload,
    RateLimitInfo
};
