import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { prisma } from '@shared/utils/prismaClient';
import logger from '@shared/utils/logger';
import { setupSwagger } from '@shared/config/swagger';
import adminRoutes from '@routes/admin.routes';
import dotenv from 'dotenv';
import path from 'path';
import { metricsHandler, metricsEnabled, metrics } from '@config/metrics';
import { trackRequest, trackError, trackDbOperation, setupResourceMonitoring } from '@middlewares/metrics.middleware';
import { createHealthCheck } from '@shared/middlewares/health';

// Enhanced startup logging
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  trackError('process', 'unhandled_rejection', 'admin-service');
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  trackError('process', 'uncaught_exception', 'admin-service');
});

logger.info('Initializing Admin Service...');

// Load and validate environment variables
dotenv.config();

// Enhanced environment validation
const validateEnvironment = () => {
  logger.info('Validating environment configuration...');
  const requiredEnvVars = {
    NODE_ENV: process.env['NODE_ENV'] ?? 'development',
    PORT: process.env['PORT'] ?? '3004',
    DATABASE_URL: process.env['DATABASE_URL'],
    LOG_LEVEL: process.env['LOG_LEVEL'] ?? 'info',
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
const app = express();
logger.info('Express application instance created');

// Initialize app locals
app.locals['activeSessions'] = new Map();

// Enhanced request logging middleware
app.use((req, res, next) => {
  const requestId = req.headers['x-request-id'] || Math.random().toString(36).substring(7);
  const startTime = process.hrtime();
  
  logger.info(`[${requestId}] Incoming ${req.method} ${req.url}`, {
    headers: req.headers,
    query: req.query,
    body: req.body,
  });

  // Track request metrics
  const requestMetrics = metrics.trackResource('admin_request', 'count');
  requestMetrics.setUsage(1, 'request');

  res.on('finish', () => {
    const [seconds, nanoseconds] = process.hrtime(startTime);
    const duration = seconds * 1000 + nanoseconds / 1000000;
    
    // Track response metrics
    const responseMetrics = metrics.trackResource('admin_response', 'latency');
    responseMetrics.setUsage(duration, 'ms');

    logger.info(`[${requestId}] Completed ${req.method} ${req.url}`, {
      statusCode: res.statusCode,
      duration: `${duration.toFixed(2)}ms`,
      headers: res.getHeaders()
    });
  });

  next();
});

// Security middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Setup Swagger documentation
setupSwagger(app as any, 'Admin Service', [
  path.resolve(__dirname, '@routes/admin.routes.ts')
]);

// Track HTTP requests
app.use(trackRequest());

// Start resource monitoring
setupResourceMonitoring();


// Standardized health check with custom admin metrics
const adminHealthCheck = createHealthCheck({
  serviceName: 'admin-service',
  onSuccess: async (metrics) => {
    const activeSessions = (app.locals['activeSessions'] as Map<string, any>).size;

    return {
      ...metrics,
      operations: {
        activeSessions
      }
    };
  }
});

app.get('/health', adminHealthCheck);

// Metrics endpoint
app.get('/metrics', metricsEnabled, metricsHandler);

// Routes
app.use('/api/admin', adminRoutes);

// Error handling
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  trackError('server', 'unhandled_error', 'admin-service');
  
  const correlationId = (req.headers['x-correlation-id'] || 'unknown').toString();
  res.status(500).json({
    error: 'Internal server error',
    message: process.env['NODE_ENV'] === 'development' ? err.message : undefined,
    correlationId
  });
});

// Graceful shutdown
const shutdown = async () => {
  logger.info('Received shutdown signal, shutting down gracefully');
  try {
    const dbTimer = trackDbOperation('disconnect', 'prisma');
    await prisma.$disconnect();
    dbTimer.end();
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    trackError('server', 'shutdown_error', 'admin-service');
    process.exit(1);
  }
};

// Handle shutdown signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any) => {
  logger.error('Unhandled Promise rejection:', reason);
  trackError('server', 'unhandled_rejection', 'admin-service');
});

// Start server
const PORT = process.env['PORT'] ?? 3004;

const startServer = async () => {
  try {
    // Verify database connection
    const dbTimer = trackDbOperation('connect', 'prisma');
    await prisma.$connect();
    dbTimer.end();
    logger.info('Database connection established');

    app.listen(PORT, () => {
      logger.info(`Admin service running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    trackError('server', 'startup_error', 'admin-service');
    process.exit(1);
  }
};

startServer();

export default app;
