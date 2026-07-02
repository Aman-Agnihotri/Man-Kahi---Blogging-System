import type { DashboardStats } from '~/types/admin';
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
  };
}
