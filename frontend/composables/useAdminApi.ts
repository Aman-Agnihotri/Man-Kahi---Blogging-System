import type {
  DashboardStats,
  PaginatedAdminUsers,
  AdminUser,
  AdminRole,
  PaginatedAdminReports,
  AdminReport,
  PaginatedAuditLog,
} from '~/types/admin';
import type { Blog, PaginatedBlogs } from '~/types/blog';

export function useAdminApi() {
  const api = useApi();

  return {
    getDashboardStats: () => api.get<DashboardStats>('/api/admin/dashboard'),

    /** Lists blogs regardless of published state, for moderation. */
    listBlogs: (page?: number, limit?: number, published?: boolean) =>
      api.get<PaginatedBlogs>('/api/admin/blogs', {
        page,
        limit,
        published: published === undefined ? undefined : String(published),
      }),

    /** Moderation: hide (false) or restore (true) a blog's public visibility. */
    setBlogVisibility: (blogId: string, visible: boolean) =>
      api.put<Blog>(`/api/admin/blog/${blogId}/visibility`, { visible }),

    /** Hard takedown - distinct from setBlogVisibility(false), which only hides it. */
    deleteBlog: (blogId: string) => api.del<{ message: string }>(`/api/admin/blog/${blogId}`),

    // --- User management --------------------------------------------------

    getUsers: (page?: number, limit?: number, search?: string, status?: 'active' | 'suspended' | 'deleted') =>
      api.get<PaginatedAdminUsers>('/api/admin/users', { page, limit, search, status }),
    suspendUser: (userId: string, reason: string) =>
      api.put<AdminUser>(`/api/admin/users/${userId}/suspend`, { reason }),
    unsuspendUser: (userId: string) =>
      api.put<AdminUser>(`/api/admin/users/${userId}/unsuspend`),

    // --- Role management --------------------------------------------------

    getRoles: () => api.get<AdminRole[]>('/api/admin/roles'),
    assignRole: (userId: string, roleId: string) =>
      api.post<{ message: string }>(`/api/admin/users/${userId}/roles`, { roleId }),
    revokeRole: (userId: string, roleId: string) =>
      api.del<{ message: string }>(`/api/admin/users/${userId}/roles/${roleId}`),

    // --- Reported content ---------------------------------------------------

    getReports: (page?: number, limit?: number, status?: 'open' | 'resolved' | 'dismissed') =>
      api.get<PaginatedAdminReports>('/api/admin/reports', { page, limit, status }),
    resolveReport: (reportId: string, actionTaken?: string) =>
      api.put<AdminReport>(`/api/admin/reports/${reportId}/resolve`, { actionTaken }),
    dismissReport: (reportId: string) =>
      api.put<AdminReport>(`/api/admin/reports/${reportId}/dismiss`),

    // --- Audit log ------------------------------------------------------------

    getAuditLog: (page?: number, limit?: number, action?: string, actorId?: string) =>
      api.get<PaginatedAuditLog>('/api/admin/audit-log', { page, limit, action, actorId }),
  };
}
