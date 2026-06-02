import { SearchService } from '@services/search.service';
import { prisma } from '@shared/utils/prismaClient';

const prismaMock = prisma as unknown as {
  blog: {
    count: jest.Mock;
    findMany: jest.Mock;
  };
};

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
