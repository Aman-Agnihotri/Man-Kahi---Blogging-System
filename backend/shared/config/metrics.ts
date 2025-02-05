import { Request, Response, NextFunction } from 'express';
import client from 'prom-client';

// Create a Registry
const register = new client.Registry();

// Types
type MetricConfig = {
  prefix: string;
  defaultLabels: Record<string, string>;
  collectInterval: number;
};

type CoreMetrics = {
  // Enhanced HTTP metrics
  httpRequestDuration: client.Histogram<string>;
  httpRequestSize: client.Histogram<string>;
  httpResponseSize: client.Histogram<string>;
  httpConcurrentRequests: client.Gauge<string>;
  httpRequestRate: client.Counter<string>;

  // Resource monitoring
  resourceUsage: client.Gauge<string>;
  resourceSaturation: client.Gauge<string>;

  // Error tracking with correlation
  errorCount: client.Counter<string>;
  warningCount: client.Counter<string>;

  // Database monitoring
  databaseOperations: client.Histogram<string>;
  databaseConnections: client.Gauge<string>;
  databasePoolMetrics: client.Gauge<string>;

  // Cache performance
  cacheOperations: client.Histogram<string>;
  cacheHitRate: client.Gauge<string>;

  // External service health
  externalCallDuration: client.Histogram<string>;
  externalCallAvailability: client.Gauge<string>;

  // Queue metrics (general purpose)
  queueSize: client.Gauge<string>;
  queueLatency: client.Histogram<string>;
  queueThroughput: client.Counter<string>;

  // Common security metrics
  securityEvents: client.Counter<string>;
  rateLimitHits: client.Counter<string>;
};

