import { Request, Response, NextFunction } from 'express';
import { metrics, analyticsMetrics } from '@config/metrics';

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

// Track event processing with timing
export const trackEventProcessing = (eventType: string) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        // Start tracking with shared HTTP metrics
        const httpTracker = metrics.trackHttpRequest(req.method, req.path, parseInt(req.headers['content-length'] ?? '0', 10));
        
        // Start analytics-specific timing
        const endTimer = analyticsMetrics.eventProcessingTime.startTimer({ event_type: eventType });
        
        try {
            res.on('finish', () => {
                const status = res.statusCode < 400 ? 'success' : 'failure';
                const responseSize = parseInt(res.getHeader('content-length')?.toString() ?? '0', 10);
                
                // Complete shared metrics tracking
                httpTracker.end(res.statusCode, responseSize);
                
                // Track analytics-specific metrics
                analyticsMetrics.eventProcessed.inc({ event_type: eventType, status });
                endTimer();
            });

            next();
        } catch (error) {
            endTimer();
            throw error;
        }
    };
};

// Track data aggregation operations
export const trackAggregation = (operationType: string) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        // Start tracking with shared HTTP metrics
        const httpTracker = metrics.trackHttpRequest(req.method, req.path, parseInt(req.headers['content-length'] ?? '0', 10));
        
        // Start analytics-specific timing
        const endTimer = analyticsMetrics.aggregationDuration.startTimer({ operation_type: operationType });
        
        try {
            res.on('finish', () => {
                const status = res.statusCode < 400 ? 'success' : 'failure';
                const responseSize = parseInt(res.getHeader('content-length')?.toString() ?? '0', 10);
                
                // Complete shared metrics tracking
                httpTracker.end(res.statusCode, responseSize);
                
                // Track analytics-specific metrics
                analyticsMetrics.aggregationOperations.inc({ operation_type: operationType, status });
                endTimer();
            });

            next();
        } catch (error) {
            endTimer();
            throw error;
        }
    };
};

// Track storage operations
export const trackStorageOperation = (operation: string, isSuccess: boolean) => {
    // Use shared database metrics for storage operations
    const dbTracker = metrics.trackDatabaseOperation(operation, 'analytics_storage');
    analyticsMetrics.dataStorageOperations.inc({
        operation,
        status: isSuccess ? 'success' : 'failure'
    });
    dbTracker.end(isSuccess ? 'success' : 'failure');
};

// Track errors using shared metrics
export const trackError = (errorType: string, errorCode: string, component: string, correlationId?: string) => {
    metrics.trackError(errorType, errorCode, component, correlationId);
};

// Update active users count (analytics-specific metric)
export const updateActiveUsers = (count: number) => {
    analyticsMetrics.activeUsers.set(count);
};

// Queue tracking using shared metrics
export const trackQueue = (queueType: string) => metrics.trackQueue(queueType);

// Setup resource monitoring with analytics-specific tracking
export const setupResourceMonitoring = (interval = 5000) => {
    const resourceTracker = metrics.trackResource('system', 'analytics');
    
    setInterval(() => {
        const usage = process.memoryUsage();
        resourceTracker.setUsage(usage.heapUsed / 1024 / 1024, 'MB');
    }, interval);
};
