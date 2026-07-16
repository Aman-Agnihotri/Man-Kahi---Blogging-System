import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';

// The router calls passport.authenticate(...) at module load time to build
// the middleware chain, so the mock has to return a real middleware
// function synchronously. The route now uses the custom-callback form of
// passport.authenticate(strategy, options, callback) - the strategy itself
// invokes `callback(err, user, info)` rather than setting req.user/req.authInfo
// and calling next(). authenticateMiddlewareMock is reconfigured per test to
// stand in for what the real strategy would have passed to that callback.
const authenticateMiddlewareMock = jest.fn(
  (_req: any, _res: any, _next: any, callback: (err: unknown, user?: any, info?: any) => void) => {
    callback(null, undefined, undefined);
  }
);

const passportAuthenticateMock = jest.fn(
  (strategy: string, options?: { session?: boolean }, callback?: (err: unknown, user?: any, info?: any) => void) => {
    if (strategy === 'google' && options?.session === false && callback) {
      return (req: any, res: any, next: any) => authenticateMiddlewareMock(req, res, next, callback);
    }
    // /google (initiate) path - not under test here, just needs to not blow up
    return (_req: any, _res: any, next: any) => next();
  }
);

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
    authenticateMiddlewareMock.mockImplementation((_req: any, _res: any, _next: any, callback: any) => {
      callback(
        null,
        { id: 'user-1', email: 'user@example.com', username: 'user', roles: ['reader'] },
        {
          token: 'access-tok',
          refreshToken: 'r-token',
          oauthProfile: { id: 'google-1', email: 'user@example.com', profile: {}, provider: 'google' },
        }
      );
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

  it('redirects with error=oauth_failed and sets no cookie when the strategy did not produce a user', async () => {
    authenticateMiddlewareMock.mockImplementation((_req: any, _res: any, _next: any, callback: any) => {
      callback(null, undefined, undefined);
    });

    const res = await request(app).get('/api/auth/google/callback');

    expect(res.status).toBe(302);
    expect(res.headers['location']).toBe('http://localhost:3000/auth/callback?error=oauth_failed');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('ignores a crafted refreshToken query param and sets only the server-minted cookie', async () => {
    authenticateMiddlewareMock.mockImplementation((_req: any, _res: any, _next: any, callback: any) => {
      callback(
        null,
        { id: 'user-1', email: 'user@example.com', username: 'user', roles: ['reader'] },
        {
          token: 'access-tok',
          refreshToken: 'r-token',
          oauthProfile: { id: 'google-1', email: 'user@example.com', profile: {}, provider: 'google' },
        }
      );
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
