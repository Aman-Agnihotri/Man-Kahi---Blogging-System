import { PrismaClient } from '@prisma/client'
import { hashPassword, verifyPassword } from '../utils/password'
import { generateToken, getTokenExpiryInSeconds } from '../utils/jwt'
import { addToBlacklist } from '../config/redis'
import { logger } from '../utils/logger'
import { prisma } from '../config/prisma'

interface RegisterInput {
  username: string
  email: string
  password: string
}

interface LoginInput {
  email: string
  password: string
}

interface AuthResponse {
  user: {
    id: string
    username: string
    email: string
    roles: string[]
  }
  token: string
}

interface UserWithRoles {
  id: string
  username: string
  email: string
  roles: Array<{
    role: {
      name: string
    }
  }>
}

export class AuthService {
  private prisma: PrismaClient

  constructor() {
    this.prisma = prisma
  }

  async register(input: RegisterInput): Promise<AuthResponse> {
    try {
      // Check if user already exists
      const existingUser = await this.prisma.user.findFirst({
        where: {
          OR: [
            { email: input.email },
            { username: input.username }
          ],
        },
      })

      if (existingUser) {
        throw new Error('User with this email or username already exists')
      }

      // Hash password
      const hashedPassword = await hashPassword(input.password)

      // Create user with default reader role
      const user = await this.prisma.user.create({
        data: {
          username: input.username,
          email: input.email,
          password: hashedPassword,
          roles: {
            create: {
              role: {
                connectOrCreate: {
                  where: { name: 'reader' },
                  create: { name: 'reader' }
                }
              }
            }
          }
        },
        include: {
          roles: {
            include: {
              role: true
            }
          }
        }
      })

      // Generate JWT token
      const token = generateToken({
        userId: user.id,
        roles: user.roles.map(ur => ur.role.name)
      })

      return {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          roles: user.roles.map(ur => ur.role.name)
        },
        token
      }
    } catch (error) {
      logger.error('Registration error:', error)
      throw error
    }
  }

  async login(input: LoginInput): Promise<AuthResponse> {
    try {
      // Find user
      const user = await this.prisma.user.findUnique({
        where: { email: input.email },
        include: {
          roles: {
            include: {
              role: true
            }
          }
        }
      })

      if (!user || !user.password) {
        throw new Error('Invalid credentials')
      }

      // Verify password
      const isValid = await verifyPassword(user.password, input.password)
      if (!isValid) {
        throw new Error('Invalid credentials')
      }

      // Generate JWT token
      const token = generateToken({
        userId: user.id,
        roles: user.roles.map(ur => ur.role.name)
      })

      return {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          roles: user.roles.map(ur => ur.role.name)
        },
        token
      }
    } catch (error) {
      logger.error('Login error:', error)
      throw error
    }
  }

  async logout(token: string): Promise<void> {
    try {
      const expiryInSeconds = getTokenExpiryInSeconds(token)
      if (expiryInSeconds > 0) {
        await addToBlacklist(token, expiryInSeconds)
      }
    } catch (error) {
      logger.error('Logout error:', error)
      throw error
    }
  }

  async addRole(userId: string, roleName: string): Promise<UserWithRoles> {
    try {
      // Check if user exists
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          roles: {
            include: {
              role: true
            }
          }
        }
      })

      if (!user) {
        throw new Error('User not found')
      }

      // Add role to user
      return await this.prisma.user.update({
        where: { id: userId },
        data: {
          roles: {
            create: {
              role: {
                connectOrCreate: {
                  where: { name: roleName },
                  create: { name: roleName }
                }
              }
            }
          }
        },
        include: {
          roles: {
            include: {
              role: true
            }
          }
        }
      })
    } catch (error) {
      logger.error('Add role error:', error)
      throw error
    }
  }
}
