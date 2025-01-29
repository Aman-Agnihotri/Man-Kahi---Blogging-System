import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { prisma } from '@shared/utils/prismaClient';
import logger from '@shared/utils/logger';
import adminRoutes from '@routes/admin.routes';
import dotenv from 'dotenv';
import { metricsHandler, metricsEnabled } from './config/metrics';
import { trackRequest, updateResourceUsage, trackAdminError } from './middlewares/metrics.middleware';

// Load environment variables
dotenv.config();

const app = express();

// Security middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Metrics middleware
app.use(trackRequest());

// Start monitoring resource usage
const startResourceMonitoring = () => {
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

startResourceMonitoring();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'admin' });
});

// Metrics endpoint (protected by metrics enabled check)
app.get('/metrics', metricsEnabled, metricsHandler);

// Routes
app.use('/api/admin', adminRoutes);

// Error handling
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  
  // Track error in metrics and add correlation ID
  const errorType = err.name || 'UnknownError';
  const correlationId = req.headers['x-correlation-id'] || 'unknown';
  trackAdminError(`${errorType}_${correlationId}`);
  
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// Start server
const PORT = process.env.PORT ?? 3004;
app.listen(PORT, () => {
  logger.info(`Admin service running on port ${PORT}`);
});

// Handle shutdown gracefully
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM signal, shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT signal, shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any) => {
  logger.error('Unhandled Promise rejection:', reason);
});

export default app;
