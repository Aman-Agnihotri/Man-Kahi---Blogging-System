import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAuthStore } from '~/composables/useAuth';

const fetchMock = vi.fn();

vi.stubGlobal('normalizeApiError', (error: any) => ({
  message: error?.data?.message ?? error?.message ?? 'Something went wrong. Please try again.',
  status: error?.statusCode ?? error?.status,
}));

describe('useAuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    fetchMock.mockReset();
    vi.stubGlobal('useRuntimeConfig', () => ({ public: { apiUrl: 'http://REPLACE_ME_API_URL' } }));
    vi.stubGlobal('$fetch', fetchMock);
  });

  it('linkWithGoogle is a no-op when there is no token', async () => {
    const auth = useAuthStore();
    auth.token = null;

    await auth.linkWithGoogle();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('linkWithGoogle posts to /api/auth/link/google with Bearer header and redirects', async () => {
    const auth = useAuthStore();
    auth.token = 'tok-123';
    fetchMock.mockResolvedValueOnce({ url: '/auth/link/callback' });

    const locationStub = { href: '' };
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: locationStub,
    });

    await auth.linkWithGoogle();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/link/google',
      expect.objectContaining({
        baseURL: 'http://REPLACE_ME_API_URL',
        method: 'POST',
        headers: { Authorization: 'Bearer tok-123' },
      })
    );
    expect(window.location.href).toBe('http://REPLACE_ME_API_URL/api/auth/link/callback');
  });

  it('login failure sets a LOGIN_ERROR and rethrows', async () => {
    const auth = useAuthStore();
    fetchMock.mockRejectedValueOnce(new Error('bad credentials'));

    await expect(auth.login({ email: 'a@b.com', password: 'x' } as any)).rejects.toEqual({
      message: 'bad credentials',
      code: 'LOGIN_ERROR',
    });
    expect(auth.error).toEqual({ message: 'bad credentials', code: 'LOGIN_ERROR' });
  });

  it('clearAuthData nulls token, refreshToken, and user', () => {
    const auth = useAuthStore();
    auth.token = 't';
    auth.refreshToken = 'r';
    auth.user = { id: '1', email: 'a@b.com', username: 'a', roles: [] } as any;

    auth.clearAuthData();

    expect(auth.token).toBeNull();
    expect(auth.refreshToken).toBeNull();
    expect(auth.user).toBeNull();
  });

  it('setAuthData populates token, refreshToken, and user', () => {
    const auth = useAuthStore();
    const user = { id: '1', email: 'a@b.com', username: 'a', roles: [] } as any;

    auth.setAuthData({ token: 't1', refreshToken: 'r1', user });

    expect(auth.token).toBe('t1');
    expect(auth.refreshToken).toBe('r1');
    expect(auth.user).toEqual(user);
  });

  it('refreshSession returns true and sets state on success', async () => {
    const auth = useAuthStore();
    const user = { id: '1', email: 'a@b.com', username: 'a', roles: [] } as any;
    fetchMock.mockResolvedValueOnce({ token: 't1', refreshToken: 'r1', user });

    const ok = await auth.refreshSession();

    expect(ok).toBe(true);
    expect(auth.token).toBe('t1');
    expect(auth.user).toEqual(user);
  });

  it('refreshSession returns false and clears state on failure, never throws', async () => {
    const auth = useAuthStore();
    auth.token = 'stale';
    fetchMock.mockRejectedValueOnce(new Error('expired'));

    const ok = await auth.refreshSession();

    expect(ok).toBe(false);
    expect(auth.token).toBeNull();
    expect(auth.refreshToken).toBeNull();
    expect(auth.user).toBeNull();
  });
});
