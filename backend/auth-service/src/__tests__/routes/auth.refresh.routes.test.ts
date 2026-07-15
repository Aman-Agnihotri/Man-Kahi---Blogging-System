import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';

// Mirrors the oauth.routes.test.ts pattern: mount the real router, but stub
// out the rate limiter and auth middleware factories so the route wiring
// itself (validation -> cookie-first resolution -> service call) is what's
// under test, not Redis-backed rate limiting or JWT auth.
jest.mock('@shared/middlewares/rateLimit', () => ({
  __esModule: true,
  createServiceRateLimit: jest.fn(() => (_req: any, _res: any, next: any) => next()),
  createEndpointRateLimit: jest.fn(() => (_req: any, _res: any, next: any) => next()),
}));

jest.mock('@shared/middlewares/auth', () => ({
  __esModule: true,
  authenticate: jest.fn(() => (_req: any, _res: any, next: any) => next()),
}));

// The global setup.ts mock stubs trackAuthMetrics as a plain jest.fn(), but
// the route uses its return value directly as request-handler middleware -
// override with a pass-through middleware factory here (same reasoning as
// oauth.routes.test.ts).
jest.mock('@middlewares/metrics.middleware', () => ({
  __esModule: true,
  trackAuthMetrics: jest.fn(() => (_req: any, _res: any, next: any) => next()),
  trackError: jest.fn(),
  trackRedisOperation: jest.fn(() => ({ end: jest.fn() })),
  trackDbOperation: jest.fn(() => ({ end: jest.fn() })),
  updateActiveTokens: jest.fn(),
}));

const refreshTokenMock = jest.fn();

jest.mock('@services/auth.service', () => ({
  __esModule: true,
  AuthService: jest.fn().mockImplementation(() => ({
    refreshToken: refreshTokenMock,
  })),
  AccountSuspendedError: class AccountSuspendedError extends Error {},
}));

import authRoutes from '@routes/auth.routes';

describe('auth routes - POST /refresh', () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/auth', authRoutes);
  });

  it('rotates the cookie for a cookie-only request with no body at all', async () => {
    refreshTokenMock.mockResolvedValue({ token: 'a-token', refreshToken: 'r-token' });

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', ['refresh_token=cookie-token']);

    expect(res.status).toBe(200);
    expect(refreshTokenMock).toHaveBeenCalledWith('cookie-token');

    const setCookie = res.headers['set-cookie'] as unknown as string[];
    expect(setCookie).toBeDefined();
    const refreshCookie = setCookie.find((c) => c.startsWith('refresh_token='));
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toContain('refresh_token=r-token');
  });

  it('still works when the refresh token arrives only in the body', async () => {
    refreshTokenMock.mockResolvedValue({ token: 'a-token', refreshToken: 'r-token' });

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'body-token' });

    expect(res.status).toBe(200);
    expect(refreshTokenMock).toHaveBeenCalledWith('body-token');
  });

  it('returns 400 from the controller when there is neither a cookie nor a body', async () => {
    const res = await request(app).post('/api/auth/refresh');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Refresh token is required' });
    expect(refreshTokenMock).not.toHaveBeenCalled();
  });
});
