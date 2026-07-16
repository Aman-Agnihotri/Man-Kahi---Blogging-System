// setup.ts globally replaces @utils/elasticsearch with jest.fn() stand-ins,
// which bypasses the real swallow-and-log contract this file exercises.
// Unmock it so BlogService runs against the real indexBlog/updateBlogIndex
// implementations, guarded only at the @elastic/elasticsearch Client boundary.
const esClientMethods = {
  info: jest.fn().mockResolvedValue({}),
  index: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  search: jest.fn(),
  indices: { exists: jest.fn(), create: jest.fn() },
  bulk: jest.fn(),
  close: jest.fn(),
};

jest.mock('@elastic/elasticsearch', () => ({
  Client: jest.fn().mockImplementation(() => esClientMethods),
}));

jest.unmock('@utils/elasticsearch');

import { BlogService } from '@services/blog.service';
import { prisma } from '@shared/utils/prismaClient';
import { blogCache, searchCache } from '@shared/config/redis';

const prismaMock = prisma as unknown as {
  blog: {
    create: jest.Mock;
    findFirst: jest.Mock;
  };
};

const cacheMock = blogCache as unknown as {
  set: jest.Mock;
};

const searchCacheMock = searchCache as unknown as {
  invalidateAll: jest.Mock;
};

const blogRecord = {
  id: 'blog-1',
  title: 'Resilient Post',
  slug: 'resilient-post',
  content: '<p>content</p>',
  description: null,
  authorId: 'author-1',
  categoryId: null,
  published: true,
  createdAt: new Date('2026-07-15T00:00:00.000Z'),
  updatedAt: new Date('2026-07-15T00:00:00.000Z'),
  publishedAt: new Date('2026-07-15T00:00:00.000Z'),
  category: null,
  tags: [],
  analytics: { views: 0 },
};

beforeEach(() => {
  esClientMethods.info.mockReset().mockResolvedValue({});
  esClientMethods.index.mockReset();
  prismaMock.blog.findFirst.mockReset().mockResolvedValue(null);
  prismaMock.blog.create.mockReset().mockResolvedValue(blogRecord);
  cacheMock.set.mockReset();
  searchCacheMock.invalidateAll.mockReset();
});

describe('BlogService publish flow resilience', () => {
  it('completes blog creation (DB write + cache) when the Elasticsearch client rejects the index call', async () => {
    esClientMethods.index.mockRejectedValue(new Error('es down'));
    const service = new BlogService();

    const result = await service.createBlog({
      title: 'Resilient Post',
      content: '# Resilient Post',
      authorId: 'author-1',
      published: true,
    });

    expect(result).toBe(blogRecord);
    expect(esClientMethods.index).toHaveBeenCalled();
    expect(cacheMock.set).toHaveBeenCalledWith('resilient-post', JSON.stringify(blogRecord));
    expect(searchCacheMock.invalidateAll).toHaveBeenCalled();
  });
});
