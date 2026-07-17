import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import DashboardPage from '~/pages/admin/dashboard.vue';

const { adminApiState, apiState } = vi.hoisted(() => {
  return {
    adminApiState: {
      getDashboardStats: vi.fn(),
      listBlogs: vi.fn(),
      setBlogVisibility: vi.fn(),
      deleteBlog: vi.fn(),
      getUsers: vi.fn(),
      suspendUser: vi.fn(),
      unsuspendUser: vi.fn(),
      getRoles: vi.fn(),
      assignRole: vi.fn(),
      revokeRole: vi.fn(),
      getReports: vi.fn(),
      resolveReport: vi.fn(),
      dismissReport: vi.fn(),
      getAuditLog: vi.fn(),
    },
    apiState: {
      get: vi.fn(),
      put: vi.fn(),
      post: vi.fn(),
      del: vi.fn(),
    },
  };
});

describe('pages/admin/dashboard.vue', () => {
  beforeEach(() => {
    adminApiState.getDashboardStats = vi.fn().mockResolvedValue({
      totalBlogs: 0,
      totalUsers: 0,
      analytics: { views: 0, reads: 0, avgEngagement: 0 },
    });
    adminApiState.listBlogs = vi.fn().mockResolvedValue({ blogs: [], total: 0, totalPages: 1 });

    apiState.post = vi.fn();
    apiState.get = vi.fn();
    apiState.put = vi.fn();
    apiState.del = vi.fn();

    vi.stubGlobal('useAdminApi', () => adminApiState);
    vi.stubGlobal('useApi', () => apiState);
  });

  function mountPage() {
    return mount(DashboardPage, {
      global: {
        stubs: { NuxtLink: true },
      },
    });
  }

  it('renders the Rebuild search index button', async () => {
    const wrapper = mountPage();
    await flushPromises();

    const button = wrapper.findAll('button').find((b) => b.text() === 'Rebuild search index');
    expect(button).toBeTruthy();
  });

  it('clicking the button calls api.post with the reindex path', async () => {
    apiState.post = vi.fn().mockResolvedValue(undefined);

    const wrapper = mountPage();
    await flushPromises();

    const button = wrapper.findAll('button').find((b) => b.text() === 'Rebuild search index');
    await button!.trigger('click');
    await flushPromises();

    expect(apiState.post).toHaveBeenCalledWith('/api/blogs/search/reindex');
  });

  it('shows the success notice when the post resolves', async () => {
    apiState.post = vi.fn().mockResolvedValue(undefined);

    const wrapper = mountPage();
    await flushPromises();

    const button = wrapper.findAll('button').find((b) => b.text() === 'Rebuild search index');
    await button!.trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Search index rebuild started — runs in the background.');
  });

  it('shows the already-running notice on a 409', async () => {
    apiState.post = vi.fn().mockRejectedValue({ status: 409 });

    const wrapper = mountPage();
    await flushPromises();

    const button = wrapper.findAll('button').find((b) => b.text() === 'Rebuild search index');
    await button!.trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('A rebuild is already running.');
  });

  it('shows the search-unavailable notice on a 503', async () => {
    apiState.post = vi.fn().mockRejectedValue({ status: 503 });

    const wrapper = mountPage();
    await flushPromises();

    const button = wrapper.findAll('button').find((b) => b.text() === 'Rebuild search index');
    await button!.trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Search is unavailable right now — is Elasticsearch up?');
  });

  it('shows the generic notice on any other error', async () => {
    apiState.post = vi.fn().mockRejectedValue({ status: 500 });

    const wrapper = mountPage();
    await flushPromises();

    const button = wrapper.findAll('button').find((b) => b.text() === 'Rebuild search index');
    await button!.trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Could not start the rebuild. Please try again.');
  });
});
