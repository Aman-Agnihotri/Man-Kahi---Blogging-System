import { BlogService } from '@services/blog.service';
import { prisma } from '@shared/utils/prismaClient';
import { blogCache, searchCache } from '@shared/config/redis';
import { updateBlogIndex } from '@utils/elasticsearch';
import { processMarkdown } from '@utils/markdown';

const prismaMock = prisma as unknown as {
  blog: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  blogRevision: {
    create: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
  };
};

const cacheMock = blogCache as unknown as {
  invalidate: jest.Mock;
  set: jest.Mock;
};

const searchCacheMock = searchCache as unknown as {
  invalidateAll: jest.Mock;
};

const updateBlogIndexMock = updateBlogIndex as jest.Mock;
const processMarkdownMock = processMarkdown as jest.Mock;

describe('BlogService.updateBlog revision auto-capture', () => {
  it('captures the pre-update content as a revision and bumps version when content actually changes', async () => {
    const service = new BlogService();
    processMarkdownMock.mockReturnValue('<p>new content</p>');
    prismaMock.blog.findUnique.mockResolvedValue({
      authorId: 'author-1',
      slug: 'same-title',
      published: true,
      publishedAt: new Date(),
      content: '<p>old content</p>',
      contentMarkdown: 'old content',
      version: 3,
      tags: [],
    });
    prismaMock.blog.update.mockResolvedValue({
      id: 'blog-1',
      slug: 'same-title',
      content: '<p>new content</p>',
      version: 4,
      category: null,
      tags: [],
      analytics: {},
    });

    await service.updateBlog('blog-1', 'author-1', { content: 'new content here' });

    expect(prismaMock.blogRevision.create).toHaveBeenCalledWith({
      data: {
        blogId: 'blog-1',
        version: 3,
        content: '<p>old content</p>',
        contentMarkdown: 'old content',
        createdBy: 'author-1',
      },
    });
    expect(prismaMock.blog.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        content: '<p>new content</p>',
        contentMarkdown: 'new content here',
        version: 4,
      }),
    }));
  });

  it('does not capture a revision or bump version when content is not provided', async () => {
    const service = new BlogService();
    prismaMock.blog.findUnique.mockResolvedValue({
      authorId: 'author-1',
      slug: 'same-title',
      published: true,
      publishedAt: new Date(),
      content: '<p>old content</p>',
      version: 3,
      tags: [],
    });
    prismaMock.blog.update.mockResolvedValue({ id: 'blog-1', tags: [] });

    await service.updateBlog('blog-1', 'author-1', { title: 'New Title' });

    expect(prismaMock.blogRevision.create).not.toHaveBeenCalled();
    expect(prismaMock.blog.update.mock.calls[0][0].data).not.toHaveProperty('version');
  });

  it('does not capture a revision when the processed content is unchanged', async () => {
    const service = new BlogService();
    processMarkdownMock.mockReturnValue('<p>same content</p>');
    prismaMock.blog.findUnique.mockResolvedValue({
      authorId: 'author-1',
      slug: 'same-title',
      published: true,
      publishedAt: new Date(),
      content: '<p>same content</p>',
      version: 2,
      tags: [],
    });
    prismaMock.blog.update.mockResolvedValue({ id: 'blog-1', tags: [] });

    await service.updateBlog('blog-1', 'author-1', { content: 'same content' });

    expect(prismaMock.blogRevision.create).not.toHaveBeenCalled();
    expect(prismaMock.blog.update.mock.calls[0][0].data).not.toHaveProperty('version');
  });
});

describe('BlogService.listRevisions', () => {
  it('returns lightweight revisions (no content) newest-first for the blog author', async () => {
    const service = new BlogService();
    prismaMock.blog.findUnique.mockResolvedValue({ id: 'blog-1', authorId: 'author-1' });
    const revisions = [{ id: 'rev-2', version: 2 }, { id: 'rev-1', version: 1 }];
    prismaMock.blogRevision.findMany.mockResolvedValue(revisions);

    const result = await service.listRevisions('blog-1', 'author-1', ['author']);

    expect(prismaMock.blogRevision.findMany).toHaveBeenCalledWith({
      where: { blogId: 'blog-1' },
      orderBy: { version: 'desc' },
      select: { id: true, version: true, createdAt: true, createdBy: true, comment: true },
    });
    expect(result).toBe(revisions);
  });

  it('allows an admin who is not the author to list revisions', async () => {
    const service = new BlogService();
    prismaMock.blog.findUnique.mockResolvedValue({ id: 'blog-1', authorId: 'author-1' });
    prismaMock.blogRevision.findMany.mockResolvedValue([]);

    await expect(service.listRevisions('blog-1', 'admin-1', ['Admin'])).resolves.toEqual([]);
  });

  it('rejects a non-author, non-admin requester', async () => {
    const service = new BlogService();
    prismaMock.blog.findUnique.mockResolvedValue({ id: 'blog-1', authorId: 'author-1' });

    await expect(service.listRevisions('blog-1', 'someone-else', ['user']))
      .rejects.toThrow('Not authorized');
  });

  it('throws Blog not found for a missing blog', async () => {
    const service = new BlogService();
    prismaMock.blog.findUnique.mockResolvedValue(null);
    await expect(service.listRevisions('missing', 'author-1', [])).rejects.toThrow('Blog not found');
  });
});

