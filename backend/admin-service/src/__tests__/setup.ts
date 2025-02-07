/**
 * Jest Test Setup
 * 
 * This file sets up the test environment for all admin service tests.
 * It is automatically loaded before running tests due to the "setupFilesAfterEnv"
 * configuration in jest.config.js.
 * 
 * Key responsibilities:
 * 1. Mock external dependencies to isolate tests
 * 2. Set up environment variables for testing
 * 3. Configure test cleanup between runs
 */

import { jest } from '@jest/globals';

// Mock Prisma client to avoid actual database operations
jest.mock('@shared/utils/prismaClient', () => ({
  __esModule: true,
  default: {
    blog: {
      count: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn()
    },
    user: {
      count: jest.fn()
    },
    tag: {
      findMany: jest.fn()
    }
  }
}));

// Mock axios to avoid actual HTTP requests
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    create: jest.fn().mockReturnThis(),
    isAxiosError: (error: any) => error.isAxiosError === true
  }
}));

// Set up test environment variables
process.env['ANALYTICS_SERVICE_URL'] = 'http://analytics-service:3003';

// Mock metrics tracking to avoid actual metrics collection
jest.mock('@middlewares/metrics.middleware', () => ({
  trackAdminError: jest.fn(),
  trackDbOperation: jest.fn().mockReturnValue({ end: jest.fn() }),
  trackExternalCall: jest.fn().mockReturnValue({ end: jest.fn() }),
}));

// Mock logger to avoid console output during tests
jest.mock('@shared/utils/logger', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn()
  }
}));

// Automatically reset all mocks before each test
// This ensures each test starts with fresh mocks
beforeEach(() => {
  jest.clearAllMocks();
});
