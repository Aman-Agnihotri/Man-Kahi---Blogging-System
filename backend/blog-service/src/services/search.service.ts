import { prisma } from '@shared/utils/prismaClient'
import { searchBlogsElastic } from '@utils/elasticsearch'
import { searchCache } from '@shared/config/redis'
import logger from '@shared/utils/logger'

export class SearchService {
  async searchBlogs(params: {
    query?: string
    page?: number
    limit?: number
    category?: string
    tags?: string[]
    sortBy?: 'recent' | 'popular' | 'relevant'
    authorId?: string
  }) {
    const startTime = Date.now();
    logger.debug(params, 'Starting blog search with params');

    // Try to get from cache first
    const cacheKey = JSON.stringify(params)
    const cachedResults = await searchCache.get(cacheKey)
    if (cachedResults) {
      logger.debug('Cache hit for search query');
      return JSON.parse(cachedResults)
    }

    logger.debug('Cache miss, executing Elasticsearch query');
    const results = await searchBlogsElastic(params)

    // Cache results
    await searchCache.set(cacheKey, JSON.stringify(results))
    logger.debug(`Search completed in ${Date.now() - startTime}ms`);

    return results
  }

  async getPopularTags() {
    logger.debug('Fetching popular tags');
    try {
      const tags = await prisma.tag.findMany({
        take: 20,
        where: {
          blogs: {
            some: {
              blog: {
                published: true,
                deletedAt: null
              }
            }
          }
        },
        orderBy: {
          blogs: {
            _count: 'desc'
          }
        }
      })
      logger.debug(`Found ${tags.length} popular tags`);
      return tags
    } catch (error) {
      logger.error({ err: error }, 'Error fetching popular tags');
      throw error;
    }
  }

  async getSuggestedBlogs(blogId: string) {
    logger.debug(`Fetching suggested blogs for blog: ${blogId}`);
    try {
      const currentBlog = await prisma.blog.findUnique({
        where: { id: blogId },
        include: {
          tags: {
            include: { tag: true }
          },
          category: true
        }
      })

      if (!currentBlog) {
        logger.error(`Blog not found for suggestions: ${blogId}`);
        throw new Error('Blog not found')
      }

      const tagIds = currentBlog.tags.map(t => t.tagId)
      
      const suggestedBlogs = await prisma.blog.findMany({
        where: {
          OR: [
            {
              tags: {
                some: {
                  tagId: {
                    in: tagIds
                  }
                }
              }
            },
            {
              categoryId: currentBlog.categoryId
            }
          ],
          AND: {
            id: { not: blogId },
            published: true,
            deletedAt: null
          }
        },
        take: 5,
        orderBy: {
          createdAt: 'desc'
        },
        include: {
          author: {
            select: {
              id: true,
              username: true,
              profileImage: true,
            },
          },
          category: true,
          tags: {
            include: { tag: true }
          },
          analytics: true
        }
      })

      logger.debug(`Found ${suggestedBlogs.length} suggested blogs for ${blogId}`);
      return suggestedBlogs
    } catch (error) {
      logger.error({ err: error }, 'Error getting suggested blogs');
      throw error;
    }
  }

  async getUserBlogs(params: {
    userId: string
    currentUserId?: string
    page?: number
    limit?: number
  }) {
    logger.debug(params, 'Fetching user blogs with params');
    try {
      const page = params.page ?? 1
      const limit = params.limit ?? 10
      if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new Error('Invalid pagination')
      }

      const includeDrafts = params.currentUserId === params.userId

      const [blogs, total] = await Promise.all([
        prisma.blog.findMany({
          where: {
            authorId: params.userId,
            deletedAt: null,
            ...(includeDrafts ? {} : { published: true }),
          },
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            author: {
              select: {
                id: true,
                username: true,
                profileImage: true,
              },
            },
            category: true,
            tags: {
              include: {
                tag: true,
              },
            },
            analytics: true,
          },
        }),
        prisma.blog.count({
          where: {
            authorId: params.userId,
            deletedAt: null,
            ...(includeDrafts ? {} : { published: true }),
          },
        }),
      ])

      logger.debug(`Found ${blogs.length} blogs for user ${params.userId}`);
      return {
        blogs,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      }
    } catch (error) {
      logger.error({ err: error }, 'Error fetching user blogs');
      throw error;
    }
  }
}
