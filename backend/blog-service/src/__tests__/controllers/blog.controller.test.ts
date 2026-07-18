import { Request, Response } from 'express';
import { BlogController } from '@controllers/blog.controller';
import { trackBlogView, updateActiveBlogCount } from '@middlewares/metrics.middleware';

type MockResponse = Response & {
  json: jest.Mock;
  status: jest.Mock;
};

type MockBlogService = {
  deleteBlog: jest.Mock;
  getBlogBySlug: jest.Mock;
  updateBlog: jest.Mock;
  setVisibility: jest.Mock;
};

type MockSearchService = {
  getPopularTags: jest.Mock;
  getSuggestedBlogs: jest.Mock;
  getUserBlogs: jest.Mock;
  searchBlogs: jest.Mock;
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
    getBlogBySlug: jest.fn(),
    updateBlog: jest.fn(),
    setVisibility: jest.fn(),
  } as MockBlogService;
  const searchService = {
    getPopularTags: jest.fn(),
    getSuggestedBlogs: jest.fn(),
    getUserBlogs: jest.fn(),
    searchBlogs: jest.fn(),
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
  it('parses search query params and passes them to the search service', async () => {
    const { controller, searchService } = createController();
    const res = createResponse();
    const results = {
      blogs: [{ id: 'blog-1', title: 'Search Result' }],
      total: 1,
      page: 2,
      totalPages: 1,
    };
    searchService.searchBlogs.mockResolvedValue(results);

    await controller.search(asRequest({
      query: {
        query: 'typescript',
        page: '2',
        limit: '5',
        category: 'category-1',
        tags: 'node,api',
        sortBy: 'recent',
        author: 'author-1',
      },
    }), res);

    expect(searchService.searchBlogs).toHaveBeenCalledWith({
      query: 'typescript',
      page: 2,
      limit: 5,
      category: 'category-1',
      tags: ['node', 'api'],
      sortBy: 'recent',
      authorId: 'author-1',
    });
    expect(res.json).toHaveBeenCalledWith(results);
  });

  it('returns popular tags from the search service', async () => {
    const { controller, searchService } = createController();
    const res = createResponse();
    const tags = [{ id: 'tag-1', name: 'typescript' }];
    searchService.getPopularTags.mockResolvedValue(tags);

    await controller.getPopularTags(asRequest({}), res);

    expect(searchService.getPopularTags).toHaveBeenCalledWith();
    expect(res.json).toHaveBeenCalledWith(tags);
  });

  it('tracks public views only for published blog reads', async () => {
    const { controller, blogService } = createController();
    const res = createResponse();
    blogService.getBlogBySlug.mockResolvedValue({
      id: 'blog-1',
      slug: 'published-blog',
      published: true,
    });

    await controller.getBySlug(asRequest({
      params: { slug: 'published-blog' },
    }), res);

    expect(blogService.getBlogBySlug).toHaveBeenCalledWith('published-blog', undefined, expect.any(String));
    expect(trackBlogView).toHaveBeenCalledWith('blog-1');
    expect(res.json).toHaveBeenCalledWith({
      id: 'blog-1',
      slug: 'published-blog',
      published: true,
    });
  });

  it('does not track public views for author draft previews', async () => {
    const { controller, blogService } = createController();
    const res = createResponse();
    blogService.getBlogBySlug.mockResolvedValue({
      id: 'blog-1',
      slug: 'draft-blog',
      published: false,
    });

    await controller.getBySlug(asRequest({
      params: { slug: 'draft-blog' },
      user: { id: 'author-1' },
    }), res);

    expect(blogService.getBlogBySlug).toHaveBeenCalledWith('draft-blog', 'author-1', 'u:author-1');
    expect(trackBlogView).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      id: 'blog-1',
      slug: 'draft-blog',
      published: false,
    });
  });

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

  it('updates visibility via setVisibility without requiring req.user (admin moderation route has no ownership check)', async () => {
    const { controller, blogService } = createController();
    const res = createResponse();
    blogService.setVisibility.mockResolvedValue({ id: 'blog-1', published: false });

    await controller.updateVisibility(asRequest({
      params: { id: 'blog-1' },
      body: { published: false },
    }), res);

    expect(blogService.setVisibility).toHaveBeenCalledWith('blog-1', false);
    expect(res.json).toHaveBeenCalledWith({ id: 'blog-1', published: false });
  });

  it('rejects non-boolean visibility payloads with a 400', async () => {
    const { controller, blogService } = createController();
    const res = createResponse();

    await controller.updateVisibility(asRequest({
      params: { id: 'blog-1' },
      body: { published: 'not-a-boolean' },
    }), res);

    expect(blogService.setVisibility).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
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

  it('coerces a multipart "published" string into a real boolean (create and update are always multipart)', async () => {
    const { controller, blogService } = createController();

    const createRes = createResponse();
    blogService.updateBlog.mockResolvedValue({ id: 'blog-1', published: true });
    await controller.update(asRequest({
      params: { id: 'blog-1' },
      body: { published: 'true' },
      user: { id: 'author-1' },
    }), createRes);
    expect(blogService.updateBlog).toHaveBeenCalledWith('blog-1', 'author-1', { published: true });

    const updateRes = createResponse();
    blogService.updateBlog.mockResolvedValue({ id: 'blog-1', published: false });
    await controller.update(asRequest({
      params: { id: 'blog-1' },
      body: { published: 'false' },
      user: { id: 'author-1' },
    }), updateRes);
    expect(blogService.updateBlog).toHaveBeenCalledWith('blog-1', 'author-1', { published: false });
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
