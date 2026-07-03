export interface OverallStats {
  views: number;
  uniqueViews: number;
  reads: number;
  linkClicks: number;
  avgReadProgress: number;
  avgEngagement: number;
  trackedBlogs: number;
}

export interface DashboardStats {
  totalBlogs: number;
  totalUsers: number;
  analytics: OverallStats;
}

export interface ApiError {
  message: string;
  details?: string;
  errors?: Array<{ field: string; message: string }>;
  status?: number;
}

// --- User management ----------------------------------------------------

export interface AdminUser {
  id: string;
  username: string;
  email: string;
  createdAt: string;
  lastLoginAt: string | null;
  suspendedAt: string | null;
  deletedAt: string | null;
}

export interface PaginatedAdminUsers {
  users: AdminUser[];
  total: number;
  page: number;
  totalPages: number;
}

// --- Role management --------------------------------------------------

export interface AdminPermission {
  id: string;
  name: string;
  slug: string;
}

export interface AdminRole {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isSystem: boolean;
  permissions: AdminPermission[];
}

// --- Reported content ---------------------------------------------------

export interface AdminReport {
  id: string;
  targetType: 'blog' | 'comment';
  targetId: string;
  reason: string;
  status: 'open' | 'resolved' | 'dismissed';
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  reporter: {
    id: string;
    username: string;
  };
}

export interface PaginatedAdminReports {
  reports: AdminReport[];
  total: number;
  page: number;
  totalPages: number;
}

// --- Audit log ------------------------------------------------------------

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actor: {
    id: string;
    username: string;
  };
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface PaginatedAuditLog {
  logs: AuditLogEntry[];
  total: number;
  page: number;
  totalPages: number;
}
