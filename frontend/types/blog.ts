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
  /** SEO fields - always present on the Blog row, optional here since not every response includes them. */
  metaTitle?: string | null;
  metaDescription?: string | null;
  canonicalUrl?: string | null;
  version?: number;
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

/**
 * The shape blog-service's /search endpoint actually returns - a flat
 * Elasticsearch document (see backend/blog-service/src/utils/
 * elasticsearch.ts's BlogDocument), NOT the same nested shape as `Blog`
 * (which comes from Postgres via getBySlug/getMyBlogs). There is no
 * `author`/`category` object here, only flat id/name-ish fields, and
 * `tags` is `string[]`, not join rows. Rendering this with `Blog`'s shape
 * (e.g. `post.author?.username`) silently renders "Unknown" for
 * everything - confirmed live - since the field is actually
 * `authorUsername` at the top level.
 */
export interface BlogSearchResultItem {
  id: string;
  title: string;
  content: string;
  description: string | null;
  slug: string;
  authorId: string;
  authorUsername: string | null;
  categoryId: string | null;
  tags: string[];
  published: boolean;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  deletedAt: string | null;
  views: number;
  excerpt: string | null;
  coverImage: string | null;
  readTime: number;
  score: number;
}

export interface SearchBlogsResult {
  blogs: BlogSearchResultItem[];
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
  metaTitle?: string;
  metaDescription?: string;
  canonicalUrl?: string;
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

// --- Likes / bookmarks --------------------------------------------------

export interface LikeResult {
  liked: boolean;
  likesCount: number;
}

export interface BookmarkResult {
  bookmarked: boolean;
}

// --- Comments -------------------------------------------------------------

export interface CommentAuthor {
  id: string;
  username: string;
  profileImage: string | null;
}

export interface Comment {
  id: string;
  blogId: string;
  userId: string;
  content: string;
  parentId: string | null;
  user: CommentAuthor;
  replies?: Comment[];
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedComments {
  comments: Comment[];
  total: number;
  page: number;
  totalPages: number;
}

// --- Revisions --------------------------------------------------------

export interface BlogRevisionSummary {
  id: string;
  version: number;
  createdAt: string;
  createdBy: string;
  comment: string | null;
}

export interface BlogRevision extends BlogRevisionSummary {
  blogId: string;
  content: string;
}

// --- Categories -----------------------------------------------------------

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  icon: string | null;
  color: string | null;
  sortOrder: number;
  isHidden: boolean;
  children?: Category[];
}

export interface CreateCategoryInput {
  name: string;
  description?: string;
  parentId?: string;
  icon?: string;
  color?: string;
  sortOrder?: number;
}

export type UpdateCategoryInput = Partial<CreateCategoryInput>;

// --- Reporting --------------------------------------------------------

export interface ReportInput {
  reason: string;
}
