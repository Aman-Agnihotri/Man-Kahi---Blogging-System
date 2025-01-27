import logger from '@shared/utils/logger'

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
    throw new Error(`${envVar} is not set`)
  }
  return clientId
}

export function getClientSecret(provider: OAuthProvider): string {
  const envVar = `${provider.toUpperCase()}_CLIENT_SECRET`
  const clientSecret = process.env[envVar]
  if (!clientSecret) {
    logger.error(`${envVar} is not set`)
    throw new Error(`${envVar} is not set`)
  }
  return clientSecret
}

export function getAuthCallbackURL(provider: OAuthProvider): string {
  const baseURL = process.env.AUTH_SERVICE_URL ?? 'http://localhost:3000'
  return `${baseURL}/auth/${provider}/callback`
}
