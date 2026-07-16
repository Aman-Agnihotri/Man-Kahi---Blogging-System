import { Client, estypes } from '@elastic/elasticsearch'
import logger from '@shared/utils/logger'
import { prisma } from '@shared/utils/prismaClient'
import { env } from '@config/env'
import { CircuitBreaker, CircuitOpenError, CircuitState } from '@shared/utils/circuitBreaker'
import { esBreakerMetrics } from '@config/metrics'

// Add debug logging
logger.info(`Attempting to connect to Elasticsearch at ${env.ELASTICSEARCH_URL}`);

export const elasticClient = new Client({
  node: env.ELASTICSEARCH_URL,
  maxRetries: 5,
  requestTimeout: 10000
});

// Validate connection on client creation
(async () => {
  try {
    const info = await elasticClient.info();
    logger.info(info, 'Successfully connected to Elasticsearch');
  } catch (error) {
    logger.error({ err: error }, 'Failed to connect to Elasticsearch');
    throw error;
  }
})();

const stateToGauge = (state: CircuitState): number => {
  switch (state) {
    case 'CLOSED':
      return 0
    case 'HALF_OPEN':
      return 1
    case 'OPEN':
      return 2
  }
}

const parseIntEnv = (name: string, defaultValue: number): number => {
  const raw = process.env[name]
  if (raw === undefined) {
    return defaultValue
  }
  const parsed = Number(raw)
  if (Number.isNaN(parsed) || parsed <= 0) {
    logger.warn(`Invalid value for ${name}=${raw}; falling back to default ${defaultValue}`)
    return defaultValue
  }
  return parsed
}

const esBreaker = new CircuitBreaker({
  failureThreshold: parseIntEnv('ES_BREAKER_FAILURE_THRESHOLD', 5),
  resetTimeoutMs: parseIntEnv('ES_BREAKER_RESET_TIMEOUT_MS', 30000),
  callTimeoutMs: parseIntEnv('ES_BREAKER_CALL_TIMEOUT_MS', 2500),
  name: 'elasticsearch',
  onStateChange: (_from, to) => {
    esBreakerMetrics.state.set(stateToGauge(to))
    esBreakerMetrics.transitions.inc({ to_state: to.toLowerCase() })
  },
})

// Seed the gauge with the breaker's initial state.
esBreakerMetrics.state.set(stateToGauge(esBreaker.state))

export const guardedEs = async <T>(fn: (client: Client) => Promise<T>): Promise<T> => {
  try {
    return await esBreaker.execute(() => fn(elasticClient))
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      esBreakerMetrics.shortCircuits.inc()
    }
    throw err
  }
}

const BLOG_INDEX = 'blogs'

interface BlogDocument {
  id: string
  title: string
  content: string
  description: string | null
  slug: string
  authorId: string
  authorUsername: string | null
  categoryId: string | null
  tags: string[]
  published: boolean
  createdAt: Date
  updatedAt: Date
  publishedAt: Date | null
  deletedAt: Date | null
  views: number
  excerpt: string | null
  coverImage: string | null
  readTime: number
}

interface SearchHit<T> {
  _source: T
  _score: number | null
}

interface SearchHits<T> {
  total: { value: number; relation: 'eq' | 'gte' }
  hits: Array<SearchHit<T>>
}

interface SearchResponse<T> {
  hits: SearchHits<T>
}

export const setupElasticsearch = async (): Promise<void> => {
  try {
    const indexExists = await elasticClient.indices.exists({
      index: BLOG_INDEX,
    })

    if (!indexExists) {
      await elasticClient.indices.create({
        index: BLOG_INDEX,
        body: {
          settings: {
            analysis: {
              analyzer: {
                custom_analyzer: {
                  type: 'custom',
                  tokenizer: 'standard',
                  filter: ['lowercase', 'stop', 'snowball'],
                },
              },
            },
            // Optimize for search performance
            number_of_shards: 3,
            number_of_replicas: 1,
            refresh_interval: '1s',
          },
          mappings: {
            properties: {
              id: { type: 'keyword' },
              title: {
                type: 'text',
                analyzer: 'custom_analyzer',
                fields: { 
                  keyword: { type: 'keyword' },
                  completion: { type: 'completion' }, // For autocomplete
                },
              },
              content: { 
                type: 'text',
                analyzer: 'custom_analyzer',
              },
              description: { 
                type: 'text',
                analyzer: 'custom_analyzer',
                fields: { keyword: { type: 'keyword' } },
              },
              slug: { type: 'keyword' },
              authorId: { type: 'keyword' },
              authorUsername: { type: 'keyword' },
              categoryId: { type: 'keyword' },
              tags: { type: 'keyword' },
              published: { type: 'boolean' },
              createdAt: { type: 'date' },
              updatedAt: { type: 'date' },
              publishedAt: { type: 'date' },
              deletedAt: { type: 'date' },
              views: { type: 'long' },
              excerpt: { type: 'text' },
              coverImage: { type: 'keyword' },
              readTime: { type: 'integer' },
            },
          },
        },
      })

      logger.info('Elasticsearch index created successfully')
    }
  } catch (error) {
    logger.error({ err: error }, 'Error setting up Elasticsearch')
    throw error
  }
}

