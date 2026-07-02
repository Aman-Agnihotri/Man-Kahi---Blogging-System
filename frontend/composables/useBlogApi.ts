import type {
  Blog,
  PaginatedBlogs,
  SearchBlogsParams,
  SearchBlogsResult,
  CreateBlogInput,
  UpdateBlogInput,
  PopularTag,
} from '~/types/blog';

function toFormData(input: CreateBlogInput | UpdateBlogInput): FormData {
  const form = new FormData();
  if (input.title !== undefined) form.set('title', input.title);
  if (input.content !== undefined) form.set('content', input.content);
  if (input.description !== undefined) form.set('description', input.description);
  if (input.categoryId !== undefined) form.set('categoryId', input.categoryId);
  if (input.published !== undefined) form.set('published', String(input.published));
  if (input.tags !== undefined) {
    input.tags.forEach((tag) => form.append('tags[]', tag));
  }
  if (input.image) form.set('image', input.image);
  return form;
}

export function useBlogApi() {
  const api = useApi();

  return {
    /** Full-text search via Elasticsearch. `query` is required by the backend. */
    search: (params: SearchBlogsParams) =>
      api.get<SearchBlogsResult>('/api/blogs/search', {
        query: params.query,
        page: params.page,
        limit: params.limit,
        category: params.category,
        tags: params.tags?.join(','),
        sortBy: params.sortBy,
      }),

    getBySlug: (slug: string) => api.get<Blog>(`/api/blogs/${slug}`),

    getPopularTags: () => api.get<PopularTag[]>('/api/blogs/tags/popular'),

    getSuggested: (blogId: string) => api.get<Blog[]>(`/api/blogs/suggested/${blogId}`),

    /** The current authenticated user's own blogs (includes drafts). */
    getMyBlogs: (page?: number, limit?: number) =>
      api.get<PaginatedBlogs>('/api/blogs/user', { page, limit }),

    /** A given user's publicly-visible blogs. */
    getUserBlogs: (userId: string, page?: number, limit?: number) =>
      api.get<PaginatedBlogs>(`/api/blogs/user/${userId}`, { page, limit }),

    create: (input: CreateBlogInput) => api.postForm<Blog>('/api/blogs', toFormData(input)),

    update: (id: string, input: UpdateBlogInput) => api.putForm<Blog>(`/api/blogs/${id}`, toFormData(input)),

    remove: (id: string) => api.del<{ message: string }>(`/api/blogs/${id}`),
  };
}
