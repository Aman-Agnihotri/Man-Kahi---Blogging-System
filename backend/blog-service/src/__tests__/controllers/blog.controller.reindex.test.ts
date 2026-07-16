import { Request, Response } from 'express';

type MockResponse = Response & {
  json: jest.Mock;
  status: jest.Mock;
};

const asRequest = (req: Record<string, unknown> = {}): Request => req as unknown as Request;

const createResponse = (): MockResponse => {
  const res = {} as MockResponse;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

// The module-level `reindexInProgress` guard in blog.controller.ts is a
// singleton for the life of the module instance, so each test gets its own
// fresh module graph (including a freshly-invoked @utils/elasticsearch
// mock factory from setup.ts) via jest.resetModules() - same pattern as
// utils/elasticsearch.circuitBreaker.test.ts.
const loadController = () => {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { BlogController } = require('@controllers/blog.controller');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const es = require('@utils/elasticsearch');
  return { controller: new BlogController(), es };
};

// Flush both the microtask queue (promise .then chains) and any
// already-scheduled macrotasks, so fire-and-forget continuations
// (.then/.catch/.finally on syncBlogsToElasticsearch) have settled.
const flushAsync = () => new Promise((resolve) => setImmediate(resolve));

describe('BlogController.reindex', () => {
  it('starts a reindex and responds 202 when Elasticsearch is reachable and none is in progress', async () => {
    const { controller, es } = loadController();
    es.guardedEs.mockImplementation((fn: (c: unknown) => unknown) => fn({ ping: jest.fn() }));
    es.syncBlogsToElasticsearch.mockReturnValue(new Promise(() => {}));

    const res = createResponse();
    await controller.reindex(asRequest(), res);

    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith({ status: 'reindex_started' });
    expect(es.syncBlogsToElasticsearch).toHaveBeenCalledTimes(1);
  });

  it('returns 409 for a second call while a reindex is already in progress, without starting another sync', async () => {
    const { controller, es } = loadController();
    es.guardedEs.mockImplementation((fn: (c: unknown) => unknown) => fn({ ping: jest.fn() }));
    es.syncBlogsToElasticsearch.mockReturnValue(new Promise(() => {}));

    const firstRes = createResponse();
    await controller.reindex(asRequest(), firstRes);
    expect(firstRes.status).toHaveBeenCalledWith(202);

    const secondRes = createResponse();
    await controller.reindex(asRequest(), secondRes);

    expect(secondRes.status).toHaveBeenCalledWith(409);
    expect(secondRes.json).toHaveBeenCalledWith({ status: 'reindex_in_progress' });
    expect(es.syncBlogsToElasticsearch).toHaveBeenCalledTimes(1);
  });

  it('returns 503 and never starts a sync when the Elasticsearch precheck fails', async () => {
    const { controller, es } = loadController();
    es.guardedEs.mockRejectedValue(new Error('es down'));

    const res = createResponse();
    await controller.reindex(asRequest(), res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ status: 'search_unavailable' });
    expect(es.syncBlogsToElasticsearch).not.toHaveBeenCalled();
  });

  it('clears the in-progress guard once the background sync succeeds, allowing a subsequent call to start', async () => {
    const { controller, es } = loadController();
    es.guardedEs.mockImplementation((fn: (c: unknown) => unknown) => fn({ ping: jest.fn() }));

    let resolveSync!: () => void;
    es.syncBlogsToElasticsearch.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveSync = resolve;
      })
    );

    const firstRes = createResponse();
    await controller.reindex(asRequest(), firstRes);
    expect(firstRes.status).toHaveBeenCalledWith(202);

    resolveSync();
    await flushAsync();

    es.syncBlogsToElasticsearch.mockReturnValueOnce(new Promise(() => {}));
    const secondRes = createResponse();
    await controller.reindex(asRequest(), secondRes);

    expect(secondRes.status).toHaveBeenCalledWith(202);
    expect(es.syncBlogsToElasticsearch).toHaveBeenCalledTimes(2);
  });

  it('clears the in-progress guard once the background sync fails, allowing a subsequent call to start', async () => {
    const { controller, es } = loadController();
    es.guardedEs.mockImplementation((fn: (c: unknown) => unknown) => fn({ ping: jest.fn() }));

    let rejectSync!: (err: Error) => void;
    es.syncBlogsToElasticsearch.mockReturnValueOnce(
      new Promise<void>((_resolve, reject) => {
        rejectSync = reject;
      })
    );

    const firstRes = createResponse();
    await controller.reindex(asRequest(), firstRes);
    expect(firstRes.status).toHaveBeenCalledWith(202);

    rejectSync(new Error('sync failed'));
    await flushAsync();

    es.syncBlogsToElasticsearch.mockReturnValueOnce(new Promise(() => {}));
    const secondRes = createResponse();
    await controller.reindex(asRequest(), secondRes);

    expect(secondRes.status).toHaveBeenCalledWith(202);
    expect(es.syncBlogsToElasticsearch).toHaveBeenCalledTimes(2);
  });
});
