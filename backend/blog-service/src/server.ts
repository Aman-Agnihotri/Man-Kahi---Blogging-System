import 'module-alias/register'
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
import { setupElasticsearch } from '@utils/elasticsearch'
import blogRoutes from './routes/blog.routes'
import { metricsHandler } from './config/metrics'

// Load environment variables
dotenv.config()

const app = express()
const PORT = process.env.PORT ?? 3002

// Middleware
app.use(helmet()) // Security headers
app.use(cors()) // CORS support
app.use(express.json()) // Parse JSON bodies

// Static files for blog images
app.use('/uploads/images', express.static(path.join(__dirname, '../uploads/images')))

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`)
  next()
})

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'blog-service',
    timestamp: new Date().toISOString(),
  })
})

// Metrics endpoint
app.get('/metrics', metricsHandler)

// Setup Swagger documentation
setupSwagger(app, 'Blog Service', [
  path.resolve(__dirname, './routes/blog.routes.ts')
]);

// Routes
app.use('/api/blogs', blogRoutes)

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

    // Setup Elasticsearch
    await setupElasticsearch()
    logger.info('Elasticsearch setup complete')

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
    process.exit(1)
  }
}

startServer()
