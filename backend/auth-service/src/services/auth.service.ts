import { prisma } from '@shared/utils/prismaClient'
import { hashPassword, verifyPassword } from '@utils/password'
import { generateToken, getTokenExpiryInSeconds } from '@shared/utils/jwt'
import { tokenBlacklist } from '@shared/config/redis'
import logger from '@shared/utils/logger'
import { RegisterInput, LoginResponse, AuthUser, UserWithRoles } from '@/types/auth.types'
import { 
    trackDbOperation, 
    trackAuthMetrics, 
    trackAuthError,
    updateActiveTokens,
    trackRedisOperation 
} from '../middlewares/metrics.middleware'

interface LoginInput {
    email: string
    password: string
}

export class AuthService {
    async register(input: RegisterInput): Promise<LoginResponse> {
        const dbTimer = trackDbOperation('insert', 'user');
        try {
            // Check if user already exists
            const existingUser = await prisma.user.findFirst({
                where: {
                    OR: [
                        { email: input.email },
                        { username: input.username }
                    ]
                }
            })

            if (existingUser) {
                dbTimer.end();
                trackAuthError('user_exists', 'register');
                throw new Error('User with this email or username already exists')
            }

            // Hash password
            const hashedPassword = await hashPassword(input.password)

            // Create user with default reader role
            const roleTimer = trackDbOperation('insert', 'user_roles');
            const user = await prisma.user.create({
                data: {
                    username: input.username,
                    email: input.email,
                    password: hashedPassword,
                    roles: {
                        create: {
                            role: {
                                connectOrCreate: {
                                    where: { name: 'reader' },
                                    create: {
                                        name: 'reader',
                                        description: 'Default reader role',
                                        slug: 'reader'
                                    }
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

            const userRoles = user.roles.map(ur => ur.role.name)

            // Generate tokens
            roleTimer.end();
            dbTimer.end();

            const token = await this.generateToken(user.id)
            const refreshToken = await this.generateRefreshToken(user.id)
            updateActiveTokens(2); // One for access token, one for refresh token

            trackAuthMetrics('registration_success', 'local');

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
        const dbTimer = trackDbOperation('select', 'user');
        try {
            // Find user
            const user = await prisma.user.findUnique({
                where: { email: input.email },
                include: {
                    roles: {
                        include: {
                            role: true
                        }
                    }
                }
            })

            if (!user?.password) {
                dbTimer.end();
                trackAuthError('invalid_credentials', 'login');
                throw new Error('Invalid credentials')
            }

            // Verify password
            const isValid = await verifyPassword(input.password, user.password)
            if (!isValid) {
                dbTimer.end();
                trackAuthError('invalid_password', 'login');
                throw new Error('Invalid credentials')
            }

            const userRoles = user.roles.map(ur => ur.role.name)

            dbTimer.end();

            // Generate tokens
            const token = await this.generateToken(user.id)
            const refreshToken = await this.generateRefreshToken(user.id)
            updateActiveTokens(2); // One for access token, one for refresh token

            trackAuthMetrics('login_success', 'local');

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
        const dbTimer = trackDbOperation('select', 'user');
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                roles: {
                    include: {
                        role: true
                    }
                }
            }
        })

        dbTimer.end();
        if (!user) {
            trackAuthError('user_not_found', 'token_generation');
            throw new Error('User not found')
        }

        const userRoles = user.roles.map(ur => ur.role.name)

        return generateToken({
            id: user.id,
            userId: user.id,
            email: user.email,
            roles: userRoles,
            type: 'access'
        })
    }

    async generateRefreshToken(userId: string): Promise<string> {
        const dbTimer = trackDbOperation('select', 'user');
        const user = await prisma.user.findUnique({
            where: { id: userId }
        })

        dbTimer.end();
        if (!user) {
            trackAuthError('user_not_found', 'refresh_token_generation');
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
        const redisTimer = trackRedisOperation('blacklist');
        try {
            const expiryInSeconds = getTokenExpiryInSeconds(token)
            if (expiryInSeconds > 0) {
                await tokenBlacklist.add(token, expiryInSeconds)
            }
            redisTimer.end();
            updateActiveTokens(-1);
            trackAuthMetrics('logout_success', 'local');
        } catch (error) {
            logger.error('Logout error:', error)
            throw error
        }
    }

    async addRole(userId: string, roleName: string): Promise<UserWithRoles> {
        const dbTimer = trackDbOperation('update', 'user_roles');
        try {
            // Check if user exists
            const user = await prisma.user.findUnique({
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
                dbTimer.end();
                trackAuthError('user_not_found', 'add_role');
                throw new Error('User not found')
            }

            // Add role to user
            const updatedUser = await prisma.user.update({
                where: { id: userId },
                data: {
                    roles: {
                        create: {
                            role: {
                                connectOrCreate: {
                                    where: { name: roleName },
                                    create: {
                                        name: roleName,
                                        description: `Role ${roleName}`,
                                        slug: roleName.toLowerCase()
                                    }
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

            dbTimer.end();
            trackAuthMetrics('role_added', 'local');
            
            return {
                ...updatedUser,
                roles: updatedUser.roles.map(ur => ur.role)
            }
        } catch (error) {
            logger.error('Add role error:', error)
            throw error
        }
    }

    async unlinkProvider(userId: string, provider: string): Promise<void> {
        const dbTimer = trackDbOperation('delete', 'oauth_provider');
        try {
            // Check if user has other login methods before unlinking
            const user = await prisma.user.findUnique({
                where: { id: userId },
                include: {
                    oAuthProviders: true
                }
            })

            if (!user) {
                dbTimer.end();
                trackAuthError('user_not_found', 'unlink_provider');
                throw new Error('User not found')
            }

            // If this is the only login method and user has no password, prevent unlinking
            if (!user.password && user.oAuthProviders.length <= 1) {
                dbTimer.end();
                trackAuthError('last_auth_method', 'unlink_provider');
                throw new Error('Cannot unlink the only authentication method')
            }

            // Delete the OAuth provider
            await prisma.oAuthProvider.deleteMany({
                where: {
                    userId,
                    provider
                }
            })

            dbTimer.end();
            trackAuthMetrics('provider_unlinked', provider);
            logger.info(`Unlinked provider ${provider} from user ${userId}`)
        } catch (error) {
            logger.error('Error unlinking provider:', error)
            throw error
        }
    }
}
