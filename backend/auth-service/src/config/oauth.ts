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
  const baseURL = process.env['AUTH_SERVICE_URL'] ?? 'http://localhost:3000'
  if (!process.env['AUTH_SERVICE_URL']) {
    trackError('missing_config', 'oauth_callback_url', 'oauth')
    logger.warn('AUTH_SERVICE_URL not set, using default: http://localhost:3000')
  }
  return `${baseURL}/auth/${provider}/callback`
}
