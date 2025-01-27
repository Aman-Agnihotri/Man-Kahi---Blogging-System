import { Request } from 'express';

/**
 * Get client IP from request with x-forwarded-for support
 */
export const getClientIp = (req: Request): string => {
    return (
        (req.headers['x-forwarded-for'] as string)?.split(',')[0] ??
        req.socket.remoteAddress ??
        'unknown'
    );
};

/**
 * Additional rate limit configurations for specific services
 */
export const RATE_LIMIT_CONFIGS = {
    search: {
        points: 10,
        duration: 60,
        blockDuration: 60 * 5, // 5 minutes
        keyPrefix: 'rl:search',
    },
    auth: {
        points: 5,
        duration: 60 * 15, // 15 minutes
        blockDuration: 60 * 30, // 30 minutes
        keyPrefix: 'rl:auth',
    },
};

/**
 * Format milliseconds into a human-readable duration
 */
export const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
        return `${hours} hour${hours > 1 ? 's' : ''}`;
    }
    if (minutes > 0) {
        return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    }
    return `${seconds} second${seconds > 1 ? 's' : ''}`;
};

/**
 * Generate error message based on rate limit configuration
 */
export const generateErrorMessage = (
    type: string,
    duration: number,
    retryAfter?: number
): string => {
    if (retryAfter) {
        return `Too many ${type} attempts. Please try again in ${formatDuration(retryAfter)}`;
    }
    return `Too many ${type} attempts. Please try again in ${formatDuration(duration * 1000)}`;
};
