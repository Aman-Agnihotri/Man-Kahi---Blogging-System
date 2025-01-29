import { Registry, Counter, Gauge, Histogram, collectDefaultMetrics } from 'prom-client';
import { Request, Response } from 'express';
import logger from '@shared/utils/logger';

// Create a new registry
export const register = new Registry();

// Add default metrics
collectDefaultMetrics({ register });

// Custom metrics
export const blogMetrics = {
  // Content operations
  blogOperations: new Counter({
    name: 'blog_operations_total',
    help: 'Count of blog operations',
    labelNames: ['service', 'operation', 'status'] as const,
    registers: [register]
  }),

  // View tracking
  blogViews: new Counter({
    name: 'blog_views_total',
    help: 'Total number of blog views',
    labelNames: ['blog_id'] as const,
    registers: [register]
  }),

  // Content stats
  activeBlogCount: new Gauge({
    name: 'blog_active_total',
    help: 'Number of active blog posts',
    registers: [register]
  }),

  // Search operations
  searchOperations: new Counter({
    name: 'blog_search_operations_total',
    help: 'Count of search operations',
    labelNames: ['service', 'operation', 'status'] as const,
    registers: [register]
  }),

  searchDuration: new Histogram({
    name: 'blog_search_duration_seconds',
    help: 'Duration of search operations',
    labelNames: ['service', 'operation'] as const,
    buckets: [0.05, 0.1, 0.5, 1, 2],
    registers: [register]
  }),

  // Performance metrics
  operationDuration: new Histogram({
    name: 'blog_operation_duration_seconds',
    help: 'Duration of blog operations',
    labelNames: ['service', 'operation'] as const,
    buckets: [0.1, 0.5, 1, 2, 5],
    registers: [register]
  }),

  cacheHits: new Counter({
    name: 'blog_cache_hits_total',
    help: 'Number of cache hits',
    labelNames: ['service', 'cache_type', 'operation'] as const,
    registers: [register]
  }),

  elasticsearchLatency: new Histogram({
    name: 'blog_elasticsearch_operation_seconds',
    help: 'Duration of Elasticsearch operations',
    labelNames: ['service', 'operation'] as const,
    buckets: [0.05, 0.1, 0.5, 1, 2],
    registers: [register]
  }),

  // Storage operations
  storageOperations: new Counter({
    name: 'blog_storage_operations_total',
    help: 'Count of storage operations',
    labelNames: ['service', 'storage_type', 'operation', 'status'] as const,
    registers: [register]
  }),

  // Storage operation duration
  storageLatency: new Histogram({
    name: 'blog_storage_operation_seconds',
    help: 'Duration of storage operations',
    labelNames: ['service', 'storage_type', 'operation'] as const,
    buckets: [0.05, 0.1, 0.5, 1, 2],
    registers: [register]
  }),

  // Database operations
  databaseOperations: new Counter({
    name: 'blog_database_operations_total',
    help: 'Count of database operations',
    labelNames: ['service', 'operation', 'status'] as const,
    registers: [register]
  }),

  // Database operation duration
  databaseLatency: new Histogram({
    name: 'blog_database_operation_seconds',
    help: 'Duration of database operations',
    labelNames: ['service', 'operation'] as const,
    buckets: [0.01, 0.05, 0.1, 0.5, 1],
    registers: [register]
  }),

  // Cache metrics
  cacheOperations: new Counter({
    name: 'blog_cache_operations_total',
    help: 'Count of cache operations',
    labelNames: ['service', 'cache_type', 'operation', 'status'] as const,
    registers: [register]
  }),

  cacheLatency: new Histogram({
    name: 'blog_cache_operation_seconds',
    help: 'Duration of cache operations',
    labelNames: ['service', 'cache_type', 'operation'] as const,
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1],
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