describe('BlogService.getRevision', () => {
  it('returns the full revision including content for the author', async () => {
    const service = new BlogService();
    prismaMock.blog.findUnique.mockResolvedValue({ id: 'blog-1', authorId: 'author-1' });
    const revision = { id: 'rev-1', blogId: 'blog-1', content: '<p>old</p>' };
    prismaMock.blogRevision.findUnique.mockResolvedValue(revision);

    const result = await service.getRevision('blog-1', 'rev-1', 'author-1', []);
    expect(result).toBe(revision);
  });

  it('throws Revision not found if the revision belongs to a different blog', async () => {
    const service = new BlogService();
    prismaMock.blog.findUnique.mockResolvedValue({ id: 'blog-1', authorId: 'author-1' });
    prismaMock.blogRevision.findUnique.mockResolvedValue({ id: 'rev-1', blogId: 'other-blog' });

    await expect(service.getRevision('blog-1', 'rev-1', 'author-1', []))
      .rejects.toThrow('Revision not found');
  });

  it('rejects a non-author, non-admin requester', async () => {
    const service = new BlogService();
    prismaMock.blog.findUnique.mockResolvedValue({ id: 'blog-1', authorId: 'author-1' });

    await expect(service.getRevision('blog-1', 'rev-1', 'someone-else', ['user']))
      .rejects.toThrow('Not authorized');
  });
});

describe('BlogService.restoreRevision', () => {
  // Regression test: a revision captured before contentMarkdown existed only
  // has the rendered HTML - restoring it has no raw source to fall back to
  // except re-processing that HTML through the markdown pipeline (the old,
  // imperfect behavior). This is intentionally NOT lossless, but it's the
  // best available option rather than failing the restore outright.
  it('restores a legacy (no contentMarkdown) revision by re-processing its HTML snapshot', async () => {
    const service = new BlogService();
    processMarkdownMock.mockReturnValue('<p>restored content</p>');
    prismaMock.blog.findUnique.mockResolvedValue({
      authorId: 'author-1',
      slug: 'same-title',
      content: '<p>current content</p>',
      contentMarkdown: 'current content',
      version: 5,
    });
    prismaMock.blogRevision.findUnique.mockResolvedValue({
      id: 'rev-2',
      blogId: 'blog-1',
      content: 'restored content',
      contentMarkdown: null,
    });
    const restoredBlog = {
      id: 'blog-1',
      slug: 'same-title',
      content: '<p>restored content</p>',
      version: 6,
      updatedAt: new Date(),
    };
    prismaMock.blog.update.mockResolvedValue(restoredBlog);

    const result = await service.restoreRevision('blog-1', 'rev-2', 'author-1');

    expect(prismaMock.blogRevision.create).toHaveBeenCalledWith({
      data: {
        blogId: 'blog-1',
        version: 5,
        content: '<p>current content</p>',
        contentMarkdown: 'current content',
        createdBy: 'author-1',
      },
    });
    expect(prismaMock.blog.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'blog-1' },
      data: { content: '<p>restored content</p>', contentMarkdown: 'restored content', version: 6 },
    }));
    expect(updateBlogIndexMock).toHaveBeenCalledWith('blog-1', expect.objectContaining({
      content: '<p>restored content</p>',
    }));
    expect(cacheMock.invalidate).toHaveBeenCalledWith('same-title');
    expect(searchCacheMock.invalidateAll).toHaveBeenCalled();
    expect(result).toBe(restoredBlog);
  });

  // Regression test for the actual bug: restoring a revision that DOES have
  // a raw markdown snapshot must re-process that markdown, not the
  // already-rendered HTML in revision.content (which would double-process
  // it and corrupt the result).
  it('restores using the raw markdown snapshot when one is present, not the rendered HTML', async () => {
    const service = new BlogService();
    processMarkdownMock.mockReturnValue('<h1>Restored<a href="#restored">#</a></h1>\n<p>restored body</p>\n');
    prismaMock.blog.findUnique.mockResolvedValue({
      authorId: 'author-1',
      slug: 'same-title',
      content: '<p>current content</p>',
      contentMarkdown: 'current content',
      version: 5,
    });
    prismaMock.blogRevision.findUnique.mockResolvedValue({
      id: 'rev-2',
      blogId: 'blog-1',
      content: '<h1>Restored<a href="#restored">#</a></h1>\n<p>restored body</p>\n',
      contentMarkdown: '# Restored\n\nrestored body',
    });
    prismaMock.blog.update.mockResolvedValue({ id: 'blog-1', slug: 'same-title', version: 6 });

    await service.restoreRevision('blog-1', 'rev-2', 'author-1');

    expect(processMarkdownMock).toHaveBeenCalledWith('# Restored\n\nrestored body');
    expect(prismaMock.blog.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ contentMarkdown: '# Restored\n\nrestored body' }),
    }));
  });

  it('rejects restore attempts from a non-author (admins included - author only)', async () => {
    const service = new BlogService();
    prismaMock.blog.findUnique.mockResolvedValue({
      authorId: 'author-1',
      slug: 'same-title',
      content: '<p>current content</p>',
      version: 5,
    });

    await expect(service.restoreRevision('blog-1', 'rev-2', 'admin-1')).rejects.toThrow('Not authorized');
    expect(prismaMock.blogRevision.create).not.toHaveBeenCalled();
  });

  it('throws Revision not found for a revision belonging to another blog', async () => {
    const service = new BlogService();
    prismaMock.blog.findUnique.mockResolvedValue({
      authorId: 'author-1',
      slug: 'same-title',
      content: '<p>current content</p>',
      version: 5,
    });
    prismaMock.blogRevision.findUnique.mockResolvedValue({ id: 'rev-2', blogId: 'other-blog' });

    await expect(service.restoreRevision('blog-1', 'rev-2', 'author-1')).rejects.toThrow('Revision not found');
  });
});
