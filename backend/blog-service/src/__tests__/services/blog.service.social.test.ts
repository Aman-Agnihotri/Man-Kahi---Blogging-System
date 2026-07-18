import { BlogService } from '@services/blog.service';
import { prisma } from '@shared/utils/prismaClient';
import { blogCache, searchCache } from '@shared/config/redis';
import { updateBlogIndex } from '@utils/elasticsearch';

const prismaMock = prisma as unknown as {
  blog: {
    count: jest.Mock;
    create: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  blogAnalytics: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  like: {
    create: jest.Mock;
    delete: jest.Mock;
    findUnique: jest.Mock;
  };
  bookmark: {
    count: jest.Mock;
    create: jest.Mock;
    delete: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
  };
  report: {
    create: jest.Mock;
    findFirst: jest.Mock;
  };
};

const cacheMock = blogCache as unknown as {
  invalidate: jest.Mock;
};

const searchCacheMock = searchCache as unknown as {
  invalidateAll: jest.Mock;
};

const updateBlogIndexMock = updateBlogIndex as jest.Mock;

describe('BlogService likes', () => {
  it('creates a Like row and increments the analytics counter only on first like', async () => {
    const service = new BlogService();
    prismaMock.blog.findUnique.mockResolvedValue({ id: 'blog-1', slug: 'blog-1-slug', deletedAt: null, published: true, authorId: 'author-1' });
    prismaMock.like.findUnique.mockResolvedValue(null);
    prismaMock.blogAnalytics.update.mockResolvedValue({ likes: 1 });

    const result = await service.likeBlog('blog-1', 'user-1');

    expect(prismaMock.like.create).toHaveBeenCalledWith({ data: { blogId: 'blog-1', userId: 'user-1' } });
    expect(prismaMock.blogAnalytics.update).toHaveBeenCalledWith({
      where: { blogId: 'blog-1' },
      data: { likes: { increment: 1 } },
      select: { likes: true },
    });
    expect(result).toEqual({ liked: true, likesCount: 1 });
  });

  // Regression test: the blog-by-slug response is Redis-cached, and its
  // embedded analytics.likes previously went stale forever after a post
  // was liked/unliked post-cache-fill, since neither path invalidated it.
  it('invalidates the blog-by-slug cache after a successful like', async () => {
    const service = new BlogService();
    prismaMock.blog.findUnique.mockResolvedValue({ id: 'blog-1', slug: 'blog-1-slug', deletedAt: null, published: true, authorId: 'author-1' });
    prismaMock.like.findUnique.mockResolvedValue(null);
    prismaMock.blogAnalytics.update.mockResolvedValue({ likes: 1 });

    await service.likeBlog('blog-1', 'user-1');

    expect(cacheMock.invalidate).toHaveBeenCalledWith('blog-1-slug');
  });

  it('does not invalidate the cache on a repeat (already-liked) call', async () => {
    const service = new BlogService();
    prismaMock.blog.findUnique.mockResolvedValue({ id: 'blog-1', slug: 'blog-1-slug', deletedAt: null, published: true, authorId: 'author-1' });
    prismaMock.like.findUnique.mockResolvedValue({ id: 'like-1', blogId: 'blog-1', userId: 'user-1' });
    prismaMock.blogAnalytics.findUnique.mockResolvedValue({ likes: 5 });

    await service.likeBlog('blog-1', 'user-1');

    expect(cacheMock.invalidate).not.toHaveBeenCalled();
  });

  it('is idempotent - repeat likes do not re-create the row or increment again', async () => {
    const service = new BlogService();
    prismaMock.blog.findUnique.mockResolvedValue({ id: 'blog-1', deletedAt: null, published: true, authorId: 'author-1' });
    prismaMock.like.findUnique.mockResolvedValue({ id: 'like-1', blogId: 'blog-1', userId: 'user-1' });
    prismaMock.blogAnalytics.findUnique.mockResolvedValue({ likes: 5 });

    const result = await service.likeBlog('blog-1', 'user-1');

    expect(prismaMock.like.create).not.toHaveBeenCalled();
    expect(prismaMock.blogAnalytics.update).not.toHaveBeenCalled();
    expect(result).toEqual({ liked: true, likesCount: 5 });
  });

  it('throws Blog not found for a missing or soft-deleted blog', async () => {
    const service = new BlogService();
    prismaMock.blog.findUnique.mockResolvedValue(null);
    await expect(service.likeBlog('missing', 'user-1')).rejects.toThrow('Blog not found');

    prismaMock.blog.findUnique.mockResolvedValue({ id: 'blog-1', deletedAt: new Date() });
    await expect(service.likeBlog('blog-1', 'user-1')).rejects.toThrow('Blog not found');

    expect(prismaMock.like.create).not.toHaveBeenCalled();
  });

  // Regression test: liking must respect the same visibility rule as
  // reading a blog - otherwise any authenticated user could like (and by
  // the success/failure response, confirm the existence of) someone
  // else's unpublished draft just by knowing its ID.
  it('rejects liking someone else\'s unpublished draft', async () => {
    const service = new BlogService();
    prismaMock.blog.findUnique.mockResolvedValue({ id: 'blog-1', deletedAt: null, published: false, authorId: 'author-1' });

    await expect(service.likeBlog('blog-1', 'someone-else')).rejects.toThrow('Blog not found');
    expect(prismaMock.like.create).not.toHaveBeenCalled();
  });

  it('lets the author like their own unpublished draft', async () => {
    const service = new BlogService();
    prismaMock.blog.findUnique.mockResolvedValue({ id: 'blog-1', deletedAt: null, published: false, authorId: 'author-1' });
    prismaMock.like.findUnique.mockResolvedValue(null);
    prismaMock.blogAnalytics.update.mockResolvedValue({ likes: 1 });

    await expect(service.likeBlog('blog-1', 'author-1')).resolves.toEqual({ liked: true, likesCount: 1 });
  });

  it('deletes a Like row and decrements the counter only if a like existed', async () => {
    const service = new BlogService();
    prismaMock.blog.findUnique.mockResolvedValue({ id: 'blog-1', slug: 'blog-1-slug', deletedAt: null });
    prismaMock.like.findUnique.mockResolvedValue({ id: 'like-1' });
    prismaMock.blogAnalytics.update.mockResolvedValue({ likes: 0 });

    const result = await service.unlikeBlog('blog-1', 'user-1');

    expect(prismaMock.like.delete).toHaveBeenCalledWith({ where: { id: 'like-1' } });
    expect(prismaMock.blogAnalytics.update).toHaveBeenCalledWith({
      where: { blogId: 'blog-1' },
      data: { likes: { decrement: 1 } },
      select: { likes: true },
    });
    expect(result).toEqual({ liked: false, likesCount: 0 });
    expect(cacheMock.invalidate).toHaveBeenCalledWith('blog-1-slug');
  });

  it('is idempotent - unliking twice does not decrement twice', async () => {
    const service = new BlogService();
    prismaMock.blog.findUnique.mockResolvedValue({ id: 'blog-1', deletedAt: null });
    prismaMock.like.findUnique.mockResolvedValue(null);
    prismaMock.blogAnalytics.findUnique.mockResolvedValue({ likes: 3 });

    const result = await service.unlikeBlog('blog-1', 'user-1');

    expect(prismaMock.like.delete).not.toHaveBeenCalled();
    expect(prismaMock.blogAnalytics.update).not.toHaveBeenCalled();
    expect(result).toEqual({ liked: false, likesCount: 3 });
  });
});

describe('BlogService bookmarks', () => {
  it('creates a Bookmark row idempotently with no analytics counter', async () => {
    const service = new BlogService();
    prismaMock.blog.findUnique.mockResolvedValue({ id: 'blog-1', deletedAt: null, published: true, authorId: 'author-1' });
    prismaMock.bookmark.findUnique.mockResolvedValue(null);

    const result = await service.bookmarkBlog('blog-1', 'user-1');

    expect(prismaMock.bookmark.create).toHaveBeenCalledWith({ data: { blogId: 'blog-1', userId: 'user-1' } });
    expect(prismaMock.blogAnalytics.update).not.toHaveBeenCalled();
    expect(result).toEqual({ bookmarked: true });
  });

  it('does not re-create a bookmark that already exists', async () => {
    const service = new BlogService();
    prismaMock.blog.findUnique.mockResolvedValue({ id: 'blog-1', deletedAt: null, published: true, authorId: 'author-1' });
    prismaMock.bookmark.findUnique.mockResolvedValue({ id: 'bookmark-1' });

    const result = await service.bookmarkBlog('blog-1', 'user-1');

    expect(prismaMock.bookmark.create).not.toHaveBeenCalled();
    expect(result).toEqual({ bookmarked: true });
  });

  it('throws Blog not found when bookmarking a missing blog', async () => {
    const service = new BlogService();
    prismaMock.blog.findUnique.mockResolvedValue(null);
    await expect(service.bookmarkBlog('missing', 'user-1')).rejects.toThrow('Blog not found');
  });

  it('rejects bookmarking someone else\'s unpublished draft', async () => {
    const service = new BlogService();
    prismaMock.blog.findUnique.mockResolvedValue({ id: 'blog-1', deletedAt: null, published: false, authorId: 'author-1' });

    await expect(service.bookmarkBlog('blog-1', 'someone-else')).rejects.toThrow('Blog not found');
    expect(prismaMock.bookmark.create).not.toHaveBeenCalled();
  });

  it('removes a bookmark idempotently', async () => {
    const service = new BlogService();
    prismaMock.blog.findUnique.mockResolvedValue({ id: 'blog-1', deletedAt: null });
    prismaMock.bookmark.findUnique.mockResolvedValue({ id: 'bookmark-1' });

    const result = await service.unbookmarkBlog('blog-1', 'user-1');

    expect(prismaMock.bookmark.delete).toHaveBeenCalledWith({ where: { id: 'bookmark-1' } });
    expect(result).toEqual({ bookmarked: false });
  });

  it('lists the current user bookmarked blogs newest-first, paginated', async () => {
    const service = new BlogService();
    const blogA = { id: 'blog-1', title: 'A' };
    const blogB = { id: 'blog-2', title: 'B' };
    prismaMock.bookmark.findMany.mockResolvedValue([{ blog: blogA }, { blog: blogB }]);
    prismaMock.bookmark.count.mockResolvedValue(2);

    const result = await service.getUserBookmarks('user-1', 1, 10);

    expect(prismaMock.bookmark.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-1', blog: { deletedAt: null } },
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 10,
    }));
    expect(result).toEqual({ blogs: [blogA, blogB], total: 2, page: 1, totalPages: 1 });
  });

  it('rejects invalid pagination for bookmarks', async () => {
    const service = new BlogService();
    await expect(service.getUserBookmarks('user-1', 0, 10)).rejects.toThrow('Invalid pagination');
    await expect(service.getUserBookmarks('user-1', 1, 1000)).rejects.toThrow('Invalid pagination');
  });
});

