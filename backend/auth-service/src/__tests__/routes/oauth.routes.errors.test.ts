import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';

// Same seam as oauth.routes.test.ts: the route uses the custom-callback form
// of passport.authenticate(strategy, options, callback) - the mock captures
// that callback via authenticateMiddlewareMock and invokes it with whatever
// (err, user, info) each test configures, standing in for what the real
// Google strategy (passport.controller.ts) would have passed to `done`.
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

const trackErrorMock = jest.fn();

jest.mock('@middlewares/metrics.middleware', () => ({
  __esModule: true,
  trackAuthMetrics: jest.fn(() => (_req: any, _res: any, next: any) => next()),
  trackError: trackErrorMock,
}));

const handleOAuthCallbackMock = jest.fn().mockResolvedValue(undefined);

jest.mock('@services/auth.service', () => ({
  __esModule: true,
  AuthService: jest.fn().mockImplementation(() => ({
    handleOAuthCallback: handleOAuthCallbackMock,
  })),
}));

// Used for the POST /oauth/link/:provider coverage - same convention as
// auth.refresh.routes.test.ts (pass-through authenticate mock). The route
// wiring calls authenticate({ strategy: ['jwt'] }) once, at module load time
// (before any beforeEach/clearAllMocks runs), so a jest.fn() call-count
// assertion on the factory itself would always read zero - capture the
// options into a plain closure variable instead, which survives clearAllMocks.
let capturedAuthOptions: unknown;
jest.mock('@shared/middlewares/auth', () => ({
  __esModule: true,
  authenticate: (opts: unknown) => {
    capturedAuthOptions = opts;
    return (_req: any, _res: any, next: any) => next();
  },
}));

import { oauthRoutes, mapOAuthErrorToCode } from '@routes/oauth.routes';

describe('oauth routes - /google/callback strategy failure surfacing', () => {
  let app: Express;

  beforeEach(() => {
    process.env['FRONTEND_URL'] = 'http://localhost:3000';
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/auth', oauthRoutes);
    trackErrorMock.mockClear();
  });

  it('surfaces a strategy failure (email collision) as a 302 to /auth/callback?error=email_exists', async () => {
    authenticateMiddlewareMock.mockImplementation((_req: any, _res: any, _next: any, callback: any) => {
      callback(new Error('Account exists with different credentials'), undefined, undefined);
    });

    const res = await request(app).get('/api/auth/google/callback');

    expect(res.status).toBe(302);
    expect(res.headers['location']).toBe('http://localhost:3000/auth/callback?error=email_exists');
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(trackErrorMock).toHaveBeenCalledWith('oauth', 'callback_failed', 'google');
  });

  it('surfaces an unmapped strategy error as ?error=oauth_failed', async () => {
    authenticateMiddlewareMock.mockImplementation((_req: any, _res: any, _next: any, callback: any) => {
      callback(new Error('Default role not found'), undefined, undefined);
    });

    const res = await request(app).get('/api/auth/google/callback');

    expect(res.status).toBe(302);
    expect(res.headers['location']).toBe('http://localhost:3000/auth/callback?error=oauth_failed');
  });

  it('redirects to ?error=oauth_failed when the strategy calls back with no error and no user', async () => {
    authenticateMiddlewareMock.mockImplementation((_req: any, _res: any, _next: any, callback: any) => {
      callback(null, undefined, undefined);
    });

    const res = await request(app).get('/api/auth/google/callback');

    expect(res.status).toBe(302);
    expect(res.headers['location']).toBe('http://localhost:3000/auth/callback?error=oauth_failed');
    expect(res.headers['set-cookie']).toBeUndefined();
  });
});

describe('mapOAuthErrorToCode', () => {
  it('maps "Account exists with different credentials" to email_exists', () => {
    expect(mapOAuthErrorToCode(new Error('Account exists with different credentials'))).toBe('email_exists');
  });

  it('maps "Email mismatch between accounts" to email_mismatch', () => {
    expect(mapOAuthErrorToCode(new Error('Email mismatch between accounts'))).toBe('email_mismatch');
  });

  it('maps "Provider already linked to this account" to provider_already_linked', () => {
    expect(mapOAuthErrorToCode(new Error('Provider already linked to this account'))).toBe('provider_already_linked');
  });

  it('maps "Invalid token" to invalid_link_token', () => {
    expect(mapOAuthErrorToCode(new Error('Invalid token'))).toBe('invalid_link_token');
  });

  it('maps "User not found" to user_not_found', () => {
    expect(mapOAuthErrorToCode(new Error('User not found'))).toBe('user_not_found');
  });

  it('maps "Email not provided by OAuth provider" to email_missing', () => {
    expect(mapOAuthErrorToCode(new Error('Email not provided by OAuth provider'))).toBe('email_missing');
  });

  it('defaults unmapped messages to oauth_failed', () => {
    expect(mapOAuthErrorToCode(new Error('Something else entirely'))).toBe('oauth_failed');
  });

  it('defaults non-Error values to oauth_failed', () => {
    expect(mapOAuthErrorToCode('a plain string error')).toBe('oauth_failed');
    expect(mapOAuthErrorToCode(undefined)).toBe('oauth_failed');
  });
});

describe('oauth routes - POST /oauth/link/:provider', () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/auth', oauthRoutes);
  });

  it('is JWT-guarded and returns the /auth/:provider?linkToken= URL for an authenticated request', async () => {
    const res = await request(app)
      .post('/api/auth/link/google')
      .send({ token: 'a-jwt' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ url: '/auth/google?linkToken=a-jwt' });
    expect(capturedAuthOptions).toEqual({ strategy: ['jwt'] });
  });

  it('returns 400 when no token is provided', async () => {
    const res = await request(app).post('/api/auth/link/google').send({});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Token is required' });
  });
});
