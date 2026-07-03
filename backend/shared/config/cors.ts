import type { CorsOptions } from 'cors'
import logger from '../utils/logger'

// CORS_ORIGIN is a comma-separated allowlist, e.g.
// "https://mankahi.example.com,https://www.mankahi.example.com". In
// development an unset CORS_ORIGIN falls back to allowing any origin (local
// dev tools and ports vary); in any other NODE_ENV an unset CORS_ORIGIN
// fails closed (rejects all cross-origin requests) instead of the previous
// bare `cors()` default, which reflected every origin unconditionally.
export function buildCorsOptions(serviceName: string): CorsOptions {
  const raw = process.env['CORS_ORIGIN']
  const isProduction = process.env['NODE_ENV'] === 'production'

  if (!raw) {
    if (!isProduction) {
      return { origin: true, credentials: true }
    }
    logger.warn(
      `[${serviceName}] CORS_ORIGIN is not set outside development - rejecting all cross-origin requests`
    )
    return { origin: false, credentials: true }
  }

  const allowedOrigins = raw
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)

  return {
    origin(origin, callback) {
      // No Origin header means same-origin, curl, or a server-to-server
      // call - none of those are subject to CORS in the first place.
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true)
        return
      }
      callback(new Error(`Origin ${origin} is not allowed by CORS`))
    },
    credentials: true,
  }
}
