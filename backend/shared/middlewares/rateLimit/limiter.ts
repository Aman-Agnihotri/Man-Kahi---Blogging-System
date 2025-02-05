import { RateLimitInfo, RateLimitOptions, IRateLimiter } from './types';
import { redis } from '../../config/redis';

const BLOCK_KEY_SUFFIX = ':blocked';
const POINTS_KEY_SUFFIX = ':points';

export class RateLimiter implements IRateLimiter {
    private readonly keyPrefix: string;

    constructor(private readonly config: RateLimitOptions) {
        this.keyPrefix = config.keyPrefix ?? 'rate_limit';
    }

    static sanitizeKey(key: string): string {
        return key.replace(/[^a-zA-Z0-9]/g, '_');
    }

    static createKey(prefix: string, key: string): string {
        return `${RateLimiter.sanitizeKey(prefix)}:${RateLimiter.sanitizeKey(key)}`;
    }

    private getPointsKey(key: string): string {
        return `${this.keyPrefix}:${key}${POINTS_KEY_SUFFIX}`;
    }

    private getBlockKey(key: string): string {
        return `${this.keyPrefix}:${key}${BLOCK_KEY_SUFFIX}`;
    }

    async consume(key: string, points: number = 1): Promise<RateLimitInfo> {
        const pointsKey = this.getPointsKey(key);
        const blockKey = this.getBlockKey(key);

        // Check if blocked
        const isBlocked = await this.isBlocked(key);
        if (isBlocked) {
            const ttl = await redis.ttl(blockKey);
            return {
                remaining: 0,
                reset: new Date(Date.now() + (ttl * 1000)),
                total: this.config.points,
                blocked: true,
                retryAfter: ttl * 1000
            };
        }

        // Get current points
        const currentPoints = parseInt(await redis.get(pointsKey) ?? '0');
        const remainingPoints = this.config.points - (currentPoints + points);

        if (remainingPoints < 0) {
            // Block if configured
            if (this.config.blockDuration) {
                await this.block(key, this.config.blockDuration);
            }

            const resetTime = new Date(Date.now() + (this.config.duration * 1000));
            return {
                remaining: 0,
                reset: resetTime,
                total: this.config.points,
                blocked: true,
                retryAfter: this.config.duration * 1000
            };
        }

        // Increment points
        await redis.multi()
            .incrby(pointsKey, points)
            .expire(pointsKey, this.config.duration)
            .exec();

        return {
            remaining: remainingPoints,
            reset: new Date(Date.now() + (this.config.duration * 1000)),
            total: this.config.points,
            blocked: false
        };
    }

    async get(key: string): Promise<RateLimitInfo | null> {
        const pointsKey = this.getPointsKey(key);
        const blockKey = this.getBlockKey(key);

        const [points, blockTTL] = await Promise.all([
            redis.get(pointsKey),
            redis.ttl(blockKey)
        ]);

        if (!points && blockTTL <= 0) {
            return null;
        }

        const currentPoints = parseInt(points ?? '0');
        const isBlocked = blockTTL > 0;
        const ttl = isBlocked ? blockTTL : await redis.ttl(pointsKey);

        return {
            remaining: Math.max(0, this.config.points - currentPoints),
            reset: new Date(Date.now() + (ttl * 1000)),
            total: this.config.points,
            blocked: isBlocked,
            ...(isBlocked && { retryAfter: blockTTL * 1000 })
        };
    }

    async block(key: string, duration?: number): Promise<void> {
        const blockKey = this.getBlockKey(key);
        const blockDuration = duration ?? this.config.blockDuration ?? this.config.duration;
        
        await redis.multi()
            .set(blockKey, '1')
            .expire(blockKey, blockDuration)
            .exec();
    }

    async reset(key: string): Promise<void> {
        const pointsKey = this.getPointsKey(key);
        const blockKey = this.getBlockKey(key);

        await redis.multi()
            .del(pointsKey)
            .del(blockKey)
            .exec();
    }

    async isBlocked(key: string): Promise<boolean> {
        const blockKey = this.getBlockKey(key);
        const result = await redis.exists(blockKey);
        return result === 1;
    }

    async set(key: string, points: number): Promise<void> {
        const pointsKey = this.getPointsKey(key);
        await redis.multi()
            .set(pointsKey, points.toString())
            .expire(pointsKey, this.config.duration)
            .exec();
    }
}
