import { Request, Response, NextFunction } from 'express';
import { verifyToken, TokenExpiredError, JsonWebTokenError } from "../../utils/jwt";
import { prisma } from "../../utils/prismaClient";
import { tokenBlacklist } from "../../config/redis";
import logger from "../../utils/logger";
import { AuthOptions, TokenPayload, AuthenticatedUser, isAuthenticatedRequest } from "./types";
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
            if (!await validateAuthentication(req, options)) {
                return res.status(401).json({
                    success: false,
                    message: "Authentication failed",
                    details: options.requireAllStrategies 
                        ? "All authentication strategies must succeed"
                        : "At least one authentication strategy must succeed"
                });
            }

            if (!await validateToken(req)) {
                return res.status(401).json({
                    success: false,
                    message: "Token has been revoked",
                    details: "This token is no longer valid. Please obtain a new token."
                });
            }

            if (!await validateRoles(req, options)) {
                return res.status(403).json({
                    success: false,
                    message: "Insufficient permissions",
                    details: `Required roles: ${options.roles?.join(', ')}`
                });
            }

            return next();
        } catch (error) {
            return handleAuthError(error, options, res, next);
        }
    });

    // Return middleware chain
    return async (req: Request, res: Response, next: NextFunction) => {
        const executeMiddlewareChain = async (index: number) => {
            if (index === middlewares.length) {
                return next();
            }

            const currentMiddleware = middlewares[index];
            if (!currentMiddleware) {
                return next();
            }

            try {
                await currentMiddleware(req, res, (error?: any) => {
                    if (error) return next(error);
                    executeMiddlewareChain(index + 1).catch(next);
                });
            } catch (error) {
                return next(error);
            }
        };

        executeMiddlewareChain(0).catch(next);
    };
};

// Validation helper functions
async function validateAuthentication(req: Request, options: AuthOptions): Promise<boolean> {
    const strategies = options.strategy || ['jwt'];
    const requireAll = options.requireAllStrategies || false;

    const results = await Promise.all(
        strategies.map(strategy => authenticateStrategy(strategy, req))
    );

    const isAuthenticated = requireAll
        ? results.every(result => result)
        : results.some(result => result);

    if (!isAuthenticated) {
        logger.warn('Authentication failed:', {
            strategies,
            requireAll,
            results: results.map((r, i) => ({ strategy: strategies[i], success: r }))
        });
    }

    return isAuthenticated;
}

async function validateToken(req: Request): Promise<boolean> {
    const token = extractBearerToken(req);
    if (!token) return true; // Skip if no token

    const isBlacklisted = await tokenBlacklist.check(token);
    if (isBlacklisted) {
        logger.warn('Attempt to use blacklisted token:', {
            tokenPrefix: token.substring(0, 10) + '...'
        });
        return false;
    }

    return true;
}

async function validateRoles(req: Request, options: AuthOptions): Promise<boolean> {
    if (!options.roles?.length || !isAuthenticatedRequest(req)) {
        return true; // Skip if no roles specified or not authenticated
    }

    const hasRequiredRole = options.roles.some(requiredRole =>
        req.user.roles.some(role => 
            role.toLowerCase() === requiredRole.toLowerCase()
        )
    );

    if (!hasRequiredRole) {
        logger.warn('Insufficient permissions:', {
            userId: req.user.id,
            requiredRoles: options.roles,
            userRoles: req.user.roles
        });
    }

    return hasRequiredRole;
}

function handleAuthError(error: any, options: AuthOptions, res: Response, next: NextFunction) {
    logger.error('Authentication error:', {
        error,
        strategies: options.strategy,
        requireAll: options.requireAllStrategies
    });
    
    if (error instanceof TokenExpiredError) {
        return res.status(401).json({
            success: false,
            message: "Token expired",
            details: "Please obtain a new access token"
        });
    }
    
    if (error instanceof JsonWebTokenError) {
        return res.status(401).json({
            success: false,
            message: "Invalid token",
            details: "The provided authentication token is malformed or invalid"
        });
    }
    
    return next(error);
}


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

        // Transform user roles into role slugs
        const roles = user.roles.map(ur => ur.role.slug);

        // Create authenticated user object
        const authenticatedUser: AuthenticatedUser = {
            id: user.id,
            email: user.email,
            username: user.username,
            roles,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
        };

        // Attach user to request
        req.user = authenticatedUser;

        return true;
    } catch (error) {
        if (error instanceof TokenExpiredError) {
            logger.info('Token expired', { tokenPrefix: token.substring(0, 10) + '...' });
        } else if (error instanceof JsonWebTokenError) {
            logger.info('Invalid token', { 
                error: error.message,
                tokenPrefix: token.substring(0, 10) + '...'
            });
        } else {
            logger.error('JWT verification error:', {
                error,
                tokenPrefix: token.substring(0, 10) + '...'
            });
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
    return authHeader.split(' ')[1] ?? null;
}
