import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { verifyJWT } from '../utils/jwt';

const prisma = new PrismaClient();

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        roles: string[];
      };
    }
  }
}

// Authenticate JWT token
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const decoded = await verifyJWT(token);
    if (!decoded || typeof decoded === 'string') {
      res.status(401).json({ message: 'Invalid token' });
      return;
    }

    // Get user with roles
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

    if (!user) {
      res.status(401).json({ message: 'User not found' });
      return;
    }

    // Add user info to request
    req.user = {
      id: user.id,
      roles: user.roles.map(ur => ur.role.name)
    };

    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    res.status(401).json({ message: 'Authentication failed' });
  }
};

// Authorize by roles
export const authorize = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        res.status(401).json({ message: 'Authentication required' });
        return;
      }

      const hasRequiredRole = req.user.roles.some(role => 
        allowedRoles.includes(role)
      );

      if (!hasRequiredRole) {
        res.status(403).json({ message: 'Insufficient permissions' });
        return;
      }

      next();
    } catch (error) {
      logger.error('Authorization error:', error);
      res.status(403).json({ message: 'Authorization failed' });
    }
  };
};
