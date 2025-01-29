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
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: 'Invalid input',
          errors: error.errors,
        })
      }
      if (error instanceof Error && error.message === 'Invalid markdown content') {
        return res.status(400).json({
          message: 'Invalid markdown content',
          errors: error.message,
        })
      }
      return res.status(500).json({ message: 'Error creating blog post' })
    }
  }

  // Get blog by slug
  async getBySlug(req: Request, res: Response): Promise<Response> {
    try {
      const blog = await this.blogService.getBlogBySlug(req.params.slug, req.user?.id)
      return res.json(blog)
    } catch (error) {
      logger.error('Error fetching blog:', error)
      if (error instanceof Error && error.message === 'Blog not found') {
        return res.status(404).json({ message: 'Blog not found' })
      }
      return res.status(500).json({ message: 'Error fetching blog post' })
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
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: 'Invalid input',
          errors: error.errors,
        })
      }
      if (error instanceof Error) {
        if (error.message === 'Blog not found') {
          return res.status(404).json({ message: 'Blog not found' })
        }
        if (error.message === 'Not authorized') {
          return res.status(403).json({ message: 'Not authorized' })
        }
        if (error.message === 'Invalid markdown content') {
          return res.status(400).json({
            message: 'Invalid markdown content',
            errors: error.message,
          })
        }
      }
      return res.status(500).json({ message: 'Error updating blog post' })
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
        if (error.message === 'Blog not found') {
          return res.status(404).json({ message: 'Blog not found' })
        }
        if (error.message === 'Not authorized') {
          return res.status(403).json({ message: 'Not authorized' })
        }
      }
      return res.status(500).json({ message: 'Error deleting blog post' })
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
          errors: error.errors,
        })
      }
      return res.status(500).json({ message: 'Error searching blogs' })
    }
  }

  // Get popular tags
  async getPopularTags(req: Request, res: Response): Promise<Response> {
    try {
      const tags = await this.searchService.getPopularTags()
      return res.json(tags)
    } catch (error) {
      logger.error('Error fetching popular tags:', error)
      return res.status(500).json({ message: 'Error fetching popular tags' })
    }
  }

  // Get suggested blogs
  async getSuggestedBlogs(req: Request, res: Response): Promise<Response> {
    try {
      const blogs = await this.searchService.getSuggestedBlogs(req.params.blogId)
      return res.json(blogs)
    } catch (error) {
      logger.error('Error fetching suggested blogs:', error)
      if (error instanceof Error && error.message === 'Blog not found') {
        return res.status(404).json({ message: 'Blog not found' })
      }
      return res.status(500).json({ message: 'Error fetching suggested blogs' })
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
      return res.status(500).json({ message: 'Error fetching user blogs' })
    }
  }
}
