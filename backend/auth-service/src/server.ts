import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import dotenv from 'dotenv'
import session from 'express-session'
import { RedisStore } from 'connect-redis'
import logger from '@shared/utils/logger'
import authRoutes from '@routes/auth.routes'
import { oauthRoutes } from '@routes/oauth.routes'
import { passport } from '@controllers/passport.controller'
import { prisma } from '@shared/utils/prismaClient'
import { redis } from '@shared/config/redis'
import { metricsHandler, metricsEnabled, metrics } from '@config/metrics'
import { 
  trackRequest, 
  setupResourceMonitoring, 
  trackRedisOperation,
  trackError 
} from '@middlewares/metrics.middleware';
import { createHealthCheck } from '@shared/middlewares/health';
import { setupSwagger } from '@shared/config/swagger'
import path from 'path'

// Enhanced startup logging
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  trackError('process', 'unhandled_rejection', 'auth-service');
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  trackError('process', 'uncaught_exception', 'auth-service');
});

logger.info('Initializing Auth Service...');

// Load and validate environment variables
dotenv.config()

// Enhanced environment validation
const validateEnvironment = () => {
  logger.info('Validating environment configuration...');
  const requiredEnvVars = {
    NODE_ENV: process.env['NODE_ENV'] ?? 'development',
    PORT: process.env['PORT'] ?? '3001',
    DATABASE_URL: process.env['DATABASE_URL'],
    REDIS_URL: process.env['REDIS_URL'],
    SESSION_SECRET: process.env['SESSION_SECRET'],
    JWT_SECRET: process.env['JWT_SECRET'],
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
const SESSION_SECRET = env.SESSION_SECRET

// Middleware
app.use(helmet()) // Security headers
app.use(cors()) // CORS support
app.use(express.json()) // Parse JSON bodies

// Enhanced request logging middleware
app.use((req, res, next) => {
  const requestId = req.headers['x-request-id'] || Math.random().toString(36).substring(7);
  const startTime = process.hrtime();
  
  logger.info(`[${requestId}] Incoming ${req.method} ${req.url}`, {
    headers: req.headers,
    query: req.query,
    body: req.body,
  });

  // Track active sessions
  const sessionTracker = metrics.trackResource('sessions', 'active');
  sessionTracker.setUsage(Object.keys(req.sessionStore || {}).length, 'count');

  res.on('finish', () => {
    const [seconds, nanoseconds] = process.hrtime(startTime);
    const duration = seconds * 1000 + nanoseconds / 1000000;

    logger.info(`[${requestId}] Completed ${req.method} ${req.url}`, {
      statusCode: res.statusCode,
      duration: `${duration.toFixed(2)}ms`,
      headers: res.getHeaders()
    });
  });

  next();
});

// Session middleware with type assertion for secret
app.use(session({
  store: new RedisStore({ client: redis }),
  secret: SESSION_SECRET as string,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env['NODE_ENV'] === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Initialize passport
app.use(passport.initialize());
app.use(passport.session());

// Start resource monitoring
setupResourceMonitoring();

// Track HTTP requests
app.use(trackRequest());

// Standardized health check endpoint
app.get('/health', createHealthCheck({ serviceName: 'auth-service' }));

// Metrics endpoint
app.get('/metrics', metricsEnabled, metricsHandler)

// Setup Swagger documentation
setupSwagger(app, 'Auth Service', [
  path.resolve(__dirname, '@routes/auth.routes.ts'),
  path.resolve(__dirname, '@routes/oauth.routes.ts')
]);

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/oauth', oauthRoutes)

// Global error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', err)
  trackError('server', 'unhandled_error', 'auth-service');
  res.status(500).json({ 
    message: 'Internal server error',
    error: process.env['NODE_ENV'] === 'development' ? err.message : undefined
  })
})

// Graceful shutdown
const shutdown = async () => {
  logger.info('Received shutdown signal')
  
  try {
    // Close database connection
    await prisma.$disconnect()
    logger.info('Database connection closed')

    // Close Redis connection
    const shutdownTimer = trackRedisOperation('shutdown', 'redis');
    await redis.quit();
    shutdownTimer.end();
    logger.info('Redis connection closed');

    process.exit(0)
  } catch (error) {
    logger.error('Error during shutdown:', error)
    trackError('server', 'shutdown_error', 'auth-service');
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
    await prisma.$connect()
    logger.info('Database connection established')

    // Verify Redis connection
    const startupTimer = trackRedisOperation('startup', 'redis');
    await redis.ping();
    startupTimer.end();
    logger.info('Redis connection established');

    // Start listening
    app.listen(PORT, () => {
      logger.info(`Auth service running on port ${PORT}`)
    })
  } catch (error) {
    logger.error('Failed to start server:', error)
    trackError('server', 'startup_error', 'auth-service');
    process.exit(1)
  }
}

startServer()
