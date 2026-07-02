export interface BlogAuthor {
  id: string;
  username: string;
  profileImage: string | null;
}

export interface BlogCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  color: string | null;
}

export interface BlogTagRef {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  icon: string | null;
}

export interface BlogTagJoin {
  id: string;
  blogId: string;
  tagId: string;
  tag: BlogTagRef;
}

export interface BlogAnalyticsSummary {
  views: number;
  uniqueViews: number;
  reads: number;
  readProgress: number;
  linkClicks: number;
  shareCount: number;
  likes: number;
  comments: number;
  shares: number;
  engagement: number;
}

export interface Blog {
  id: string;
  title: string;
  content: string;
  readTime: number;
  slug: string;
  createdAt: string;
  updatedAt: string;
  published: boolean;
  description: string | null;
  contentType: string;
  excerpt: string | null;
  coverImage: string | null;
  language: string;
  status: string;
  publishedAt: string | null;
  authorId: string;
  author?: BlogAuthor | null;
  categoryId: string | null;
  category?: BlogCategory | null;
  tags: BlogTagJoin[];
  analytics?: BlogAnalyticsSummary | null;
}

export interface PaginatedBlogs {
  blogs: Blog[];
  total: number;
  page: number;
  totalPages: number;
}

export interface SearchBlogsParams {
  /** Omit to list published blogs (e.g. sorted by recent) instead of full-text matching. */
  query?: string;
  page?: number;
  limit?: number;
  category?: string;
  tags?: string[];
  sortBy?: 'recent' | 'popular' | 'relevant';
}

export interface SearchBlogsResult {
  blogs: (Blog & { score: number })[];
  total: number;
  page: number;
  totalPages: number;
}

export interface CreateBlogInput {
  title: string;
  content: string;
  description?: string;
  categoryId?: string;
  tags?: string[];
  published?: boolean;
  image?: File | null;
}

export type UpdateBlogInput = Partial<CreateBlogInput>;

export interface PopularTag {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  icon: string | null;
}

/** Flattens a blog's tag join rows into plain tag names for display/forms. */
export function tagNames(blog: Pick<Blog, 'tags'>): string[] {
  return blog.tags.map((t) => t.tag.name);
}
