import { Request, Response, NextFunction } from 'express';
import { RateLimiter } from './limiter';
import { MemoryRateLimiter } from './memoryLimiter';
import { RateLimitOptions, RateLimitInfo, IRateLimiter } from './types';
import logger from '../../utils/logger';
import { AuthenticatedRequest } from '../auth';
import { getClientIp, generateErrorMessage } from './utils';
import { 
    SERVICE_CONFIGS, 
    ROLE_CONFIGS, 
    DEFAULT_CONFIGS,
    RATE_LIMIT_BYPASS
} from './config';

// Store limiters to avoid recreating them
const limiters = new Map<string, IRateLimiter>();

/**
 * Check if IP is in bypass list
 */
const shouldBypassRateLimit = (ip: string): boolean => {
    return RATE_LIMIT_BYPASS.ips.has(ip);
};

/**
 * Get or create a limiter instance
 */
const getLimiter = (config: RateLimitOptions, useMemory: boolean = false): IRateLimiter => {
    const key = `${config.keyPrefix}:${useMemory ? 'mem' : 'redis'}`;
    
    if (!limiters.has(key)) {
        limiters.set(key, useMemory 
            ? new MemoryRateLimiter(config)
            : new RateLimiter(config)
        );
    }
    
    return limiters.get(key)!;
};

/**
 * Set rate limit headers
 */
const setRateLimitHeaders = (res: Response, info: RateLimitInfo): void => {
    res.set({
        'X-RateLimit-Limit': info.total.toString(),
        'X-RateLimit-Remaining': info.remaining.toString(),
        'X-RateLimit-Reset': Math.ceil(info.reset.getTime() / 1000).toString()
    });

    if (info.retryAfter) {
        res.set('Retry-After', Math.ceil(info.retryAfter / 1000).toString());
    }
};

/**
 * Handle rate limit error response
 */
const handleRateLimitError = (
    req: Request,
    res: Response,
    config: RateLimitOptions,
    error: any
): void => {
    logger.warn(`Rate limit exceeded for IP: ${getClientIp(req)}`);
    const retryAfter = error.msBeforeNext || config.duration * 1000;
    
    res.status(429).json({
        success: false,
        message: config.errorMessage ?? generateErrorMessage(
            'request',
            config.duration,
            retryAfter
        ),
        retryAfter: Math.ceil(retryAfter / 1000)
    });
};

/**
 * Create middleware for basic rate limiting
 */
export const createRateLimit = (options: Partial<RateLimitOptions> = {}, useMemory: boolean = false) => {
    const config = { ...DEFAULT_CONFIGS.redis, ...options };
    const limiter = getLimiter(config, useMemory);

    return async (req: Request, res: Response, next: NextFunction) => {
        const ip = getClientIp(req);

        if (shouldBypassRateLimit(ip)) {
            return next();
        }

        try {
            const key = options.keyGenerator 
                ? options.keyGenerator(req)
                : RateLimiter.sanitizeKey(ip);

            const info = await limiter.consume(key);
            setRateLimitHeaders(res, info);

            // Skip count based on response status if configured
            res.on('finish', async () => {
                const status = res.statusCode;
                if (
                    (config.skipFailedRequests && status >= 400) ||
                    (config.skipSuccessfulRequests && status < 400)
                ) {
                    await limiter.reset(key);
                }

                if (config.onRateLimit) {
                    config.onRateLimit(req, info);
                }
            });

            next();
        } catch (error) {
            handleRateLimitError(req, res, config, error);
        }
    };
};

/**
 * Create middleware for service-specific rate limiting
 */
export const createServiceRateLimit = (serviceName: string, options: Partial<RateLimitOptions> = {}) => {
    const config = {
        ...SERVICE_CONFIGS[serviceName] || DEFAULT_CONFIGS.redis,
        ...options
    };
    const limiter = getLimiter(config);

    return async (req: Request, res: Response, next: NextFunction) => {
        const ip = getClientIp(req);

        if (shouldBypassRateLimit(ip)) {
            return next();
        }

        try {
            const key = RateLimiter.createKey(serviceName, ip);
            const info = await limiter.consume(key);
            setRateLimitHeaders(res, info);
            next();
        } catch (error) {
            handleRateLimitError(req, res, config, error);
        }
    };
};

/**
 * Create middleware for role-based rate limiting
 */
export const createRoleRateLimit = (options: Partial<RateLimitOptions> = {}) => {
    const limiters = new Map<string, IRateLimiter>();

    return async (req: Request, res: Response, next: NextFunction) => {
        const ip = getClientIp(req);

        if (shouldBypassRateLimit(ip)) {
            return next();
        }

        try {
            const authReq = req as AuthenticatedRequest;
            const role = authReq.user?.roles?.[0]?.name || 'reader';

            // Get or create limiter for this role
            if (!limiters.has(role)) {
                const roleConfig = {
                    ...ROLE_CONFIGS[role] || ROLE_CONFIGS.reader,
                    ...options
                };
                limiters.set(role, new RateLimiter(roleConfig));
            }

            const limiter = limiters.get(role)!;
            const key = RateLimiter.createKey(role, ip);
            const info = await limiter.consume(key);
            
            setRateLimitHeaders(res, info);
            next();
        } catch (error) {
            const config = { ...ROLE_CONFIGS.reader, ...options };
            handleRateLimitError(req, res, config, error);
        }
    };
};

/**
 * Create middleware for endpoint-specific rate limiting
 */
export const createEndpointRateLimit = (endpointKey: string, options: Partial<RateLimitOptions> = {}) => {
    const config = {
        ...SERVICE_CONFIGS[endpointKey] || DEFAULT_CONFIGS.redis,
        ...options
    };
    const limiter = getLimiter(config);

    return async (req: Request, res: Response, next: NextFunction) => {
        const ip = getClientIp(req);

        if (shouldBypassRateLimit(ip)) {
            return next();
        }

        try {
            const key = RateLimiter.createKey(endpointKey, ip);
            const info = await limiter.consume(key);
            setRateLimitHeaders(res, info);
            next();
        } catch (error) {
            handleRateLimitError(req, res, config, error);
        }
    };
};
