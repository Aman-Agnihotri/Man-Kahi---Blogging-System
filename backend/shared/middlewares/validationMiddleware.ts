import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import logger from '../utils/logger';

/** Utility: Validates a CUID (Compact Unique Identifier). */
function validateId(id: string) {
    const cuidRegex = /^c[0-9a-z]{24}$/i;
    return cuidRegex.test(id);
}

/** Middleware: Validates route parameters for IDs. */
export const validateIdParam = (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    if (!validateId(id)) {
        logger.info(`Request '${req.method} ${req.originalUrl}' failed. Invalid ID format: ${id}`);
        return res.status(400).json({ success: false, message: 'Invalid ID format.' });
    }
    next();
};

/** Middleware: Validates request payloads against a schema. */
const validateSchema = (schema: any) => (req: Request, res: Response, next: NextFunction) => {
    const parseResult = schema.safeParse(req.body);
    if (!parseResult.success) {
        interface ValidationError {
            message: string;
        }

        const errorMessages: string[] = parseResult.error.errors.map((err: ValidationError) => err.message);
        logger.info(`Validation failed for ${req.method} ${req.originalUrl}:`, errorMessages);
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            errors: errorMessages
        });
    }
    req.body = parseResult.data; // Sanitize request body
    next();
};

/** Middleware: Dynamically applies validation schemas based on routes. */
export const validateBody = (req: Request, res: Response, next: NextFunction) => {
    if (!req.body) {
        logger.info(`Request '${req.method} ${req.originalUrl}' failed. Request body is empty.`);
        return res.status(400).json({ success: false, message: 'Request body is empty.' });
    }

    const routeValidationMap: { [key: string]: any } = {
        '/register': registerUserSchema,
        '/login': loginUserSchema,
        '/users': req.method === 'POST' ? registerUserSchema : updateUserSchema,
        '/blogs': blogSchema,
    };

    for (const route in routeValidationMap) {
        if (req.originalUrl.includes(route)) {
            return validateSchema(routeValidationMap[route])(req, res, next);
        }
    }
    next();
};

/** Zod Schemas for Validation */
export const registerUserSchema = z.object({
    username: z.string().min(6, "Username must be at least 6 characters long.").max(20).regex(/^[a-zA-Z0-9]+$/, "Username must contain only letters and numbers."),
    email: z.string().email("Invalid email address."),
    password: z.string().min(8, "Password must be at least 8 characters long.").regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d]{8,}$/, "Password must contain uppercase, lowercase, and numbers."),
});

export const loginUserSchema = z.object({
    email: z.string().email("Invalid email address."),
    password: z.string().min(8, "Invalid password.").regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d]{8,}$/),
});

export const updateUserSchema = z.object({
    username: z.string().min(3).max(30).optional(),
    email: z.string().email().optional(),
    password: z.string().min(8).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d]{8,}$/).optional(),
}).refine(data => Object.values(data).some(value => value !== undefined), {
    message: "At least one field must be provided.",
});

export const blogSchema = z.object({
    title: z.string().min(3, "Title must be at least 3 characters.").max(200),
    content: z.string().min(10, "Content must be at least 10 characters."),
    tags: z.array(z.string().min(1)).optional(),
    category: z.string().min(3).max(50).optional(),
});
