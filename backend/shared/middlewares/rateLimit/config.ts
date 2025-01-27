import { RateLimitConfig } from './types';

/**
 * Rate limit bypass configuration
 */
export const RATE_LIMIT_BYPASS = {
    ips: new Set([
        '127.0.0.1',
        'localhost',
        '::1',
        process.env.RATE_LIMIT_BYPASS_IP
    ].filter(Boolean))
};

/**
 * Service-specific rate limit configurations
 */
export const SERVICE_CONFIGS: { [key: string]: RateLimitConfig } = {
    // Auth service endpoints
    'auth': {
        points: 5, // Number of attempts
        duration: 60 * 15, // 15 minutes
        blockDuration: 60 * 30, // 30 minutes block
        keyPrefix: 'rl:auth',
    },
    'api': {
        points: 30, // Number of requests
        duration: 60, // Per minute
        blockDuration: 60 * 15, // 15 minutes block
        keyPrefix: 'rl:api',
    },

    // Blog service endpoints
    'blog:api': {
        points: 30, // Number of requests
        duration: 60, // Per minute
        blockDuration: 60 * 15, // 15 minutes block
        keyPrefix: 'rl:blog:api',
    },
    'blog:search': {
        points: 10, // Number of searches
        duration: 60, // Per minute
        blockDuration: 60 * 5, // 5 minutes block
        keyPrefix: 'rl:blog:search',
    },
};

/**
 * Role-based rate limit configurations - From existing authorizeRoles middleware
 */
export const ROLE_CONFIGS: { [key: string]: RateLimitConfig } = {
    admin: {
        points: 1000,
        duration: 60,
        keyPrefix: 'rl:role:admin',
    },
    author: {
        points: 100,
        duration: 60,
        keyPrefix: 'rl:role:author',
    },
    reader: {
        points: 50,
        duration: 60,
        keyPrefix: 'rl:role:reader',
    }
};

/**
 * Default configurations - Matching existing service defaults
 */
export const DEFAULT_CONFIGS = {
    memory: {
        points: 30,
        duration: 60,
        blockDuration: 60 * 15,
        keyPrefix: 'rl:mem',
    },
    redis: {
        points: 30,
        duration: 60,
        blockDuration: 60 * 15,
        keyPrefix: 'rl:api',
    }
};
