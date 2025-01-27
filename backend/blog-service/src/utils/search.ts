import { PrismaClient, Prisma } from '@prisma/client'
import logger from '@shared/utils/logger'
import { redis } from '@shared/config/redis'

const prisma = new PrismaClient()

export interface SearchOptions {
  query: string
  page?: number
  limit?: number
  category?: string
  tags?: string[]
  authorId?: string
  sortBy?: 'recent' | 'popular' | 'relevant'
}

interface BlogResult {
  id: string
  title: string
  description: string | null
  content: string
  slug: string
  authorId: string
  createdAt: Date
  updatedAt: Date
  category?: {
    name: string
  } | null
  tags: Array<{
    tag: {
      name: string
    }
  }>
  analytics?: {
    views: number
  } | null
}

export interface SearchResult {
  blogs: BlogResult[]
  total: number
  page: number
  totalPages: number
}

export const searchBlogs = async (options: SearchOptions): Promise<SearchResult> => {
  try {
    const {
      query,
      page = 1,
      limit = 10,
      category,
      tags,
      authorId,
      sortBy = 'relevant'
    } = options

    // Check cache first
    const cacheKey = `search:${JSON.stringify(options)}`
    const cachedResult = await redis.get(cacheKey)
    if (cachedResult) {
      return JSON.parse(cachedResult)
    }

    // Build where clause
    const where: Prisma.BlogWhereInput = {
      AND: [
        {
          OR: [
            {
              title: {
                contains: query,
                mode: 'insensitive',
              },
            },
            {
              content: {
                contains: query,
                mode: 'insensitive',
              },
            },
          ],
        },
        { deletedAt: null },
        { published: true },
        ...(category
          ? [
              {
                category: {
                  name: category,
                },
              },
            ]
          : []),
        ...(tags && tags.length > 0
          ? [
              {
                tags: {
                  some: {
                    tag: {
                      name: {
                        in: tags,
                      },
                    },
                  },
                },
              },
            ]
          : []),
        ...(authorId ? [{ authorId }] : []),
      ],
    }

    // Determine sorting
    const orderBy = (() => {
      switch (sortBy) {
        case 'recent':
          return { createdAt: 'desc' as const }
        case 'popular':
          return { analytics: { views: 'desc' as const } }
        case 'relevant':
        default:
          return [
            { analytics: { views: 'desc' as const } },
            { createdAt: 'desc' as const },
          ]
      }
    })()

    // Execute search query
    const [blogs, total] = await Promise.all([
      prisma.blog.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          title: true,
          description: true,
          content: true,
          slug: true,
          authorId: true,
          createdAt: true,
          updatedAt: true,
          category: {
            select: {
              name: true,
            },
          },
          tags: {
            include: {
              tag: {
                select: {
                  name: true,
                },
              },
            },
          },
          analytics: {
            select: {
              views: true,
            },
          },
        },
      }),
      prisma.blog.count({ where }),
    ])

    const result: SearchResult = {
      blogs: blogs.map(blog => ({
        ...blog,
        category: blog.category || undefined,
        analytics: blog.analytics || undefined
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    }

    // Cache results
    await redis.set(
      cacheKey,
      JSON.stringify(result),
      'EX',
      60 * 30 // Cache for 30 minutes
    )

    return result
  } catch (error) {
    logger.error('Error searching blogs:', error)
    throw error
  }
}

export const getPopularTags = async (limit: number = 10): Promise<Array<{ name: string; count: number }>> => {
  try {
    const cacheKey = `popular-tags:${limit}`
    const cached = await redis.get(cacheKey)
    if (cached) {
      return JSON.parse(cached)
    }

    const tags = await prisma.tag.findMany({
      select: {
        name: true,
        _count: {
          select: {
            blogs: true,
          },
        },
      },
      orderBy: {
        blogs: {
          _count: 'desc',
        },
      },
      take: limit,
    })

    const result = tags.map(tag => ({
      name: tag.name,
      count: tag._count.blogs,
    }))

    // Cache for 1 hour
    await redis.set(cacheKey, JSON.stringify(result), 'EX', 60 * 60)

    return result
  } catch (error) {
    logger.error('Error getting popular tags:', error)
    throw error
  }
}

export interface SuggestedBlog {
  id: string
  title: string
  description: string | null
  slug: string
}

export const getSuggestedBlogs = async (
  blogId: string,
  limit: number = 5
): Promise<SuggestedBlog[]> => {
  try {
    const cacheKey = `suggested-blogs:${blogId}:${limit}`
    const cached = await redis.get(cacheKey)
    if (cached) {
      return JSON.parse(cached)
    }

    const blog = await prisma.blog.findUnique({
      where: { id: blogId },
      include: {
        tags: {
          include: {
            tag: true,
          },
        },
        category: true,
      },
    })

    if (!blog) {
      throw new Error('Blog not found')
    }

    const suggestedBlogs = await prisma.blog.findMany({
      where: {
        OR: [
          // Same category
          blog.category?.id ? {
            categoryId: blog.category.id,
          } : {},
          // Similar tags
          {
            tags: {
              some: {
                tagId: {
                  in: blog.tags.map(t => t.tag.id),
                },
              },
            },
          },
        ],
        AND: [
          { published: true },
          { deletedAt: null },
          { NOT: { id: blogId } }, // Exclude current blog
        ],
      },
      select: {
        id: true,
        title: true,
        description: true,
        slug: true,
      },
      take: limit,
      orderBy: {
        analytics: {
          views: 'desc',
        },
      },
    })

    // Cache for 1 hour
    await redis.set(cacheKey, JSON.stringify(suggestedBlogs), 'EX', 60 * 60)

    return suggestedBlogs
  } catch (error) {
    logger.error('Error getting suggested blogs:', error)
    throw error
  }
}
