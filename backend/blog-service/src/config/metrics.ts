import { Counter, Gauge, Histogram } from 'prom-client';
import { createServiceMetrics, register } from '@shared/config/metrics';

// Initialize shared metrics with service name
export const metrics = createServiceMetrics('blog');

// Blog-specific metrics (complementing shared metrics)
export const blogMetrics = {
  // Blog content operations
  blogOperations: new Counter({
    name: 'blog_operations_total',
    help: 'Count of blog operations',
    labelNames: ['operation', 'status'],
    registers: [register]
  }),

  // View tracking
  blogViews: new Counter({
    name: 'blog_views_total',
    help: 'Total number of blog views',
    labelNames: ['blog_id'],
    registers: [register]
  }),

  // Content stats
  activeBlogCount: new Gauge({
    name: 'blog_active_total',
    help: 'Number of active blog posts',
    registers: [register]
  }),

  // Search metrics
  searchOperations: new Counter({
    name: 'blog_search_operations_total',
    help: 'Count of search operations',
    labelNames: ['operation', 'status'],
    registers: [register]
  }),

  searchDuration: new Histogram({
    name: 'blog_search_duration_seconds',
    help: 'Duration of search operations',
    labelNames: ['operation'],
    buckets: [0.05, 0.1, 0.5, 1, 2],
    registers: [register]
  }),

  // Elasticsearch specific metrics
  elasticsearchLatency: new Histogram({
    name: 'blog_elasticsearch_operation_seconds',
    help: 'Duration of Elasticsearch operations',
    labelNames: ['operation'],
    buckets: [0.05, 0.1, 0.5, 1, 2],
    registers: [register]
  }),
  
  // MinIO specific metrics
  minioOperations: new Counter({
    name: 'blog_minio_operations_total',
    help: 'Count of MinIO storage operations',
    labelNames: ['operation', 'status'],
    registers: [register]
  }),

  minioLatency: new Histogram({
    name: 'blog_minio_operation_seconds',
    help: 'Duration of MinIO storage operations',
    labelNames: ['operation'],
    buckets: [0.05, 0.1, 0.5, 1, 2],
    registers: [register]
  })
};

// Re-export metrics endpoint handlers from shared config
export { register, metricsHandler, metricsEnabled } from '@shared/config/metrics';
