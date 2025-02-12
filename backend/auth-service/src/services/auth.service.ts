import { prisma } from '@shared/utils/prismaClient'
import { hashPassword, verifyPassword } from '@utils/password'
import { generateToken, getTokenExpiryInSeconds } from '@shared/utils/jwt'
import { tokenBlacklist } from '@shared/config/redis'
import logger from '@shared/utils/logger'
import { RegisterInput, LoginResponse, AuthUser, UserWithRoles } from '@/types/auth.types'
import { 
    trackDbOperation, 
    trackAuthMetrics, 
    trackError,
    updateActiveTokens,
    trackRedisOperation 
} from '@middlewares/metrics.middleware'

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
                trackError('auth', 'user_exists', 'register');
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
                trackError('auth', 'invalid_credentials', 'login');
                throw new Error('Invalid credentials')
            }

            // Verify password
            const isValid = await verifyPassword(input.password, user.password)
            if (!isValid) {
                // Update login attempts
                await prisma.user.update({
                    where: { id: user.id },
                    data: {
                        loginAttempts: {
                            increment: 1
                        },
                        // Lock account after 5 failed attempts for 30 minutes
                        lockedUntil: user.loginAttempts >= 4 ? 
                            new Date(Date.now() + 30 * 60 * 1000) : null
                    }
                });
                
                dbTimer.end();
                trackError('auth', 'invalid_password', 'login');
                throw new Error('Invalid credentials')
            }

            // Reset login tracking on successful login
            await prisma.user.update({
                where: { id: user.id },
                data: {
                    lastLoginAt: new Date(),
                    loginAttempts: 0,
                    lockedUntil: null
                }
            });

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
            trackError('auth', 'user_not_found', 'token_generation');
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

    async findOrCreateOAuthUser(profile: any): Promise<UserWithRoles> {
        const dbTimer = trackDbOperation('select', 'oauth_users');
        try {
            // Check if user exists by OAuth provider ID
            let user = await prisma.user.findFirst({
                where: {
                    oAuthProviders: {
                        some: {
                            provider: profile.provider,
                            providerId: profile.id
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
            });

            if (!user) {
                // Create new user if not exists
                const emailUsername = profile.email ? profile.email.split('@')[0] : undefined;
                const username = profile.profile.name ?? 
                               emailUsername ?? 
                               `user_${profile.id}`;
                
                // Check if email is available
                if (!profile.email) {
                    throw new Error('Email is required for authentication');
                }

                user = await prisma.user.create({
                    data: {
                        email: profile.email,
                        username,
                        roles: {
                            create: {
                                role: {
                                    connectOrCreate: {
                                        where: { name: 'user' },
                                        create: {
                                            name: 'user',
                                            description: 'Default user role',
                                            slug: 'user'
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
                });
            }

            dbTimer.end();
            return {
                ...user,
                roles: user.roles.map(ur => ur.role)
            };
        } catch (error) {
            dbTimer.end();
            logger.error('OAuth user creation error:', error);
            throw error;
        }
    }

    async handleOAuthCallback(profile: any, tokens: any, userId: string): Promise<void> {
        const dbTimer = trackDbOperation('upsert', 'oauth_provider');
        try {
            const oauthData = {
                provider: profile.provider,
                providerId: profile.id,
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                expiresAt: tokens.expiresAt ? new Date(tokens.expiresAt) : null,
                tokenType: tokens.tokenType,
                scope: tokens.scope,
                idToken: tokens.idToken,
                profileData: profile,
                userId: userId
            };

            // Store in OAuthProvider model
            await prisma.oAuthProvider.upsert({
                where: {
                    provider_providerId: {
                        provider: profile.provider,
                        providerId: profile.id
                    }
                },
                update: oauthData,
                create: oauthData
            });

            // Update user's last login
            await prisma.user.update({
                where: { id: userId },
                data: {
                    lastLoginAt: new Date(),
                    loginAttempts: 0,
                    lockedUntil: null
                }
            });

            dbTimer.end();
            trackAuthMetrics('oauth_success', profile.provider);
        } catch (error) {
            dbTimer.end();
            logger.error('OAuth callback error:', error);
            trackError('oauth', 'callback_failed', profile.provider);
            throw error;
        }
    }

    async generateRefreshToken(userId: string): Promise<string> {
        const dbTimer = trackDbOperation('select', 'user');
        const user = await prisma.user.findUnique({
            where: { id: userId }
        })

        dbTimer.end();
        if (!user) {
            trackError('auth', 'user_not_found', 'refresh_token_generation');
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
                trackError('auth', 'user_not_found', 'add_role');
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

    async refreshToken(refreshToken: string): Promise<LoginResponse> {
        const dbTimer = trackDbOperation('select', 'user');
        try {
            // Verify refresh token
            const decoded = await import('@shared/utils/jwt').then(jwt => jwt.verifyToken(refreshToken));
            if (!decoded || decoded.type !== 'refresh') {
                dbTimer.end();
                trackError('auth', 'invalid_refresh_token', 'refresh');
                throw new Error('Invalid refresh token');
            }

            // Get user with roles
            const user = await prisma.user.findUnique({
                where: { id: decoded.userId },
                include: {
                    roles: {
                        include: {
                            role: true
                        }
                    }
                }
            });

            if (!user) {
                dbTimer.end();
                trackError('auth', 'user_not_found', 'refresh');
                throw new Error('User not found');
            }

            const userRoles = user.roles.map(ur => ur.role.name);

            // Generate new tokens
            const token = await this.generateToken(user.id);
            const newRefreshToken = await this.generateRefreshToken(user.id);
            updateActiveTokens(2); // One for access token, one for refresh token

            trackAuthMetrics('token_refresh_success', 'local');

            const authUser: AuthUser = {
                id: user.id,
                username: user.username,
                email: user.email,
                roles: userRoles
            };

            dbTimer.end();

            return {
                user: authUser,
                token,
                refreshToken: newRefreshToken
            };
        } catch (error) {
            dbTimer.end();
            logger.error('Refresh token error:', error);
            throw error;
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
                trackError('auth', 'user_not_found', 'unlink_provider');
                throw new Error('User not found')
            }

            // If this is the only login method and user has no password, prevent unlinking
            if (!user.password && user.oAuthProviders.length <= 1) {
                dbTimer.end();
                trackError('auth', 'last_auth_method', 'unlink_provider');
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
