import { BlogService } from '@services/blog.service';
import { prisma } from '@shared/utils/prismaClient';
import { blogCache } from '@shared/config/redis';
import { processImage } from '@config/upload';
import { indexBlog, updateBlogIndex } from '@utils/elasticsearch';

const prismaMock = prisma as unknown as {
  blog: {
    create: jest.Mock;
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  };
};

const cacheMock = blogCache as unknown as {
  invalidate: jest.Mock;
  set: jest.Mock;
};

const processImageMock = processImage as jest.Mock;
const indexBlogMock = indexBlog as jest.Mock;
const updateBlogIndexMock = updateBlogIndex as jest.Mock;

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
    expect(cacheMock.invalidate).toHaveBeenCalledWith('same-title');
    expect(updateBlogIndexMock).toHaveBeenCalledWith('blog-1', {
      deletedAt: expect.any(Date),
    });
  });
});
