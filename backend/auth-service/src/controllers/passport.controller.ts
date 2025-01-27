import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import { prisma } from '@shared/utils/prismaClient'
import { verifyToken } from '@shared/utils/jwt'
import logger from '@shared/utils/logger'
import {
  OAuthProvider,
  PROVIDERS,
  getClientId,
  getClientSecret,
  getAuthCallbackURL,
  DEFAULT_ROLE,
  providerScopes,
} from '../config/oauth'
import { AuthService } from '../services/auth.service'

const authService = new AuthService()

/**
 * Links an OAuth provider to a user's account
 */
async function linkProvider(token: string, profile: any): Promise<any> {
  try {
    const decodedToken = verifyToken(token)
    const userId = typeof decodedToken === 'object' ? decodedToken.userId : null

    if (!userId) {
      throw new Error('Invalid token')
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { roles: true },
    })

    if (!user) {
      throw new Error('User not found')
    }

    // Check if provider is already linked
    const existingProvider = await prisma.oAuthProvider.findFirst({
      where: {
        userId: user.id,
        provider: profile.provider as OAuthProvider,
      },
    })

    if (existingProvider) {
      throw new Error('Provider already linked to this account')
    }

    // Verify email matches
    const profileEmail = profile.emails?.[0]?.value
    if (user.email !== profileEmail) {
      throw new Error('Email mismatch between accounts')
    }

    // Link the provider
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        oAuthProviders: {
          create: {
            provider: profile.provider as OAuthProvider,
            providerId: profile.id,
          },
        },
      },
      include: { roles: true },
    })

    // Generate new tokens
    const accessToken = await authService.generateToken(user.id)
    const refreshToken = await authService.generateRefreshToken(user.id)

    return { 
      user: updatedUser, 
      token: accessToken,
      refreshToken 
    }
  } catch (error) {
    logger.error('Error linking provider:', error)
    throw error
  }
}

/**
 * Handles OAuth authentication
 */
async function handleOAuthAuthentication(profile: any) {
  try {
    const email = profile.emails?.[0]?.value
    if (!email) {
      throw new Error('Email not provided by OAuth provider')
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
      include: {
        roles: true,
        oAuthProviders: true,
      },
    })

    if (existingUser) {
      // Check if this provider is already linked
      const hasProvider = existingUser.oAuthProviders.some(
        (p) => p.provider === profile.provider
      )
      if (!hasProvider) {
        throw new Error('Account exists with different credentials')
      }
      return existingUser
    }

    // Get default role
    const defaultRole = await prisma.role.findUnique({
      where: { name: DEFAULT_ROLE },
    })
    if (!defaultRole) {
      throw new Error('Default role not found')
    }

    // Create new user
    const newUser = await prisma.user.create({
      data: {
        email,
        username: profile.displayName || email.split('@')[0],
        roles: {
          connect: { id: defaultRole.id },
        },
        oAuthProviders: {
          create: {
            provider: profile.provider as OAuthProvider,
            providerId: profile.id,
          },
        },
      },
      include: { roles: true },
    })

    return newUser
  } catch (error) {
    logger.error('Error in OAuth authentication:', error)
    throw error
  }
}

// Set up Google OAuth strategy
function setupGoogleStrategy() {
  passport.use(
    new GoogleStrategy(
      {
        clientID: getClientId('google'),
        clientSecret: getClientSecret('google'),
        callbackURL: getAuthCallbackURL('google'),
        passReqToCallback: true,
        scope: providerScopes.google
      },
      async (req: any, accessToken: string, refreshToken: string, profile: any, done: Function) => {
        try {
          // Check if we're linking to existing account
          const stateToken = req.query.state
          if (stateToken) {
            const result = await linkProvider(stateToken, profile)
            return done(null, result.user, { 
              token: result.token,
              refreshToken: result.refreshToken 
            })
          }

          // Handle normal OAuth login/registration
          const user = await handleOAuthAuthentication(profile)
          const authToken = await authService.generateToken(user.id)
          const newRefreshToken = await authService.generateRefreshToken(user.id)
          return done(null, user, { 
            token: authToken,
            refreshToken: newRefreshToken 
          })
        } catch (error) {
          return done(error)
        }
      }
    )
  )
}

// Initialize strategies
PROVIDERS.forEach((provider) => {
  if (provider === 'google') {
    setupGoogleStrategy()
  }
})

// Serialize user for session
passport.serializeUser((user: any, done) => {
  done(null, user.id)
})

// Deserialize user from session
passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id },
      include: { roles: true },
    })
    done(null, user)
  } catch (error) {
    done(error)
  }
})

export { passport }
