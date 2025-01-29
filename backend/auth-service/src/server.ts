import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import dotenv from 'dotenv'
import session from 'express-session'
import { RedisStore } from 'connect-redis'
import logger from '@shared/utils/logger'
import authRoutes from './routes/auth.routes'
import { oauthRoutes } from './routes/oauth.routes'
import { passport } from './controllers/passport.controller'
import { prisma } from '@shared/utils/prismaClient'
import { redis } from '@shared/config/redis'
import { metricsHandler } from './config/metrics'
import { updateResourceUsage, trackRedisOperation } from './middlewares/metrics.middleware'

// Load environment variables
dotenv.config()

const app = express()
const PORT = process.env.PORT ?? 3001

// Session configuration
const SESSION_SECRET = process.env.SESSION_SECRET ?? 'your-session-secret'

// Middleware
app.use(helmet()) // Security headers
app.use(cors()) // CORS support
app.use(express.json()) // Parse JSON bodies

// Session middleware
app.use(session({
  store: new RedisStore({ client: redis }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}))

// Initialize passport
app.use(passport.initialize())
app.use(passport.session())

// Resource monitoring
const monitorResources = () => {
  setInterval(() => {
    const used = process.memoryUsage();
    updateResourceUsage('memory', 'heapUsed', used.heapUsed);
    updateResourceUsage('memory', 'heapTotal', used.heapTotal);
    updateResourceUsage('memory', 'rss', used.rss);
    updateResourceUsage('memory', 'external', used.external);
    
    const cpuUsage = process.cpuUsage();
    updateResourceUsage('cpu', 'user', cpuUsage.user);
    updateResourceUsage('cpu', 'system', cpuUsage.system);
  }, 5000); // Update every 5 seconds
};

// Start resource monitoring
monitorResources();

// Request logging with basic metrics
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  const redisTimer = trackRedisOperation('session_check');
  redisTimer.end();
  next();
})

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'auth-service',
    timestamp: new Date().toISOString(),
  })
})

// Metrics endpoint
app.get('/metrics', metricsHandler)

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/oauth', oauthRoutes)

// Global error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', err)
  res.status(500).json({ 
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  })
})

// Graceful shutdown
const shutdown = async () => {
  logger.info('Received shutdown signal')
  
  try {
    // Close database connection
    await prisma.$disconnect()
    logger.info('Database connection closed')

    // Close Redis connection with metrics
    const redisTimer = trackRedisOperation('shutdown');
    await redis.quit();
    redisTimer.end();
    logger.info('Redis connection closed');

    process.exit(0)
  } catch (error) {
    logger.error('Error during shutdown:', error)
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

    // Verify Redis connection with metrics
    const redisTimer = trackRedisOperation('startup');
    await redis.ping();
    redisTimer.end();
    logger.info('Redis connection established');

    // Start listening
    app.listen(PORT, () => {
      logger.info(`Auth service running on port ${PORT}`)
    })
  } catch (error) {
    logger.error('Failed to start server:', error)
    process.exit(1)
  }
}
