import { Request, Response } from 'express';
import { isProviderConfigured, getAuthCallbackURL, requireProviderConfigured } from '@config/oauth';

describe('oauth config', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('isProviderConfigured', () => {
    it('is false when no credentials are set (OAuth optional per environment)', () => {
      delete process.env['GOOGLE_CLIENT_ID'];
      delete process.env['GOOGLE_CLIENT_SECRET'];
      expect(isProviderConfigured('google')).toBe(false);
    });

    it('is true once both client id and secret are set', () => {
      process.env['GOOGLE_CLIENT_ID'] = 'id';
      process.env['GOOGLE_CLIENT_SECRET'] = 'secret';
      expect(isProviderConfigured('google')).toBe(true);
    });
  });

  describe('getAuthCallbackURL', () => {
    it('prefers an explicit GOOGLE_CALLBACK_URL when set', () => {
      process.env['GOOGLE_CALLBACK_URL'] = 'https://example.com/api/auth/google/callback';
      expect(getAuthCallbackURL('google')).toBe('https://example.com/api/auth/google/callback');
    });

    it('falls back to AUTH_SERVICE_URL + the /api/auth mount path', () => {
      delete process.env['GOOGLE_CALLBACK_URL'];
      process.env['AUTH_SERVICE_URL'] = 'http://auth-service:3001';
      expect(getAuthCallbackURL('google')).toBe('http://auth-service:3001/api/auth/google/callback');
    });
  });

  describe('requireProviderConfigured (OAuth-disabled mode)', () => {
    const buildMockRes = () => {
      const json = jest.fn();
      const status = jest.fn().mockReturnValue({ json });
      return { status, json } as unknown as Response;
    };

    it('responds 503 and does not call next() when the provider is not configured', () => {
      delete process.env['GOOGLE_CLIENT_ID'];
      delete process.env['GOOGLE_CLIENT_SECRET'];
      const res = buildMockRes();
      const next = jest.fn();

      requireProviderConfigured('google')({} as Request, res, next);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(next).not.toHaveBeenCalled();
    });

    it('calls next() when the provider is configured', () => {
      process.env['GOOGLE_CLIENT_ID'] = 'id';
      process.env['GOOGLE_CLIENT_SECRET'] = 'secret';
      const res = buildMockRes();
      const next = jest.fn();

      requireProviderConfigured('google')({} as Request, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
