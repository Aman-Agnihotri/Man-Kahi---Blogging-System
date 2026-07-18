import { BlogService } from '@services/blog.service';
import { prisma } from '@shared/utils/prismaClient';
import { blogCache, searchCache, redis } from '@shared/config/redis';
import { processImage } from '@config/upload';
import { indexBlog, updateBlogIndex } from '@utils/elasticsearch';

const prismaMock = prisma as unknown as {
  blog: {
    create: jest.Mock;
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  blogAnalytics: {
    update: jest.Mock;
  };
};

const cacheMock = blogCache as unknown as {
  get: jest.Mock;
  invalidate: jest.Mock;
  incrementViews: jest.Mock;
  set: jest.Mock;
};

const searchCacheMock = searchCache as unknown as {
  invalidateAll: jest.Mock;
};

const redisMock = redis as unknown as {
  set: jest.Mock;
};

const processImageMock = processImage as jest.Mock;
const indexBlogMock = indexBlog as jest.Mock;
const updateBlogIndexMock = updateBlogIndex as jest.Mock;

// registerView is a fire-and-forget call from getBlogBySlug (not awaited),
// so tests asserting on its side effects need to let its internal await
// chain (redis.set -> blogAnalytics.update -> Promise.all) settle first.
const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

const blogRecord = {
  id: 'blog-1',
  title: 'Same Title',
  slug: 'same-title-1',
  content: '<p>content</p>',
  description: null,
  authorId: 'author-1',
  categoryId: null,
  published: true,
  createdAt: new Date('2026-06-02T00:00:00.000Z'),
  updatedAt: new Date('2026-06-02T00:00:00.000Z'),
  category: null,
  tags: [],
  analytics: { views: 0 },
};

describe('BlogService contract fixes', () => {
  it('creates blogs with a unique slug and Prisma coverImage field', async () => {
    const service = new BlogService();
    const file = { originalname: 'cover.png' } as Express.Multer.File;
    prismaMock.blog.findFirst
      .mockResolvedValueOnce({ id: 'existing-blog' })
      .mockResolvedValueOnce(null);
    processImageMock.mockResolvedValue('/uploads/cover.jpg');
    prismaMock.blog.create.mockResolvedValue(blogRecord);

    const result = await service.createBlog({
      title: 'Same Title',
      content: '# Same Title\n\nBody',
      authorId: 'author-1',
      file,
      published: true,
    });

    expect(result).toBe(blogRecord);
    expect(prismaMock.blog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        slug: 'same-title-1',
        coverImage: '/uploads/cover.jpg',
      }),
    }));
    expect(prismaMock.blog.create.mock.calls[0][0].data).not.toHaveProperty('imageUrl');
    expect(indexBlogMock).toHaveBeenCalledWith(expect.objectContaining({
      id: 'blog-1',
      slug: 'same-title-1',
    }));
    expect(cacheMock.set).toHaveBeenCalledWith('same-title-1', JSON.stringify(blogRecord));
  });

  it('sets publishedAt when creating a blog as published, leaves it null for a draft', async () => {
    const service = new BlogService();
    prismaMock.blog.findFirst.mockResolvedValue(null);
    prismaMock.blog.create.mockResolvedValue(blogRecord);

    await service.createBlog({
      title: 'Same Title',
      content: '# Same Title\n\nBody',
      authorId: 'author-1',
      published: true,
    });
    expect(prismaMock.blog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ publishedAt: expect.any(Date) }),
    }));

    prismaMock.blog.create.mockClear();
    await service.createBlog({
      title: 'Same Title',
      content: '# Same Title\n\nBody',
      authorId: 'author-1',
      published: false,
    });
    expect(prismaMock.blog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ publishedAt: null }),
    }));
  });

  it('allows authors to read their own cached drafts without counting a public view', async () => {
    const service = new BlogService();
    const draftBlog = {
      ...blogRecord,
      slug: 'draft-blog',
      published: false,
    };
    cacheMock.get.mockResolvedValue(JSON.stringify(draftBlog));

    const result = await service.getBlogBySlug('draft-blog', 'author-1');

    expect(result).toEqual(expect.objectContaining({
      id: draftBlog.id,
      authorId: draftBlog.authorId,
      published: false,
      slug: draftBlog.slug,
    }));
    expect(prismaMock.blog.findUnique).not.toHaveBeenCalled();
    expect(cacheMock.incrementViews).not.toHaveBeenCalled();
    expect(updateBlogIndexMock).not.toHaveBeenCalled();
  });

  it('hides cached drafts from anonymous users and non-authors', async () => {
    const service = new BlogService();
    const draftBlog = {
      ...blogRecord,
      slug: 'draft-blog',
      published: false,
    };
    cacheMock.get.mockResolvedValue(JSON.stringify(draftBlog));

    await expect(service.getBlogBySlug('draft-blog')).rejects.toThrow('Blog not found');
    await expect(service.getBlogBySlug('draft-blog', 'other-user')).rejects.toThrow('Blog not found');

    expect(prismaMock.blog.findUnique).not.toHaveBeenCalled();
    expect(cacheMock.incrementViews).not.toHaveBeenCalled();
    expect(updateBlogIndexMock).not.toHaveBeenCalled();
  });

  it('allows authors to read database drafts without counting a public view', async () => {
    const service = new BlogService();
    const draftBlog = {
      ...blogRecord,
      slug: 'draft-blog',
      published: false,
      // Non-null so the read-time lazy backfill (which mutates the
      // returned object and calls prisma.blog.update) doesn't fire and
      // change what gets cached below.
      readTime: 3,
    };
    cacheMock.get.mockResolvedValue(null);
    prismaMock.blog.findUnique.mockResolvedValue(draftBlog);

    const result = await service.getBlogBySlug('draft-blog', 'author-1');

    expect(result).toEqual(draftBlog);
    expect(prismaMock.blog.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        slug: 'draft-blog',
        deletedAt: null,
      },
    }));
    expect(cacheMock.set).toHaveBeenCalledWith('draft-blog', JSON.stringify(draftBlog));
    expect(cacheMock.incrementViews).not.toHaveBeenCalled();
    expect(updateBlogIndexMock).not.toHaveBeenCalled();
  });

  describe('view counting (deduped per-visitor)', () => {
    it('registers a deduped view for published blog reads and updates Postgres + Elasticsearch', async () => {
      const service = new BlogService();
      cacheMock.get.mockResolvedValue(null);
      prismaMock.blog.findUnique.mockResolvedValue({
        ...blogRecord,
        readTime: 3,
        analytics: { views: 7 },
      });
      redisMock.set.mockResolvedValue('OK');
      prismaMock.blogAnalytics.update.mockResolvedValue({ views: 8 });

      await service.getBlogBySlug('same-title-1', undefined, 'a:visitor-hash');
      await flushPromises();

      expect(redisMock.set).toHaveBeenCalledWith(
        'blog:viewed:blog-1:a:visitor-hash', '1', 'EX', 86400, 'NX'
      );
      expect(prismaMock.blogAnalytics.update).toHaveBeenCalledWith({
        where: { blogId: 'blog-1' },
        data: { views: { increment: 1 } },
        select: { views: true },
      });
      expect(updateBlogIndexMock).toHaveBeenCalledWith('blog-1', { views: 8 });
      expect(cacheMock.invalidate).toHaveBeenCalledWith('same-title-1');
    });

    it('does not double-count a repeat view from the same visitor within the dedup window', async () => {
      const service = new BlogService();
      cacheMock.get.mockResolvedValue(null);
      prismaMock.blog.findUnique.mockResolvedValue({
        ...blogRecord,
        readTime: 3,
        analytics: { views: 7 },
      });
      redisMock.set.mockResolvedValue(null);

      await service.getBlogBySlug('same-title-1', undefined, 'a:visitor-hash');
      await flushPromises();

      expect(redisMock.set).toHaveBeenCalledWith(
        'blog:viewed:blog-1:a:visitor-hash', '1', 'EX', 86400, 'NX'
      );
      expect(prismaMock.blogAnalytics.update).not.toHaveBeenCalled();
      expect(updateBlogIndexMock).not.toHaveBeenCalled();
    });

    it('swallows a Redis failure during view registration without throwing or counting a view', async () => {
      const service = new BlogService();
      cacheMock.get.mockResolvedValue(null);
      prismaMock.blog.findUnique.mockResolvedValue({
        ...blogRecord,
        readTime: 3,
        analytics: { views: 7 },
      });
      redisMock.set.mockRejectedValue(new Error('redis down'));

      await expect(
        service.getBlogBySlug('same-title-1', undefined, 'a:visitor-hash')
      ).resolves.toBeDefined();
      await flushPromises();

      expect(prismaMock.blogAnalytics.update).not.toHaveBeenCalled();
    });
  });

  it('updates blog images through coverImage and excludes the current blog when regenerating slugs', async () => {
    const service = new BlogService();
    const file = { originalname: 'new-cover.png' } as Express.Multer.File;
    const updatedBlog = {
      ...blogRecord,
      title: 'Updated Title',
      slug: 'updated-title',
      tags: [],
    };

    prismaMock.blog.findUnique.mockResolvedValue({
      authorId: 'author-1',
      slug: 'same-title',
      tags: [],
    });
    prismaMock.blog.findFirst.mockResolvedValue(null);
    processImageMock.mockResolvedValue('/uploads/new-cover.jpg');
    prismaMock.blog.update.mockResolvedValue(updatedBlog);

    await service.updateBlog('blog-1', 'author-1', {
      title: 'Updated Title',
      file,
    });

    expect(prismaMock.blog.findFirst).toHaveBeenCalledWith({
      where: {
        slug: 'updated-title',
        id: { not: 'blog-1' },
      },
      select: { id: true },
    });
    expect(prismaMock.blog.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'blog-1' },
      data: expect.objectContaining({
        title: 'Updated Title',
        slug: 'updated-title',
        coverImage: '/uploads/new-cover.jpg',
      }),
    }));
    expect(updateBlogIndexMock).toHaveBeenCalledWith('blog-1', expect.objectContaining({
      slug: 'updated-title',
    }));
    expect(cacheMock.invalidate).toHaveBeenCalledWith('same-title');
    expect(cacheMock.invalidate).toHaveBeenCalledWith('updated-title');
  });

  it('sets publishedAt only on the first transition from unpublished to published', async () => {
    const service = new BlogService();
    prismaMock.blog.update.mockResolvedValue(blogRecord);

    // First publish: currently unpublished, no publishedAt yet -> should set it.
    prismaMock.blog.findUnique.mockResolvedValue({
      authorId: 'author-1',
      slug: 'same-title',
      published: false,
      publishedAt: null,
      tags: [],
    });
    await service.updateBlog('blog-1', 'author-1', { published: true });
    expect(prismaMock.blog.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ published: true, publishedAt: expect.any(Date) }),
    }));

    // Already published: re-sending published:true should not reset publishedAt.
    prismaMock.blog.update.mockClear();
    prismaMock.blog.findUnique.mockResolvedValue({
      authorId: 'author-1',
      slug: 'same-title',
      published: true,
      publishedAt: new Date('2026-01-01T00:00:00.000Z'),
      tags: [],
    });
    await service.updateBlog('blog-1', 'author-1', { published: true });
    expect(prismaMock.blog.update.mock.calls[0][0].data).not.toHaveProperty('publishedAt');
  });

  it('deletes blogs by ID and returns the deleted blog metadata', async () => {
    const service = new BlogService();
    const deletedBlog = {
      id: 'blog-1',
      authorId: 'author-1',
      slug: 'same-title',
      published: true,
    };
    prismaMock.blog.findUnique.mockResolvedValue(deletedBlog);
    prismaMock.blog.update.mockResolvedValue({ ...deletedBlog, deletedAt: new Date() });

    const result = await service.deleteBlog('blog-1', 'author-1');

    expect(result).toBe(deletedBlog);
    expect(prismaMock.blog.findUnique).toHaveBeenCalledWith({
      where: { id: 'blog-1' },
      select: { id: true, authorId: true, slug: true, published: true },
    });
    expect(prismaMock.blog.update).toHaveBeenCalledWith({
      where: { id: 'blog-1' },
      data: { deletedAt: expect.any(Date) },
    });
    const deletedAt = prismaMock.blog.update.mock.calls[0][0].data.deletedAt;
    expect(cacheMock.invalidate).toHaveBeenCalledWith('same-title');
    expect(updateBlogIndexMock).toHaveBeenCalledWith('blog-1', {
      deletedAt,
    });
  });

  describe('setVisibility (admin moderation)', () => {
    // Regression test: admin-service used to write `published` straight to
    // Postgres via its own Prisma client, bypassing this reindex/cache
    // invalidation entirely - a hidden blog stayed visible in search/home
    // indefinitely because Elasticsearch and the Redis search cache never
    // heard about the change. setVisibility is the fix: same reindex +
    // invalidation as updateBlog, but with no author-ownership check since
    // the caller is already gated on the admin role at the route level.
    it('hides a published blog without requiring author ownership', async () => {
      const service = new BlogService();
      prismaMock.blog.findUnique.mockResolvedValue({
        slug: 'same-title',
        published: true,
        publishedAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      const updated = { ...blogRecord, published: false, publishedAt: null as Date | null };
      prismaMock.blog.update.mockResolvedValue(updated);

      const result = await service.setVisibility('blog-1', false);

      expect(result).toBe(updated);
      expect(prismaMock.blog.update).toHaveBeenCalledWith({
        where: { id: 'blog-1' },
        data: { published: false },
        include: expect.any(Object),
      });
      expect(updateBlogIndexMock).toHaveBeenCalledWith('blog-1', {
        published: updated.published,
        publishedAt: updated.publishedAt,
      });
      expect(cacheMock.invalidate).toHaveBeenCalledWith('same-title');
      expect(searchCacheMock.invalidateAll).toHaveBeenCalled();
    });

    it('sets publishedAt on first publish via moderation, leaves it alone on republish', async () => {
      const service = new BlogService();
      prismaMock.blog.findUnique.mockResolvedValue({
        slug: 'same-title',
        published: false,
        publishedAt: null,
      });
      prismaMock.blog.update.mockResolvedValue(blogRecord);

      await service.setVisibility('blog-1', true);
      expect(prismaMock.blog.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ published: true, publishedAt: expect.any(Date) }),
      }));

      prismaMock.blog.update.mockClear();
      prismaMock.blog.findUnique.mockResolvedValue({
        slug: 'same-title',
        published: true,
        publishedAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      await service.setVisibility('blog-1', true);
      expect(prismaMock.blog.update.mock.calls[0][0].data).not.toHaveProperty('publishedAt');
    });

    it('throws Blog not found for an unknown ID rather than upserting', async () => {
      const service = new BlogService();
      prismaMock.blog.findUnique.mockResolvedValue(null);

      await expect(service.setVisibility('missing-blog', false)).rejects.toThrow('Blog not found');
      expect(prismaMock.blog.update).not.toHaveBeenCalled();
    });
  });

  describe('read time', () => {
    it('computes read time from content on create', async () => {
      const service = new BlogService();
      const content = 'word '.repeat(250).trim(); // 250 words -> ceil(250/200) = 2
      prismaMock.blog.findFirst.mockResolvedValue(null);
      prismaMock.blog.create.mockResolvedValue(blogRecord);

      await service.createBlog({
        title: 'Same Title',
        content,
        authorId: 'author-1',
      });

      expect(prismaMock.blog.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ readTime: 2 }),
      }));
    });

    it('recomputes read time only when the content is actually changing', async () => {
      const service = new BlogService();
      const newContent = 'word '.repeat(400).trim(); // 400 words -> ceil(400/200) = 2
      prismaMock.blog.update.mockResolvedValue(blogRecord);

      // Content changes -> readTime recomputed.
      prismaMock.blog.findUnique.mockResolvedValue({
        authorId: 'author-1',
        slug: 'same-title',
        content: '<p>old</p>',
        contentMarkdown: 'old content',
        version: 1,
        tags: [],
      });
      await service.updateBlog('blog-1', 'author-1', { content: newContent });
      expect(prismaMock.blog.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ readTime: 2 }),
      }));

      // Only the description changes (no content field at all) -> no readTime recompute.
      prismaMock.blog.update.mockClear();
      prismaMock.blog.findUnique.mockResolvedValue({
        authorId: 'author-1',
        slug: 'same-title',
        content: '<p>old</p>',
        contentMarkdown: 'old content',
        version: 1,
        tags: [],
      });
      await service.updateBlog('blog-1', 'author-1', { description: 'new description' });
      expect(prismaMock.blog.update.mock.calls[0][0].data).not.toHaveProperty('readTime');
    });

    it('backfills a missing read time when serving a blog from the database, healing both the row and the cache', async () => {
      const service = new BlogService();
      const contentMarkdown = 'word '.repeat(250).trim(); // 250 words -> ceil(250/200) = 2
      const dbBlog = {
        ...blogRecord,
        readTime: null as number | null,
        content: '<p>rendered</p>',
        contentMarkdown,
      };
      cacheMock.get.mockResolvedValue(null);
      prismaMock.blog.findUnique.mockResolvedValue(dbBlog);
      prismaMock.blog.update.mockResolvedValue({ ...dbBlog, readTime: 2 });

      const result = await service.getBlogBySlug('same-title-1');

      expect(result.readTime).toBe(2);
      expect(prismaMock.blog.update).toHaveBeenCalledWith({
        where: { id: 'blog-1' },
        data: { readTime: 2 },
      });
      expect(cacheMock.set).toHaveBeenCalledWith('same-title-1', JSON.stringify(dbBlog));
    });
  });
});
