import { Request, Response, NextFunction } from 'express';
import { verifyToken, TokenExpiredError, JsonWebTokenError } from "../../utils/jwt";
import { prisma } from "../../utils/prismaClient";
import { tokenBlacklist } from "../../config/redis";
import logger from "../../utils/logger";
import { AuthOptions, AuthenticatedRequest, TokenPayload, AuthenticatedUser } from "./types";
import { rateLimit } from "./rateLimit";

type RequestHandler = (req: Request, res: Response, next: NextFunction) => Promise<any>;

export const authenticate = (options: AuthOptions = {}) => {
    const middlewares: RequestHandler[] = [];

    // Add rate limiting if configured
    if (options.rateLimit) {
        middlewares.push(rateLimit(
            options.rateLimit.windowMs,
            options.rateLimit.max
        ));
    }

    // Add authentication middleware
    middlewares.push(async (req: Request, res: Response, next: NextFunction) => {
        try {
            const strategies = options.strategy || ['jwt'];
            const requireAll = options.requireAllStrategies || false;

            // Track authentication success for each strategy
            const results = await Promise.all(
                strategies.map(strategy => authenticateStrategy(strategy, req))
            );

            // Determine if authentication was successful based on strategy requirements
            const isAuthenticated = requireAll
                ? results.every(result => result)
                : results.some(result => result);

            if (!isAuthenticated) {
                return res.status(401).json({
                    success: false,
                    message: "Authentication failed"
                });
            }

            // If using JWT, verify token is not blacklisted
            const token = extractBearerToken(req);
            if (token) {
                const isBlacklisted = await tokenBlacklist.check(token);
                if (isBlacklisted) {
                    return res.status(401).json({
                        success: false,
                        message: "Token has been revoked"
                    });
                }
            }

            // Apply role-based access control if roles are specified
            if (options.roles?.length) {
                const user = (req as AuthenticatedRequest).user;
                const hasRequiredRole = options.roles.some(role =>
                    user.roles.some(userRole => 
                        userRole.name.toLowerCase() === role.toLowerCase()
                    )
                );

                if (!hasRequiredRole) {
                    return res.status(403).json({
                        success: false,
                        message: "Insufficient permissions"
                    });
                }
            }

            next();
        } catch (error) {
            logger.error('Authentication error:', error);
            next(error);
        }
    });

    // Return middleware chain
    return async (req: Request, res: Response, next: NextFunction) => {
        const executeMiddlewareChain = async (index: number) => {
            if (index === middlewares.length) {
                return next();
            }

            try {
                await middlewares[index](req, res, (error?: any) => {
                    if (error) return next(error);
                    executeMiddlewareChain(index + 1).catch(next);
                });
            } catch (error) {
                next(error);
            }
        };

        executeMiddlewareChain(0).catch(next);
    };
};

async function authenticateStrategy(
    strategy: 'jwt' | 'oauth',
    req: Request
): Promise<boolean> {
    switch (strategy) {
        case 'jwt':
            return await handleJwtStrategy(req);
        case 'oauth':
            return handleOAuthStrategy(req);
        default:
            return false;
    }
}

async function handleJwtStrategy(req: Request): Promise<boolean> {
    const token = extractBearerToken(req);
    if (!token) return false;

    try {
        const decoded = verifyToken(token) as TokenPayload;
        if (!decoded.id) return false;

        const user = await prisma.user.findUnique({
            where: { id: decoded.id },
            include: {
                roles: {
                    include: {
                        role: true
                    }
                }
            }
        });

        if (!user) return false;

        // Transform user roles into the expected format
        const roles = user.roles.map(ur => ur.role);

        // Create authenticated user object
        const authenticatedUser: AuthenticatedUser = {
            id: user.id,
            email: user.email,
            username: user.username,
            roles: roles,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
        };

        // Attach user to request
        (req as AuthenticatedRequest).user = authenticatedUser;

        return true;
    } catch (error) {
        if (error instanceof TokenExpiredError) {
            logger.info('Token expired');
        } else if (error instanceof JsonWebTokenError) {
            logger.info('Invalid token');
        } else {
            logger.error('JWT verification error:', error);
        }
        return false;
    }
}

function handleOAuthStrategy(req: Request): boolean {
    return req.isAuthenticated();
}

function extractBearerToken(req: Request): string | null {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return null;
    return authHeader.split(' ')[1] || null;
}
