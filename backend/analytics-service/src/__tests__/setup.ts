/**
 * Jest Test Setup
 *
 * This file sets up the test environment for all analytics service tests.
 * It is automatically loaded before running tests due to the
 * "setupFilesAfterEnv" configuration in jest.config.js.
 *
 * Key responsibilities:
 * 1. Mock external dependencies to isolate tests
 * 2. Configure test cleanup between runs
 *
 * Tests instantiate AnalyticsController directly and call its methods with
 * hand-built Partial<Request>/Partial<Response> mocks - there is no
 * supertest/real-Express-router testing in this codebase, since spinning up
 * a real router in tests hits real rate-limit middleware that isn't
 * test-friendly.
 */

import { jest } from '@jest/globals';

const prismaMock = {
  analyticsEvent: {
    create: jest.fn(),
  },
  blogAnalytics: {
    upsert: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    aggregate: jest.fn(),
    count: jest.fn(),
  },
};

// Mock Prisma client to avoid actual database operations
jest.mock('@shared/utils/prismaClient', () => ({
  __esModule: true,
  default: prismaMock,
  prisma: prismaMock,
}));

// Mock Redis-backed analytics helpers to avoid actual Redis operations
jest.mock('@shared/config/redis', () => ({
  __esModule: true,
  analytics: {
    trackView: jest.fn(),
    trackReadProgress: jest.fn(),
    trackLinkClick: jest.fn(),
    getRealTimeStats: (jest.fn() as any).mockResolvedValue({
      views: 0,
      uniqueViews: 0,
      readProgress: 0,
      isHot: false,
    }),
    getHotBlogs: jest.fn(),
    streamEvent: jest.fn(),
  },
}));

// Mock metrics config used directly by the controller
jest.mock('@config/metrics', () => {
  const counter = { inc: jest.fn() };
  const histogram = { observe: jest.fn(), startTimer: jest.fn(() => jest.fn()) };
  return {
    __esModule: true,
    metrics: {
      trackQueue: jest.fn(() => ({
        setSize: jest.fn(),
        trackLatency: jest.fn(() => ({ end: jest.fn() })),
      })),
      trackError: jest.fn(),
      trackHttpRequest: jest.fn(() => ({ end: jest.fn() })),
      trackDatabaseOperation: jest.fn(() => ({ end: jest.fn() })),
      trackResource: jest.fn(() => ({ setUsage: jest.fn() })),
    },
    analyticsMetrics: {
      eventProcessed: counter,
      activeUsers: { set: jest.fn() },
      eventProcessingTime: histogram,
      aggregationOperations: counter,
      aggregationDuration: histogram,
      dataStorageOperations: counter,
      recoveryAttempts: counter,
    },
  };
});

// Mock metrics middleware used by the routes layer
jest.mock('@middlewares/metrics.middleware', () => ({
  __esModule: true,
  trackRequest: jest.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  trackEventProcessing: jest.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  trackAggregation: jest.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  trackStorageOperation: jest.fn(),
  trackError: jest.fn(),
  updateActiveUsers: jest.fn(),
  trackQueue: jest.fn(),
  setupResourceMonitoring: jest.fn(),
}));

// Mock logger to avoid console output during tests
jest.mock('@shared/utils/logger', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

// Automatically reset all mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});
