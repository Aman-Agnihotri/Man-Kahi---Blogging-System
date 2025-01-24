import { Request, Response } from 'express'
import { z } from 'zod'
import { AuthService } from '../services/auth.service'
import { logger } from '../utils/logger'
import { AuthRequest } from '../middlewares/auth.middleware'

// Input validation schemas
const registerSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email().max(100),
  password: z
    .string()
    .min(8)
    .max(100)
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d\w\W]{8,}$/,
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

export class AuthController {
  private authService: AuthService

  constructor() {
    this.authService = new AuthService()
  }

  register = async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate input
      const validatedInput = registerSchema.parse(req.body)

      // Register user
      const result = await this.authService.register(validatedInput)

      res.status(201).json(result)
    } catch (error) {
      logger.error('Register controller error:', error)
      
      if (error instanceof z.ZodError) {
        res.status(400).json({
          message: 'Invalid input',
          errors: error.errors,
        })
        return
      }

      if (error instanceof Error) {
        if (error.message.includes('already exists')) {
          res.status(409).json({ message: error.message })
          return
        }
      }

      res.status(500).json({ message: 'Internal server error' })
    }
  }

  login = async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate input
      const validatedInput = loginSchema.parse(req.body)

      // Login user
      const result = await this.authService.login(validatedInput)

      res.json(result)
    } catch (error) {
      logger.error('Login controller error:', error)

      if (error instanceof z.ZodError) {
        res.status(400).json({
          message: 'Invalid input',
          errors: error.errors,
        })
        return
      }

      if (error instanceof Error) {
        if (error.message === 'Invalid credentials') {
          res.status(401).json({ message: error.message })
          return
        }
      }

      res.status(500).json({ message: 'Internal server error' })
    }
  }

  logout = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const token = req.headers.authorization?.split(' ')[1]
      if (!token) {
        res.status(400).json({ message: 'No token provided' })
        return
      }

      await this.authService.logout(token)
      res.json({ message: 'Logged out successfully' })
    } catch (error) {
      logger.error('Logout controller error:', error)
      res.status(500).json({ message: 'Internal server error' })
    }
  }

  addRole = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      // Validate input
      const validatedInput = addRoleSchema.parse(req.body)

      // Add role to user
      const updatedUser = await this.authService.addRole(
        validatedInput.userId,
        validatedInput.roleName
      )

      res.json({
        message: 'Role added successfully',
        user: {
          id: updatedUser.id,
          username: updatedUser.username,
          email: updatedUser.email,
          roles: updatedUser.roles.map(ur => ur.role.name)
        }
      })
    } catch (error) {
      logger.error('Add role controller error:', error)

      if (error instanceof z.ZodError) {
        res.status(400).json({
          message: 'Invalid input',
          errors: error.errors,
        })
        return
      }

      if (error instanceof Error) {
        if (error.message === 'User not found') {
          res.status(404).json({ message: error.message })
          return
        }
      }

      res.status(500).json({ message: 'Internal server error' })
    }
  }
}