describe('BlogService trending', () => {
  it('queries published, non-deleted blogs ordered by analytics views desc', async () => {
    const service = new BlogService();
    const blogs = [{ id: 'blog-1' }];
    prismaMock.blog.findMany.mockResolvedValue(blogs);

    const result = await service.getTrendingBlogs(5);

    expect(prismaMock.blog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { published: true, deletedAt: null },
      orderBy: { analytics: { views: 'desc' } },
      take: 5,
    }));
    expect(result).toBe(blogs);
  });
});

describe('BlogService recent (Postgres-realtime Featured feed)', () => {
  it('queries published, non-deleted blogs ordered by createdAt desc, paginated, and returns a flat search-shaped envelope', async () => {
    const service = new BlogService();
    const recentBlog = {
      id: 'blog-1',
      title: 'Recent Post',
      content: '<p>rendered</p>',
      contentMarkdown: 'word '.repeat(250).trim(),
      description: 'desc',
      slug: 'recent-post',
      authorId: 'author-1',
      author: { id: 'author-1', username: 'author-name', profileImage: null },
      categoryId: 'cat-1',
      tags: [{ tag: { name: 'tech' } }],
      published: true,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      publishedAt: new Date('2026-01-01'),
      deletedAt: null,
      analytics: { views: 42 },
      excerpt: 'excerpt',
      coverImage: null,
      readTime: null as number | null,
    };
    const blogs = [recentBlog];
    prismaMock.blog.findMany.mockResolvedValue(blogs);
    prismaMock.blog.count.mockResolvedValue(1);

    const result = await service.getRecentBlogs(1, 9);

    expect(prismaMock.blog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { published: true, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 9,
    }));
    expect(prismaMock.blog.count).toHaveBeenCalledWith({
      where: { published: true, deletedAt: null },
    });
    expect(result).toEqual({
      blogs: [
        {
          id: 'blog-1',
          title: 'Recent Post',
          content: '<p>rendered</p>',
          description: 'desc',
          slug: 'recent-post',
          authorId: 'author-1',
          authorUsername: 'author-name',
          categoryId: 'cat-1',
          tags: ['tech'],
          published: true,
          createdAt: recentBlog.createdAt,
          updatedAt: recentBlog.updatedAt,
          publishedAt: recentBlog.publishedAt,
          deletedAt: null,
          views: 42,
          excerpt: 'excerpt',
          coverImage: null,
          readTime: 2,
          score: 0,
        },
      ],
      total: 1,
      page: 1,
      totalPages: 1,
    });
  });
});

