import { Registry, Counter, Gauge, Histogram, Summary, collectDefaultMetrics } from 'prom-client';
import { Request, Response, NextFunction } from 'express';
import logger from '@shared/utils/logger';

const METRICS_ENABLED = process.env.METRICS_ENABLED === 'true';
const METRICS_PREFIX = process.env.METRICS_PREFIX ?? 'admin_';
const METRICS_DEFAULT_LABELS = process.env.METRICS_DEFAULT_LABELS ? 
  JSON.parse(process.env.METRICS_DEFAULT_LABELS) : 
  { service: 'admin' };
const METRICS_COLLECTION_INTERVAL = parseInt(process.env.METRICS_COLLECTION_INTERVAL ?? '5000', 10);

// Create a new registry
export const register = new Registry();

// Add default metrics with configuration
// Configure and collect default metrics
collectDefaultMetrics({ 
  register,
  prefix: METRICS_PREFIX,
  labels: METRICS_DEFAULT_LABELS
});

// Utility function to create metric name with prefix
const metricName = (name: string) => `${METRICS_PREFIX}${name}`;

// Custom metrics
export const adminMetrics = {
  // Admin operations tracking
  adminOperations: new Counter({
    name: metricName('operations_total'),
    help: 'Count of administrative operations',
    labelNames: ['operation', 'status'] as const,
    registers: [register]
  }),

  // Active admin sessions
  activeAdminSessions: new Gauge({
    name: metricName('active_sessions'),
    help: 'Number of active admin sessions',
    registers: [register]
  }),

  // Operation performance
  operationDuration: new Histogram({
    name: metricName('operation_duration_seconds'),
    help: 'Duration of administrative operations',
    labelNames: ['operation'] as const,
    buckets: [0.1, 0.5, 1, 2, 5],
    registers: [register]
  }),

  // Content moderation metrics
  moderationActions: new Counter({
    name: metricName('moderation_actions_total'),
    help: 'Count of content moderation actions',
    labelNames: ['action_type', 'status'] as const,
    registers: [register]
  }),

  // User management metrics
  userManagementActions: new Counter({
    name: metricName('user_management_actions_total'),
    help: 'Count of user management actions',
    labelNames: ['action_type', 'status'] as const,
    registers: [register]
  }),

  // System configuration changes
  configChanges: new Counter({
    name: metricName('config_changes_total'),
    help: 'Count of system configuration changes',
    labelNames: ['component', 'status'] as const,
    registers: [register]
  }),

  // Error tracking
  adminErrors: new Counter({
    name: metricName('errors_total'),
    help: 'Count of administrative errors',
    labelNames: ['error_type'] as const,
    registers: [register]
  }),

  // Role management metrics
  roleOperations: new Counter({
    name: metricName('role_operations_total'),
    help: 'Count of role management operations',
    labelNames: ['operation', 'status'] as const,
    registers: [register]
  }),

  // Dashboard access tracking
  dashboardAccess: new Counter({
    name: metricName('dashboard_access_total'),
    help: 'Count of admin dashboard access',
    labelNames: ['dashboard', 'status'] as const,
    registers: [register]
  }),

  // Request rate tracking
  requestRate: new Counter({
    name: metricName('requests_total'),
    help: 'Count of total admin service requests',
    labelNames: ['method', 'path', 'status'] as const,
    registers: [register]
  }),

  // Response time tracking with percentiles
  responseTime: new Summary({
    name: metricName('response_time_seconds'),
    help: 'Response time in seconds',
    labelNames: ['method', 'path'] as const,
    percentiles: [0.5, 0.9, 0.95, 0.99],
    registers: [register]
  }),

  // Database operation metrics
  dbOperations: new Histogram({
    name: metricName('db_operation_duration_seconds'),
    help: 'Duration of database operations',
    labelNames: ['operation', 'table'] as const,
    buckets: [0.01, 0.05, 0.1, 0.5, 1],
    registers: [register]
  }),

  // External service call latency
  externalCalls: new Histogram({
    name: metricName('external_call_duration_seconds'),
    help: 'Duration of external service calls',
    labelNames: ['service', 'endpoint'] as const,
    buckets: [0.1, 0.5, 1, 2, 5],
    registers: [register]
  }),

  // Resource metrics
  resourceUsage: new Gauge({
    name: metricName('resource_usage'),
    help: 'Resource usage metrics',
    labelNames: ['resource', 'type'] as const,
    registers: [register]
  }),

  // Concurrent operations
  concurrentOperations: new Gauge({
    name: metricName('concurrent_operations'),
    help: 'Number of concurrent operations',
    labelNames: ['operation_type'] as const,
    registers: [register]
  }),

  // Rate limiting metrics
  rateLimitHits: new Counter({
    name: metricName('rate_limit_hits_total'),
    help: 'Number of rate limit hits',
    labelNames: ['service'] as const,
    registers: [register]
  }),

  // Authentication metrics
  authenticationAttempts: new Counter({
    name: metricName('authentication_attempts_total'),
    help: 'Number of authentication attempts',
    labelNames: ['status'] as const,
    registers: [register]
  }),

  // Session duration
  sessionDuration: new Histogram({
    name: metricName('session_duration_seconds'),
    help: 'Duration of admin sessions',
    buckets: [60, 300, 900, 1800, 3600], // 1m, 5m, 15m, 30m, 1h
    registers: [register]
  })
};

// Middleware to check if metrics are enabled
export const metricsEnabled = (_req: Request, res: Response, next: NextFunction) => {
  if (!METRICS_ENABLED) {
    return res.status(404).send('Metrics collection is disabled');
  }
  next();
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
