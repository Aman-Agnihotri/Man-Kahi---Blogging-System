import { jest } from '@jest/globals';

// Required by @shared/utils/constants before any service code is imported
process.env['NODE_ENV'] = 'test';
process.env['DATABASE_URL'] = 'postgresql://test:test@localhost:5432/test_db';
process.env['JWT_SECRET'] = 'test-jwt-secret-at-least-32-characters-long';
process.env['JWT_ACCESS_EXPIRES_IN'] = '1h';
process.env['JWT_REFRESH_EXPIRES_IN'] = '7d';
process.env['SESSION_SECRET'] = 'test-session-secret-at-least-32-characters';
process.env['AUTH_SERVICE_URL'] = 'http://localhost:3001';
process.env['FRONTEND_URL'] = 'http://localhost:3000';

const prismaMock = {
  user: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  oAuthProvider: {
    findFirst: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
  role: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
  follow: {
    upsert: jest.fn(),
    deleteMany: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
  },
};

jest.mock('@shared/utils/prismaClient', () => ({
  __esModule: true,
  default: prismaMock,
  prisma: prismaMock,
}));

jest.mock('@shared/config/redis', () => ({
  __esModule: true,
  tokenBlacklist: {
    add: jest.fn(),
    check: jest.fn(),
  },
  redis: {
    ping: jest.fn(),
    quit: jest.fn(),
  },
}));

jest.mock('@middlewares/metrics.middleware', () => ({
  __esModule: true,
  trackDbOperation: jest.fn(() => ({ end: jest.fn() })),
  trackAuthMetrics: jest.fn(),
  trackError: jest.fn(),
  updateActiveTokens: jest.fn(),
  trackRedisOperation: jest.fn(() => ({ end: jest.fn() })),
}));

jest.mock('@config/upload', () => ({
  __esModule: true,
  processAvatarImage: jest.fn(),
  avatarUpload: {
    single: jest.fn(() => jest.fn()),
  },
}));

jest.mock('@utils/password', () => ({
  __esModule: true,
  hashPassword: jest.fn(async (password: string) => `hashed:${password}`),
  verifyPassword: jest.fn(async (hashedPassword: string, plainPassword: string) => hashedPassword === `hashed:${plainPassword}`),
  needsRehash: jest.fn(() => false),
}));

jest.mock('@utils/mailer', () => ({
  __esModule: true,
  sendPasswordResetEmail: jest.fn(async () => undefined),
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

export { prismaMock };