export const indexBlog = async (blog: BlogDocument): Promise<void> => {
  try {
    await guardedEs(client =>
      client.index<BlogDocument>({
        index: BLOG_INDEX,
        id: blog.id,
        document: blog,
        refresh: true, // Make the document immediately searchable
      })
    )
  } catch (error) {
    logger.warn({ err: error, blogId: blog.id }, 'ES index operation skipped')
  }
}

export const updateBlogIndex = async (id: string, blog: Partial<BlogDocument>): Promise<void> => {
  try {
    await guardedEs(client =>
      client.update<BlogDocument>({
        index: BLOG_INDEX,
        id,
        doc: blog,
        refresh: true,
      })
    )
  } catch (error) {
    logger.warn({ err: error, blogId: id }, 'ES index operation skipped')
  }
}

export const removeBlogFromIndex = async (id: string): Promise<void> => {
  try {
    await guardedEs(client =>
      client.delete({
        index: BLOG_INDEX,
        id,
      })
    )
  } catch (error) {
    logger.warn({ err: error, blogId: id }, 'ES index operation skipped')
  }
}

export interface SearchOptions {
  query?: string
  page?: number
  limit?: number
  category?: string
  tags?: string[]
  authorId?: string
  sortBy?: 'recent' | 'popular' | 'relevant'
}

export interface SearchResult {
  blogs: Array<BlogDocument & { score: number }>
  total: number
  page: number
  totalPages: number
}

export const searchBlogsElastic = async (options: SearchOptions): Promise<SearchResult> => {
  try {
    const {
      query,
      page = 1,
      limit = 10,
      category,
      tags,
      authorId,
      sortBy = 'relevant',
    } = options

    const must: estypes.QueryDslQueryContainer[] = [
      query
        ? {
            bool: {
              should: [
                { match: { title: { query, boost: 2 } } },
                { match: { content: query } },
                { match: { description: { query, boost: 1.5 } } },
              ],
              minimum_should_match: 1,
            },
          }
        : { match_all: {} },
      { term: { published: true } },
    ]

    if (category) {
      must.push({ term: { categoryId: category } })
    }

    if (tags?.length) {
      must.push({ terms: { tags } })
    }

    if (authorId) {
      must.push({ term: { authorId } })
    }

    const sort = (() => {
      switch (sortBy) {
        case 'recent':
          return [{ createdAt: { order: 'desc' } }]
        case 'popular':
          return [{ views: { order: 'desc' } }]
        case 'relevant':
        default:
          return [
            { _score: { order: 'desc' } },
            { views: { order: 'desc' } },
            { createdAt: { order: 'desc' } },
          ]
      }
    })() as estypes.Sort

    const response = await guardedEs(client =>
      client.search<estypes.SearchResponse<BlogDocument>>({
        index: BLOG_INDEX,
        body: {
          query: {
            // deleteBlog() soft-deletes (sets deletedAt) and updates the ES
            // doc accordingly, but this query never excluded it - a "deleted"
            // post kept appearing in search/browse results indefinitely.
            bool: { must, must_not: [{ exists: { field: 'deletedAt' } }] },
          },
          sort,
          from: (page - 1) * limit,
          size: limit,
          track_total_hits: true,
        },
      })
    )

    if (!response) {
      return {
        blogs: [],
        total: 0,
        page,
        totalPages: 0
      }
    }

    const hits = response.hits.hits.map(hit => ({
      ...(hit._source as unknown as BlogDocument),
      score: hit._score ?? 0
    }))

    const total = typeof response.hits.total === 'number' 
      ? response.hits.total 
      : (response.hits.total as { value: number }).value

    return {
      blogs: hits,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    }
  } catch (error) {
    logger.error({ err: error }, 'Error searching blogs in Elasticsearch')
    throw error
  }
}

export const syncBlogsToElasticsearch = async (): Promise<void> => {
  try {
    let offset = 0
    const batchSize = 100 // Process in batches to handle large datasets

    while (true) {
      const blogs = await prisma.blog.findMany({
        skip: offset,
        take: batchSize,
        include: {
          author: {
            select: { username: true },
          },
          tags: {
            include: {
              tag: true,
            },
          },
          analytics: true,
        },
      })

      if (blogs.length === 0) break

      const operations = blogs.flatMap(blog => [
        { index: { _index: BLOG_INDEX, _id: blog.id } },
        {
          id: blog.id,
          title: blog.title,
          content: blog.content,
          description: blog.description,
          slug: blog.slug,
          authorId: blog.authorId,
          authorUsername: blog.author?.username ?? null,
          categoryId: blog.categoryId,
          tags: blog.tags.map(t => t.tag.name),
          published: blog.published,
          createdAt: blog.createdAt,
          updatedAt: blog.updatedAt,
          publishedAt: blog.publishedAt,
          deletedAt: blog.deletedAt,
          views: blog.analytics?.views ?? 0,
          excerpt: blog.excerpt,
          coverImage: blog.coverImage,
          readTime: blog.readTime,
        },
      ])

      await elasticClient.bulk({
        operations,
        refresh: true,
      })

      logger.info(`Synced blogs ${offset + 1} to ${offset + blogs.length}`)
      offset += batchSize
    }

    logger.info('Completed syncing all blogs to Elasticsearch')
  } catch (error) {
    logger.error({ err: error }, 'Error syncing blogs to Elasticsearch')
    throw error
  }
}