describe('BlogService reportBlog', () => {
  it('creates a report against a blog', async () => {
    const service = new BlogService();
    prismaMock.blog.findUnique.mockResolvedValue({ id: 'blog-1', deletedAt: null });
    prismaMock.report.findFirst.mockResolvedValue(null);
    const report = { id: 'report-1' };
    prismaMock.report.create.mockResolvedValue(report);

    const result = await service.reportBlog('blog-1', 'user-1', 'This is spam content that is inappropriate');

    expect(prismaMock.report.create).toHaveBeenCalledWith({
      data: {
        targetType: 'blog',
        targetId: 'blog-1',
        reporterId: 'user-1',
        reason: 'This is spam content that is inappropriate',
      },
    });
    expect(result).toBe(report);
  });

  it('rejects a duplicate report while one is still open', async () => {
    const service = new BlogService();
    prismaMock.blog.findUnique.mockResolvedValue({ id: 'blog-1', deletedAt: null });
    prismaMock.report.findFirst.mockResolvedValue({ id: 'existing-report' });

    await expect(service.reportBlog('blog-1', 'user-1', 'duplicate report reason text'))
      .rejects.toThrow('Report already exists');
    expect(prismaMock.report.create).not.toHaveBeenCalled();
  });

  it('throws Blog not found for a missing blog', async () => {
    const service = new BlogService();
    prismaMock.blog.findUnique.mockResolvedValue(null);
    await expect(service.reportBlog('missing', 'user-1', 'some reason text here')).rejects.toThrow('Blog not found');
  });
});

