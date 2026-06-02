import { SearchService } from '@services/search.service';
import { prisma } from '@shared/utils/prismaClient';
import { searchCache } from '@shared/config/redis';
import { searchBlogsElastic } from '@utils/elasticsearch';

const prismaMock = prisma as unknown as {
  blog: {
    count: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
  };
  tag: {
    findMany: jest.Mock;
  };
};

const searchCacheMock = searchCache as unknown as {
  get: jest.Mock;
  set: jest.Mock;
};

const searchBlogsElasticMock = searchBlogsElastic as jest.Mock;

beforeEach(() => {
  prismaMock.blog.count.mockReset();
  prismaMock.blog.findMany.mockReset();
  prismaMock.blog.findUnique.mockReset();
  prismaMock.tag.findMany.mockReset();
  searchCacheMock.get.mockReset();
  searchCacheMock.set.mockReset();
  searchBlogsElasticMock.mockReset();
});

describe('SearchService blog search', () => {
  it('returns cached search results without querying Elasticsearch', async () => {
    const service = new SearchService();
    const params = {
      query: 'typescript',
      page: 1,
      limit: 10,
      sortBy: 'relevant' as const,
    };
    const cachedResults = {
      blogs: [{ id: 'blog-1', title: 'Cached Result' }],
      total: 1,
      page: 1,
      totalPages: 1,
    };
    searchCacheMock.get.mockResolvedValue(JSON.stringify(cachedResults));

    const result = await service.searchBlogs(params);

    expect(result).toEqual(cachedResults);
    expect(searchCacheMock.get).toHaveBeenCalledWith(JSON.stringify(params));
    expect(searchBlogsElasticMock).not.toHaveBeenCalled();
    expect(searchCacheMock.set).not.toHaveBeenCalled();
  });

  it('queries Elasticsearch and caches results on search cache miss', async () => {
    const service = new SearchService();
    const params = {
      query: 'typescript',
      page: 2,
      limit: 5,
      category: 'category-1',
      tags: ['node', 'api'],
      authorId: 'author-1',
      sortBy: 'recent' as const,
    };
    const results = {
      blogs: [{ id: 'blog-1', title: 'Fresh Result' }],
      total: 1,
      page: 2,
      totalPages: 1,
    };
    searchCacheMock.get.mockResolvedValue(null);
    searchBlogsElasticMock.mockResolvedValue(results);

    const result = await service.searchBlogs(params);

    expect(result).toEqual(results);
    expect(searchBlogsElasticMock).toHaveBeenCalledWith(params);
    expect(searchCacheMock.set).toHaveBeenCalledWith(
      JSON.stringify(params),
      JSON.stringify(results)
    );
  });
});

describe('SearchService popular tags', () => {
  it('fetches popular tags from published, non-deleted blogs only', async () => {
    const service = new SearchService();
    const tags = [{ id: 'tag-1', name: 'typescript' }];
    prismaMock.tag.findMany.mockResolvedValue(tags);

    const result = await service.getPopularTags();

    expect(result).toBe(tags);
    expect(prismaMock.tag.findMany).toHaveBeenCalledWith({
      take: 20,
      where: {
        blogs: {
          some: {
            blog: {
              published: true,
              deletedAt: null,
            },
          },
        },
      },
      orderBy: {
        blogs: {
          _count: 'desc',
        },
      },
    });
  });
});

describe('SearchService suggested blogs', () => {
  it('throws when suggestions are requested for a missing blog', async () => {
    const service = new SearchService();
    prismaMock.blog.findUnique.mockResolvedValue(null);

    await expect(service.getSuggestedBlogs('missing-blog')).rejects.toThrow('Blog not found');

    expect(prismaMock.blog.findUnique).toHaveBeenCalledWith({
      where: { id: 'missing-blog' },
      include: {
        tags: {
          include: { tag: true },
        },
        category: true,
      },
    });
    expect(prismaMock.blog.findMany).not.toHaveBeenCalled();
  });

  it('suggests published non-deleted blogs by shared tags or category', async () => {
    const service = new SearchService();
    const suggestedBlogs = [{ id: 'blog-2', title: 'Related Blog' }];
    prismaMock.blog.findUnique.mockResolvedValue({
      id: 'blog-1',
      categoryId: 'category-1',
      tags: [
        { tagId: 'tag-1', tag: { id: 'tag-1', name: 'typescript' } },
        { tagId: 'tag-2', tag: { id: 'tag-2', name: 'node' } },
      ],
      category: { id: 'category-1', name: 'Engineering' },
    });
    prismaMock.blog.findMany.mockResolvedValue(suggestedBlogs);

    const result = await service.getSuggestedBlogs('blog-1');

    expect(result).toBe(suggestedBlogs);
    expect(prismaMock.blog.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          {
            tags: {
              some: {
                tagId: {
                  in: ['tag-1', 'tag-2'],
                },
              },
            },
          },
          {
            categoryId: 'category-1',
          },
        ],
        AND: {
          id: { not: 'blog-1' },
          published: true,
          deletedAt: null,
        },
      },
      take: 5,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        category: true,
        tags: {
          include: { tag: true },
        },
        analytics: true,
      },
    });
  });
});

describe('SearchService user blog visibility', () => {
  it('shows only published blogs for public user-blog requests', async () => {
    const service = new SearchService();
    prismaMock.blog.findMany.mockResolvedValue([]);
    prismaMock.blog.count.mockResolvedValue(0);

    await service.getUserBlogs({ userId: 'author-1' });

    expect(prismaMock.blog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        authorId: 'author-1',
        deletedAt: null,
        published: true,
      },
      skip: 0,
      take: 10,
    }));
    expect(prismaMock.blog.count).toHaveBeenCalledWith({
      where: {
        authorId: 'author-1',
        deletedAt: null,
        published: true,
      },
    });
  });

  it('includes drafts when the requester owns the blog list', async () => {
    const service = new SearchService();
    prismaMock.blog.findMany.mockResolvedValue([]);
    prismaMock.blog.count.mockResolvedValue(0);

    await service.getUserBlogs({
      userId: 'author-1',
      currentUserId: 'author-1',
      page: 2,
      limit: 5,
    });

    expect(prismaMock.blog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        authorId: 'author-1',
        deletedAt: null,
      },
      skip: 5,
      take: 5,
    }));
    expect(prismaMock.blog.count).toHaveBeenCalledWith({
      where: {
        authorId: 'author-1',
        deletedAt: null,
      },
    });
  });

  it('rejects invalid pagination before querying Prisma', async () => {
    const service = new SearchService();

    await expect(service.getUserBlogs({
      userId: 'author-1',
      page: Number.NaN,
      limit: 10,
    })).rejects.toThrow('Invalid pagination');

    expect(prismaMock.blog.findMany).not.toHaveBeenCalled();
    expect(prismaMock.blog.count).not.toHaveBeenCalled();
  });
});
