import { Request, Response, NextFunction } from "express";
import logger from "../utils/logger";
import { prisma } from "../utils/prismaClient";

const authorizeRoles = (roles: string[]) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const user = (req as any).user; // Authenticated user

        if (!user) {
            logger.info("Unauthorized access: User not found in request.");
            res.status(403).json({ success: false, message: "Unauthorized access." });
            return;
        }

        // Fetch roles if not already included in the user object
        if (!user.roles) {
            const userRoles = await prisma.userRole.findMany({
                where: { userId: user.id },
                include: { role: true },
            });
            user.roles = userRoles.map((ur) => ur.role);
        }

        // Check if the user has the required role
        const rolesLower = roles.map(role => role.toLowerCase());
        const hasRole = user.roles.some((role: any) =>
            rolesLower.includes(role.name.toLowerCase())
        );

        if (!hasRole) {
            logger.info(`Access denied: User '${user.id}' lacks required roles.`);
            res.status(403).json({ success: false, message: "Access denied." });
            return;
        }

        logger.debug(`User '${user.id}' authorized with roles: ${user.roles.map((r: any) => r.name).join(', ')}`);
        next();
    };
};

export default authorizeRoles;