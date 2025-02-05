import { Request, Response, NextFunction } from 'express';
import { RateLimiter } from './limiter';
import { MemoryRateLimiter } from './memoryLimiter';
import { RateLimitOptions, RateLimitInfo, IRateLimiter } from './types';
import logger from '../../utils/logger';
import { isAuthenticatedRequest } from '../auth/types';
import { getClientIp, generateErrorMessage } from './utils';
import { createServiceMetrics } from '../../config/metrics';
import { 
    SERVICE_CONFIGS, 
    ROLE_CONFIGS, 
    DEFAULT_CONFIGS,
    RATE_LIMIT_BYPASS
} from './config';

// Store limiters to avoid recreating them
const limiters = new Map<string, IRateLimiter>();

// Initialize shared metrics
const metrics = createServiceMetrics('shared');

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
    const keyPrefix = config.keyPrefix ?? 'rate_limit';
    const key = `${keyPrefix}:${useMemory ? 'mem' : 'redis'}`;
    
    if (!limiters.has(key)) {
        const limiter = useMemory ? new MemoryRateLimiter(config) : new RateLimiter(config);
        limiters.set(key, limiter);
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
    error: any,
    limitType: string
): void => {
    const ip = getClientIp(req);
    
    // Include user ID in log if authenticated
    const userId = isAuthenticatedRequest(req) ? req.user.id : undefined;
    const userPart = userId ? ' (user: ' + userId + ')' : '';
    logger.warn(`Rate limit exceeded for IP: ${ip}` + userPart);
    const retryAfter = error.msBeforeNext || config.duration * 1000;
    
    // Track rate limit using shared metrics
    const baseUrl = req.baseUrl || '';
    const serviceName = baseUrl.split('/')[1] ?? 'unknown';
    const metricName = `${serviceName}_service`;
    metrics.trackRateLimit(metricName, limitType);
    
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
    const config: RateLimitOptions = {
        ...DEFAULT_CONFIGS.redis,
        ...options
    };
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
            handleRateLimitError(req, res, config, error, 'generic');
        }
    };
};

/**
 * Create middleware for service-specific rate limiting
 */
export const createServiceRateLimit = (serviceName: string, options: Partial<RateLimitOptions> = {}) => {
    const baseConfig = SERVICE_CONFIGS[serviceName] || DEFAULT_CONFIGS.redis;
    const config: RateLimitOptions = {
        ...baseConfig,
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
            handleRateLimitError(req, res, config, error, 'service');
        }
    };
};

/**
 * Create middleware for role-based rate limiting
 */
export const createRoleRateLimit = (options: Partial<RateLimitOptions> = {}) => {
    const defaultConfig: RateLimitOptions = {
        ...DEFAULT_CONFIGS.redis,
        ...options
    };
    const limiters = new Map<string, IRateLimiter>();

    return async (req: Request, res: Response, next: NextFunction) => {
        const ip = getClientIp(req);

        if (shouldBypassRateLimit(ip)) {
            return next();
        }

        try {
            // Get user's primary role or default to reader
            const role = isAuthenticatedRequest(req) && req.user.roles.length > 0 
                ? req.user.roles[0] 
                : 'reader';

            // Get or create limiter for this role
            const limiterKey = role ?? 'reader';
            if (!limiters.has(limiterKey)) {
                const baseConfig = ROLE_CONFIGS[limiterKey] || ROLE_CONFIGS['reader'];
                const roleConfig: RateLimitOptions = {
                    ...defaultConfig,
                    ...baseConfig
                };
                const limiter = new RateLimiter(roleConfig);
                limiters.set(limiterKey, limiter);
            }

            const limiter = limiters.get(limiterKey)!;
            const key = RateLimiter.createKey(limiterKey, ip);
            const info = await limiter.consume(key);
            
            setRateLimitHeaders(res, info);
            next();
        } catch (error) {
            const baseConfig = ROLE_CONFIGS['reader'];
            const config: RateLimitOptions = {
                ...defaultConfig,
                ...baseConfig
            };
            handleRateLimitError(req, res, config, error, 'role');
        }
    };
};

/**
 * Create middleware for endpoint-specific rate limiting
 */
export const createEndpointRateLimit = (endpointKey: string, options: Partial<RateLimitOptions> = {}) => {
    const baseConfig = SERVICE_CONFIGS[endpointKey] || DEFAULT_CONFIGS.redis;
    const config: RateLimitOptions = {
        ...DEFAULT_CONFIGS.redis,
        ...baseConfig,
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
            handleRateLimitError(req, res, config, error, 'endpoint');
        }
    };
};
