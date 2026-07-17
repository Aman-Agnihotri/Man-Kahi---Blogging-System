import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import { prisma } from '@shared/utils/prismaClient'
import { verifyLinkToken } from '@shared/utils/jwt'
import logger from '@shared/utils/logger'
import {
  OAuthProvider,
  PROVIDERS,
  getClientId,
  getClientSecret,
  getAuthCallbackURL,
  DEFAULT_ROLE,
  providerScopes,
} from '@config/oauth'
import { AuthService } from '@services/auth.service'
import { 
  trackDbOperation, 
  trackAuthMetrics, 
  trackError,
  updateActiveTokens 
} from '@middlewares/metrics.middleware'

const authService = new AuthService()

/**
 * Links an OAuth provider to a user's account
 */
async function linkProvider(token: string, profile: any): Promise<any> {
  const dbTimer = trackDbOperation('link', 'oauth_provider');
  try {
    let userId: string
    try {
      userId = verifyLinkToken(token)
    } catch (err) {
      trackError('oauth', 'invalid_token', 'link_provider')
      throw err
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { roles: true },
    })

    if (!user) {
      trackError('oauth', 'user_not_found', 'link_provider');
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
      trackError('oauth', 'provider_already_linked', 'link_provider');
      throw new Error('Provider already linked to this account')
    }

    // Verify email matches
    const profileEmail = profile.emails?.[0]?.value
    if (user.email !== profileEmail) {
      trackError('oauth', 'email_mismatch', 'link_provider');
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
    dbTimer.end();

    // Generate new tokens
    const accessToken = await authService.generateToken(user.id)
    const refreshToken = await authService.generateRefreshToken(user.id)
    updateActiveTokens(1);

    trackAuthMetrics('link_success', profile.provider);
    return { 
      user: updatedUser, 
      token: accessToken,
      refreshToken 
    }
  } catch (error) {
    dbTimer.end();
    logger.error({ err: error }, 'Error linking provider')
    throw error
  }
}

/**
 * Handles OAuth authentication
 */
async function handleOAuthAuthentication(profile: any) {
  const dbTimer = trackDbOperation('auth', 'user');
  try {
    const email = profile.emails?.[0]?.value
    if (!email) {
      trackError('oauth', 'missing_email', profile.provider);
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
        trackError('oauth', 'account_exists', profile.provider);
        throw new Error('Account exists with different credentials')
      }
      dbTimer.end();
      trackAuthMetrics('login_success', profile.provider);
      return existingUser
    }

    // Get default role
    const defaultRole = await prisma.role.findUnique({
      where: { name: DEFAULT_ROLE },
    })
    if (!defaultRole) {
      trackError('oauth', 'default_role_missing', profile.provider);
      throw new Error('Default role not found')
    }

    // Create new user
    const newUser = await prisma.user.create({
      data: {
        email,
        username: profile.displayName || email.split('@')[0],
        roles: {
          create: {
            role: {
              connect: { id: defaultRole.id },
            },
          },
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
    dbTimer.end();

    trackAuthMetrics('registration_success', profile.provider);
    return newUser
  } catch (error) {
    dbTimer.end();
    logger.error({ err: error }, 'Error in OAuth authentication')
    throw error
  }
}

// Set up Google OAuth strategy
function setupGoogleStrategy() {
  if (!process.env['GOOGLE_CLIENT_ID'] || !process.env['GOOGLE_CLIENT_SECRET']) {
    logger.warn('Google OAuth credentials are not set; Google login is disabled')
    return
  }

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
          // Shape the raw passport profile into the OAuthUser form the
          // callback route's service calls (findOrCreateOAuthUser /
          // handleOAuthCallback) read via req.authInfo.oauthProfile.
          const oauthProfile = {
            id: profile.id,
            email: profile.emails?.[0]?.value,
            profile: {
              name: profile.displayName,
              picture: profile.photos?.[0]?.value,
            },
            provider: profile.provider,
          }

          // Check if we're linking to existing account
          const stateToken = req.query.state
          if (stateToken) {
            const result = await linkProvider(stateToken, profile)
            return done(null, result.user, {
              token: result.token,
              refreshToken: result.refreshToken,
              oauthProfile,
            })
          }

          // Handle normal OAuth login/registration
          const user = await handleOAuthAuthentication(profile)
          const authToken = await authService.generateToken(user.id)
          const refreshToken = await authService.generateRefreshToken(user.id)
          updateActiveTokens(1);
          return done(null, user, {
            token: authToken,
            refreshToken,
            oauthProfile,
          })
        } catch (error) {
          trackError('oauth', 'oauth_strategy', 'google');
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
  const dbTimer = trackDbOperation('deserialize', 'user');
  try {
    const user = await prisma.user.findUnique({
      where: { id },
      include: { roles: true },
    })
    dbTimer.end();
    done(null, user)
  } catch (error) {
    dbTimer.end();
    trackError('oauth', 'session_deserialize', 'oauth');
    done(error)
  }
})

export { passport }
