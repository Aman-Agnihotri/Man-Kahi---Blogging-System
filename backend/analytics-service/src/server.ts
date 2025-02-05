import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { prisma } from '@shared/utils/prismaClient';
import logger from '@shared/utils/logger';
import { setupSwagger } from '@shared/config/swagger';
import analyticsRoutes from '@routes/analytics.routes';
import { redis } from '@shared/config/redis';
import { metricsHandler, metricsEnabled } from '@config/metrics';
import { 
  trackRequest,
  setupResourceMonitoring,
  trackError 
} from '@middlewares/metrics.middleware';

// Enhanced startup logging
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
});

logger.info('Initializing Analytics Service...');

// Enhanced environment validation
const validateEnvironment = () => {
  logger.info('Validating environment configuration...');
  const requiredEnvVars = {
    LOG_LEVEL: process.env['LOG_LEVEL'] ?? 'info',
    PORT: process.env['PORT'],
    DATABASE_URL: process.env['DATABASE_URL'],
    REDIS_URL: process.env['REDIS_URL'],
  };

  for (const [key, value] of Object.entries(requiredEnvVars)) {
    if (!value) {
      const error = new Error(`Missing required environment variable: ${key}`);
      logger.error(error);
      throw error;
    }
    logger.info(`Environment variable ${key} is set`);
  }

  if (!['error', 'warn', 'info', 'debug'].includes(requiredEnvVars.LOG_LEVEL)) {
    const error = new Error(`Invalid LOG_LEVEL: ${requiredEnvVars.LOG_LEVEL}. Must be one of: error, warn, info, debug`);
    logger.error(error);
    throw error;
  }

  logger.info('Environment validation completed successfully');
};

validateEnvironment();

const app: Application = express();
logger.info('Express application instance created');

// Middleware setup with logging
logger.info('Setting up middleware...');
app.use(helmet());
logger.info('Helmet security middleware configured');

app.use(cors());
logger.info('CORS middleware configured');

app.use(express.json());
logger.info('JSON body parser configured');

app.use((req: Request, res: Response, next: NextFunction) => {
  logger.debug(`${req.method} ${req.url}`, {
    headers: req.headers,
    query: req.query,
    body: req.body,
  });
  next();
});
logger.info('Request logging middleware configured');

// Setup Swagger documentation
logger.info('Setting up Swagger documentation...');
setupSwagger(app as any, 'Analytics Service', [
  path.resolve(__dirname, '@routes/analytics.routes.ts')
]);
logger.info('Swagger documentation configured');

import { createHealthCheck } from '@shared/middlewares/health';

// Custom health check that includes queue metrics
const analyticsHealthCheck = createHealthCheck({
  serviceName: 'analytics-service',
  onSuccess: async (metrics) => {
    // Add queue metrics
    try {
      const eventQueueSize = await redis.llen('analytics:events') || 0;
      const aggregationQueueSize = await redis.llen('analytics:aggregation') || 0;
      return {
        ...metrics,
        queues: {
          events: eventQueueSize,
          aggregation: aggregationQueueSize
        }
      };
    } catch (err) {
      logger.error('Error fetching queue sizes:', err);
      trackError('health', 'queue_check_failed', 'analytics-service');
      return metrics;
    }
  }
});

app.get('/health', analyticsHealthCheck);

// Metrics endpoint
// Track HTTP requests
app.use(trackRequest());

// Start resource monitoring
setupResourceMonitoring();

app.get('/metrics', metricsEnabled, metricsHandler);

// Routes
app.use('/api/analytics', analyticsRoutes);

// Error handling
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled error:', err);
  trackError('server', 'unhandled_error', 'analytics-service');
  
  const correlationId = (req.headers['x-correlation-id'] || 'unknown').toString();
  res.status(500).json({
    error: 'Internal server error',
    message: process.env['NODE_ENV'] === 'development' ? err.message : undefined,
    correlationId
  });
});

// Start server
const startServer = async () => {
  logger.info('Starting analytics service...');
  
  try {
    // Test database connection
    logger.info('Establishing database connection...');
    await prisma.$connect();
    const dbResult = await prisma.$queryRaw`SELECT 1`;
    logger.info('Database connection test successful:', dbResult);

    // Test Redis connection
    logger.info('Testing Redis connection...');
    const redisResult = await redis.ping();
    logger.info('Redis connection test successful:', redisResult);

    // Initialize metrics
    logger.info('Initializing metrics collection...');
    setupResourceMonitoring();
    logger.info('Resource monitoring initialized');

    // Start the server
    const PORT = process.env['PORT'] ?? 3003;
    app.listen(PORT, () => {
      logger.info(`Analytics service running on port ${PORT}`);
      logger.info('Server startup sequence completed successfully');
    });

  } catch (error) {
    logger.error('Failed to start server:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
      details: error
    });
    console.error('Full error details:', error);
    trackError('server', 'startup_error', 'analytics-service');
    process.exit(1);
  }
};

// Handle shutdown gracefully
const shutdown = async () => {
  logger.info('Received shutdown signal, shutting down gracefully');
  try {
    await Promise.all([
      prisma.$disconnect(),
      redis.quit(),
    ]);
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    trackError('server', 'shutdown_error', 'analytics-service');
    process.exit(1);
  }
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any) => {
  logger.error('Unhandled Promise rejection:', reason);
  trackError('server', 'unhandled_rejection', 'analytics-service');
});

startServer();

export default app;
