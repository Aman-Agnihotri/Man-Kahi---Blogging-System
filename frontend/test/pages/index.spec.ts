import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import IndexPage from '~/pages/index.vue';

const { blogApiState } = vi.hoisted(() => {
  return {
    blogApiState: {
      getRecent: vi.fn(),
      getTrending: vi.fn(),
    },
  };
});

describe('pages/index.vue', () => {
  beforeEach(() => {
    blogApiState.getRecent = vi.fn().mockResolvedValue({
      blogs: [],
      total: 0,
      page: 1,
      totalPages: 1,
    });
    blogApiState.getTrending = vi.fn().mockResolvedValue([]);

    vi.stubGlobal('useBlogApi', () => blogApiState);
  });

  it('loads Featured via getRecent, not search', async () => {
    mount(IndexPage);
    await flushPromises();

    expect(blogApiState.getRecent).toHaveBeenCalledWith(1, 9);
    expect(blogApiState.getTrending).toHaveBeenCalledWith(5);
  });

  it('renders flat post.views/post.readTime/post.authorUsername from the mocked response', async () => {
    blogApiState.getRecent.mockResolvedValueOnce({
      blogs: [
        {
          id: 'blog-1',
          title: 'Recent Post',
          slug: 'recent-post',
          excerpt: 'excerpt',
          coverImage: null,
          tags: ['tech'],
          authorUsername: 'author-name',
          publishedAt: '2026-01-01T00:00:00.000Z',
          views: 42,
          readTime: 5,
        },
      ],
      total: 1,
      page: 1,
      totalPages: 2,
    });

    const wrapper = mount(IndexPage);
    await flushPromises();

    expect(wrapper.text()).toContain('Recent Post');
    expect(wrapper.text()).toContain('author-name');
    expect(wrapper.text()).toContain('42');
    expect(wrapper.text()).toContain('5 min read');
  });

  it('Load More triggers getRecent(page+1, ...)', async () => {
    blogApiState.getRecent.mockResolvedValueOnce({
      blogs: [
        {
          id: 'blog-1',
          title: 'Recent Post',
          slug: 'recent-post',
          excerpt: 'excerpt',
          coverImage: null,
          tags: ['tech'],
          authorUsername: 'author-name',
          publishedAt: '2026-01-01T00:00:00.000Z',
          views: 42,
          readTime: 5,
        },
      ],
      total: 2,
      page: 1,
      totalPages: 2,
    });

    const wrapper = mount(IndexPage);
    await flushPromises();

    blogApiState.getRecent.mockResolvedValueOnce({
      blogs: [
        {
          id: 'blog-2',
          title: 'Older Post',
          slug: 'older-post',
          excerpt: 'excerpt',
          coverImage: null,
          tags: ['tech'],
          authorUsername: 'author-name',
          publishedAt: '2026-01-01T00:00:00.000Z',
          views: 1,
          readTime: 2,
        },
      ],
      total: 2,
      page: 2,
      totalPages: 2,
    });

    await wrapper.find('button').trigger('click');
    await flushPromises();

    expect(blogApiState.getRecent).toHaveBeenCalledWith(2, 9);
  });
});
