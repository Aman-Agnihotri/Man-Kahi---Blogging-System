import { SearchService } from '@services/search.service';
import { searchCache } from '@shared/config/redis';
import { searchBlogsElastic } from '@utils/elasticsearch';

const searchCacheMock = searchCache as unknown as {
  get: jest.Mock;
  set: jest.Mock;
};

const searchBlogsElasticMock = searchBlogsElastic as jest.Mock;

beforeEach(() => {
  searchCacheMock.get.mockReset();
  searchCacheMock.set.mockReset();
  searchBlogsElasticMock.mockReset();
});

describe('SearchService degraded search contract', () => {
  it('returns the degraded 200-shape (never throws) when Elasticsearch rejects', async () => {
    const service = new SearchService();
    searchCacheMock.get.mockResolvedValue(null);
    searchBlogsElasticMock.mockRejectedValue(new Error('es down'));

    const result = await service.searchBlogs({ query: 'typescript', page: 2 });

    expect(result).toEqual({
      blogs: [],
      total: 0,
      page: 2,
      totalPages: 0,
      degraded: true,
      reason: 'search_unavailable',
    });
    expect(searchCacheMock.set).not.toHaveBeenCalled();
  });

  it('defaults page to 1 in the degraded shape when no page was requested', async () => {
    const service = new SearchService();
    searchCacheMock.get.mockResolvedValue(null);
    searchBlogsElasticMock.mockRejectedValue(new Error('es down'));

    const result = await service.searchBlogs({ query: 'typescript' });

    expect(result).toEqual(expect.objectContaining({ page: 1, degraded: true }));
  });

  it('degrades identically when the ES call short-circuits (CircuitOpenError) rather than a real ES error', async () => {
    const service = new SearchService();
    searchCacheMock.get.mockResolvedValue(null);
    const { CircuitOpenError } = require('@shared/utils/circuitBreaker');
    searchBlogsElasticMock.mockRejectedValue(new CircuitOpenError());

    const result = await service.searchBlogs({ query: 'typescript', page: 1 });

    expect(result).toEqual({
      blogs: [],
      total: 0,
      page: 1,
      totalPages: 0,
      degraded: true,
      reason: 'search_unavailable',
    });
  });
});
