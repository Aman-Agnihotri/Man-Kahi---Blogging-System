const prismaMock = {
  blog: {
    count: jest.fn(),
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  tag: {
    findMany: jest.fn(),
  },
  blogAnalytics: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  blogRevision: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  like: {
    create: jest.fn(),
    delete: jest.fn(),
    findUnique: jest.fn(),
  },
  bookmark: {
    count: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  comment: {
    count: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  category: {
    count: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  report: {
    create: jest.fn(),
    findFirst: jest.fn(),
  },
};

jest.mock('@shared/utils/prismaClient', () => ({
  __esModule: true,
  default: prismaMock,
  prisma: prismaMock,
}));

jest.mock('@shared/config/redis', () => ({
  __esModule: true,
  blogCache: {
    get: jest.fn(),
    set: jest.fn(),
    invalidate: jest.fn(),
    incrementViews: jest.fn(),
  },
  searchCache: {
    get: jest.fn(),
    set: jest.fn(),
    invalidateAll: jest.fn(),
  },
  redis: {
    ping: jest.fn(),
    quit: jest.fn(),
  },
}));

jest.mock('@utils/elasticsearch', () => ({
  __esModule: true,
  elasticClient: {
    close: jest.fn(),
  },
  indexBlog: jest.fn(),
  searchBlogsElastic: jest.fn(),
  setupElasticsearch: jest.fn(),
  updateBlogIndex: jest.fn(),
}));

jest.mock('@config/upload', () => ({
  __esModule: true,
  processImage: jest.fn(),
  upload: {
    single: jest.fn(() => jest.fn()),
  },
}));

jest.mock('@utils/markdown', () => ({
  __esModule: true,
  processMarkdown: jest.fn((content: string) => `<p>${content}</p>`),
  validateMarkdown: jest.fn(() => ({ isValid: true, errors: [] })),
}));

jest.mock('@middlewares/metrics.middleware', () => ({
  __esModule: true,
  trackBlogOperation: jest.fn(() => jest.fn((_req, _res, next) => next())),
  trackBlogView: jest.fn(),
  trackDbOperation: jest.fn(() => ({ end: jest.fn() })),
  trackError: jest.fn(),
  trackMinioOperation: jest.fn(() => ({ end: jest.fn() })),
  trackSearchOperation: jest.fn(() => ({ end: jest.fn() })),
  updateActiveBlogCount: jest.fn(),
}));

jest.mock('@shared/utils/logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
});
