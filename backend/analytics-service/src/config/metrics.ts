import { Counter, Gauge, Histogram } from 'prom-client';
import { createServiceMetrics, register } from '@shared/config/metrics';

// Initialize shared metrics with service name
export const metrics = createServiceMetrics('analytics');

// Analytics-specific metrics (complementing shared metrics)
export const analyticsMetrics = {
  // Event tracking
  eventProcessed: new Counter({
    name: 'analytics_events_processed_total',
    help: 'Number of analytics events processed',
    labelNames: ['event_type', 'status'],
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
    labelNames: ['event_type'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1],
    registers: [register]
  }),

  // Data aggregation metrics
  aggregationOperations: new Counter({
    name: 'analytics_aggregation_operations_total',
    help: 'Number of data aggregation operations',
    labelNames: ['operation_type', 'status'],
    registers: [register]
  }),

  aggregationDuration: new Histogram({
    name: 'analytics_aggregation_duration_seconds',
    help: 'Time taken for data aggregation operations',
    labelNames: ['operation_type'],
    buckets: [0.1, 0.5, 1, 5, 10],
    registers: [register]
  }),

  // Storage metrics
  dataStorageOperations: new Counter({
    name: 'analytics_storage_operations_total',
    help: 'Number of data storage operations',
    labelNames: ['operation', 'status'],
    registers: [register]
  }),

  // Error recovery metrics - keeping only recovery tracking as it's specific to analytics
  recoveryAttempts: new Counter({
    name: 'analytics_recovery_attempts_total',
    help: 'Number of attempted error recoveries',
    labelNames: ['error_type', 'status'],
    registers: [register]
  })
};

// Re-export metrics endpoint handlers from shared config
export { register, metricsHandler, metricsEnabled } from '@shared/config/metrics';
