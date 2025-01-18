import { verifyToken, TokenExpiredError, JsonWebTokenError } from "../utils/jwt";
import { Request, Response, NextFunction } from 'express';
import logger from "../utils/logger";
import { prisma } from "../utils/prismaClient";

const authenticateUser = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')){
        // If no token, check if OAuth user is authenticated via Passport session
        // if(req.isAuthenticated?.()) {
        //     return next(); // User is authenticated via OAuth, proceed to the next middleware
        // }

        logger.info("Unauthorized access: No authentication token provided.");
        return res.status(401).json({ success: false, message: "Unauthorized, please log in." });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Authorization token required.' });
    }

    try {
        const decodedUser = verifyToken(token);

        let user_id = '';

        if (typeof decodedUser !== 'string' && 'id' in decodedUser) {
            user_id = decodedUser.id;
        } else {
            logger.info("Authentication failed. Invalid token payload: " + JSON.stringify(decodedUser));
            return res.status(401).json({ success: false, message: 'Invalid or expired access token.' });
        }

        const user = await prisma.user.findUnique({ where: { id: user_id } });

        if (!user) {
            logger.info("Authentication failed. User with ID " + user_id + " not found.");
            return res.status(401).json({ success: false, message: 'Invalid or expired access token.' });
        }

        (req as any).user = user;
        return next();
    } catch (error) {
        if (error instanceof TokenExpiredError) {
            logger.info(`Authentication failed. Token expired. \nExpiredAt: ${error.expiredAt}`);
            return res.status(401).json({ success: false, message: "Invalid or expired access token." });

        } else if (error instanceof Error && error.message === 'invalid signature'){
            logger.info("Authentication failed. Invalid token signature.");
            return res.status(401).json({ success: false, message: "Invalid or expired access token." });

        } else if (error instanceof JsonWebTokenError) {
            logger.info("Authentication failed. Malformed token.");
            return res.status(401).json({ success: false, message: "Invalid or expired access token." });

        } else {
            next({ message: "An error occurred during authentication.", error });
        }
    }
};

export default authenticateUser;