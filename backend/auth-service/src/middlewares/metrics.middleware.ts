import { Request, Response, NextFunction } from 'express';
import { metrics, authMetrics } from '@config/metrics';

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

// Track authentication operations
export const trackAuthMetrics = (operationType: string, provider: string = 'local') => {
    return async (req: Request, res: Response, next: NextFunction) => {
        // Start tracking with shared HTTP metrics
        const httpTracker = metrics.trackHttpRequest(req.method, req.path, parseInt(req.headers['content-length'] ?? '0', 10));
        
        try {
            res.on('finish', () => {
                const status = res.statusCode < 400 ? 'success' : 'failure';
                const responseSize = parseInt(res.getHeader('content-length')?.toString() ?? '0', 10);
                
                // Complete shared metrics tracking
                httpTracker.end(res.statusCode, responseSize);
                
                // Track auth-specific metrics
                switch (operationType) {
                    case 'login':
                        authMetrics.loginAttempts.inc({ status, provider });
                        break;
                    case 'register':
                        authMetrics.registrationAttempts.inc({ status, provider });
                        break;
                }
            });

            next();
        } catch (error) {
            httpTracker.end(500, 0);
            throw error;
        }
    };
};

// Track OAuth operations
export const trackOAuthOperation = (provider: string, operation: string) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        // Start tracking with shared HTTP metrics
        const httpTracker = metrics.trackHttpRequest(req.method, req.path, parseInt(req.headers['content-length'] ?? '0', 10));
        const endTimer = authMetrics.oauthLatency.startTimer({ provider, operation });
        
        try {
            res.on('finish', () => {
                const status = res.statusCode < 400 ? 'success' : 'failure';
                const responseSize = parseInt(res.getHeader('content-length')?.toString() ?? '0', 10);
                
                // Complete shared metrics tracking
                httpTracker.end(res.statusCode, responseSize);
                
                // Track OAuth-specific metrics
                authMetrics.oauthOperations.inc({ provider, operation, status });
                endTimer();
            });

            next();
        } catch (error) {
            endTimer();
            httpTracker.end(500, 0);
            throw error;
        }
    };
};

// Track database operations using shared metrics
export const trackDbOperation = (operation: string, table: string) => 
    metrics.trackDatabaseOperation(operation, table);

// Track Redis operations using shared cache metrics
export const trackRedisOperation = (operation: string, cacheType: string = 'redis') => 
    metrics.trackCacheOperation(operation, cacheType);

// Track errors using shared metrics
export const trackError = (errorType: string, errorCode: string, component: string, correlationId?: string) => 
    metrics.trackError(errorType, errorCode, component, correlationId);

// Track active tokens
export const updateActiveTokens = (delta: number) => {
    authMetrics.activeTokens.inc(delta);
};

// Track active sessions
export const updateActiveSessions = (delta: number) => {
    authMetrics.activeSessions.inc(delta);
};

// Track session duration
export const trackSessionDuration = (durationInSeconds: number) => {
    authMetrics.sessionDuration.observe(durationInSeconds);
};

// Track resource usage
export const trackResource = (resource: string, type: string) => 
    metrics.trackResource(resource, type);

// Setup resource monitoring
export const setupResourceMonitoring = (interval = 5000) => {
    // Set up resource usage tracking
    const resourceTracker = metrics.trackResource('system', 'auth');
    
    setInterval(() => {
        const usage = process.memoryUsage();
        resourceTracker.setUsage(usage.heapUsed / 1024 / 1024, 'MB'); // Convert to MB
    }, interval);
};

// Track external service calls
export const trackExternalCall = (service: string, operation: string) => 
    metrics.trackExternalCall(service, operation);

// Track queue operations
export const trackQueue = (queueName: string) => 
    metrics.trackQueue(queueName);

// Track security events
export const trackSecurityEvent = (eventType: string, severity: string) => 
    metrics.trackSecurityEvent(eventType, severity);
