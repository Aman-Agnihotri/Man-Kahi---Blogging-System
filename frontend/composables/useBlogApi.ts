import type {
  Blog,
  PaginatedBlogs,
  SearchBlogsParams,
  SearchBlogsResult,
  CreateBlogInput,
  UpdateBlogInput,
  PopularTag,
  LikeResult,
  BookmarkResult,
  Comment,
  PaginatedComments,
  BlogRevisionSummary,
  BlogRevision,
  Category,
  CreateCategoryInput,
  UpdateCategoryInput,
  ReportInput,
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
  if (input.metaTitle !== undefined) form.set('metaTitle', input.metaTitle);
  if (input.metaDescription !== undefined) form.set('metaDescription', input.metaDescription);
  if (input.canonicalUrl !== undefined) form.set('canonicalUrl', input.canonicalUrl);
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

    getTrending: (limit?: number) => api.get<Blog[]>('/api/blogs/trending', { limit }),

    /** Postgres-realtime recent blogs (flat envelope, mirrors `search`). */
    getRecent: (page?: number, limit?: number) =>
      api.get<SearchBlogsResult>('/api/blogs/recent', { page, limit }),

    // --- Likes / bookmarks -----------------------------------------------

    like: (blogId: string) => api.post<LikeResult>(`/api/blogs/${blogId}/like`),
    unlike: (blogId: string) => api.del<LikeResult>(`/api/blogs/${blogId}/like`),
    bookmark: (blogId: string) => api.post<BookmarkResult>(`/api/blogs/${blogId}/bookmark`),
    unbookmark: (blogId: string) => api.del<BookmarkResult>(`/api/blogs/${blogId}/bookmark`),
    getBookmarks: (page?: number, limit?: number) =>
      api.get<PaginatedBlogs>('/api/blogs/bookmarks', { page, limit }),

    // --- Comments --------------------------------------------------------

    getComments: (blogId: string, page?: number, limit?: number) =>
      api.get<PaginatedComments>(`/api/blogs/${blogId}/comments`, { page, limit }),
    createComment: (blogId: string, content: string, parentId?: string) =>
      api.post<Comment>(`/api/blogs/${blogId}/comments`, { content, parentId }),
    updateComment: (commentId: string, content: string) =>
      api.put<Comment>(`/api/blogs/comments/${commentId}`, { content }),
    deleteComment: (commentId: string) =>
      api.del<{ id: string }>(`/api/blogs/comments/${commentId}`),
    reportComment: (commentId: string, input: ReportInput) =>
      api.post<{ id: string }>(`/api/blogs/comments/${commentId}/report`, input),

    // --- Reporting ------------------------------------------------------

    reportBlog: (blogId: string, input: ReportInput) =>
      api.post<{ id: string }>(`/api/blogs/${blogId}/report`, input),

    // --- Revisions -------------------------------------------------------

    getRevisions: (blogId: string) =>
      api.get<BlogRevisionSummary[]>(`/api/blogs/${blogId}/revisions`),
    getRevision: (blogId: string, revisionId: string) =>
      api.get<BlogRevision>(`/api/blogs/${blogId}/revisions/${revisionId}`),
    restoreRevision: (blogId: string, revisionId: string) =>
      api.post<Blog>(`/api/blogs/${blogId}/revisions/${revisionId}/restore`),

    // --- Categories ------------------------------------------------------

    getCategories: () => api.get<Category[]>('/api/blogs/categories'),
    createCategory: (input: CreateCategoryInput) =>
      api.post<Category>('/api/blogs/categories', input),
    updateCategory: (id: string, input: UpdateCategoryInput) =>
      api.put<Category>(`/api/blogs/categories/${id}`, input),
    deleteCategory: (id: string) =>
      api.del<{ message: string }>(`/api/blogs/categories/${id}`),

    // --- Reading progress / share tracking (fire-and-forget, best effort) --

    trackReadProgress: (blogId: string, progress: number) =>
      api.post('/api/blogs/analytics/progress', { blogId, progress }).catch(() => undefined),
    trackLinkClick: (blogId: string, url: string) =>
      api.post('/api/blogs/analytics/link', { blogId, url }).catch(() => undefined),
  };
}
