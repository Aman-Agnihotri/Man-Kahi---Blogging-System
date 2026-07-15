import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';

// The router calls passport.authenticate(...) at module load time to build
// the middleware chain, so the mock has to return a real middleware
// function synchronously. authenticateMiddlewareMock is reconfigured per
// test to stand in for what passport would have put on req.user/req.authInfo.
const authenticateMiddlewareMock = jest.fn((req: any, _res: any, next: any) => next());

const passportAuthenticateMock = jest.fn((strategy: string, options?: { session?: boolean }) => {
  if (strategy === 'google' && options?.session === false) {
    return authenticateMiddlewareMock;
  }
  // /google (initiate) path - not under test here, just needs to not blow up
  return (_req: any, _res: any, next: any) => next();
});

jest.mock('@controllers/passport.controller', () => ({
  __esModule: true,
  passport: {
    authenticate: (...args: any[]) => passportAuthenticateMock(...(args as [string, any])),
  },
}));

jest.mock('@shared/middlewares/rateLimit', () => ({
  __esModule: true,
  createEndpointRateLimit: jest.fn(() => (_req: any, _res: any, next: any) => next()),
}));

jest.mock('@config/oauth', () => ({
  __esModule: true,
  requireProviderConfigured: jest.fn(() => (_req: any, _res: any, next: any) => next()),
}));

// The global setup.ts mock stubs trackAuthMetrics as a plain jest.fn(), but
// the /google route uses its return value directly as request-handler
// middleware - override with a pass-through middleware factory here.
jest.mock('@middlewares/metrics.middleware', () => ({
  __esModule: true,
  trackAuthMetrics: jest.fn(() => (_req: any, _res: any, next: any) => next()),
  trackError: jest.fn(),
}));

const handleOAuthCallbackMock = jest.fn().mockResolvedValue(undefined);

jest.mock('@services/auth.service', () => ({
  __esModule: true,
  AuthService: jest.fn().mockImplementation(() => ({
    handleOAuthCallback: handleOAuthCallbackMock,
  })),
}));

import { oauthRoutes } from '@routes/oauth.routes';

describe('oauth routes - /google/callback', () => {
  let app: Express;

  beforeEach(() => {
    process.env['FRONTEND_URL'] = 'http://localhost:3000';
    app = express();
    app.use(cookieParser());
    app.use('/api/auth', oauthRoutes);
  });

  it('sets the HttpOnly refresh cookie and redirects with no tokens in the URL', async () => {
    authenticateMiddlewareMock.mockImplementation((req: any, _res: any, next: any) => {
      req.user = { id: 'user-1', email: 'user@example.com', username: 'user', roles: ['reader'] };
      req.authInfo = {
        token: 'access-tok',
        refreshToken: 'r-token',
        oauthProfile: { id: 'google-1', email: 'user@example.com', profile: {}, provider: 'google' },
      };
      next();
    });

    const res = await request(app).get('/api/auth/google/callback');

    expect(res.status).toBe(302);
    expect(res.headers['location']).toBe('http://localhost:3000/auth/callback');

    const setCookie = res.headers['set-cookie'] as unknown as string[];
    expect(setCookie).toBeDefined();
    const refreshCookie = setCookie.find((c) => c.startsWith('refresh_token='));
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toContain('refresh_token=r-token');
    expect(refreshCookie).toContain('Path=/api/auth');
    expect(refreshCookie).toContain('HttpOnly');
    expect(refreshCookie).toContain('SameSite=Lax');

    expect(handleOAuthCallbackMock).toHaveBeenCalled();
  });

  it('redirects with an error and sets no cookie when the strategy did not produce auth info', async () => {
    authenticateMiddlewareMock.mockImplementation((_req: any, _res: any, next: any) => {
      next();
    });

    const res = await request(app).get('/api/auth/google/callback');

    expect(res.status).toBe(302);
    expect(res.headers['location']).toBe('http://localhost:3000/auth/callback?error=Authentication%20failed');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('ignores a crafted refreshToken query param and sets only the server-minted cookie', async () => {
    authenticateMiddlewareMock.mockImplementation((req: any, _res: any, next: any) => {
      req.user = { id: 'user-1', email: 'user@example.com', username: 'user', roles: ['reader'] };
      req.authInfo = {
        token: 'access-tok',
        refreshToken: 'r-token',
        oauthProfile: { id: 'google-1', email: 'user@example.com', profile: {}, provider: 'google' },
      };
      next();
    });

    const res = await request(app).get('/api/auth/google/callback?refreshToken=EVIL');

    expect(res.status).toBe(302);
    expect(res.headers['location']).toBe('http://localhost:3000/auth/callback');

    const setCookie = res.headers['set-cookie'] as unknown as string[];
    const refreshCookie = setCookie.find((c) => c.startsWith('refresh_token='));
    expect(refreshCookie).toContain('refresh_token=r-token');
    expect(refreshCookie).not.toContain('EVIL');
  });
});
