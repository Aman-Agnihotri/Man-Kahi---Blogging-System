import { Request, Response, NextFunction } from 'express';
import { adminMetrics } from '../config/metrics';
import { performance } from 'perf_hooks';

// Global request tracking middleware
export const trackRequest = () => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const start = performance.now();
        const path = req.route ? req.route.path : req.path;
        
        // Track concurrent operations
        adminMetrics.concurrentOperations.inc({ operation_type: 'http_request' });
        
        res.on('finish', () => {
            const duration = (performance.now() - start) / 1000; // Convert to seconds
            const status = res.statusCode < 400 ? 'success' : 'failure';
            
            // Request rate
            adminMetrics.requestRate.inc({ 
                method: req.method, 
                path, 
                status 
            });
            
            // Response time
            adminMetrics.responseTime.observe(
                { method: req.method, path }, 
                duration
            );
            
            // Decrease concurrent operations
            adminMetrics.concurrentOperations.dec({ operation_type: 'http_request' });
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
            adminMetrics.dbOperations.observe({ operation, table }, duration);
        }
    };
};

// Track external service calls
export const trackExternalCall = (service: string, endpoint: string) => {
    const startTime = performance.now();
    adminMetrics.concurrentOperations.inc({ operation_type: 'external_call' });
    
    return {
        end: () => {
            const duration = (performance.now() - startTime) / 1000;
            adminMetrics.externalCalls.observe({ service, endpoint }, duration);
            adminMetrics.concurrentOperations.dec({ operation_type: 'external_call' });
        }
    };
};

// Track resource usage
export const updateResourceUsage = (resource: string, type: string, value: number) => {
    adminMetrics.resourceUsage.set({ resource, type }, value);
};

// Track admin operations with timing
export const trackAdminOperation = (operationType: string) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const start = performance.now();
        const endTimer = adminMetrics.operationDuration.startTimer({ operation: operationType });
        adminMetrics.concurrentOperations.inc({ operation_type: operationType });
        
        res.on('finish', () => {
            const status = res.statusCode < 400 ? 'success' : 'failure';
            const duration = (performance.now() - start) / 1000;
            
            adminMetrics.adminOperations.inc({ operation: operationType, status });
            adminMetrics.responseTime.observe({ 
                method: req.method, 
                path: req.route ? req.route.path : req.path 
            }, duration);
            
            endTimer();
            adminMetrics.concurrentOperations.dec({ operation_type: operationType });
        });

        next();
    };
};

// Track moderation actions
export const trackModerationAction = (actionType: string) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const endTimer = adminMetrics.operationDuration.startTimer({ operation: `moderation_${actionType}` });
        
        res.on('finish', () => {
            const status = res.statusCode < 400 ? 'success' : 'failure';
            adminMetrics.moderationActions.inc({ action_type: actionType, status });
            endTimer();
        });

        next();
    };
};

// Track user management actions
export const trackUserManagement = (actionType: string) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const endTimer = adminMetrics.operationDuration.startTimer({ operation: `user_${actionType}` });
        
        res.on('finish', () => {
            const status = res.statusCode < 400 ? 'success' : 'failure';
            adminMetrics.userManagementActions.inc({ action_type: actionType, status });
            endTimer();
        });

        next();
    };
};

// Track configuration changes
export const trackConfigChange = (component: string) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const endTimer = adminMetrics.operationDuration.startTimer({ operation: `config_${component}` });
        
        res.on('finish', () => {
            const status = res.statusCode < 400 ? 'success' : 'failure';
            adminMetrics.configChanges.inc({ component, status });
            endTimer();
        });

        next();
    };
};

// Track role operations
export const trackRoleOperation = (operation: string) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const endTimer = adminMetrics.operationDuration.startTimer({ operation: `role_${operation}` });
        
        res.on('finish', () => {
            const status = res.statusCode < 400 ? 'success' : 'failure';
            adminMetrics.roleOperations.inc({ operation, status });
            endTimer();
        });

        next();
    };
};

// Track dashboard access
export const trackDashboardAccess = (dashboard: string) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const status = res.statusCode < 400 ? 'success' : 'failure';
        adminMetrics.dashboardAccess.inc({ dashboard, status });
        next();
    };
};

// Track admin errors
export const trackAdminError = (errorType: string) => {
    adminMetrics.adminErrors.inc({ error_type: errorType });
};

// Update active admin sessions
// Track admin sessions
export const updateAdminSessions = (delta: number) => {
    adminMetrics.activeAdminSessions.inc(delta);
    if (delta === 1) {
        const sessionStart = Date.now();
        return {
            end: () => {
                const duration = (Date.now() - sessionStart) / 1000;
                adminMetrics.sessionDuration.observe(duration);
                adminMetrics.activeAdminSessions.dec();
            }
        };
    }
    return { end: () => {} };
};

// Track authentication attempts
export const trackAuthAttempt = (status: 'success' | 'failure') => {
    adminMetrics.authenticationAttempts.inc({ status });
};

// Track rate limit hits
export const trackRateLimit = (service: string) => {
    adminMetrics.rateLimitHits.inc({ service });
};

// Track request completion
export const trackRequestCompletion = (req: Request, res: Response) => {
    const path = req.route ? req.route.path : req.path;
    const method = req.method;
    const status = res.statusCode < 400 ? 'success' : 'failure';

    adminMetrics.requestRate.inc({
        method,
        path,
        status
    });

    if (res.statusCode === 429) {
        trackRateLimit('admin_service');
    }
};
