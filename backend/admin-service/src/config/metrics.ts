import { Counter, Gauge, Histogram } from 'prom-client';
import { createServiceMetrics, register } from '@shared/config/metrics';

// Initialize shared metrics with service name
export const metrics = createServiceMetrics('admin');

// Admin-specific metrics that complement the shared metrics
export const adminMetrics = {
  // Content moderation metrics
  moderationActions: new Counter({
    name: 'admin_moderation_actions_total',
    help: 'Count of content moderation actions',
    labelNames: ['action_type', 'status'],
    registers: [register]
  }),

  // User management metrics
  userManagementActions: new Counter({
    name: 'admin_user_management_actions_total',
    help: 'Count of user management actions',
    labelNames: ['action_type', 'status'],
    registers: [register]
  }),

  // System configuration changes
  configChanges: new Counter({
    name: 'admin_config_changes_total',
    help: 'Count of system configuration changes',
    labelNames: ['component', 'status'],
    registers: [register]
  }),

  // Role management metrics
  roleOperations: new Counter({
    name: 'admin_role_operations_total',
    help: 'Count of role management operations',
    labelNames: ['operation', 'status'],
    registers: [register]
  }),

  // Dashboard access tracking
  dashboardAccess: new Counter({
    name: 'admin_dashboard_access_total',
    help: 'Count of admin dashboard access',
    labelNames: ['dashboard', 'status'],
    registers: [register]
  }),

  // Active admin sessions
  activeAdminSessions: new Gauge({
    name: 'admin_active_sessions',
    help: 'Number of active admin sessions',
    registers: [register]
  }),

  // Session duration
  sessionDuration: new Histogram({
    name: 'admin_session_duration_seconds',
    help: 'Duration of admin sessions',
    buckets: [60, 300, 900, 1800, 3600], // 1m, 5m, 15m, 30m, 1h
    registers: [register]
  })
};

// Re-export metrics endpoint handlers from shared config
export { register, metricsHandler, metricsEnabled } from '@shared/config/metrics';
