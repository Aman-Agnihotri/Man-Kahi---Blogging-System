import { Request, Response, NextFunction } from 'express';
import { analyticsMetrics } from '../config/metrics';

// Track event processing with timing
export const trackEventProcessing = (eventType: string) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const endTimer = analyticsMetrics.eventProcessingTime.startTimer({ event_type: eventType });
        
        // Track request in queue
        analyticsMetrics.queueSize.inc({ queue_type: eventType });
        
        try {
            // Ensure cleanup happens even if next() throws
            res.on('finish', () => {
                const status = res.statusCode < 400 ? 'success' : 'failure';
                analyticsMetrics.eventProcessed.inc({ event_type: eventType, status });
                // Request completed, decrease queue size
                analyticsMetrics.queueSize.dec({ queue_type: eventType });
                endTimer();
            });

            res.on('error', () => {
                analyticsMetrics.queueSize.dec({ queue_type: eventType });
                endTimer();
            });

            next();
        } catch (error) {
            // Ensure cleanup if middleware throws
            analyticsMetrics.queueSize.dec({ queue_type: eventType });
            endTimer();
            throw error;
        }
    };
};

// Track data aggregation operations
export const trackAggregation = (operationType: string) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const endTimer = analyticsMetrics.aggregationDuration.startTimer({ operation_type: operationType });
        
        // Track aggregation request in queue
        analyticsMetrics.queueSize.inc({ queue_type: 'aggregation' });
        
        try {
            // Ensure cleanup happens even if next() throws
            res.on('finish', () => {
                const status = res.statusCode < 400 ? 'success' : 'failure';
                analyticsMetrics.aggregationOperations.inc({ operation_type: operationType, status });
                // Request completed, decrease queue size
                analyticsMetrics.queueSize.dec({ queue_type: 'aggregation' });
                endTimer();
            });

            res.on('error', () => {
                analyticsMetrics.queueSize.dec({ queue_type: 'aggregation' });
                endTimer();
            });

            next();
        } catch (error) {
            // Ensure cleanup if middleware throws
            analyticsMetrics.queueSize.dec({ queue_type: 'aggregation' });
            endTimer();
            throw error;
        }
    };
};

// Track storage operations
export const trackStorageOperation = (operation: string, isSuccess: boolean) => {
    analyticsMetrics.dataStorageOperations.inc({
        operation,
        status: isSuccess ? 'success' : 'failure'
    });
};

// Track error occurrences
export const trackError = (errorType: string) => {
    analyticsMetrics.errorCount.inc({ error_type: errorType });
};

// Update queue metrics
export const updateQueueMetrics = (queueType: string, size: number) => {
    analyticsMetrics.queueSize.set({ queue_type: queueType }, size);
};

// Track queue processing time
export const trackQueueLatency = (queueType: string) => {
    return analyticsMetrics.queueLatency.startTimer({ queue_type: queueType });
};

// Update active users count
export const updateActiveUsers = (count: number) => {
    analyticsMetrics.activeUsers.set(count);
};

// Middleware to track overall analytics API performance
export const trackAnalyticsEndpoint = (operationType: string) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const endTimer = analyticsMetrics.eventProcessingTime.startTimer({ event_type: operationType });
        
        // Track API request in queue
        analyticsMetrics.queueSize.inc({ queue_type: 'api' });
        
        try {
            // Ensure cleanup happens even if next() throws
            res.on('finish', () => {
                const status = res.statusCode < 400 ? 'success' : 'failure';
                analyticsMetrics.eventProcessed.inc({
                    event_type: operationType,
                    status
                });
                // Request completed, decrease queue size
                analyticsMetrics.queueSize.dec({ queue_type: 'api' });
                endTimer();
            });

            res.on('error', () => {
                analyticsMetrics.queueSize.dec({ queue_type: 'api' });
                endTimer();
            });

            next();
        } catch (error) {
            // Ensure cleanup if middleware throws
            analyticsMetrics.queueSize.dec({ queue_type: 'api' });
            endTimer();
            throw error;
        }
    };
};
