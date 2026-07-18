import { prisma } from '@shared/utils/prismaClient'
import { processMarkdown, validateMarkdown } from '@utils/markdown'
import { indexBlog, updateBlogIndex } from '@utils/elasticsearch'
import { redis, blogCache, searchCache } from '@shared/config/redis'
import { processImage } from '@config/upload'
import slugify from 'slugify'
import logger from '@shared/utils/logger'

interface CreateBlogInput {
  title: string
  content: string
  description?: string
  categoryId?: string
  tags?: string[]
  published?: boolean
  authorId: string
  file?: Express.Multer.File
  metaTitle?: string
  metaDescription?: string
  canonicalUrl?: string
}

interface UpdateBlogInput {
  title?: string
  content?: string
  description?: string
  categoryId?: string
  tags?: string[]
  published?: boolean
  file?: Express.Multer.File
  metaTitle?: string
  metaDescription?: string
  canonicalUrl?: string
}

interface BlogVisibilitySnapshot {
  id: string
  authorId: string
  published: boolean
  deletedAt?: Date | string | null
}

export class BlogService {
  private canReadBlog(blog: BlogVisibilitySnapshot, userId?: string): boolean {
    return blog.published || (!!userId && blog.authorId === userId)
  }

  // Naive whitespace word count over the markdown source, rounded up to a
  // whole minute at 200wpm (never below 1 minute for non-empty content).
  private computeReadTime(markdown: string): number {
    const wordCount = markdown.trim().split(/\s+/).filter(Boolean).length
    return Math.max(1, Math.ceil(wordCount / 200))
  }

  // Deduped, fire-and-forget view registration: a Redis NX key scopes one
  // counted view per (blogId, viewerId) per 24h window. Only the visitor
  // that actually wins the NX set gets to increment Postgres, so repeat
  // visits within the window don't inflate the count. Redis failures fail
  // closed (skip the count, never overcount) and are swallowed - view
  // counting must never break serving the blog itself.
  private async registerView(blogId: string, slug: string, viewerId: string): Promise<void> {
    try {
      const result = await redis.set(`blog:viewed:${blogId}:${viewerId}`, '1', 'EX', 86400, 'NX')
      if (result !== 'OK') {
        return
      }
      const updated = await prisma.blogAnalytics.update({
        where: { blogId },
        data: { views: { increment: 1 } },
        select: { views: true },
      })
      await Promise.all([
        blogCache.invalidate(slug),
        updateBlogIndex(blogId, { views: updated.views }),
      ])
    } catch (error) {
      logger.error({ err: error }, 'Error registering blog view')
    }
  }

  // Snapshots the blog's current (pre-update) content as a BlogRevision row.
  // Shared by updateBlog (auto-capture on content change) and
  // restoreRevision (capture what was live before rewriting it).
  private async captureRevision(
    blogId: string,
    authorId: string,
    currentContent: string,
    currentContentMarkdown: string | null,
    currentVersion: number
  ): Promise<void> {
    await prisma.blogRevision.create({
      data: {
        blogId,
        version: currentVersion,
        content: currentContent,
        contentMarkdown: currentContentMarkdown,
        createdBy: authorId,
      },
    });
  }

  private async generateUniqueSlug(title: string, excludeBlogId?: string): Promise<string> {
    const baseSlug = slugify(title, { lower: true, strict: true }) || 'post'
    let suffix = 0

    while (true) {
      const suffixText = suffix === 0 ? '' : `-${suffix}`
      const slug = `${baseSlug.slice(0, 200 - suffixText.length)}${suffixText}`
      const existingBlog = await prisma.blog.findFirst({
        where: {
          slug,
          ...(excludeBlogId ? { id: { not: excludeBlogId } } : {}),
        },
        select: { id: true },
      })

      if (!existingBlog) {
        return slug
      }

      suffix += 1
    }
  }

