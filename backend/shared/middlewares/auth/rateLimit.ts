import { Request, Response, NextFunction } from 'express';
import { rateLimit as rateLimiting } from "../../config/redis";
import logger from "../../utils/logger";
import { RateLimitInfo } from "./types";

export const rateLimit = (windowMs: number, maxRequests: number) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const key = `ratelimit:${req.ip}`;
        
        try {
            const requests = await rateLimiting.increment(key, Math.ceil(windowMs / 1000));
            
            const rateLimitInfo: RateLimitInfo = {
                windowMs,
                max: maxRequests,
                remaining: Math.max(0, maxRequests - requests),
                resetTime: new Date(Date.now() + windowMs)
            };

            // Set rate limit headers
            res.set({
                'X-RateLimit-Limit': maxRequests.toString(),
                'X-RateLimit-Remaining': rateLimitInfo.remaining.toString(),
                'X-RateLimit-Reset': rateLimitInfo.resetTime.getTime().toString()
            });

            if (requests > maxRequests) {
                logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
                return res.status(429).json({
                    success: false,
                    message: 'Too many requests, please try again later',
                    rateLimitInfo
                });
            }

            return next();
        } catch (error) {
            logger.error('Rate limiting error:', error);
            // Continue despite rate limiting errors
            return next();
        }
    };
};
