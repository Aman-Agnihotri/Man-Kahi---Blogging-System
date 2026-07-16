import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import CallbackPage from '~/pages/auth/callback.vue';

const { routeState, routerReplace, authState } = vi.hoisted(() => {
  return {
    routeState: { query: {} as Record<string, any> },
    routerReplace: vi.fn(),
    authState: { error: null as any, refreshSession: vi.fn() },
  };
});

describe('pages/auth/callback.vue', () => {
  beforeEach(() => {
    routerReplace.mockClear();
    routeState.query = {};
    authState.error = null;
    authState.refreshSession = vi.fn();

    vi.stubGlobal('useRoute', () => routeState);
    vi.stubGlobal('useRouter', () => ({ replace: routerReplace, push: vi.fn() }));
    vi.stubGlobal('useAuthStore', () => authState);
  });

  const loginErrorCases: Array<[string, string]> = [
    ['email_exists', 'This email is already registered. Sign in with your password, then link Google in settings.'],
    ['email_missing', "Google didn't share an email address for that account, so we can't sign you in. Try a different Google account."],
    ['oauth_failed', 'Something went wrong signing in with Google. Please try again.'],
    ['user_not_found', "We couldn't find your account. Please sign in again, then retry linking Google."],
  ];

  it.each(loginErrorCases)('code=%s maps to auth store error + redirects to login', async (code, message) => {
    routeState.query = { error: code };
    const wrapper = mount(CallbackPage);
    await flushPromises();

    expect(authState.error).toEqual({ message, code: 'OAUTH_ERROR' });
    expect(routerReplace).toHaveBeenCalledWith('/auth/login');
    wrapper.unmount();
  });

  const settingsErrorCases: Array<[string, string]> = [
    ['provider_already_linked', 'Your Google account is already linked to this profile.'],
    ['email_mismatch', "That Google account's email doesn't match your ManKahi email. Link a Google account that uses the same email."],
    ['invalid_link_token', 'Your linking session expired. Please try linking Google again.'],
  ];

  it.each(settingsErrorCases)('code=%s redirects to settings with linkError', async (code, message) => {
    routeState.query = { error: code };
    const wrapper = mount(CallbackPage);
    await flushPromises();

    expect(routerReplace).toHaveBeenCalledWith('/user/settings?linkError=' + encodeURIComponent(message));
    wrapper.unmount();
  });

  it('unknown error code falls back to oauth_failed message and redirects to login', async () => {
    routeState.query = { error: 'something_unrecognized' };
    const wrapper = mount(CallbackPage);
    await flushPromises();

    expect(authState.error).toEqual({
      message: 'Something went wrong signing in with Google. Please try again.',
      code: 'OAUTH_ERROR',
    });
    expect(routerReplace).toHaveBeenCalledWith('/auth/login');
    wrapper.unmount();
  });

  it('success with no linked query and refreshSession true redirects to dashboard', async () => {
    authState.refreshSession = vi.fn().mockResolvedValueOnce(true);
    const wrapper = mount(CallbackPage);
    await flushPromises();

    expect(routerReplace).toHaveBeenCalledWith('/user/dashboard');
    wrapper.unmount();
  });

  it('success with refreshSession false redirects to login', async () => {
    authState.refreshSession = vi.fn().mockResolvedValueOnce(false);
    const wrapper = mount(CallbackPage);
    await flushPromises();

    expect(routerReplace).toHaveBeenCalledWith('/auth/login');
    wrapper.unmount();
  });

  it('success with linked=google query and refreshSession true redirects to settings with linked', async () => {
    routeState.query = { linked: 'google' };
    authState.refreshSession = vi.fn().mockResolvedValueOnce(true);
    const wrapper = mount(CallbackPage);
    await flushPromises();

    expect(routerReplace).toHaveBeenCalledWith('/user/settings?linked=google');
    wrapper.unmount();
  });
});
