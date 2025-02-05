import { Counter, Gauge, Histogram } from 'prom-client';
import { createServiceMetrics, register } from '@shared/config/metrics';

// Initialize shared metrics with service name
export const metrics = createServiceMetrics('auth');

// Auth-specific metrics (complementing shared metrics)
export const authMetrics = {
  // Authentication metrics
  loginAttempts: new Counter({
    name: 'auth_login_attempts_total',
    help: 'Total number of login attempts',
    labelNames: ['status', 'provider'],
    registers: [register]
  }),
  
  registrationAttempts: new Counter({
    name: 'auth_registration_attempts_total',
    help: 'Total number of registration attempts',
    labelNames: ['status', 'provider'],
    registers: [register]
  }),

  activeTokens: new Gauge({
    name: 'auth_active_tokens',
    help: 'Number of active JWT tokens',
    registers: [register]
  }),

  // Session metrics
  activeSessions: new Gauge({
    name: 'auth_active_sessions',
    help: 'Number of active user sessions',
    registers: [register]
  }),

  sessionDuration: new Histogram({
    name: 'auth_session_duration_seconds',
    help: 'Duration of user sessions',
    buckets: [300, 900, 1800, 3600, 7200, 14400, 28800], // 5m, 15m, 30m, 1h, 2h, 4h, 8h
    registers: [register]
  }),

  // OAuth specific metrics
  oauthOperations: new Counter({
    name: 'auth_oauth_operations_total',
    help: 'Total number of OAuth operations',
    labelNames: ['provider', 'operation', 'status'],
    registers: [register]
  }),

  oauthLatency: new Histogram({
    name: 'auth_oauth_operation_duration_seconds',
    help: 'Duration of OAuth operations',
    labelNames: ['provider', 'operation'],
    buckets: [0.1, 0.5, 1, 2, 5],
    registers: [register]
  })
};

// Re-export metrics endpoint handlers from shared config
export { register, metricsHandler, metricsEnabled } from '@shared/config/metrics';