// Define core metrics with enhanced functionality
const createCoreMetrics = (config: MetricConfig): CoreMetrics => ({
  // HTTP metrics
  httpRequestDuration: new client.Histogram({
    name: `${config.prefix}http_request_duration_seconds`,
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code', 'service'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  }),

  httpRequestSize: new client.Histogram({
    name: `${config.prefix}http_request_size_bytes`,
    help: 'Size of HTTP requests in bytes',
    labelNames: ['method', 'route'],
    buckets: [100, 1000, 10000, 100000, 1000000],
  }),

  httpResponseSize: new client.Histogram({
    name: `${config.prefix}http_response_size_bytes`,
    help: 'Size of HTTP responses in bytes',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [100, 1000, 10000, 100000, 1000000],
  }),

  httpConcurrentRequests: new client.Gauge({
    name: `${config.prefix}http_concurrent_requests`,
    help: 'Number of concurrent HTTP requests',
    labelNames: ['method', 'route'],
  }),

  httpRequestRate: new client.Counter({
    name: `${config.prefix}http_requests_total`,
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
  }),

  // Resource metrics
  resourceUsage: new client.Gauge({
    name: `${config.prefix}resource_usage`,
    help: 'Resource usage metrics',
    labelNames: ['resource', 'type', 'unit'],
  }),

  resourceSaturation: new client.Gauge({
    name: `${config.prefix}resource_saturation`,
    help: 'Resource saturation levels',
    labelNames: ['resource', 'type'],
  }),

  // Error tracking
  errorCount: new client.Counter({
    name: `${config.prefix}errors_total`,
    help: 'Count of errors by type',
    labelNames: ['error_type', 'error_code', 'correlation_id', 'component'],
  }),

  warningCount: new client.Counter({
    name: `${config.prefix}warnings_total`,
    help: 'Count of warnings by type',
    labelNames: ['warning_type', 'component'],
  }),

  // Database metrics
  databaseOperations: new client.Histogram({
    name: `${config.prefix}database_operation_seconds`,
    help: 'Duration of database operations',
    labelNames: ['operation', 'table', 'status'],
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  }),

  databaseConnections: new client.Gauge({
    name: `${config.prefix}database_connections`,
    help: 'Number of active database connections',
    labelNames: ['pool', 'state'],
  }),

  databasePoolMetrics: new client.Gauge({
    name: `${config.prefix}database_pool_metrics`,
    help: 'Database connection pool metrics',
    labelNames: ['pool', 'metric'],
  }),

  // Cache metrics
  cacheOperations: new client.Histogram({
    name: `${config.prefix}cache_operation_seconds`,
    help: 'Duration of cache operations',
    labelNames: ['operation', 'cache_type'],
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1],
  }),

  cacheHitRate: new client.Gauge({
    name: `${config.prefix}cache_hit_rate`,
    help: 'Cache hit rate percentage',
    labelNames: ['cache_type'],
  }),

  // External service metrics
  externalCallDuration: new client.Histogram({
    name: `${config.prefix}external_call_seconds`,
    help: 'Duration of external service calls',
    labelNames: ['service', 'operation', 'status'],
    buckets: [0.1, 0.5, 1, 2, 5],
  }),

  externalCallAvailability: new client.Gauge({
    name: `${config.prefix}external_service_availability`,
    help: 'Availability status of external services',
    labelNames: ['service'],
  }),

  // Queue metrics
  queueSize: new client.Gauge({
    name: `${config.prefix}queue_size`,
    help: 'Current size of queues',
    labelNames: ['queue_name', 'priority'],
  }),

  queueLatency: new client.Histogram({
    name: `${config.prefix}queue_latency_seconds`,
    help: 'Processing latency for queued items',
    labelNames: ['queue_name', 'priority'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
  }),

  queueThroughput: new client.Counter({
    name: `${config.prefix}queue_throughput_total`,
    help: 'Number of items processed through queues',
    labelNames: ['queue_name', 'status'],
  }),

  // Security metrics
  securityEvents: new client.Counter({
    name: `${config.prefix}security_events_total`,
    help: 'Count of security-related events',
    labelNames: ['event_type', 'severity'],
  }),

  rateLimitHits: new client.Counter({
    name: `${config.prefix}rate_limit_hits_total`,
    help: 'Number of rate limit hits',
    labelNames: ['endpoint', 'limit_type'],
  }),
});

// Factory function to create service metrics
const createServiceMetrics = (serviceName: string) => {
  const config: MetricConfig = {
    prefix: `${serviceName}_`,
    defaultLabels: { service: serviceName },
    collectInterval: parseInt(process.env['METRICS_COLLECTION_INTERVAL'] ?? '5000', 10),
  };

  // Add default metrics
  client.collectDefaultMetrics({
    register,
    prefix: config.prefix,
    labels: config.defaultLabels,
  });

  // Create and register core metrics
  const coreMetrics = createCoreMetrics(config);
  Object.values(coreMetrics).forEach(metric => register.registerMetric(metric));

  // Return unified metrics interface
  return {
    // HTTP tracking
    trackHttpRequest: (method: string, route: string, size: number) => {
      const timer = coreMetrics.httpRequestDuration.startTimer();
      coreMetrics.httpRequestSize.observe({ method, route }, size);
      coreMetrics.httpConcurrentRequests.inc({ method, route });
      
      return {
        end: (statusCode: number, responseSize: number) => {
          timer({ method, route, status_code: statusCode });
          coreMetrics.httpResponseSize.observe({ method, route, status_code: statusCode }, responseSize);
          coreMetrics.httpRequestRate.inc({ method, route, status_code: statusCode });
          coreMetrics.httpConcurrentRequests.dec({ method, route });
        }
      };
    },

    // Resource tracking
    trackResource: (resource: string, type: string) => ({
      setUsage: (value: number, unit: string) => 
        coreMetrics.resourceUsage.set({ resource, type, unit }, value),
      setSaturation: (value: number) => 
        coreMetrics.resourceSaturation.set({ resource, type }, value),
    }),

    // Error tracking
    trackError: (errorType: string, errorCode: string, component: string, correlationId: string = 'unknown') => {
      coreMetrics.errorCount.inc({ 
        error_type: errorType, 
        error_code: errorCode, 
        correlation_id: correlationId,
        component 
      });
    },

    trackWarning: (warningType: string, component: string) => {
      coreMetrics.warningCount.inc({ warning_type: warningType, component });
    },

    // Database tracking
    trackDatabaseOperation: (operation: string, table: string) => {
      const timer = coreMetrics.databaseOperations.startTimer();
      return {
        end: (status: string = 'success') => timer({ operation, table, status }),
      };
    },

    trackDatabasePool: (pool: string) => ({
      setConnections: (state: string, count: number) => 
        coreMetrics.databaseConnections.set({ pool, state }, count),
      setMetric: (metric: string, value: number) => 
        coreMetrics.databasePoolMetrics.set({ pool, metric }, value),
    }),

    // Cache tracking
    trackCacheOperation: (operation: string, cacheType: string) => {
      const timer = coreMetrics.cacheOperations.startTimer();
      return {
        end: () => timer({ operation, cache_type: cacheType }),
      };
    },

    setCacheHitRate: (cacheType: string, rate: number) => {
      coreMetrics.cacheHitRate.set({ cache_type: cacheType }, rate);
    },

    // External service tracking
    trackExternalCall: (service: string, operation: string) => {
      const timer = coreMetrics.externalCallDuration.startTimer();
      return {
        end: (status: string = 'success') => timer({ service, operation, status }),
      };
    },

    setExternalServiceAvailability: (service: string, isAvailable: boolean) => {
      coreMetrics.externalCallAvailability.set({ service }, isAvailable ? 1 : 0);
    },

    // Queue tracking
    trackQueue: (queueName: string) => ({
      setSize: (size: number, priority: string = 'default') => 
        coreMetrics.queueSize.set({ queue_name: queueName, priority }, size),
      trackLatency: (priority: string = 'default') => {
        const timer = coreMetrics.queueLatency.startTimer();
        return {
          end: () => timer({ queue_name: queueName, priority }),
        };
      },
      incrementThroughput: (status: string = 'success') => 
        coreMetrics.queueThroughput.inc({ queue_name: queueName, status }),
    }),

    // Security tracking
    trackSecurityEvent: (eventType: string, severity: string) => {
      coreMetrics.securityEvents.inc({ event_type: eventType, severity });
    },

    trackRateLimit: (endpoint: string, limitType: string) => {
      coreMetrics.rateLimitHits.inc({ endpoint, limit_type: limitType });
    },
  };
};

// Middleware to enable/disable metrics endpoint
const metricsEnabled = (req: Request, res: Response, next: NextFunction): void => {
  if (process.env['ENABLE_METRICS'] !== 'true') {
    res.status(404).send('Not found');
    return;
  }
  next();
};

// Handler for metrics endpoint
const metricsHandler = async (_req: Request, res: Response) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).send(err);
  }
};

export {
  register,
  createServiceMetrics,
  metricsEnabled,
  metricsHandler,
};
