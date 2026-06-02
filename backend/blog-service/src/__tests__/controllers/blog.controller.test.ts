import { Request, Response } from 'express';
import { BlogController } from '@controllers/blog.controller';
import { updateActiveBlogCount } from '@middlewares/metrics.middleware';

type MockResponse = Response & {
  json: jest.Mock;
  status: jest.Mock;
};

type MockBlogService = {
  deleteBlog: jest.Mock;
  updateBlog: jest.Mock;
};

type MockSearchService = {
  getSuggestedBlogs: jest.Mock;
  getUserBlogs: jest.Mock;
};

const asRequest = (req: Record<string, unknown>): Request => req as unknown as Request;

const createResponse = (): MockResponse => {
  const res = {} as MockResponse;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const createController = () => {
  const controller = new BlogController();
  const blogService = {
    deleteBlog: jest.fn(),
    updateBlog: jest.fn(),
  } as MockBlogService;
  const searchService = {
    getSuggestedBlogs: jest.fn(),
    getUserBlogs: jest.fn(),
  } as MockSearchService;

  Object.assign(controller as unknown as {
    blogService: MockBlogService;
    searchService: MockSearchService;
  }, {
    blogService,
    searchService,
  });

  return { controller, blogService, searchService };
};

describe('BlogController contract fixes', () => {
  it('deletes by blog ID and updates active count only from the deleted blog result', async () => {
    const { controller, blogService } = createController();
    const res = createResponse();
    blogService.deleteBlog.mockResolvedValue({
      id: 'blog-1',
      authorId: 'author-1',
      slug: 'old-slug',
      published: true,
    });

    await controller.delete(asRequest({
      params: { id: 'blog-1' },
      user: { id: 'author-1' },
    }), res);

    expect(blogService.deleteBlog).toHaveBeenCalledWith('blog-1', 'author-1');
    expect(updateActiveBlogCount).toHaveBeenCalledWith(-1);
    expect(res.json).toHaveBeenCalledWith({ message: 'Blog deleted successfully' });
  });

  it('passes uploaded files through update requests', async () => {
    const { controller, blogService } = createController();
    const res = createResponse();
    const file = { originalname: 'cover.png' } as Express.Multer.File;
    blogService.updateBlog.mockResolvedValue({ id: 'blog-1', title: 'Updated Title' });

    await controller.update(asRequest({
      params: { id: 'blog-1' },
      body: { title: 'Updated Title' },
      file,
      user: { id: 'author-1' },
    }), res);

    expect(blogService.updateBlog).toHaveBeenCalledWith('blog-1', 'author-1', {
      title: 'Updated Title',
      file,
    });
    expect(res.json).toHaveBeenCalledWith({ id: 'blog-1', title: 'Updated Title' });
  });

  it('reads suggested blog IDs from the blogId route param', async () => {
    const { controller, searchService } = createController();
    const res = createResponse();
    const suggestions = [{ id: 'blog-2' }];
    searchService.getSuggestedBlogs.mockResolvedValue(suggestions);

    await controller.getSuggestedBlogs(asRequest({
      params: { blogId: 'blog-1' },
    }), res);

    expect(searchService.getSuggestedBlogs).toHaveBeenCalledWith('blog-1');
    expect(res.json).toHaveBeenCalledWith(suggestions);
  });

  it('returns 401 for current-user blogs when no authenticated user exists', async () => {
    const { controller, searchService } = createController();
    const res = createResponse();

    await controller.getUserBlogs(asRequest({
      params: {},
      query: {},
    }), res);

    expect(searchService.getUserBlogs).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Authentication required',
      details: 'You must be logged in to fetch your own blogs',
    });
  });

  it('uses the authenticated user for current-user blog requests without passing NaN pagination', async () => {
    const { controller, searchService } = createController();
    const res = createResponse();
    const result = { blogs: [], total: 0, page: 1, totalPages: 0 };
    searchService.getUserBlogs.mockResolvedValue(result);

    await controller.getUserBlogs(asRequest({
      params: {},
      query: {},
      user: { id: 'author-1' },
    }), res);

    expect(searchService.getUserBlogs).toHaveBeenCalledWith({
      userId: 'author-1',
      currentUserId: 'author-1',
      page: undefined,
      limit: undefined,
    });
    expect(res.json).toHaveBeenCalledWith(result);
  });
});
