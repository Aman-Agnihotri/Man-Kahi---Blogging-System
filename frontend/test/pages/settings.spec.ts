import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import SettingsPage from '~/pages/user/settings.vue';

const { authState, apiState, profileApiState, routeState } = vi.hoisted(() => {
  return {
    authState: {
      user: { id: '1', email: 'a@b.com', username: 'alice', roles: [] as string[] },
      linkWithGoogle: vi.fn(),
      logout: vi.fn(),
      clearAuthData: vi.fn(),
    },
    apiState: {
      get: vi.fn(),
      del: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delWithBody: vi.fn(),
      postForm: vi.fn(),
      putForm: vi.fn(),
    },
    profileApiState: {
      getProfile: vi.fn(),
      updateProfile: vi.fn(),
      uploadAvatar: vi.fn(),
      getNotificationPrefs: vi.fn(),
      updateNotificationPrefs: vi.fn(),
      deleteAccount: vi.fn(),
    },
    routeState: { query: {} as Record<string, any> },
  };
});

describe('pages/user/settings.vue', () => {
  beforeEach(() => {
    routeState.query = {};

    profileApiState.getProfile = vi.fn().mockResolvedValue({
      bio: '',
      socialLinks: {},
      profileImage: null,
    });
    profileApiState.getNotificationPrefs = vi.fn().mockResolvedValue({
      emailOnComment: false,
      emailOnFollow: false,
      emailOnLike: false,
    });

    apiState.get = vi.fn().mockResolvedValue({ providers: [] });
    apiState.del = vi.fn().mockResolvedValue(undefined);

    authState.linkWithGoogle = vi.fn().mockResolvedValue(undefined);

    vi.stubGlobal('useAuthStore', () => authState);
    vi.stubGlobal('useApi', () => apiState);
    vi.stubGlobal('useProfileApi', () => profileApiState);
    vi.stubGlobal('useRoute', () => routeState);
  });

  it('renders Connected + Unlink when google is a linked provider', async () => {
    apiState.get = vi.fn().mockResolvedValue({ providers: ['google'] });

    const wrapper = mount(SettingsPage);
    await flushPromises();

    expect(wrapper.text()).toContain('Connected');
    const unlinkButton = wrapper.findAll('button').find((b) => b.text() === 'Unlink');
    expect(unlinkButton).toBeTruthy();
  });

  it('renders the Link button when no providers are linked', async () => {
    apiState.get = vi.fn().mockResolvedValue({ providers: [] });

    const wrapper = mount(SettingsPage);
    await flushPromises();

    const linkButton = wrapper.findAll('button').find((b) => b.text() === 'Link Google');
    expect(linkButton).toBeTruthy();
  });

  it('clicking Link Google calls auth.linkWithGoogle', async () => {
    apiState.get = vi.fn().mockResolvedValue({ providers: [] });

    const wrapper = mount(SettingsPage);
    await flushPromises();

    const linkButton = wrapper.findAll('button').find((b) => b.text() === 'Link Google');
    await linkButton!.trigger('click');
    await flushPromises();

    expect(authState.linkWithGoogle).toHaveBeenCalled();
  });

  it('shows the linkError message from the query string in the red error box', async () => {
    routeState.query = { linkError: 'Your linking session expired. Please try linking Google again.' };

    const wrapper = mount(SettingsPage);
    await flushPromises();

    expect(wrapper.find('.bg-red-50').text()).toContain('Your linking session expired. Please try linking Google again.');
  });

  it('shows a green success message when linked=google is in the query string', async () => {
    routeState.query = { linked: 'google' };

    const wrapper = mount(SettingsPage);
    await flushPromises();

    expect(wrapper.text()).toContain('Google account connected.');
  });

  it('clicking Unlink reveals the inline confirm', async () => {
    apiState.get = vi.fn().mockResolvedValue({ providers: ['google'] });

    const wrapper = mount(SettingsPage);
    await flushPromises();

    const unlinkButton = wrapper.findAll('button').find((b) => b.text() === 'Unlink');
    await unlinkButton!.trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Remove Google sign-in?');
  });

  it('confirming Unlink calls api.del', async () => {
    apiState.get = vi.fn().mockResolvedValue({ providers: ['google'] });
    apiState.del = vi.fn().mockResolvedValue(undefined);

    const wrapper = mount(SettingsPage);
    await flushPromises();

    const unlinkButton = wrapper.findAll('button').find((b) => b.text() === 'Unlink');
    await unlinkButton!.trigger('click');
    await flushPromises();

    const confirmButton = wrapper.findAll('button').find((b) => b.text() === 'Confirm');
    await confirmButton!.trigger('click');
    await flushPromises();

    expect(apiState.del).toHaveBeenCalledWith('/api/auth/unlink/google');
  });

  it('shows the only-sign-in-method message and keeps the confirm open when del rejects', async () => {
    apiState.get = vi.fn().mockResolvedValue({ providers: ['google'] });
    apiState.del = vi.fn().mockRejectedValue({
      message: 'Cannot unlink your only sign-in method. Set a password first.',
    });

    const wrapper = mount(SettingsPage);
    await flushPromises();

    const unlinkButton = wrapper.findAll('button').find((b) => b.text() === 'Unlink');
    await unlinkButton!.trigger('click');
    await flushPromises();

    const confirmButton = wrapper.findAll('button').find((b) => b.text() === 'Confirm');
    await confirmButton!.trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Cannot unlink your only sign-in method. Set a password first.');
    expect(wrapper.text()).toContain('Remove Google sign-in?');
  });
});
