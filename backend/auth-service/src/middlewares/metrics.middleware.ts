import { Request, Response, NextFunction } from 'express';
import { authMetrics } from '../config/metrics';
import { performance } from 'perf_hooks';

// Track authentication operations
export const trackAuthMetrics = (operationType: string, provider: string = 'local') => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const endTimer = authMetrics.authLatency.startTimer({ operation: operationType });
        
        res.on('finish', () => {
            const status = res.statusCode < 400 ? 'success' : 'failure';
            
            switch (operationType) {
                case 'login':
                    authMetrics.loginAttempts.inc({ status, provider });
                    break;
                case 'register':
                    authMetrics.registrationAttempts.inc({ status, provider });
                    break;
            }

            if (res.statusCode === 429) {
                authMetrics.rateLimitHits.inc({ endpoint: req.path });
            }

            endTimer();
        });

        next();
    };
};

// Track database operations
export const trackDbOperation = (operation: string, table: string) => {
    const startTime = performance.now();
    return {
        end: () => {
            const duration = (performance.now() - startTime) / 1000;
            authMetrics.dbOperations.observe({ operation, table }, duration);
        }
    };
};

// Track Redis operations
export const trackRedisOperation = (operation: string) => {
    const startTime = performance.now();
    return {
        end: () => {
            const duration = (performance.now() - startTime) / 1000;
            authMetrics.redisOperations.observe({ operation }, duration);
        }
    };
};

// Track errors
export const trackAuthError = (type: string, operation: string) => {
    authMetrics.errors.inc({ type, operation });
};

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
export const updateResourceUsage = (resource: string, type: string, value: number) => {
    authMetrics.resourceUsage.set({ resource, type }, value);
};

// Track rate limit hits
export const trackRateLimit = (endpoint: string) => {
    authMetrics.rateLimitHits.inc({ endpoint });
};
