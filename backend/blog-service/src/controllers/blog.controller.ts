import { Request, Response } from 'express'
import { z } from 'zod'
import { PrismaClient } from '@prisma/client'
import { logger } from '@utils/logger'
import { processMarkdown, validateMarkdown } from '@utils/markdown'
import { processImage } from '@config/upload'
import { searchBlogsElastic, indexBlog, updateBlogIndex, removeBlogFromIndex } from '@utils/elasticsearch'
import { 
  cacheBlog, 
  getBlogFromCache, 
  invalidateBlogCache,
  incrementBlogViews,
  cacheSearchResults,
  getSearchFromCache
} from '@config/redis'
import slugify from 'slugify'

const prisma = new PrismaClient()

// Input validation schemas
const createBlogSchema = z.object({
  title: z.string().min(3).max(200),
  content: z.string().min(100),
  description: z.string().max(500).optional(),
  categoryId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  published: z.boolean().optional(),
})

const updateBlogSchema = createBlogSchema.partial()

const searchQuerySchema = z.object({
  query: z.string().min(1),
  page: z.string().transform(Number).optional(),
  limit: z.string().transform(Number).optional(),
  category: z.string().optional(),
  tags: z.string().transform(tags => tags.split(',')).optional(),
  sortBy: z.enum(['recent', 'popular', 'relevant']).optional(),
})

