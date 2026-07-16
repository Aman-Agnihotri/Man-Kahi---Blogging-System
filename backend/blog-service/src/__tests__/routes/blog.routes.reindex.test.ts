// Route-shape assertion for POST /search/reindex: confirms the route is
// gated behind admin authenticate() and the admin service rate limit,
// mirroring the /:id/moderate admin route pattern. The 403-for-non-admin
// enforcement itself lives in - and is already tested by - the shared
// authenticate() middleware, so this file only checks that this route
// wires the admin variants in, not that they reject non-admins.
type Handler = ((req: unknown, res: unknown, next: unknown) => unknown) & {
  __authOptions?: { roles?: string[] };
  __rateLimitService?: string;
};

const authenticateMock = jest.fn((options?: { roles?: string[] }) => {
  const handler: Handler = (_req, _res, next) => (next as () => void)();
  handler.__authOptions = options;
  return handler;
});

jest.mock('@shared/middlewares/auth', () => ({
  __esModule: true,
  authenticate: (options?: { roles?: string[] }) => authenticateMock(options),
}));

const createServiceRateLimitMock = jest.fn((serviceName: string) => {
  const handler: Handler = (_req, _res, next) => (next as () => void)();
  handler.__rateLimitService = serviceName;
  return handler;
});

jest.mock('@shared/middlewares/rateLimit', () => ({
  __esModule: true,
  createServiceRateLimit: (serviceName: string) => createServiceRateLimitMock(serviceName),
  createEndpointRateLimit: jest.fn(() => (_req: unknown, _res: unknown, next: unknown) =>
    (next as () => void)()),
}));

jest.mock('@controllers/blog.controller', () => ({
  __esModule: true,
  BlogController: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@controllers/comment.controller', () => ({
  __esModule: true,
  CommentController: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@controllers/revision.controller', () => ({
  __esModule: true,
  RevisionController: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@controllers/category.controller', () => ({
  __esModule: true,
  CategoryController: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@middlewares/analytics.middleware', () => ({
  __esModule: true,
  trackBlogView: jest.fn((_req: unknown, _res: unknown, next: unknown) => (next as () => void)()),
  trackReadProgress: jest.fn((_req: unknown, _res: unknown, next: unknown) =>
    (next as () => void)()),
  trackLinkClick: jest.fn((_req: unknown, _res: unknown, next: unknown) =>
    (next as () => void)()),
  addAnalyticsHeaders: jest.fn((_req: unknown, _res: unknown, next: unknown) =>
    (next as () => void)()),
}));

jest.mock('@config/metrics', () => ({
  __esModule: true,
  metricsHandler: jest.fn(),
}));

interface RouteLayer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: Handler }>;
  };
}

describe('POST /search/reindex route shape', () => {
  it('gates the reindex route behind admin authenticate() and the admin service rate limit', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const router = require('@routes/blog.routes').default;

    const layer = (router.stack as RouteLayer[]).find(
      (l) => l.route?.path === '/search/reindex' && l.route.methods['post']
    );

    expect(layer).toBeDefined();

    const handlers = layer!.route!.stack.map((s) => s.handle);

    const authHandler = handlers.find((h) => h.__authOptions !== undefined);
    expect(authHandler?.__authOptions).toEqual({ roles: ['admin'] });

    const rateLimitHandler = handlers.find((h) => h.__rateLimitService !== undefined);
    expect(rateLimitHandler?.__rateLimitService).toBe('admin');
  });
});
