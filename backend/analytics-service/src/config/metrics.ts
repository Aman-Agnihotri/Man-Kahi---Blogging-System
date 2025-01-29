import { Registry, Counter, Gauge, Histogram, collectDefaultMetrics } from 'prom-client';
import { Request, Response } from 'express';
import logger from '@shared/utils/logger';

// Create a new registry
export const register = new Registry();

// Add default metrics
collectDefaultMetrics({ register });

// Custom metrics
export const analyticsMetrics = {
  // Event tracking
  eventProcessed: new Counter({
    name: 'analytics_events_processed_total',
    help: 'Number of analytics events processed',
    labelNames: ['event_type', 'status'] as const,
    registers: [register]
  }),

  // Real-time metrics
  activeUsers: new Gauge({
    name: 'analytics_active_users',
    help: 'Number of active users in last 5 minutes',
    registers: [register]
  }),

  // Event processing performance
  eventProcessingTime: new Histogram({
    name: 'analytics_event_processing_duration_seconds',
    help: 'Time taken to process analytics events',
    labelNames: ['event_type'] as const,
    buckets: [0.01, 0.05, 0.1, 0.5, 1],
    registers: [register]
  }),

  // Data aggregation metrics
  aggregationOperations: new Counter({
    name: 'analytics_aggregation_operations_total',
    help: 'Number of data aggregation operations',
    labelNames: ['operation_type', 'status'] as const,
    registers: [register]
  }),

  aggregationDuration: new Histogram({
    name: 'analytics_aggregation_duration_seconds',
    help: 'Time taken for data aggregation operations',
    labelNames: ['operation_type'] as const,
    buckets: [0.1, 0.5, 1, 5, 10],
    registers: [register]
  }),

  // Storage metrics
  dataStorageOperations: new Counter({
    name: 'analytics_storage_operations_total',
    help: 'Number of data storage operations',
    labelNames: ['operation', 'status'] as const,
    registers: [register]
  }),

  // Error tracking
  errorCount: new Counter({
    name: 'analytics_errors_total',
    help: 'Number of errors in analytics processing',
    labelNames: ['error_type'] as const,
    registers: [register]
  }),

  // Queue metrics
  queueSize: new Gauge({
    name: 'analytics_queue_size',
    help: 'Current size of analytics processing queue',
    labelNames: ['queue_type'] as const,
    registers: [register]
  }),

  queueLatency: new Histogram({
    name: 'analytics_queue_latency_seconds',
    help: 'Time events spend in processing queue',
    labelNames: ['queue_type'] as const,
    buckets: [0.1, 0.5, 1, 5, 10],
    registers: [register]
  }),

  // Resource usage metrics
  resourceUsage: new Gauge({
    name: 'analytics_resource_usage',
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
