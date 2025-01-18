import logger from '../utils/logger';
import { Request, Response, NextFunction } from 'express';

const prismaErrorCodePattern = /P\d{4}/;

/**
 * Centralized error handler middleware.
 *
 * Logs the error with the logger and sends a JSON response with the error message
 * and status code.
 *
 * @param {Error} err - The error that occurred
 * @param {Request} req - The Express request object
 * @param {Response} res - The Express response object
 * @param {NextFunction} next - The next middleware function in the chain
 */
const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
    
    // Check if the error is a Prisma error
    const isPrismaError = err?.error.code && prismaErrorCodePattern.test(err.error.code);

    if (isPrismaError) {
        // Log Prisma-specific error
        logger.warn(`Prisma Error [${err.error.code}]: ${err.error.message}`, {
            method: req.method,
            path: req.originalUrl,
            status: err.status || 500,
            prismaCode: err.error.code,
            stack: err.error.stack
        });

    } else {

        // Log general error
        logger.warn(`Error occurred: ${err.message}`, {
            method: req.method,
            path: req.originalUrl,
            status: err.status || 500,
            stack: err.error ? err.error.stack : err.stack
        });
    }

    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal Server Error',
    });
};

export default errorHandler;