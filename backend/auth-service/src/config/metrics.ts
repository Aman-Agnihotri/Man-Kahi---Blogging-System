import { Registry, Counter, Gauge, Histogram, collectDefaultMetrics } from 'prom-client';
import { Request, Response } from 'express';
import logger from '@shared/utils/logger';

// Create a new registry
export const register = new Registry();

// Add default metrics (e.g., CPU, memory usage)
collectDefaultMetrics({ register });

// Custom metrics
export const authMetrics = {
  // Authentication metrics
  loginAttempts: new Counter({
    name: 'auth_login_attempts_total',
    help: 'Total number of login attempts',
    labelNames: ['status', 'provider'] as const,
    registers: [register]
  }),
  
  registrationAttempts: new Counter({
    name: 'auth_registration_attempts_total',
    help: 'Total number of registration attempts',
    labelNames: ['status', 'provider'] as const,
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

  // Database operation metrics
  dbOperations: new Histogram({
    name: 'auth_db_operation_duration_seconds',
    help: 'Duration of database operations',
    labelNames: ['operation', 'table'] as const,
    buckets: [0.01, 0.05, 0.1, 0.5, 1],
    registers: [register]
  }),

  // Redis operation metrics
  redisOperations: new Histogram({
    name: 'auth_redis_operation_duration_seconds',
    help: 'Duration of Redis operations',
    labelNames: ['operation'] as const,
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1],
    registers: [register]
  }),

  // Performance metrics
  authLatency: new Histogram({
    name: 'auth_operation_duration_seconds',
    help: 'Duration of authentication operations',
    labelNames: ['operation'] as const,
    buckets: [0.1, 0.5, 1, 2, 5],
    registers: [register]
  }),

  // Error metrics
  errors: new Counter({
    name: 'auth_errors_total',
    help: 'Total number of authentication errors',
    labelNames: ['type', 'operation'] as const,
    registers: [register]
  }),

  // Rate limiting metrics
  rateLimitHits: new Counter({
    name: 'auth_rate_limit_hits_total',
    help: 'Number of rate limit hits',
    labelNames: ['endpoint'] as const,
    registers: [register]
  }),

  // Resource metrics
  resourceUsage: new Gauge({
    name: 'auth_resource_usage',
    help: 'Resource usage metrics',
    labelNames: ['resource', 'type'] as const,
    registers: [register]
  })
};

// Metrics endpoint handler
export const metricsHandler = async (_req: Request, res: Response) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    logger.error('Error collecting metrics:', error);
    res.status(500).send('Error collecting metrics');
  }
};