describe('BlogService adminDelete (moderation takedown)', () => {
  it('soft-deletes a blog with no author-ownership check and reindexes/invalidates caches', async () => {
    const service = new BlogService();
    prismaMock.blog.findUnique.mockResolvedValue({ id: 'blog-1', slug: 'some-slug', published: true });
    prismaMock.blog.update.mockResolvedValue({ id: 'blog-1', deletedAt: new Date() });

    const result = await service.adminDelete('blog-1');

    expect(prismaMock.blog.update).toHaveBeenCalledWith({
      where: { id: 'blog-1' },
      data: { deletedAt: expect.any(Date) },
    });
    expect(cacheMock.invalidate).toHaveBeenCalledWith('some-slug');
    expect(updateBlogIndexMock).toHaveBeenCalledWith('blog-1', { deletedAt: expect.any(Date) });
    expect(searchCacheMock.invalidateAll).toHaveBeenCalled();
    expect(result).toEqual({ id: 'blog-1', slug: 'some-slug', published: true });
  });

  it('throws Blog not found for a missing blog', async () => {
    const service = new BlogService();
    prismaMock.blog.findUnique.mockResolvedValue(null);
    await expect(service.adminDelete('missing')).rejects.toThrow('Blog not found');
    expect(prismaMock.blog.update).not.toHaveBeenCalled();
  });
});

describe('BlogService SEO metadata passthrough', () => {
  const blogRecord = {
    id: 'blog-1',
    slug: 'seo-blog',
    content: '<p>content</p>',
    category: null,
    tags: [],
    analytics: { views: 0 },
  };

  it('passes metaTitle/metaDescription/canonicalUrl through on create', async () => {
    const service = new BlogService();
    prismaMock.blog.findFirst.mockResolvedValue(null);
    prismaMock.blog.create.mockResolvedValue(blogRecord);

    await service.createBlog({
      title: 'SEO Blog',
      content: '# SEO Blog\n\n' + 'body '.repeat(30),
      authorId: 'author-1',
      metaTitle: 'Custom Title',
      metaDescription: 'Custom description',
      canonicalUrl: 'https://example.com/canonical',
    });

    expect(prismaMock.blog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        metaTitle: 'Custom Title',
        metaDescription: 'Custom description',
        canonicalUrl: 'https://example.com/canonical',
      }),
    }));
  });

  it('passes SEO fields through on update', async () => {
    const service = new BlogService();
    prismaMock.blog.findUnique.mockResolvedValue({
      authorId: 'author-1',
      slug: 'seo-blog',
      content: '<p>content</p>',
      version: 1,
      tags: [],
    });
    prismaMock.blog.update.mockResolvedValue(blogRecord);

    await service.updateBlog('blog-1', 'author-1', {
      metaTitle: 'Updated Title',
      metaDescription: 'Updated description',
      canonicalUrl: 'https://example.com/updated',
    });

    expect(prismaMock.blog.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        metaTitle: 'Updated Title',
        metaDescription: 'Updated description',
        canonicalUrl: 'https://example.com/updated',
      }),
    }));
  });
});
