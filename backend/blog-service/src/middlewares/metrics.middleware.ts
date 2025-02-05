import { Request, Response, NextFunction } from 'express';
import { metrics, blogMetrics } from '@config/metrics';

// Track all HTTP requests using shared metrics
export const trackRequest = () => {
    return (req: Request, res: Response, next: NextFunction) => {
        const tracker = metrics.trackHttpRequest(req.method, req.path, parseInt(req.headers['content-length'] ?? '0', 10));
        
        res.on('finish', () => {
            const responseSize = parseInt(res.getHeader('content-length')?.toString() ?? '0', 10);
            tracker.end(res.statusCode, responseSize);
        });

        next();
    };
};

// Track blog operations
export const trackBlogOperation = (operationType: string) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        // Start tracking with shared HTTP metrics
        const httpTracker = metrics.trackHttpRequest(req.method, req.path, parseInt(req.headers['content-length'] ?? '0', 10));
        
        try {
            res.on('finish', () => {
                const status = res.statusCode < 400 ? 'success' : 'failure';
                const responseSize = parseInt(res.getHeader('content-length')?.toString() ?? '0', 10);
                
                // Complete shared metrics tracking
                httpTracker.end(res.statusCode, responseSize);
                
                // Track blog-specific metrics
                blogMetrics.blogOperations.inc({ operation: operationType, status });
            });

            next();
        } catch (error) {
            httpTracker.end(500, 0);
            throw error;
        }
    };
};

// Track blog views
export const trackBlogView = (blogId: string) => {
    blogMetrics.blogViews.inc({ blog_id: blogId });
};

// Update active blog count
export const updateActiveBlogCount = (delta: number) => {
    blogMetrics.activeBlogCount.inc(delta);
};

// Track search operations
export const trackSearchOperation = (operation: string) => {
    // Start tracking with shared external service metrics
    const externalTracker = metrics.trackExternalCall('elasticsearch', operation);
    const endTimer = blogMetrics.searchDuration.startTimer({ operation });
    
    return {
        end: (status: 'success' | 'failure' = 'success') => {
            blogMetrics.searchOperations.inc({ operation, status });
            endTimer();
            externalTracker.end(status);
        }
    };
};

// Track Elasticsearch operations
export const trackElasticsearchOperation = (operation: string) => {
    // Track with both shared external metrics and blog-specific metrics
    const externalTracker = metrics.trackExternalCall('elasticsearch', operation);
    const endTimer = blogMetrics.elasticsearchLatency.startTimer({ operation });
    
    return {
        end: (status: 'success' | 'failure' = 'success') => {
            endTimer();
            externalTracker.end(status);
        }
    };
};

// Track MinIO operations
export const trackMinioOperation = (operation: string) => {
    // Track with both shared storage metrics and blog-specific metrics
    const storageTracker = metrics.trackExternalCall('minio', operation);
    const endTimer = blogMetrics.minioLatency.startTimer({ operation });
    
    return {
        end: (status: 'success' | 'failure' = 'success') => {
            blogMetrics.minioOperations.inc({ operation, status });
            endTimer();
            storageTracker.end(status);
        }
    };
};

// Track database operations using shared metrics
export const trackDbOperation = (operation: string, table: string) => 
    metrics.trackDatabaseOperation(operation, table);

// Track cache operations using shared metrics
export const trackCacheOperation = (operation: string, cacheType: string = 'memory') => 
    metrics.trackCacheOperation(operation, cacheType);

// Track errors using shared metrics
export const trackError = (errorType: string, errorCode: string, component: string, correlationId?: string) => 
    metrics.trackError(errorType, errorCode, component, correlationId);

// Track resources using shared metrics
export const trackResource = (resource: string, type: string) => 
    metrics.trackResource(resource, type);

// Setup resource monitoring
export const setupResourceMonitoring = (interval = 5000) => {
    // Set up resource usage tracking
    const resourceTracker = metrics.trackResource('system', 'blog');
    
    setInterval(() => {
        const usage = process.memoryUsage();
        resourceTracker.setUsage(usage.heapUsed / 1024 / 1024, 'MB'); // Convert to MB
    }, interval);
};

// Track security events
export const trackSecurityEvent = (eventType: string, severity: string) => 
    metrics.trackSecurityEvent(eventType, severity);

// Track queue operations
export const trackQueue = (queueName: string) => 
    metrics.trackQueue(queueName);
