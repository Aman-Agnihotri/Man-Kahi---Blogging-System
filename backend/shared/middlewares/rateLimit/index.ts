import { RateLimiter } from './limiter';
import { MemoryRateLimiter } from './memoryLimiter';
import {
    createRateLimit,
    createRoleRateLimit,
    createServiceRateLimit,
    createEndpointRateLimit
} from './middleware';
import {
    RateLimitConfig,
    RateLimitOptions,
    RateLimitInfo,
    IRateLimiter
} from './types';
import {
    SERVICE_CONFIGS,
    ROLE_CONFIGS,
    DEFAULT_CONFIGS,
    RATE_LIMIT_BYPASS
} from './config';

/**
 * Rate Limiting Middleware
 * 
 * This module provides a comprehensive solution for rate limiting in Express applications.
 * It supports multiple strategies including IP-based, role-based, service-based, and
 * endpoint-specific rate limiting with both Redis and in-memory storage options.
 * 
 * Features:
 * - Redis-based distributed rate limiting
 * - In-memory rate limiting option
 * - Multiple strategies (IP, Role, Service, Endpoint)
 * - Configurable limits and windows
 * - Block duration support
 * - Rate limit bypass for testing
 * - TypeScript support
 * - Header-based rate limit info
 * - Custom error messages
 * - Detailed logging
 * 
 * Basic Usage:
 * ```typescript
 * import { createRateLimit } from '@shared/middlewares/rateLimit';
 * 
 * // Simple IP-based rate limiting
 * app.use(createRateLimit());
 * 
 * // Memory-based rate limiting
 * app.use(createRateLimit({}, true));
 * 
 * // Role-based rate limiting
 * app.use(createRoleRateLimit());
 * 
 * // Service-specific rate limiting
 * app.use(createServiceRateLimit('auth'));
 * 
 * // Endpoint-specific rate limiting
 * app.post('/login', createEndpointRateLimit('auth:login'));
 * ```
 * 
 * Extended Configuration:
 * ```typescript
 * app.use(createRateLimit({
 *   points: 100,
 *   duration: 60,
 *   blockDuration: 300,
 *   keyPrefix: 'custom',
 *   errorMessage: 'Custom rate limit message',
 *   skipFailedRequests: true,
 *   skipSuccessfulRequests: false,
 *   keyGenerator: (req) => req.headers['x-forwarded-for'] || req.ip,
 *   handler: async (req, info) => {
 *     // Custom handling logic
 *     return true;
 *   },
 *   onRateLimit: (req, info) => {
 *     // Custom rate limit event handling
 *   }
 * }));
 * ```
 */

export {
    // Main middleware factories
    createRateLimit,
    createRoleRateLimit,
    createServiceRateLimit,
    createEndpointRateLimit,
    
    // Rate limiter implementations
    RateLimiter,
    MemoryRateLimiter,
    
    // Types
    RateLimitConfig,
    RateLimitOptions,
    RateLimitInfo,
    IRateLimiter,
    
    // Configurations
    SERVICE_CONFIGS,
    ROLE_CONFIGS,
    DEFAULT_CONFIGS,
    RATE_LIMIT_BYPASS
};
