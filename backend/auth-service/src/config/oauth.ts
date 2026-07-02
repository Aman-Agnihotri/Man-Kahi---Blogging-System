import logger from '@shared/utils/logger'
import { trackError } from '@middlewares/metrics.middleware'

export type OAuthProvider = 'google'

export const PROVIDERS = ['google'] as const

export const DEFAULT_ROLE = 'reader'

export const providerScopes: Record<OAuthProvider, string[]> = {
  google: ['profile', 'email'],
}

export function getClientId(provider: OAuthProvider): string {
  const envVar = `${provider.toUpperCase()}_CLIENT_ID`
  const clientId = process.env[envVar]
  if (!clientId) {
    logger.error(`${envVar} is not set`)
    trackError('missing_config', `oauth_${provider}_client_id`, 'oauth')
    throw new Error(`${envVar} is not set`)
  }
  return clientId
}

export function getClientSecret(provider: OAuthProvider): string {
  const envVar = `${provider.toUpperCase()}_CLIENT_SECRET`
  const clientSecret = process.env[envVar]
  if (!clientSecret) {
    logger.error(`${envVar} is not set`)
    trackError('missing_config', `oauth_${provider}_client_secret`, 'oauth')
    throw new Error(`${envVar} is not set`)
  }
  return clientSecret
}

export function getAuthCallbackURL(provider: OAuthProvider): string {
  const explicitCallbackURL = process.env[`${provider.toUpperCase()}_CALLBACK_URL`]
  if (explicitCallbackURL) {
    return explicitCallbackURL
  }

  const baseURL = process.env['AUTH_SERVICE_URL'] ?? 'http://localhost:3001'
  if (!process.env['AUTH_SERVICE_URL']) {
    trackError('missing_config', 'oauth_callback_url', 'oauth')
    logger.warn('AUTH_SERVICE_URL not set, using default: http://localhost:3001')
  }
  // Must match how oauthRoutes is mounted in server.ts (/api/auth) and the
  // nginx gateway's OAuth location block.
  return `${baseURL}/api/auth/${provider}/callback`
}

/**
 * Whether a given OAuth provider has credentials configured for this environment.
 * OAuth is optional: providers without credentials are simply disabled.
 */
export function isProviderConfigured(provider: OAuthProvider): boolean {
  return Boolean(
    process.env[`${provider.toUpperCase()}_CLIENT_ID`] &&
    process.env[`${provider.toUpperCase()}_CLIENT_SECRET`]
  )
}

/**
 * Express middleware factory that returns a 503 instead of letting passport
 * throw on an unregistered strategy when a provider's OAuth credentials are
 * not configured for this environment.
 */
export function requireProviderConfigured(provider: OAuthProvider) {
  return (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction): void => {
    if (!isProviderConfigured(provider)) {
      res.status(503).json({
        message: `${provider} OAuth is not configured on this server`,
      });
      return;
    }
    next();
  };
}
