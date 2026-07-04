// Deep-clones an object, replacing the value of any key whose name matches
// a known-sensitive field (case-insensitive) with '[REDACTED]'. Used before
// logging request bodies/headers - without this, every service's
// request-logging middleware was writing plaintext passwords and tokens
// (login, register, password reset, refresh, etc.) straight into log files
// that persist for 14 days and are also captured by `docker compose logs`.
const SENSITIVE_KEYS = new Set([
  'password',
  'newpassword',
  'currentpassword',
  'confirmpassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'resettoken',
  'idtoken',
  'secret',
  'clientsecret',
  'authorization',
  'cookie',
  'apikey',
])

export function redactSensitiveFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(redactSensitiveFields) as unknown as T
  }

  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = SENSITIVE_KEYS.has(key.toLowerCase())
        ? '[REDACTED]'
        : redactSensitiveFields(val)
    }
    return result as T
  }

  return value
}
