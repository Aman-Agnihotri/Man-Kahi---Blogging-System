import { Request, Response } from 'express';
import os from 'os';
import { prisma as prismaClient } from '../../utils/prismaClient';
import { redis } from '../../config/redis';
import logger from '../../utils/logger';

interface ServiceDependencies {
  database?: boolean;
  redis?: boolean;
  elasticsearch?: boolean;
}

interface ServiceMetrics {
  uptime: number;
  responseTime: number;
  memory: {
    total: number;
    free: number;
    used: number;
    heapUsed: number;
  };
  cpu: {
    loadAvg: number[];
    cores: number;
  };
  connections: ServiceDependencies;
  [key: string]: any; // Allow additional custom metrics
}

interface ElasticsearchClient {
  ping: () => Promise<boolean>;
  close: () => Promise<void>;
}

interface HealthCheckOptions {
  serviceName: string;
  elasticsearchClient?: ElasticsearchClient;
  onSuccess?: (metrics: ServiceMetrics) => Promise<ServiceMetrics>;
}

export const createHealthCheck = (options: HealthCheckOptions) => {
  return async (_req: Request, res: Response) => {
    const start = process.hrtime();

    try {
      // Check database connection
      const dbHealthy = await checkDatabase();
      
      // Check Redis connection
      const redisHealthy = await checkRedis();

      // Check Elasticsearch if client provided
      const esHealthy = options.elasticsearchClient ? 
        await checkElasticsearch(options.elasticsearchClient) : 
        undefined;

      // Calculate response time
      const diff = process.hrtime(start);
      const responseTime = (diff[0] * 1e9 + diff[1]) / 1e6; // Convert to milliseconds

      // Get system metrics
      const metrics: ServiceMetrics = {
        uptime: process.uptime(),
        responseTime,
        memory: {
          total: os.totalmem(),
          free: os.freemem(),
          used: os.totalmem() - os.freemem(),
          heapUsed: process.memoryUsage().heapUsed,
        },
        cpu: {
          loadAvg: os.loadavg(),
          cores: os.cpus().length,
        },
        connections: {
          database: dbHealthy,
          redis: redisHealthy,
          ...(esHealthy !== undefined && { elasticsearch: esHealthy }),
        },
      };

      const allDependenciesHealthy = Object.values(metrics.connections).every(status => status);

      if (!allDependenciesHealthy) {
        res.status(503).json({
          status: 'degraded',
          timestamp: new Date().toISOString(),
          service: options.serviceName,
          metrics,
        });
        return;
      }

      // Apply custom metrics if onSuccess handler provided
      const finalMetrics = options.onSuccess ? await options.onSuccess(metrics) : metrics;

      res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: options.serviceName,
        metrics: finalMetrics,
      });
      return;
    } catch (error) {
      logger.error(`Health check failed for ${options.serviceName}:`, error);
      
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        service: options.serviceName,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return;
    }
  };
};

async function checkDatabase(): Promise<boolean> {
  try {
    await prismaClient.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error('Database health check failed:', error);
    return false;
  }
}

async function checkRedis(): Promise<boolean> {
  try {
    await redis.ping();
    return true;
  } catch (error) {
    logger.error('Redis health check failed:', error);
    return false;
  }
}

async function checkElasticsearch(client: ElasticsearchClient): Promise<boolean> {
  try {
    await client.ping();
    return true;
  } catch (error) {
    logger.error('Elasticsearch health check failed:', error);
    return false;
  }
}
