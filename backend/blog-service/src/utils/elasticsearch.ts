import { Client, estypes } from '@elastic/elasticsearch'
import logger from '@shared/utils/logger'
import { prisma } from '@shared/utils/prismaClient'
import { env } from '@config/env'

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
    logger.info('Successfully connected to Elasticsearch:', info);
  } catch (error) {
    logger.error('Failed to connect to Elasticsearch:', error);
    throw error;
  }
})();

const BLOG_INDEX = 'blogs'

interface BlogDocument {
  id: string
  title: string
  content: string
  description: string | null
  slug: string
  authorId: string
  categoryId: string | null
  tags: string[]
  published: boolean
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
  views: number
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
              categoryId: { type: 'keyword' },
              tags: { type: 'keyword' },
              published: { type: 'boolean' },
              createdAt: { type: 'date' },
              updatedAt: { type: 'date' },
              deletedAt: { type: 'date' },
              views: { type: 'long' },
            },
          },
        },
      })

      logger.info('Elasticsearch index created successfully')
    }
  } catch (error) {
    logger.error('Error setting up Elasticsearch:', error)
    throw error
  }
}

export const indexBlog = async (blog: BlogDocument): Promise<void> => {
  try {
    await elasticClient.index<BlogDocument>({
      index: BLOG_INDEX,
      id: blog.id,
      document: blog,
      refresh: true, // Make the document immediately searchable
    })
  } catch (error) {
    logger.error('Error indexing blog:', error)
    throw error
  }
}

export const updateBlogIndex = async (id: string, blog: Partial<BlogDocument>): Promise<void> => {
  try {
    await elasticClient.update<BlogDocument>({
      index: BLOG_INDEX,
      id,
      doc: blog,
      refresh: true,
    })
  } catch (error) {
    logger.error('Error updating blog index:', error)
    throw error
  }
}

export const removeBlogFromIndex = async (id: string): Promise<void> => {
  try {
    await elasticClient.delete({
      index: BLOG_INDEX,
      id,
    })
  } catch (error) {
    logger.error('Error removing blog from index:', error)
    throw error
  }
}

export interface SearchOptions {
  query: string
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
      {
        bool: {
          should: [
            { match: { title: { query, boost: 2 } } },
            { match: { content: query } },
            { match: { description: { query, boost: 1.5 } } },
          ],
          minimum_should_match: 1,
        },
      },
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

    const response = await elasticClient.search<estypes.SearchResponse<BlogDocument>>({
      index: BLOG_INDEX,
      body: {
        query: {
          bool: { must },
        },
        sort,
        from: (page - 1) * limit,
        size: limit,
        track_total_hits: true,
      },
    })

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
    logger.error('Error searching blogs in Elasticsearch:', error)
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
          categoryId: blog.categoryId,
          tags: blog.tags.map(t => t.tag.name),
          published: blog.published,
          createdAt: blog.createdAt,
          updatedAt: blog.updatedAt,
          deletedAt: blog.deletedAt,
          views: blog.analytics?.views ?? 0,
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
    logger.error('Error syncing blogs to Elasticsearch:', error)
    throw error
  }
}
