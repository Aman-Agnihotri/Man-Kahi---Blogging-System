import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import dotenv from 'dotenv'
import { logger } from './utils/logger'
import authRoutes from './routes/auth.routes'
import { prisma } from './config/prisma'
import { redis } from './config/redis'

// Load environment variables
dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(helmet()) // Security headers
app.use(cors()) // CORS support
app.use(express.json()) // Parse JSON bodies

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`)
  next()
})

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'auth-service',
    timestamp: new Date().toISOString(),
  })
})

// Routes
app.use('/api/auth', authRoutes)

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

    // Close Redis connection
    await redis.quit()
    logger.info('Redis connection closed')

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

    // Verify Redis connection
    await redis.ping()
    logger.info('Redis connection established')

    // Start listening
    app.listen(PORT, () => {
      logger.info(`Auth service running on port ${PORT}`)
    })
  } catch (error) {
    logger.error('Failed to start server:', error)
    process.exit(1)
  }
}

startServer()
