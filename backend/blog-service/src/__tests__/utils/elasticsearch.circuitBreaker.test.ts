// setup.ts (setupFilesAfterEach) globally replaces the whole @utils/elasticsearch
// module with jest.fn() stand-ins, which makes the module's real breaker/guardedEs
// code unreachable. This file unmocks it and instead mocks only the @elastic/elasticsearch
// Client, so the real breaker wiring runs against a controllable client.
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

beforeEach(() => {
  jest.resetModules();
  process.env['ES_BREAKER_FAILURE_THRESHOLD'] = '3';
  process.env['ES_BREAKER_RESET_TIMEOUT_MS'] = '30000';
  process.env['ES_BREAKER_CALL_TIMEOUT_MS'] = '2500';

  esClientMethods.info.mockReset().mockResolvedValue({});
  esClientMethods.index.mockReset();
  esClientMethods.update.mockReset();
  esClientMethods.delete.mockReset();
  esClientMethods.search.mockReset();
});

afterEach(() => {
  delete process.env['ES_BREAKER_FAILURE_THRESHOLD'];
  delete process.env['ES_BREAKER_RESET_TIMEOUT_MS'];
  delete process.env['ES_BREAKER_CALL_TIMEOUT_MS'];
});

describe('elasticsearch circuit breaker wiring', () => {
  it('short-circuits after N (=threshold) consecutive failures without invoking the guarded action further', async () => {
    const { guardedEs } = require('@utils/elasticsearch');
    const { CircuitOpenError } = require('@shared/utils/circuitBreaker');
    const action = jest.fn().mockRejectedValue(new Error('es down'));

    for (let i = 0; i < 3; i++) {
      await expect(guardedEs(action)).rejects.toThrow('es down');
    }
    expect(action).toHaveBeenCalledTimes(3);

    // Circuit is now OPEN: subsequent calls must short-circuit without
    // touching the guarded action at all.
    await expect(guardedEs(action)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(action).toHaveBeenCalledTimes(3);

    await expect(guardedEs(action)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(action).toHaveBeenCalledTimes(3);
  });

  it('indexBlog swallows ES failures, logs a warning, and never rethrows', async () => {
    const { indexBlog } = require('@utils/elasticsearch');
    const logger = require('@shared/utils/logger').default;
    esClientMethods.index.mockRejectedValue(new Error('es down'));

    const blog = {
      id: 'blog-1',
      title: 'title',
      content: 'content',
      description: null,
      slug: 'slug',
      authorId: 'author-1',
      authorUsername: null,
      categoryId: null,
      tags: [],
      published: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      publishedAt: null,
      deletedAt: null,
      views: 0,
      excerpt: null,
      coverImage: null,
      readTime: 1,
    };

    await expect(indexBlog(blog)).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ blogId: 'blog-1' }),
      'ES index operation skipped'
    );
  });

  it('updateBlogIndex swallows ES failures and never rethrows', async () => {
    const { updateBlogIndex } = require('@utils/elasticsearch');
    esClientMethods.update.mockRejectedValue(new Error('es down'));

    await expect(updateBlogIndex('blog-1', { title: 'new title' })).resolves.toBeUndefined();
  });

  it('removeBlogFromIndex swallows ES failures and never rethrows', async () => {
    const { removeBlogFromIndex } = require('@utils/elasticsearch');
    esClientMethods.delete.mockRejectedValue(new Error('es down'));

    await expect(removeBlogFromIndex('blog-1')).resolves.toBeUndefined();
  });
});
