import { RateLimiterMemory } from "rate-limiter-flexible";
import rateLimit from "express-rate-limit";
import { Request, Response, NextFunction } from "express";
import logger from "../utils/logger";
import { rateLimitConfig } from "../utils/constants";

/**
 * Creates an IP rate limiter based on the given configuration.
 * @param {Object} [config=rateLimitConfig.ip] - The configuration object to use for the rate limiter.
 * @property {number} config.windowMs - The time frame in milliseconds for the rate limit.
 * @property {number} config.limit - The maximum number of requests allowed in the time frame.
 * @property {string} config.message - The message to return when the rate limit is exceeded.
 * @returns {express.RequestHandler} The IP rate limiter middleware.
 */
export const createIpRateLimiter = (config = rateLimitConfig.ip) => rateLimit({
    windowMs: config.windowMs,
    limit: config.limit,
    message: "Too many requests from this IP, please try again after " + config.windowMs / 1000 + " seconds.",
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    handler: (req, res, next, options) => {
        logger.info(`IP rate limit exceeded for IP: ${req.ip}`);
        res.status(429).json({ success: false, message: options.message });
    }
});

/**
 * Creates a role-based rate limiter.
 * @param {Request} req - Express request object.
 * @param {Response} res - Express response object.
 * @param {NextFunction} next - Express next function.
 */
export const useRoleRateLimiter = async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user; // Assuming user is attached to request
    const role = user?.roles?.[0]?.name || "reader"; // Default to "reader" role

    const config = rateLimitConfig.roles[role];

    if (!config) {
        logger.warn(`No rate limit configuration found for role: ${role}`);
        return next();
    }

    const rateLimiter = new RateLimiterMemory({ points: config.points, duration: config.duration });

    try {
        await rateLimiter.consume(user?.id || req.ip);
        next();
    } catch (rateLimitError) {
        logger.info(`Rate limit exceeded for role: ${role}, IP: ${req.ip}`);
        res.status(429).json({ success: false, message: "Too many requests, please try again later." });
    }
};

export const ipRateLimiter = createIpRateLimiter();