  async createBlog(data: CreateBlogInput) {
    const startTime = Date.now();
    logger.debug({ title: data.title, authorId: data.authorId }, 'Creating new blog post');

    // Validate markdown content
    const validation = validateMarkdown(data.content);
    if (!validation.isValid) {
      logger.error('Invalid markdown content in blog creation');
      throw new Error('Invalid markdown content');
    }

    // Process markdown
    const processedContent = processMarkdown(data.content);

    // Generate slug
    const slug = await this.generateUniqueSlug(data.title);

    // Process image if provided
    let coverImage: string | undefined;
    if (data.file) {
      logger.debug('Processing blog image');
      coverImage = await processImage(data.file);
    }

    // Create blog post
    logger.debug('Creating blog post in database');
    const blog = await prisma.blog.create({
      data: {
        title: data.title,
        slug,
        content: processedContent,
        contentMarkdown: data.content,
        readTime: this.computeReadTime(data.content),
        description: data.description,
        published: data.published ?? false,
        publishedAt: data.published ? new Date() : null,
        authorId: data.authorId,
        ...(coverImage && { coverImage }),
        ...(data.categoryId && { categoryId: data.categoryId }),
        ...(data.metaTitle !== undefined && { metaTitle: data.metaTitle }),
        ...(data.metaDescription !== undefined && { metaDescription: data.metaDescription }),
        ...(data.canonicalUrl !== undefined && { canonicalUrl: data.canonicalUrl }),
        ...(data.tags && {
          tags: {
            create: data.tags.map(tagName => ({
              tag: {
                connectOrCreate: {
                  where: { name: tagName },
                  create: {
                    name: tagName,
                    slug: slugify(tagName, { lower: true, strict: true }),
                  },
                },
              },
            })),
          },
        }),
        analytics: {
          create: {
            views: 0,
            uniqueViews: 0,
            reads: 0,
          },
        },
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            profileImage: true,
          },
        },
        category: true,
        tags: {
          include: {
            tag: true,
          },
        },
        analytics: true,
      },
    });

    // Index in Elasticsearch
    logger.debug(`Indexing blog ${blog.id} in Elasticsearch`);
    await indexBlog({
      id: blog.id,
      title: blog.title,
      content: blog.content,
      description: blog.description,
      slug: blog.slug,
      authorId: blog.authorId,
      authorUsername: blog.author?.username ?? null,
      categoryId: blog.categoryId,
      tags: blog.tags.map(t => t.tag.name),
      published: blog.published,
      createdAt: blog.createdAt,
      updatedAt: blog.updatedAt,
      publishedAt: blog.publishedAt,
      deletedAt: null,
      views: blog.analytics?.views ?? 0,
      excerpt: blog.excerpt,
      coverImage: blog.coverImage,
      readTime: blog.readTime,
    });

    // Cache the blog
    logger.debug(`Caching blog with slug ${slug}`);
    await blogCache.set(slug, JSON.stringify(blog));
    await searchCache.invalidateAll();
    logger.info(`Blog created successfully in ${Date.now() - startTime}ms: ${blog.id}`);

    return blog;
  }

  async getBlogBySlug(slug: string, userId?: string, viewerId?: string) {
    logger.debug(`Fetching blog by slug: ${slug}`);
    // Try to get from cache first
    const cachedBlog = await blogCache.get(slug);
    if (cachedBlog) {
      const blog = JSON.parse(cachedBlog) as BlogVisibilitySnapshot & {
        analytics?: { views?: number } | null
        content: string
        contentMarkdown?: string | null
        readTime?: number | null
      };
      // Check visibility
      if (blog.deletedAt || !this.canReadBlog(blog, userId)) {
        logger.warn(`Unauthorized access attempt for unpublished blog: ${slug}`);
        throw new Error('Blog not found');
      }
      // Lazy backfill: cached copies predating read-time support (or
      // created before this fix) won't have one. In-memory only here -
      // the DB branch below is what actually heals the persisted row.
      if (!blog.readTime) {
        blog.readTime = this.computeReadTime(blog.contentMarkdown ?? blog.content)
      }
      // Register (deduped) view in background
      if (blog.published && viewerId) {
        this.registerView(blog.id, slug, viewerId);
      }
      return blog;
    }

    // If not in cache, get from database
    const blog = await prisma.blog.findUnique({
      where: {
        slug,
        deletedAt: null,
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            profileImage: true,
          },
        },
        category: true,
        tags: {
          include: {
            tag: true,
          },
        },
        analytics: true,
      },
    });

    if (!blog) {
      logger.warn(`Blog not found with slug: ${slug}`);
      throw new Error('Blog not found');
    }

    if (!this.canReadBlog(blog, userId)) {
      logger.warn(`Unauthorized access attempt for unpublished blog: ${slug}`);
      throw new Error('Blog not found');
    }

    // Lazy backfill: heal rows written before read-time support existed.
    // Persist it (fire-and-forget) BEFORE caching so the cached copy is
    // healed too, instead of caching the stale readTime-less row.
    if (!blog.readTime) {
      blog.readTime = this.computeReadTime(blog.contentMarkdown ?? blog.content)
      prisma.blog.update({
        where: { id: blog.id },
        data: { readTime: blog.readTime },
      }).catch((error: Error) => logger.error({ err: error }, 'Error persisting backfilled read time'));
      void updateBlogIndex(blog.id, { readTime: blog.readTime });
    }

    // Cache the blog
    await blogCache.set(slug, JSON.stringify(blog));

    // Register (deduped) view in background and update Elasticsearch
    if (blog.published && viewerId) {
      this.registerView(blog.id, slug, viewerId);
    }

    return blog;
  }

  async updateBlog(id: string, authorId: string, data: UpdateBlogInput) {
    const startTime = Date.now();
    logger.debug({ authorId }, `Updating blog: ${id}`);

    // Check blog exists and user is author
    const blog = await prisma.blog.findUnique({
      where: { id },
      select: {
        authorId: true,
        slug: true,
        published: true,
        publishedAt: true,
        content: true,
        contentMarkdown: true,
        version: true,
        tags: {
          include: {
            tag: true,
          },
        },
      },
    });

    if (!blog) {
      logger.warn(`Blog not found for update: ${id}`);
      throw new Error('Blog not found');
    }

    if (blog.authorId !== authorId) {
      logger.warn(`Unauthorized blog update attempt for ${id} by ${authorId}`);
      throw new Error('Not authorized');
    }

    // Process content if provided
    let processedContent = undefined;
    if (data.content) {
      const validation = validateMarkdown(data.content);
      if (!validation.isValid) {
        logger.error('Invalid markdown content in blog update');
        throw new Error('Invalid markdown content');
      }
      processedContent = processMarkdown(data.content);
    }

    // Capture a snapshot of the pre-update content as a revision, but only
    // when the (processed) content is actually changing - resubmitting the
    // same content shouldn't create a no-op revision entry.
    const isContentChanging = processedContent !== undefined && processedContent !== blog.content;
    if (isContentChanging) {
      await this.captureRevision(id, authorId, blog.content, blog.contentMarkdown, blog.version);
    }

    let coverImage: string | undefined;
    if (data.file) {
      logger.debug('Processing updated blog image');
      coverImage = await processImage(data.file);
    }

    const updatedSlug = data.title
      ? await this.generateUniqueSlug(data.title, id)
      : undefined

    // First transition from unpublished to published sets publishedAt;
    // it's never set at all otherwise, and re-publishing shouldn't reset it.
    const isFirstPublish = data.published === true && !blog.published && !blog.publishedAt

    // Update blog
    const updatedBlog = await prisma.blog.update({
      where: { id },
      data: {
        ...(data.title && {
          title: data.title,
          slug: updatedSlug,
        }),
        ...(processedContent && { content: processedContent, contentMarkdown: data.content }),
        ...(isContentChanging && { version: blog.version + 1, readTime: this.computeReadTime(data.content!) }),
        ...(coverImage && { coverImage }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.published !== undefined && { published: data.published }),
        ...(isFirstPublish && { publishedAt: new Date() }),
        ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
        ...(data.metaTitle !== undefined && { metaTitle: data.metaTitle }),
        ...(data.metaDescription !== undefined && { metaDescription: data.metaDescription }),
        ...(data.canonicalUrl !== undefined && { canonicalUrl: data.canonicalUrl }),
        ...(data.tags && {
          tags: {
            deleteMany: {},
            create: data.tags.map(tagName => ({
              tag: {
                connectOrCreate: {
                  where: { name: tagName },
                  create: {
                    name: tagName,
                    slug: slugify(tagName, { lower: true, strict: true }),
                  },
                },
              },
            })),
          },
        }),
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            profileImage: true,
          },
        },
        category: true,
        tags: {
          include: {
            tag: true,
          },
        },
        analytics: true,
      },
    });

    // Update Elasticsearch
    logger.debug(`Updating blog ${id} in Elasticsearch`);
    await updateBlogIndex(id, {
      title: updatedBlog.title,
      content: updatedBlog.content,
      description: updatedBlog.description,
      slug: updatedBlog.slug,
      categoryId: updatedBlog.categoryId,
      tags: updatedBlog.tags.map(t => t.tag.name),
      published: updatedBlog.published,
      updatedAt: updatedBlog.updatedAt,
      publishedAt: updatedBlog.publishedAt,
      excerpt: updatedBlog.excerpt,
      coverImage: updatedBlog.coverImage,
      readTime: updatedBlog.readTime,
    });

    // Invalidate old cache and cache updated blog
    logger.debug(`Updating cache for blog ${id}`);
    await Promise.all([
      blogCache.invalidate(blog.slug),
      updatedSlug ? blogCache.invalidate(updatedSlug) : null,
      blogCache.set(updatedBlog.slug, JSON.stringify(updatedBlog)),
      searchCache.invalidateAll(),
    ]);

    logger.info(`Blog updated successfully in ${Date.now() - startTime}ms: ${id}`);
    return updatedBlog;
  }

  // Admin moderation path - unlike updateBlog, deliberately has no
  // author-ownership check (the route is gated on the admin role instead),
  // and only ever touches published/publishedAt. Reuses the same
  // Elasticsearch reindex + Redis cache invalidation as updateBlog so a
  // hidden blog actually disappears from search/home instead of just
  // flipping a column no reader-facing query paths re-check.
  async setVisibility(id: string, published: boolean) {
    const startTime = Date.now();
    logger.debug({ published }, `Admin updating blog visibility: ${id}`);

    const blog = await prisma.blog.findUnique({
      where: { id },
      select: { slug: true, published: true, publishedAt: true },
    });

    if (!blog) {
      logger.warn(`Blog not found for visibility update: ${id}`);
      throw new Error('Blog not found');
    }

    const isFirstPublish = published === true && !blog.published && !blog.publishedAt;

    const updatedBlog = await prisma.blog.update({
      where: { id },
      data: {
        published,
        ...(isFirstPublish && { publishedAt: new Date() }),
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            profileImage: true,
          },
        },
        category: true,
        tags: {
          include: {
            tag: true,
          },
        },
        analytics: true,
      },
    });

    await updateBlogIndex(id, {
      published: updatedBlog.published,
      publishedAt: updatedBlog.publishedAt,
    });

    await Promise.all([
      blogCache.invalidate(blog.slug),
      blogCache.set(updatedBlog.slug, JSON.stringify(updatedBlog)),
      searchCache.invalidateAll(),
    ]);

    logger.info(`Blog visibility updated in ${Date.now() - startTime}ms: ${id}`);
    return updatedBlog;
  }

  async deleteBlog(id: string, authorId: string) {
    logger.debug({ authorId }, `Attempting to delete blog: ${id}`);

    // Check blog exists and user is author
    const blog = await prisma.blog.findUnique({
      where: { id },
      select: { id: true, authorId: true, slug: true, published: true }
    });

    if (!blog) {
      logger.warn(`Blog not found for deletion: ${id}`);
      throw new Error('Blog not found');
    }

    if (blog.authorId !== authorId) {
      logger.warn(`Unauthorized blog deletion attempt for ${id} by ${authorId}`);
      throw new Error('Not authorized');
    }

    logger.debug(`Soft deleting blog ${id} and cleaning up references`);
    const deletedAt = new Date();
    await prisma.blog.update({
      where: { id },
      data: { deletedAt },
    });

    await Promise.all([
      blogCache.invalidate(blog.slug),
      updateBlogIndex(id, { deletedAt }),
      searchCache.invalidateAll(),
    ]);

    logger.info(`Blog deleted successfully: ${id}`);
    return blog;
  }

  // Admin moderation takedown - deliberately no author-ownership check (the
  // route is gated on the admin role instead), mirroring setVisibility's
  // approach exactly. Reuses the same soft-delete + reindex + cache
  // invalidation as the author-initiated deleteBlog above.
  async adminDelete(id: string) {
    logger.debug(`Admin deleting blog: ${id}`);

    const blog = await prisma.blog.findUnique({
      where: { id },
      select: { id: true, slug: true, published: true },
    });

    if (!blog) {
      logger.warn(`Blog not found for admin deletion: ${id}`);
      throw new Error('Blog not found');
    }

    const deletedAt = new Date();
    await prisma.blog.update({
      where: { id },
      data: { deletedAt },
    });

    await Promise.all([
      blogCache.invalidate(blog.slug),
      updateBlogIndex(id, { deletedAt }),
      searchCache.invalidateAll(),
    ]);

    logger.info(`Blog admin-deleted successfully: ${id}`);
    return blog;
  }

  // --- Likes ---------------------------------------------------------

  async likeBlog(blogId: string, userId: string) {
    const blog = await prisma.blog.findUnique({
      where: { id: blogId },
      select: { id: true, slug: true, deletedAt: true, published: true, authorId: true },
    });
    // Same visibility rule as reading a blog by slug: a draft is only
    // interactable by its own author. Without this, any authenticated
    // user could like/bookmark/comment on someone else's unpublished
    // draft just by guessing or otherwise obtaining its ID.
    if (!blog || blog.deletedAt || !this.canReadBlog(blog, userId)) {
      throw new Error('Blog not found');
    }

    const existingLike = await prisma.like.findUnique({
      where: { blogId_userId: { blogId, userId } },
    });

    if (existingLike) {
      const analytics = await prisma.blogAnalytics.findUnique({
        where: { blogId },
        select: { likes: true },
      });
      return { liked: true, likesCount: analytics?.likes ?? 0 };
    }

    await prisma.like.create({ data: { blogId, userId } });
    const analytics = await prisma.blogAnalytics.update({
      where: { blogId },
      data: { likes: { increment: 1 } },
      select: { likes: true },
    });
    // The blog-by-slug response (and its embedded analytics.likes) is
    // Redis-cached on read - without invalidating it here, a post viewed
    // even once before being liked would keep showing its pre-like count
    // until the cache naturally expired.
    await blogCache.invalidate(blog.slug);

    return { liked: true, likesCount: analytics.likes };
  }

  async unlikeBlog(blogId: string, userId: string) {
    // Deliberately no canReadBlog visibility check here (unlike likeBlog):
    // removing your own prior like must stay possible even if the blog
    // was unpublished after you liked it - you already know it exists,
    // there's no new information disclosed, and otherwise a like placed
    // while public would become permanently un-removable via the API.
    const blog = await prisma.blog.findUnique({
      where: { id: blogId },
      select: { id: true, slug: true, deletedAt: true },
    });
    if (!blog || blog.deletedAt) {
      throw new Error('Blog not found');
    }

    const existingLike = await prisma.like.findUnique({
      where: { blogId_userId: { blogId, userId } },
    });

    if (!existingLike) {
      const analytics = await prisma.blogAnalytics.findUnique({
        where: { blogId },
        select: { likes: true },
      });
      return { liked: false, likesCount: analytics?.likes ?? 0 };
    }

    await prisma.like.delete({ where: { id: existingLike.id } });
    const analytics = await prisma.blogAnalytics.update({
      where: { blogId },
      data: { likes: { decrement: 1 } },
      select: { likes: true },
    });
    await blogCache.invalidate(blog.slug);

    return { liked: false, likesCount: analytics.likes };
  }

  // --- Bookmarks -------------------------------------------------------

  async bookmarkBlog(blogId: string, userId: string) {
    const blog = await prisma.blog.findUnique({
      where: { id: blogId },
      select: { id: true, deletedAt: true, published: true, authorId: true },
    });
    if (!blog || blog.deletedAt || !this.canReadBlog(blog, userId)) {
      throw new Error('Blog not found');
    }

    const existing = await prisma.bookmark.findUnique({
      where: { blogId_userId: { blogId, userId } },
    });
    if (!existing) {
      await prisma.bookmark.create({ data: { blogId, userId } });
    }

    return { bookmarked: true };
  }

  async unbookmarkBlog(blogId: string, userId: string) {
    // Same reasoning as unlikeBlog: no visibility check, removing your
    // own bookmark must stay possible regardless of current visibility.
    const blog = await prisma.blog.findUnique({
      where: { id: blogId },
      select: { id: true, deletedAt: true },
    });
    if (!blog || blog.deletedAt) {
      throw new Error('Blog not found');
    }

    const existing = await prisma.bookmark.findUnique({
      where: { blogId_userId: { blogId, userId } },
    });
    if (existing) {
      await prisma.bookmark.delete({ where: { id: existing.id } });
    }

    return { bookmarked: false };
  }

  async getUserBookmarks(userId: string, page = 1, limit = 10) {
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error('Invalid pagination');
    }

    const where = { userId, blog: { deletedAt: null } };

    const [bookmarks, total] = await Promise.all([
      prisma.bookmark.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          blog: {
            include: {
              author: { select: { id: true, username: true, profileImage: true } },
              category: true,
              tags: { include: { tag: true } },
              analytics: true,
            },
          },
        },
      }),
      prisma.bookmark.count({ where }),
    ]);

    return {
      blogs: bookmarks.map((b: { blog: unknown }) => b.blog),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  // --- Trending ----------------------------------------------------------

  // Not Redis-cached for this first pass - could add a short-TTL cache
  // (blogCache/searchCache already exist) later if traffic warranted it.
  async getTrendingBlogs(limit: number) {
    logger.debug(`Fetching trending blogs, limit=${limit}`);
    return prisma.blog.findMany({
      where: { published: true, deletedAt: null },
      orderBy: { analytics: { views: 'desc' } },
      take: limit,
      include: {
        author: { select: { id: true, username: true, profileImage: true } },
        category: true,
        tags: { include: { tag: true } },
        analytics: true,
      },
    });
  }

  // --- Recent (realtime Featured feed) --------------------------------------

  // Postgres-realtime counterpart to ES-backed search 'recent' sort - reads
  // straight from the DB so Featured never shows stale ES-cached counters.
  // Not Redis-cached for this first pass, mirrors getTrendingBlogs above.
  async getRecentBlogs(page: number, limit: number) {
    logger.debug(`Fetching recent blogs, page=${page}, limit=${limit}`);
    const [blogs, total] = await prisma.$transaction([
      prisma.blog.findMany({
        where: { published: true, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          author: { select: { id: true, username: true, profileImage: true } },
          category: true,
          tags: { include: { tag: true } },
          analytics: true,
        },
      }),
      prisma.blog.count({ where: { published: true, deletedAt: null } }),
    ]);

    const mapped = blogs.map((blog: typeof blogs[number]) => ({
      id: blog.id,
      title: blog.title,
      content: blog.content,
      description: blog.description,
      slug: blog.slug,
      authorId: blog.authorId,
      authorUsername: blog.author?.username ?? null,
      categoryId: blog.categoryId,
      tags: blog.tags.map((t: { tag: { name: string } }) => t.tag.name),
      published: blog.published,
      createdAt: blog.createdAt,
      updatedAt: blog.updatedAt,
      publishedAt: blog.publishedAt,
      deletedAt: blog.deletedAt,
      views: blog.analytics?.views ?? 0,
      excerpt: blog.excerpt,
      coverImage: blog.coverImage,
      readTime: blog.readTime || this.computeReadTime(blog.contentMarkdown ?? blog.content),
      score: 0,
    }));

    return {
      blogs: mapped,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  // --- Reporting -----------------------------------------------------------

  async reportBlog(blogId: string, reporterId: string, reason: string) {
    const blog = await prisma.blog.findUnique({
      where: { id: blogId },
      select: { id: true, deletedAt: true },
    });
    if (!blog || blog.deletedAt) {
      throw new Error('Blog not found');
    }

    const existingOpenReport = await prisma.report.findFirst({
      where: { targetType: 'blog', targetId: blogId, reporterId, status: 'open' },
    });
    if (existingOpenReport) {
      throw new Error('Report already exists');
    }

    return prisma.report.create({
      data: { targetType: 'blog', targetId: blogId, reporterId, reason },
    });
  }

  // --- Revisions -----------------------------------------------------------

  async listRevisions(blogId: string, requesterId: string, requesterRoles: string[]) {
    const blog = await prisma.blog.findUnique({
      where: { id: blogId },
      select: { id: true, authorId: true },
    });
    if (!blog) {
      throw new Error('Blog not found');
    }

    const isAdmin = requesterRoles.some(role => role.toLowerCase() === 'admin');
    if (blog.authorId !== requesterId && !isAdmin) {
      throw new Error('Not authorized');
    }

    return prisma.blogRevision.findMany({
      where: { blogId },
      orderBy: { version: 'desc' },
      select: { id: true, version: true, createdAt: true, createdBy: true, comment: true },
    });
  }

  async getRevision(blogId: string, revisionId: string, requesterId: string, requesterRoles: string[]) {
    const blog = await prisma.blog.findUnique({
      where: { id: blogId },
      select: { id: true, authorId: true },
    });
    if (!blog) {
      throw new Error('Blog not found');
    }

    const isAdmin = requesterRoles.some(role => role.toLowerCase() === 'admin');
    if (blog.authorId !== requesterId && !isAdmin) {
      throw new Error('Not authorized');
    }

    const revision = await prisma.blogRevision.findUnique({ where: { id: revisionId } });
    if (!revision || revision.blogId !== blogId) {
      throw new Error('Revision not found');
    }

    return revision;
  }

  async restoreRevision(blogId: string, revisionId: string, authorId: string) {
    const startTime = Date.now();
    logger.debug({ authorId }, `Restoring blog ${blogId} to revision ${revisionId}`);

    const blog = await prisma.blog.findUnique({
      where: { id: blogId },
      select: { authorId: true, slug: true, content: true, contentMarkdown: true, version: true },
    });
    if (!blog) {
      throw new Error('Blog not found');
    }
    if (blog.authorId !== authorId) {
      throw new Error('Not authorized');
    }

    const revision = await prisma.blogRevision.findUnique({ where: { id: revisionId } });
    if (!revision || revision.blogId !== blogId) {
      throw new Error('Revision not found');
    }

    // Revisions captured before contentMarkdown existed only have the
    // rendered HTML snapshot - fall back to re-processing that (the old,
    // imperfect behavior) rather than losing the ability to restore them.
    const restoredSource = revision.contentMarkdown ?? revision.content;
    const validation = validateMarkdown(restoredSource);
    if (!validation.isValid) {
      logger.error('Invalid markdown content in revision restore');
      throw new Error('Invalid markdown content');
    }
    const processedContent = processMarkdown(restoredSource);

    // Capture what's currently live as a new revision before overwriting it.
    await this.captureRevision(blogId, authorId, blog.content, blog.contentMarkdown, blog.version);

    const updatedBlog = await prisma.blog.update({
      where: { id: blogId },
      data: {
        content: processedContent,
        contentMarkdown: revision.contentMarkdown ?? restoredSource,
        readTime: this.computeReadTime(restoredSource),
        version: blog.version + 1,
      },
      include: {
        author: { select: { id: true, username: true, profileImage: true } },
        category: true,
        tags: { include: { tag: true } },
        analytics: true,
      },
    });

    await updateBlogIndex(blogId, {
      content: updatedBlog.content,
      updatedAt: updatedBlog.updatedAt,
    });

    await Promise.all([
      blogCache.invalidate(blog.slug),
      blogCache.set(updatedBlog.slug, JSON.stringify(updatedBlog)),
      searchCache.invalidateAll(),
    ]);

    logger.info(`Blog ${blogId} restored to revision ${revisionId} in ${Date.now() - startTime}ms`);
    return updatedBlog;
  }
}
