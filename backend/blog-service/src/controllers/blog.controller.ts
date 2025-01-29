import { Request, Response } from 'express'
import { z } from 'zod'
import logger from '@shared/utils/logger'
import { BlogService } from '@services/blog.service'
import { SearchService } from '@services/search.service'

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
  private readonly blogService: BlogService
  private readonly searchService: SearchService

  constructor() {
    this.blogService = new BlogService()
    this.searchService = new SearchService()
  }

  // Create new blog
  async create(req: Request, res: Response): Promise<Response> {
    try {
      const validatedInput = createBlogSchema.parse(req.body)
      const blog = await this.blogService.createBlog({
        ...validatedInput,
        authorId: req.user!.id,
        file: req.file,
      })
      return res.status(201).json(blog)
    } catch (error) {
      logger.error('Error creating blog:', error)
      
      // Input validation errors
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: 'Invalid input data',
          errors: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        })
      }

      // Known error types with specific messages
      if (error instanceof Error) {
        switch (error.message) {
          case 'Invalid markdown content':
            return res.status(400).json({
              message: 'Invalid markdown content format',
              details: 'The provided markdown content contains invalid syntax or formatting'
            })
          case 'File upload failed':
            return res.status(400).json({
              message: 'Image upload failed',
              details: 'Failed to process or store the uploaded image'
            })
          case 'Category not found':
            return res.status(400).json({
              message: 'Invalid category',
              details: 'The specified category does not exist'
            })
          case 'Tag limit exceeded':
            return res.status(400).json({
              message: 'Too many tags',
              details: 'Maximum number of tags per blog exceeded'
            })
        }
      }

      // Unexpected errors
      logger.error('Unexpected error in blog creation:', error)
      return res.status(500).json({ 
        message: 'Internal server error',
        details: 'Failed to create blog post due to an unexpected error'
      })
    }
  }

  // Get blog by slug
  async getBySlug(req: Request, res: Response): Promise<Response> {
    try {
      const blog = await this.blogService.getBlogBySlug(req.params.slug, req.user?.id)
      return res.json(blog)
    } catch (error) {
      logger.error('Error fetching blog:', error)
      
      if (error instanceof Error) {
        switch (error.message) {
          case 'Blog not found':
            return res.status(404).json({
              message: 'Blog not found',
              details: 'The specified blog post does not exist'
            })
          case 'Not authorized':
            return res.status(403).json({
              message: 'Not authorized',
              details: 'This blog post is not publicly accessible'
            })
        }
      }
      
      logger.error('Unexpected error fetching blog:', error)
      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to fetch blog post due to an unexpected error'
      })
    }
  }

  // Update blog
  async update(req: Request, res: Response): Promise<Response> {
    try {
      const validatedInput = updateBlogSchema.parse(req.body)
      const blog = await this.blogService.updateBlog(req.params.id, req.user!.id, validatedInput)
      return res.json(blog)
    } catch (error) {
      logger.error('Error updating blog:', error)
      
      // Input validation errors
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: 'Invalid input data',
          errors: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        })
      }

      // Known error types with specific messages
      if (error instanceof Error) {
        switch (error.message) {
          case 'Blog not found':
            return res.status(404).json({
              message: 'Blog not found',
              details: 'The specified blog post does not exist'
            })
          case 'Not authorized':
            return res.status(403).json({
              message: 'Not authorized',
              details: 'You do not have permission to update this blog post'
            })
          case 'Invalid markdown content':
            return res.status(400).json({
              message: 'Invalid markdown content format',
              details: 'The provided markdown content contains invalid syntax or formatting'
            })
          case 'File upload failed':
            return res.status(400).json({
              message: 'Image upload failed',
              details: 'Failed to process or store the uploaded image'
            })
          case 'Category not found':
            return res.status(400).json({
              message: 'Invalid category',
              details: 'The specified category does not exist'
            })
          case 'Tag limit exceeded':
            return res.status(400).json({
              message: 'Too many tags',
              details: 'Maximum number of tags per blog exceeded'
            })
          case 'Version conflict':
            return res.status(409).json({
              message: 'Version conflict',
              details: 'The blog post has been modified by another user'
            })
        }
      }

      // Unexpected errors
      logger.error('Unexpected error in blog update:', error)
      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to update blog post due to an unexpected error'
      })
    }
  }

  // Delete blog
  async delete(req: Request, res: Response): Promise<Response> {
    try {
      await this.blogService.deleteBlog(req.params.id, req.user!.id)
      return res.json({ message: 'Blog deleted successfully' })
    } catch (error) {
      logger.error('Error deleting blog:', error)
      
      if (error instanceof Error) {
        switch (error.message) {
          case 'Blog not found':
            return res.status(404).json({
              message: 'Blog not found',
              details: 'The specified blog post does not exist'
            })
          case 'Not authorized':
            return res.status(403).json({
              message: 'Not authorized',
              details: 'You do not have permission to delete this blog post'
            })
          case 'Blog has dependencies':
            return res.status(409).json({
              message: 'Cannot delete blog',
              details: 'This blog post has dependent content that prevents deletion'
            })
        }
      }
      
      logger.error('Unexpected error deleting blog:', error)
      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to delete blog post due to an unexpected error'
      })
    }
  }

  // Search blogs
  async search(req: Request, res: Response): Promise<Response> {
    try {
      const params = searchQuerySchema.parse(req.query)
      const results = await this.searchService.searchBlogs({
        ...params,
        authorId: req.query.author as string,
      })
      return res.json(results)
    } catch (error) {
      logger.error('Error searching blogs:', error)
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: 'Invalid search parameters',
          errors: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        })
      }

      if (error instanceof Error) {
        switch (error.message) {
          case 'Invalid search query':
            return res.status(400).json({
              message: 'Invalid search query',
              details: 'The search query contains invalid characters or syntax'
            })
          case 'Search limit exceeded':
            return res.status(429).json({
              message: 'Search limit exceeded',
              details: 'Too many search requests. Please try again later'
            })
        }
      }
      
      logger.error('Unexpected error in search:', error)
      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to perform search due to an unexpected error'
      })
    }
  }

  // Get popular tags
  async getPopularTags(req: Request, res: Response): Promise<Response> {
    try {
      const tags = await this.searchService.getPopularTags()
      return res.json(tags)
    } catch (error) {
      logger.error('Error fetching popular tags:', error)
      
      if (error instanceof Error) {
        if (error.message === 'Cache error') {
            return res.status(503).json({
              message: 'Service temporarily unavailable',
              details: 'Unable to fetch tags due to cache service issues'
            })
        }
      }
      
      logger.error('Unexpected error fetching tags:', error)
      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to fetch popular tags due to an unexpected error'
      })
    }
  }

  // Get suggested blogs
  async getSuggestedBlogs(req: Request, res: Response): Promise<Response> {
    try {
      const blogs = await this.searchService.getSuggestedBlogs(req.params.blogId)
      return res.json(blogs)
    } catch (error) {
      logger.error('Error fetching suggested blogs:', error)
      
      if (error instanceof Error) {
        switch (error.message) {
          case 'Blog not found':
            return res.status(404).json({
              message: 'Blog not found',
              details: 'The specified blog post does not exist'
            })
          case 'Invalid blog ID':
            return res.status(400).json({
              message: 'Invalid blog ID',
              details: 'The provided blog ID is not in the correct format'
            })
        }
      }
      
      logger.error('Unexpected error fetching suggestions:', error)
      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to fetch suggested blogs due to an unexpected error'
      })
    }
  }

  // Get user's blogs
  async getUserBlogs(req: Request, res: Response): Promise<Response> {
    try {
      const result = await this.searchService.getUserBlogs({
        userId: req.params.userId || req.user!.id,
        currentUserId: req.user!.id,
        page: parseInt(req.query.page as string),
        limit: parseInt(req.query.limit as string),
      })
      return res.json(result)
    } catch (error) {
      logger.error('Error fetching user blogs:', error)
      
      if (error instanceof Error) {
        switch (error.message) {
          case 'User not found':
            return res.status(404).json({
              message: 'User not found',
              details: 'The specified user does not exist'
            })
          case 'Invalid user ID':
            return res.status(400).json({
              message: 'Invalid user ID',
              details: 'The provided user ID is not in the correct format'
            })
          case 'Invalid pagination':
            return res.status(400).json({
              message: 'Invalid pagination parameters',
              details: 'Page or limit values are invalid'
            })
        }
      }
      
      logger.error('Unexpected error fetching user blogs:', error)
      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to fetch user blogs due to an unexpected error'
      })
    }
  }
}
