import { Request, Response, NextFunction } from 'express';
import { metrics, adminMetrics } from '@config/metrics';

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

// Track resource usage using shared metrics
export const trackResource = (resource: string, type: string) => 
  metrics.trackResource(resource, type);

// Track database operations using shared metrics
export const trackDbOperation = (operation: string, table: string) => 
  metrics.trackDatabaseOperation(operation, table);

// Track external service calls using shared metrics
export const trackExternalCall = (service: string, operation: string) => 
  metrics.trackExternalCall(service, operation);

// Track errors using shared metrics
export const trackError = (errorType: string, errorCode: string, component: string, correlationId?: string) => 
  metrics.trackError(errorType, errorCode, component, correlationId);

// Track admin-specific errors using both shared and admin metrics
export const trackAdminError = (errorCode: string) => {
  // Track in shared metrics
  metrics.trackError('admin', errorCode, 'admin-service');
  
  // Map error codes to admin metrics
  switch (errorCode) {
    case 'dashboard_stats_validation_error':
    case 'dashboard_stats_fetch_error':
      adminMetrics.dashboardAccess.inc({ dashboard: 'stats', status: 'failure' });
      break;
    case 'blog_analytics_validation_error':
    case 'blog_analytics_fetch_error':
      adminMetrics.moderationActions.inc({ action_type: 'view_analytics', status: 'failure' });
      break;
    case 'user_analytics_validation_error':
    case 'user_analytics_fetch_error':
    case 'user_not_found_error':
      adminMetrics.userManagementActions.inc({ action_type: 'view_analytics', status: 'failure' });
      break;
    case 'trending_content_validation_error':
    case 'trending_content_fetch_error':
      adminMetrics.moderationActions.inc({ action_type: 'view_trending', status: 'failure' });
      break;
    case 'tag_analytics_validation_error':
    case 'tag_analytics_fetch_error':
      adminMetrics.moderationActions.inc({ action_type: 'view_tag_analytics', status: 'failure' });
      break;
    case 'blog_not_found':
    case 'blog_not_found_error':
    case 'blog_visibility_update_error':
      adminMetrics.moderationActions.inc({ action_type: 'update_visibility', status: 'failure' });
      break;
    case 'analytics_service_error':
      adminMetrics.configChanges.inc({ component: 'analytics_service', status: 'failure' });
      break;
    default:
      adminMetrics.moderationActions.inc({ action_type: 'unknown', status: 'failure' });
  }
};

// Track admin-specific operations
export const trackAdminOperation = (operationType: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Start tracking operation with shared metrics
    const tracker = metrics.trackHttpRequest(req.method, req.path, parseInt(req.headers['content-length'] ?? '0', 10));
    
    res.on('finish', () => {
      const status = res.statusCode < 400 ? 'success' : 'failure';
      const responseSize = parseInt(res.getHeader('content-length')?.toString() ?? '0', 10);
      
      // End shared metrics tracking
      tracker.end(res.statusCode, responseSize);
      
      // Track in admin-specific metrics based on operation type
      switch (operationType) {
        case 'moderation':
          adminMetrics.moderationActions.inc({ action_type: req.path, status });
          break;
        case 'user_management':
          adminMetrics.userManagementActions.inc({ action_type: req.path, status });
          break;
        case 'config':
          adminMetrics.configChanges.inc({ component: req.path, status });
          break;
        case 'role':
          adminMetrics.roleOperations.inc({ operation: req.path, status });
          break;
      }

      // Track rate limit hits in admin metrics
      if (res.statusCode === 429) {
        adminMetrics.configChanges.inc({ component: 'rate_limit', status: 'failure' });
      }
    });

    next();
  };
};

// Track dashboard access
export const trackDashboardAccess = (dashboard: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const tracker = metrics.trackHttpRequest(req.method, req.path, parseInt(req.headers['content-length'] ?? '0', 10));
    
    res.on('finish', () => {
      const status = res.statusCode < 400 ? 'success' : 'failure';
      const responseSize = parseInt(res.getHeader('content-length')?.toString() ?? '0', 10);
      
      tracker.end(res.statusCode, responseSize);
      adminMetrics.dashboardAccess.inc({ dashboard, status });
    });

    next();
  };
};

// Track admin sessions
export const trackAdminSession = () => {
  adminMetrics.activeAdminSessions.inc();
  const sessionStart = Date.now();

  return {
    end: () => {
      const duration = (Date.now() - sessionStart) / 1000;
      adminMetrics.sessionDuration.observe(duration);
      adminMetrics.activeAdminSessions.dec();
    }
  };
};

// Setup resource monitoring
export const setupResourceMonitoring = (interval = 5000) => {
  // Set up resource usage tracking
  const resourceTracker = metrics.trackResource('system', 'admin');
  
  setInterval(() => {
    const usage = process.memoryUsage();
    resourceTracker.setUsage(usage.heapUsed / 1024 / 1024, 'MB'); // Convert to MB
  }, interval);
};
