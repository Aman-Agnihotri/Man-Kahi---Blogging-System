import { PrismaClient } from '@prisma/client'
import { hashPassword, verifyPassword } from '@utils/password'
import { generateToken, getTokenExpiryInSeconds } from '@shared/utils/jwt'
import { tokenBlacklist } from '@shared/config/redis'
import logger from '@shared/utils/logger'
import { prisma } from '@config/prisma'
import { RegisterInput, LoginResponse, AuthUser, UserWithRoles } from '@/types/auth.types'

interface LoginInput {
    email: string
    password: string
}

export class AuthService {
    private readonly prisma: PrismaClient

    constructor() {
        this.prisma = prisma
    }

    async register(input: RegisterInput): Promise<LoginResponse> {
        try {
            // Check if user already exists
            const existingUser = await this.prisma.user.findFirst({
                where: {
                    OR: [
                        { email: input.email },
                        { username: input.username }
                    ]
                }
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
                    UserRole: {
                        create: {
                            role: {
                                connectOrCreate: {
                                    where: { name: 'reader' },
                                    create: {
                                        name: 'reader',
                                        description: 'Default reader role'
                                    }
                                }
                            }
                        }
                    }
                },
                include: {
                    UserRole: {
                        include: {
                            role: true
                        }
                    }
                }
            })

            const userRoles = user.UserRole.map(ur => ur.role.name)

            // Generate tokens
            const token = await this.generateToken(user.id)
            const refreshToken = await this.generateRefreshToken(user.id)

            const authUser: AuthUser = {
                id: user.id,
                username: user.username,
                email: user.email,
                roles: userRoles
            }

            return {
                user: authUser,
                token,
                refreshToken
            }
        } catch (error) {
            logger.error('Registration error:', error)
            throw error
        }
    }

    async login(input: LoginInput): Promise<LoginResponse> {
        try {
            // Find user
            const user = await this.prisma.user.findUnique({
                where: { email: input.email },
                include: {
                    UserRole: {
                        include: {
                            role: true
                        }
                    }
                }
            })

            if (!user?.password) {
                throw new Error('Invalid credentials')
            }

            // Verify password
            const isValid = await verifyPassword(input.password, user.password)
            if (!isValid) {
                throw new Error('Invalid credentials')
            }

            const userRoles = user.UserRole.map(ur => ur.role.name)

            // Generate tokens
            const token = await this.generateToken(user.id)
            const refreshToken = await this.generateRefreshToken(user.id)

            const authUser: AuthUser = {
                id: user.id,
                username: user.username,
                email: user.email,
                roles: userRoles
            }

            return {
                user: authUser,
                token,
                refreshToken
            }
        } catch (error) {
            logger.error('Login error:', error)
            throw error
        }
    }

    async generateToken(userId: string): Promise<string> {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: {
                UserRole: {
                    include: {
                        role: true
                    }
                }
            }
        })

        if (!user) {
            throw new Error('User not found')
        }

        const userRoles = user.UserRole.map(ur => ur.role.name)

        return generateToken({
            id: user.id,
            userId: user.id,
            email: user.email,
            roles: userRoles,
            type: 'access'
        })
    }

    async generateRefreshToken(userId: string): Promise<string> {
        const user = await this.prisma.user.findUnique({
            where: { id: userId }
        })

        if (!user) {
            throw new Error('User not found')
        }

        // Generate a longer-lived token for refresh
        return generateToken({
            id: user.id,
            userId: user.id,
            email: user.email,
            roles: [],  // Refresh tokens don't need roles
            type: 'refresh'
        })
    }

    async logout(token: string): Promise<void> {
        try {
            const expiryInSeconds = getTokenExpiryInSeconds(token)
            if (expiryInSeconds > 0) {
                await tokenBlacklist.add(token, expiryInSeconds)
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
                    UserRole: {
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
            const updatedUser = await this.prisma.user.update({
                where: { id: userId },
                data: {
                    UserRole: {
                        create: {
                            role: {
                                connectOrCreate: {
                                    where: { name: roleName },
                                    create: {
                                        name: roleName,
                                        description: `Role ${roleName}`
                                    }
                                }
                            }
                        }
                    }
                },
                include: {
                    UserRole: {
                        include: {
                            role: true
                        }
                    }
                }
            })

            return {
                ...updatedUser,
                roles: updatedUser.UserRole.map(ur => ur.role)
            }
        } catch (error) {
            logger.error('Add role error:', error)
            throw error
        }
    }

    async unlinkProvider(userId: string, provider: string): Promise<void> {
        try {
            // Check if user has other login methods before unlinking
            const user = await this.prisma.user.findUnique({
                where: { id: userId },
                include: {
                    oAuthProviders: true
                }
            })

            if (!user) {
                throw new Error('User not found')
            }

            // If this is the only login method and user has no password, prevent unlinking
            if (!user.password && user.oAuthProviders.length <= 1) {
                throw new Error('Cannot unlink the only authentication method')
            }

            // Delete the OAuth provider
            await this.prisma.oAuthProvider.deleteMany({
                where: {
                    userId,
                    provider
                }
            })

            logger.info(`Unlinked provider ${provider} from user ${userId}`)
        } catch (error) {
            logger.error('Error unlinking provider:', error)
            throw error
        }
    }
}
