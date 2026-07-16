import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import ExplorePage from '~/pages/content/explore.vue';

const { blogApiState } = vi.hoisted(() => {
  return {
    blogApiState: {
      search: vi.fn(),
      getPopularTags: vi.fn(),
      getCategories: vi.fn(),
    },
  };
});

describe('pages/content/explore.vue', () => {
  beforeEach(() => {
    blogApiState.search = vi.fn();
    blogApiState.getPopularTags = vi.fn().mockResolvedValue([]);
    blogApiState.getCategories = vi.fn().mockResolvedValue([]);

    vi.stubGlobal('useBlogApi', () => blogApiState);
  });

  it('renders the degraded envelope as an empty-results message, not an error box', async () => {
    blogApiState.search.mockResolvedValueOnce({
      blogs: [],
      total: 0,
      page: 1,
      totalPages: 0,
      degraded: true,
      reason: 'search_unavailable',
    });

    const wrapper = mount(ExplorePage);
    await flushPromises();

    expect(wrapper.text()).toContain('No stories match your search.');
    expect(wrapper.find('.bg-red-50').exists()).toBe(false);
  });

  it('renders the error box when search rejects', async () => {
    blogApiState.search.mockRejectedValueOnce(new Error('search failed'));

    const wrapper = mount(ExplorePage);
    await flushPromises();

    expect(wrapper.find('.bg-red-50').exists()).toBe(true);
    expect(wrapper.text()).toContain('search failed');
  });
});
