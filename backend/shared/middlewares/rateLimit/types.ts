import { Request } from 'express';

export interface RateLimitConfig {
    points: number;       // Number of requests allowed
    duration: number;     // Time window in seconds
    blockDuration?: number; // How long to block if limit exceeded (seconds)
    keyPrefix?: string;   // Prefix for Redis keys
}

export interface RoleLimitConfig {
    [role: string]: RateLimitConfig;
}

export interface ServiceLimitConfig {
    [service: string]: RateLimitConfig;
}

export interface EndpointLimitConfig {
    [endpoint: string]: RateLimitConfig;
}

export interface RateLimitInfo {
    remaining: number;    // Remaining points in current window
    reset: Date;         // When the current window resets
    total: number;       // Total points allowed in window
    retryAfter?: number; // Milliseconds until retry is allowed
    blocked: boolean;    // Whether the key is currently blocked
}

export interface RateLimitOptions extends RateLimitConfig {
    errorMessage?: string;
    skipFailedRequests?: boolean;
    skipSuccessfulRequests?: boolean;
    keyGenerator?: (req: Request) => string;
    handler?: (req: Request, info: RateLimitInfo) => Promise<boolean>;
    onRateLimit?: (req: Request, info: RateLimitInfo) => void;
}

/**
 * Common interface for rate limiters
 */
export interface IRateLimiter {
    consume(key: string, points?: number): Promise<RateLimitInfo>;
    get(key: string): Promise<RateLimitInfo | null>;
    block(key: string, duration?: number): Promise<void>;
    reset(key: string): Promise<void>;
    isBlocked(key: string): Promise<boolean>;
    set(key: string, points: number): Promise<void>;
}
