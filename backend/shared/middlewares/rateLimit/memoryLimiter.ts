import { RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';
import { RateLimitConfig, RateLimitInfo, IRateLimiter } from './types';
import logger from '../../utils/logger';

export class MemoryRateLimiter implements IRateLimiter {
    private readonly limiter: RateLimiterMemory;
    private readonly config: RateLimitConfig;

    constructor(config: RateLimitConfig) {
        this.config = {
            ...config,
            keyPrefix: config.keyPrefix ?? 'rl:mem',
        };

        this.limiter = new RateLimiterMemory({
            points: config.points,
            duration: config.duration,
            blockDuration: config.blockDuration,
        });
    }

    /**
     * Consume points from the rate limiter
     */
    async consume(key: string, points: number = 1): Promise<RateLimitInfo> {
        try {
            const res = await this.limiter.consume(key, points);
            return this.formatResponse(res);
        } catch (rateLimiterRes) {
            if (rateLimiterRes instanceof Error) {
                throw rateLimiterRes;
            }
            // When consumption fails due to rate limiting
            return this.formatResponse(rateLimiterRes as RateLimiterRes, true);
        }
    }

    /**
     * Get rate limit info without consuming points
     */
    async get(key: string): Promise<RateLimitInfo | null> {
        try {
            const res = await this.limiter.get(key);
            return res ? this.formatResponse(res) : null;
        } catch (error) {
            logger.error('Error getting rate limit info:', error);
            return null;
        }
    }

    /**
     * Block a key for a specified duration
     */
    async block(key: string, duration?: number): Promise<void> {
        try {
            const blockDuration = duration ?? this.config.blockDuration ?? this.config.duration;
            await this.limiter.block(key, blockDuration);
        } catch (error) {
            logger.error('Error blocking key:', error);
            throw error;
        }
    }

    /**
     * Reset rate limit for a key
     */
    async reset(key: string): Promise<void> {
        try {
            await this.limiter.delete(key);
        } catch (error) {
            logger.error('Error resetting rate limit:', error);
            throw error;
        }
    }

    /**
     * Check if a key is currently blocked
     */
    async isBlocked(key: string): Promise<boolean> {
        try {
            const res = await this.limiter.get(key);
            return res ? res.remainingPoints <= 0 : false;
        } catch (error) {
            logger.error('Error checking blocked status:', error);
            return false;
        }
    }

    /**
     * Force set points consumed for a key
     */
    async set(key: string, points: number): Promise<void> {
        try {
            const duration = Math.ceil(this.config.duration);
            await this.limiter.set(key, points, duration);
            logger.debug(`Set points for key ${key} to ${points}`);
        } catch (error) {
            logger.error('Error setting points:', error);
            throw error;
        }
    }

    /**
     * Format the rate limiter response
     */
    private formatResponse(res: RateLimiterRes, consumed: boolean = false): RateLimitInfo {
        const remainingPoints = Math.max(0, res.remainingPoints);
        return {
            remaining: remainingPoints,
            reset: new Date(Date.now() + res.msBeforeNext),
            total: this.config.points,
            retryAfter: consumed ? res.msBeforeNext : undefined,
            blocked: remainingPoints <= 0
        };
    }
}
