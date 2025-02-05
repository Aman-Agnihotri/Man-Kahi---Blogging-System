import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import path from 'path'
import fs from 'fs'
import dotenv from 'dotenv'
import logger from '@shared/utils/logger'
import { prisma } from '@shared/utils/prismaClient'
import { redis } from '@shared/config/redis'
import { setupSwagger } from '@shared/config/swagger'
import { setupElasticsearch, elasticClient } from '@utils/elasticsearch'
import blogRoutes from '@routes/blog.routes'
import { metricsHandler, metricsEnabled, metrics } from '@config/metrics'
import { 
  trackRequest,
  trackError,
  trackDbOperation,
  trackCacheOperation,
  setupResourceMonitoring,
  trackElasticsearchOperation 
} from '@middlewares/metrics.middleware';
import { createHealthCheck } from '@shared/middlewares/health';

// Enhanced startup logging
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  trackError('process', 'unhandled_rejection', 'blog-service');
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  trackError('process', 'uncaught_exception', 'blog-service');
});

logger.info('Initializing Blog Service...');

// Load and validate environment variables
dotenv.config()

// Enhanced environment validation
const validateEnvironment = () => {
  logger.info('Validating environment configuration...');
  const requiredEnvVars = {
    NODE_ENV: process.env['NODE_ENV'] ?? 'development',
    PORT: process.env['PORT'] ?? '3002',
    DATABASE_URL: process.env['DATABASE_URL'],
    REDIS_URL: process.env['REDIS_URL'],
    UPLOAD_PATH: process.env['UPLOAD_PATH'] ?? path.join(__dirname, '../uploads'),
    LOG_LEVEL: process.env['LOG_LEVEL'] ?? 'info'
  };

  for (const [key, value] of Object.entries(requiredEnvVars)) {
    if (!value) {
      const error = new Error(`Missing required environment variable: ${key}`);
      logger.error(error);
      throw error;
    }
    logger.info(`Environment variable ${key} is set`);
  }

  logger.info('Environment validation completed successfully');
  return requiredEnvVars;
};

const env = validateEnvironment();
const app = express()
logger.info('Express application instance created');

const PORT = parseInt(env.PORT, 10)

// Middleware
app.use(helmet()) // Security headers
app.use(cors()) // CORS support
app.use(express.json()) // Parse JSON bodies

// Static files for blog images
app.use('/uploads/images', express.static(path.join(__dirname, '../uploads/images')))

// Enhanced request logging middleware
app.use((req, res, next) => {
  const requestId = req.headers['x-request-id'] || Math.random().toString(36).substring(7);
  const startTime = process.hrtime();
  
  logger.info(`[${requestId}] Incoming ${req.method} ${req.url}`, {
    headers: req.headers,
    query: req.query,
    body: req.body,
  });

  // Track request size
  const requestSize = req.headers['content-length'] ? parseInt(req.headers['content-length'], 10) : 0;
  const requestMetrics = metrics.trackResource('request', 'size');
  requestMetrics.setUsage(requestSize, 'bytes');

  res.on('finish', () => {
    const [seconds, nanoseconds] = process.hrtime(startTime);
    const duration = seconds * 1000 + nanoseconds / 1000000;
    
    // Track response time
    const responseMetrics = metrics.trackResource('response', 'time');
    responseMetrics.setUsage(duration, 'ms');

    logger.info(`[${requestId}] Completed ${req.method} ${req.url}`, {
      statusCode: res.statusCode,
      duration: `${duration.toFixed(2)}ms`,
      responseSize: res.getHeader('content-length'),
      headers: res.getHeaders()
    });
  });

  next();
});

// Start resource monitoring
setupResourceMonitoring();

// Track HTTP requests
app.use(trackRequest());

// Standardized health check endpoint
app.get('/health', createHealthCheck({ 
  serviceName: 'blog-service',
  elasticsearchClient: elasticClient
}));

// Metrics endpoint (protected by metrics enabled check)
app.get('/metrics', metricsEnabled, metricsHandler)

// Setup Swagger documentation
setupSwagger(app, 'Blog Service', [
  path.resolve(__dirname, '@routes/blog.routes.ts')
]);

// Routes
app.use('/api/blogs', blogRoutes)

// Global error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  trackError('server', 'unhandled_error', 'blog-service');
  
  const correlationId = (req.headers['x-correlation-id'] || 'unknown').toString();
  res.status(500).json({
    error: 'Internal server error',
    message: process.env['NODE_ENV'] === 'development' ? err.message : undefined,
    correlationId
  });
});

// Graceful shutdown
const shutdown = async () => {
  logger.info('Received shutdown signal')
  
  try {
    // Close database connection
    await prisma.$disconnect()
    logger.info('Database connection closed')

    // Close Redis connection
    await redis.quit()
    logger.info('Redis connection closed')

    // Close Elasticsearch connection
    const esTimer = trackElasticsearchOperation('shutdown');
    await elasticClient.close();
    esTimer.end('success');
    logger.info('Elasticsearch connection closed');

    process.exit(0)
  } catch (error) {
    logger.error('Error during shutdown:', error)
    trackError('server', 'shutdown_error', 'blog-service');
    process.exit(1)
  }
}

// Handle shutdown signals
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

// Start server
const startServer = async () => {
  try {
    // Verify database connection
    const dbTimer = trackDbOperation('connect', 'prisma');
    await prisma.$connect();
    dbTimer.end();
    logger.info('Database connection established');

    // Verify Redis connection
    const cacheTimer = trackCacheOperation('ping', 'redis');
    await redis.ping();
    cacheTimer.end();
    logger.info('Redis connection established');

    // Setup Elasticsearch
    const esTimer = trackElasticsearchOperation('setup');
    await setupElasticsearch();
    esTimer.end('success');
    logger.info('Elasticsearch setup complete');

    // Create uploads directory if it doesn't exist
    const uploadsDir = path.join(__dirname, '../uploads/images')
    await fs.promises.mkdir(uploadsDir, { recursive: true })
    logger.info('Uploads directory ready')

    // Start listening
    app.listen(PORT, () => {
      logger.info(`Blog service running on port ${PORT}`)
    })
  } catch (error) {
    logger.error('Failed to start server:', error)
    trackError('server', 'startup_error', 'blog-service');
    process.exit(1)
  }
}

startServer();

export default app;
