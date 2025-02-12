import { z } from 'zod'
import { AuthService } from '@services/auth.service'
import logger from '@shared/utils/logger'
import { AuthenticatedRequest } from '@shared/middlewares/auth'
import { RequestHandler } from 'express-serve-static-core'
import { 
  updateActiveTokens, 
  trackDbOperation, 
  trackError,
  trackRedisOperation 
} from '@middlewares/metrics.middleware'

// Input validation schemas
const registerSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email().max(100),
  password: z
    .string()
    .min(8)
    .max(100)
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/,
      'Password must contain at least one uppercase letter, one lowercase letter, and one number'
    ),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

const addRoleSchema = z.object({
  userId: z.string().min(1),
  roleName: z.string().min(1),
})

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
})

export class AuthController {
  private readonly authService: AuthService

  constructor() {
    this.authService = new AuthService()
  }

  register: RequestHandler<{}, any, z.infer<typeof registerSchema>> = async (req, res, next) => {
    try {
      // Validate input
      const validatedInput = registerSchema.parse(req.body)

      // Register user with database tracking
      const dbTimer = trackDbOperation('insert', 'user');
      const result = await this.authService.register(validatedInput)
      dbTimer.end();

      res.status(201).json(result)
    } catch (error) {
      logger.error('Register controller error:', error)
      
      if (error instanceof z.ZodError) {
        trackError('validation', 'register_validation_failed', 'auth');
        res.status(400).json({
          message: 'Invalid input',
          errors: error.errors,
        })
        return
      }

      if (error instanceof Error) {
        if (error.message.includes('already exists')) {
          trackError('duplicate_user', 'user_already_exists', 'auth');
          res.status(409).json({ message: error.message })
          return
        }
      }

      trackError('server', 'registration_failed', 'auth');
      res.status(500).json({ message: 'Internal server error' })
    }
  }

  login: RequestHandler<{}, any, z.infer<typeof loginSchema>> = async (req, res, next) => {
    const redisTimer = trackRedisOperation('session_create');
    try {
      // Validate input
      const validatedInput = loginSchema.parse(req.body)

      // Login user with database tracking
      const dbTimer = trackDbOperation('select', 'user');
      const result = await this.authService.login(validatedInput)
      dbTimer.end();

      // Update metrics
      updateActiveTokens(1);
      redisTimer.end();
      
      res.json(result)
    } catch (error) {
      redisTimer.end();
      logger.error('Login controller error:', error)

      if (error instanceof z.ZodError) {
        trackError('validation', 'login_validation_failed', 'auth');
        res.status(400).json({
          message: 'Invalid input',
          errors: error.errors,
        })
        return
      }

      if (error instanceof Error) {
        if (error.message === 'Invalid credentials') {
          trackError('invalid_credentials', 'login_failed', 'auth');
          res.status(401).json({ message: error.message })
          return
        }
      }

      trackError('server', 'login_failed', 'auth');
      res.status(500).json({ message: 'Internal server error' })
    }
  }

  logout: RequestHandler<{}, any> = async (req, res, next) => {
    const redisTimer = trackRedisOperation('session_destroy');
    try {
      const token = req.headers.authorization?.split(' ')[1]
      if (!token) {
        trackError('missing_token', 'logout_failed', 'auth');
        res.status(400).json({ message: 'No token provided' })
        return
      }

      await this.authService.logout(token)
      updateActiveTokens(-1)
      redisTimer.end()
      
      res.json({ message: 'Logged out successfully' })
    } catch (error) {
      redisTimer.end()
      logger.error('Logout controller error:', error)
      trackError('server', 'logout_failed', 'auth');
      res.status(500).json({ message: 'Internal server error' })
    }
  }

  refreshToken: RequestHandler<{}, any, z.infer<typeof refreshTokenSchema>> = async (req, res, next) => {
    const redisTimer = trackRedisOperation('token_refresh');
    try {
      // Validate input
      const validatedInput = refreshTokenSchema.parse(req.body);

      // Refresh token with database tracking
      const dbTimer = trackDbOperation('select', 'user');
      const result = await this.authService.refreshToken(validatedInput.refreshToken);
      dbTimer.end();

      // Update metrics
      updateActiveTokens(1);
      redisTimer.end();

      res.json(result);
    } catch (error) {
      redisTimer.end();
      logger.error('Refresh token controller error:', error);

      if (error instanceof z.ZodError) {
        trackError('validation', 'refresh_token_validation_failed', 'auth');
        res.status(400).json({
          message: 'Invalid input',
          errors: error.errors,
        });
        return;
      }

      if (error instanceof Error) {
        if (error.message === 'Invalid refresh token') {
          trackError('invalid_token', 'refresh_token_failed', 'auth');
          res.status(401).json({ message: error.message });
          return;
        }
      }

      trackError('server', 'refresh_token_failed', 'auth');
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  addRole: RequestHandler<{}, any, z.infer<typeof addRoleSchema>> = async (req, res, next) => {
    try {
      // Validate input
      const validatedInput = addRoleSchema.parse(req.body)

      // Check if user has admin role
      const authReq = req as AuthenticatedRequest
      const hasAdminRole = authReq.user.roles.some(role => role === 'admin')
      
      if (!hasAdminRole) {
        trackError('unauthorized', 'add_role_unauthorized', 'auth');
        res.status(403).json({ message: 'Unauthorized' })
        return
      }

      // Add role to user with database tracking
      const dbTimer = trackDbOperation('update', 'user_roles');
      const updatedUser = await this.authService.addRole(
        validatedInput.userId,
        validatedInput.roleName
      )
      dbTimer.end();

      res.json({
        message: 'Role added successfully',
        user: {
          id: updatedUser.id,
          username: updatedUser.username,
          email: updatedUser.email,
          roles: updatedUser.roles.map(role => role.name)
        }
      })
    } catch (error) {
      logger.error('Add role controller error:', error)

      if (error instanceof z.ZodError) {
        trackError('validation', 'add_role_validation_failed', 'auth');
        res.status(400).json({
          message: 'Invalid input',
          errors: error.errors,
        })
        return
      }

      if (error instanceof Error) {
        if (error.message === 'User not found') {
          trackError('user_not_found', 'add_role_failed', 'auth');
          res.status(404).json({ message: error.message })
          return
        }
      }

      trackError('server', 'add_role_failed', 'auth');
      res.status(500).json({ message: 'Internal server error' })
    }
  }
}