export class BlogController {
  // Create new blog
  async create(req: Request, res: Response): Promise<any> {
    try {
      const { body, file } = req
      const validatedInput = createBlogSchema.parse(body)
      const { title, content, description, categoryId, tags, published = false } = validatedInput

      // Validate markdown content
      const validation = validateMarkdown(content)
      if (!validation.isValid) {
        return res.status(400).json({
          message: 'Invalid markdown content',
          errors: validation.errors,
        })
      }

      // Process markdown
      const processedContent = processMarkdown(content)

      // Generate slug
      const slug = slugify(title, { lower: true, strict: true })

      // Process image if provided
      let imageUrl: string | undefined
      if (file) {
        imageUrl = await processImage(file)
      }

      // Create blog post
      const blog = await prisma.blog.create({
        data: {
          title,
          slug,
          content: processedContent,
          description,
          published,
          authorId: req.user!.id,
          ...(categoryId && { categoryId }),
          ...(tags && {
            tags: {
              create: tags.map(tagName => ({
                tag: {
                  connectOrCreate: {
                    where: { name: tagName },
                    create: {
                      name: tagName,
                      slug: slugify(tagName, { lower: true, strict: true }),
                    },
                  },
                },
              })),
            },
          }),
          analytics: {
            create: {
              views: 0,
              uniqueViews: 0,
              reads: 0,
            },
          },
        },
        include: {
          category: true,
          tags: {
            include: {
              tag: true,
            },
          },
          analytics: true,
        },
      })

      // Index in Elasticsearch
      await indexBlog({
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
        deletedAt: null,
        views: blog.analytics?.views ?? 0,
      })

      // Cache the blog
      await cacheBlog(slug, JSON.stringify(blog))

      return res.status(201).json(blog)
    } catch (error) {
      logger.error('Error creating blog:', error)
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: 'Invalid input',
          errors: error.errors,
        })
      }
      return res.status(500).json({ message: 'Error creating blog post' })
    }
  }

  // Get blog by slug
  async getBySlug(req: Request, res: Response): Promise<any> {
    try {
      const { slug } = req.params

      // Try to get from cache first
      const cachedBlog = await getBlogFromCache(slug)
      if (cachedBlog) {
        const blog = JSON.parse(cachedBlog)
        // Check visibility
        if (!blog.published && !req.user?.id) {
          return res.status(404).json({ message: 'Blog not found' })
        }
        // Increment views in background
        incrementBlogViews(blog.id).catch(error => 
          logger.error('Error incrementing views:', error)
        )
        return res.json(blog)
      }

      // If not in cache, get from database
      const blog = await prisma.blog.findUnique({
        where: {
          slug,
          deletedAt: null,
          ...(req.user?.id ? {} : { published: true }),
        },
        include: {
          category: true,
          tags: {
            include: {
              tag: true,
            },
          },
          analytics: true,
        },
      })

      if (!blog) {
        return res.status(404).json({ message: 'Blog not found' })
      }

      // Cache the blog
      await cacheBlog(slug, JSON.stringify(blog))

      // Increment views in background and update Elasticsearch
      Promise.all([
        incrementBlogViews(blog.id),
        updateBlogIndex(blog.id, { views: (blog.analytics?.views ?? 0) + 1 })
      ]).catch(error => logger.error('Error updating views:', error))

      return res.json(blog)
    } catch (error) {
      logger.error('Error fetching blog:', error)
      return res.status(500).json({ message: 'Error fetching blog post' })
    }
  }

  // Update blog
  async update(req: Request, res: Response): Promise<any> {
    try {
      const { id } = req.params
      const validatedInput = updateBlogSchema.parse(req.body)
      const { title, content, description, categoryId, tags, published } = validatedInput

      // Check blog exists and user is author
      const blog = await prisma.blog.findUnique({
        where: { id },
        select: {
          authorId: true,
          slug: true,
          tags: {
            include: {
              tag: true,
            },
          },
        },
      })

      if (!blog) {
        return res.status(404).json({ message: 'Blog not found' })
      }

      if (blog.authorId !== req.user!.id) {
        return res.status(403).json({ message: 'Not authorized' })
      }

      // Process content if provided
      let processedContent = undefined
      if (content) {
        const validation = validateMarkdown(content)
        if (!validation.isValid) {
          return res.status(400).json({
            message: 'Invalid markdown content',
            errors: validation.errors,
          })
        }
        processedContent = processMarkdown(content)
      }

      // Update blog
      const updatedBlog = await prisma.blog.update({
        where: { id },
        data: {
          ...(title && {
            title,
            slug: slugify(title, { lower: true, strict: true }),
          }),
          ...(processedContent && { content: processedContent }),
          ...(description !== undefined && { description }),
          ...(published !== undefined && { published }),
          ...(categoryId !== undefined && { categoryId }),
          ...(tags && {
            tags: {
              deleteMany: {},
              create: tags.map(tagName => ({
                tag: {
                  connectOrCreate: {
                    where: { name: tagName },
                    create: {
                      name: tagName,
                      slug: slugify(tagName, { lower: true, strict: true }),
                    },
                  },
                },
              })),
            },
          }),
        },
        include: {
          category: true,
          tags: {
            include: {
              tag: true,
            },
          },
          analytics: true,
        },
      })

      // Update Elasticsearch
      await updateBlogIndex(id, {
        title: updatedBlog.title,
        content: updatedBlog.content,
        description: updatedBlog.description,
        slug: updatedBlog.slug,
        categoryId: updatedBlog.categoryId,
        tags: updatedBlog.tags.map(t => t.tag.name),
        published: updatedBlog.published,
        updatedAt: updatedBlog.updatedAt,
      })

      // Invalidate old cache and cache updated blog
      await Promise.all([
        invalidateBlogCache(blog.slug),
        title ? invalidateBlogCache(slugify(title, { lower: true, strict: true })) : null,
        cacheBlog(updatedBlog.slug, JSON.stringify(updatedBlog)),
      ])

      return res.json(updatedBlog)
    } catch (error) {
      logger.error('Error updating blog:', error)
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: 'Invalid input',
          errors: error.errors,
        })
      }
      return res.status(500).json({ message: 'Error updating blog post' })
    }
  }

  // Delete blog (soft delete)
  async delete(req: Request, res: Response): Promise<any> {
    try {
      const { id } = req.params

      // Check blog exists and user is author
      const blog = await prisma.blog.findUnique({ 
        where: { id },
        select: { 
          authorId: true,
          slug: true 
        }
      })

      if (!blog) {
        return res.status(404).json({ message: 'Blog not found' })
      }

      if (blog.authorId !== req.user!.id) {
        return res.status(403).json({ message: 'Not authorized' })
      }

      // Soft delete, invalidate cache, and update Elasticsearch
      await Promise.all([
        prisma.blog.update({
          where: { id },
          data: { deletedAt: new Date() },
        }),
        invalidateBlogCache(blog.slug),
        updateBlogIndex(id, { deletedAt: new Date() })
      ])

      return res.json({ message: 'Blog deleted successfully' })
    } catch (error) {
      logger.error('Error deleting blog:', error)
      return res.status(500).json({ message: 'Error deleting blog post' })
    }
  }

  // Search blogs
  async search(req: Request, res: Response): Promise<any> {
    try {
      const params = searchQuerySchema.parse(req.query)
      
      // Try to get from cache first
      const cacheKey = JSON.stringify(params)
      const cachedResults = await getSearchFromCache(cacheKey)
      if (cachedResults) {
        return res.json(JSON.parse(cachedResults))
      }

      const results = await searchBlogsElastic({
        ...params,
        authorId: req.query.author as string,
      })

      // Cache results
      await cacheSearchResults(cacheKey, JSON.stringify(results))

      return res.json(results)
    } catch (error) {
      logger.error('Error searching blogs:', error)
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: 'Invalid search parameters',
          errors: error.errors,
        })
      }
      return res.status(500).json({ message: 'Error searching blogs' })
    }
  }

  // Get popular tags
  async getPopularTags(req: Request, res: Response): Promise<void> {
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
      });

      res.json(tags);
    } catch (error) {
      logger.error('Error fetching popular tags:', error);
      res.status(500).json({ message: 'Error fetching popular tags' });
    }
  }

  // Get suggested blogs
  async getSuggestedBlogs(req: Request, res: Response): Promise<void> {
    try {
      const { blogId } = req.params;
      const currentBlog = await prisma.blog.findUnique({
        where: { id: blogId },
        include: {
          tags: {
            include: { tag: true }
          },
          category: true
        }
      });

      if (!currentBlog) {
        res.status(404).json({ message: 'Blog not found' });
        return;
      }

      const tagIds = currentBlog.tags.map(t => t.tagId);
      
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
          category: true,
          tags: {
            include: { tag: true }
          },
          analytics: true
        }
      });

      res.json(suggestedBlogs);
    } catch (error) {
      logger.error('Error fetching suggested blogs:', error);
      res.status(500).json({ message: 'Error fetching suggested blogs' });
    }
  }

  // Get user's blogs
  async getUserBlogs(req: Request, res: Response): Promise<any> {
    try {
      const userId = req.params.userId || req.user!.id
      const page = parseInt(req.query.page as string) || 1
      const limit = parseInt(req.query.limit as string) || 10

      const [blogs, total] = await Promise.all([
        prisma.blog.findMany({
          where: {
            authorId: userId,
            deletedAt: null,
            ...(userId !== req.user!.id ? { published: true } : {}),
          },
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
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
            authorId: userId,
            deletedAt: null,
            ...(userId !== req.user!.id ? { published: true } : {}),
          },
        }),
      ])

      return res.json({
        blogs,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      })
    } catch (error) {
      logger.error('Error fetching user blogs:', error)
      return res.status(500).json({ message: 'Error fetching user blogs' })
    }
  }
}
