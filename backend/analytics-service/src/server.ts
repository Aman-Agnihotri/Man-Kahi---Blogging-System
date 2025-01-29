import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { prisma } from '@shared/utils/prismaClient';
import logger from '@shared/utils/logger';
import analyticsRoutes from '@routes/analytics.routes';
import { metricsHandler, analyticsMetrics, register } from './config/metrics';
import { redis } from '@shared/config/redis';

// Validate essential environment variables
const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info';
if (!['error', 'warn', 'info', 'debug'].includes(LOG_LEVEL)) {
  throw new Error(`Invalid LOG_LEVEL: ${LOG_LEVEL}. Must be one of: error, warn, info, debug`);
}

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Health check endpoint with metrics
app.get('/health', async (req: Request, res: Response) => {
  try {
    // Check database connectivity
    await prisma.$queryRaw`SELECT 1`;
    
    // Check Redis connectivity
    await redis.ping();

    // Track resource usage
    const used = process.memoryUsage();
    analyticsMetrics.resourceUsage.set({ resource: 'memory', type: 'heapUsed' }, used.heapUsed);
    analyticsMetrics.resourceUsage.set({ resource: 'memory', type: 'heapTotal' }, used.heapTotal);
    analyticsMetrics.resourceUsage.set({ resource: 'memory', type: 'rss' }, used.rss);
    analyticsMetrics.resourceUsage.set({ resource: 'memory', type: 'external' }, used.external);

    // Track CPU usage
    const cpuUsage = process.cpuUsage();
    analyticsMetrics.resourceUsage.set({ resource: 'cpu', type: 'user' }, cpuUsage.user);
    analyticsMetrics.resourceUsage.set({ resource: 'cpu', type: 'system' }, cpuUsage.system);

    // Get queue sizes
    // Get current metric values
    let eventQueueSize = 0;
    let aggregationQueueSize = 0;

    // Get queue metrics from registry
    try {
      const allMetrics = await register.getMetricsAsJSON();
      const queueMetric = allMetrics.find(m => m.name === 'analytics_queue_size');
      if (queueMetric && Array.isArray(queueMetric.values)) {
        eventQueueSize = queueMetric.values.find(
          v => v.labels?.queue_type === 'events'
        )?.value ?? 0;
        aggregationQueueSize = queueMetric.values.find(
          v => v.labels?.queue_type === 'aggregation'
        )?.value ?? 0;
      }
    } catch (err) {
      logger.error('Error fetching queue metrics:', err);
    }

    res.json({
      status: 'ok',
      service: 'analytics',
      timestamp: new Date().toISOString(),
      metrics: {
        memory: used,
        cpu: cpuUsage,
        queues: {
          events: eventQueueSize,
          aggregation: aggregationQueueSize
        },
        database: 'connected',
        redis: 'connected'
      }
    });
  } catch (error) {
      logger.error('Health check failed:', error);

    // Determine which dependency failed
    const dependencies = {
      database: false,
      redis: false
    };
    
    try {
      await prisma.$queryRaw`SELECT 1`;
      dependencies.database = true;
    } catch (e) {
      logger.error('Database health check failed:', e);
    }
    
    try {
      await redis.ping();
      dependencies.redis = true;
    } catch (e) {
      logger.error('Redis health check failed:', e);
    }

    res.status(503).json({
      status: 'error',
      service: 'analytics',
      timestamp: new Date().toISOString(),
      error: 'Service unhealthy',
      dependencies
    });
  }
});

// Metrics endpoint
app.get('/metrics', metricsHandler);

// Routes
app.use('/api/analytics', analyticsRoutes);

// Error handling
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// Start server
const PORT = process.env.PORT ?? 3003;
// Initialize monitoring
const initMonitoring = () => {
  setInterval(() => {
    const used = process.memoryUsage();
    analyticsMetrics.resourceUsage.set({ resource: 'memory', type: 'heapUsed' }, used.heapUsed);
    analyticsMetrics.resourceUsage.set({ resource: 'memory', type: 'heapTotal' }, used.heapTotal);
    analyticsMetrics.resourceUsage.set({ resource: 'memory', type: 'rss' }, used.rss);
    analyticsMetrics.resourceUsage.set({ resource: 'memory', type: 'external' }, used.external);

    const cpuUsage = process.cpuUsage();
    analyticsMetrics.resourceUsage.set({ resource: 'cpu', type: 'user' }, cpuUsage.user);
    analyticsMetrics.resourceUsage.set({ resource: 'cpu', type: 'system' }, cpuUsage.system);
  }, 5000); // Update every 5 seconds
};

// Start server with monitoring
app.listen(PORT, () => {
  initMonitoring();
  logger.info(`Analytics service running on port ${PORT}`);
});

// Handle shutdown gracefully
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM signal, shutting down gracefully');
  try {
    await Promise.all([
      prisma.$disconnect(),
      redis.quit(),
    ]);
    analyticsMetrics.resourceUsage.reset();
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT signal, shutting down gracefully');
  await Promise.all([
    prisma.$disconnect(),
    redis.quit(),
  ]);
  process.exit(0);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any) => {
  logger.error('Unhandled Promise rejection:', reason);
});

export default app;
