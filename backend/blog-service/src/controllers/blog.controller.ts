import { Request, Response } from 'express'
import { z } from 'zod'
import crypto from 'crypto'
import logger from '@shared/utils/logger'
import { BlogService } from '@services/blog.service'
import { SearchService } from '@services/search.service'
import { getImageObjectUrl } from '@utils/minio'
import { guardedEs, syncBlogsToElasticsearch } from '@utils/elasticsearch'
import { 
  trackDbOperation,
  trackSearchOperation,
  trackError,
  trackMinioOperation,
  updateActiveBlogCount,
  trackBlogView
} from '@middlewares/metrics.middleware'

// create/update are always submitted as multipart/form-data (an optional
// cover image rides along), so every field - including this one - arrives
// as a string, never a real boolean. Accept both so JSON callers aren't
// broken either.
const booleanish = z.preprocess((val) => {
  if (val === 'true') return true
  if (val === 'false') return false
  return val
}, z.boolean())

// Input validation schemas
const createBlogSchema = z.object({
  title: z.string().min(3).max(200),
  content: z.string().min(100),
  description: z.string().max(500).optional(),
  categoryId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  published: booleanish.optional(),
  metaTitle: z.string().max(200).optional(),
  metaDescription: z.string().max(1000).optional(),
  canonicalUrl: z.string().url().max(255).optional(),
})

const updateBlogSchema = createBlogSchema.partial()

const trendingQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
})

const recentQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(9),
})

const paginationQuerySchema = z.object({
  page: z.string().transform(Number).optional(),
  limit: z.string().transform(Number).optional(),
})

const reportBlogSchema = z.object({
  reason: z.string().min(10).max(500),
})

const searchQuerySchema = z.object({
  // Optional: an absent/empty query lists published blogs (e.g. sorted by
  // recent) instead of full-text matching, which is what the home/explore
  // "browse" views need - there was previously no way to list blogs at all
  // without providing a search term.
  query: z.string().optional(),
  page: z.string().transform(Number).optional(),
  limit: z.string().transform(Number).optional(),
  category: z.string().optional(),
  tags: z.string().transform(tags => tags.split(',')).optional(),
  sortBy: z.enum(['recent', 'popular', 'relevant']).optional(),
})

// Guards against overlapping fire-and-forget reindex runs - see
// BlogController.reindex.
let reindexInProgress = false;

// Identifies a viewer for deduped view counting: authenticated requests key
// off the user ID; anonymous requests hash client IP + user agent (no raw
// IP is ever stored, the hash is ephemeral). Optional-chained throughout -
// bare test request objects lack headers/socket entirely. No trust-proxy is
// configured on this server, so req.ip would be the proxy's address, not
// the client's - X-Forwarded-For is read directly instead.
function resolveViewerId(req: Request): string {
  if (req.user?.id) {
    return `u:${req.user.id}`
  }
  const forwardedFor = req.headers?.['x-forwarded-for']
  const clientIp = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : forwardedFor?.split(',')[0]?.trim()
  const userAgent = req.headers?.['user-agent']
  const hash = crypto
    .createHash('sha256')
    .update(`${clientIp}|${userAgent}`)
    .digest('hex')
    .slice(0, 32)
  return `a:${hash}`
}

export class BlogController {
  private readonly blogService: BlogService
  private readonly searchService: SearchService

  constructor() {
    this.blogService = new BlogService()
    this.searchService = new SearchService()
  }

  // Create new blog
  async create(req: Request, res: Response): Promise<Response> {
    let fileUploadTimer;
    let dbTimer;
    
    try {
      const validatedInput = createBlogSchema.parse(req.body)
      
      // Track file upload if exists
      if (req.file) {
        fileUploadTimer = trackMinioOperation('upload');
      }
      
      // Track database operation
      dbTimer = trackDbOperation('create', 'blog');
      const blog = await this.blogService.createBlog({
        ...validatedInput,
        authorId: req.user!.id,
        file: req.file,
      })
      // End timers
      dbTimer.end();
      if (fileUploadTimer) {
        fileUploadTimer.end();
      }

      // Update active blog count if published
      if (blog.published) {
        updateActiveBlogCount(1);
      }

      return res.status(201).json(blog)
    } catch (error) {
      // End timers if they exist
      if (typeof dbTimer !== 'undefined') {
        dbTimer.end('failure');
      }
      if (typeof fileUploadTimer !== 'undefined') {
        fileUploadTimer.end('failure');
      }

      logger.error({ err: error }, 'Error creating blog')
      
      // Input validation errors
      if (error instanceof z.ZodError) {
        trackError('validation', 'create_blog', 'blog-service');
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
        trackError('business_logic', error.message, 'blog-service');
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
      logger.error({ err: error }, 'Unexpected error in blog creation')
      trackError('unexpected', 'create_blog', 'blog-service');
      return res.status(500).json({ 
        message: 'Internal server error',
        details: 'Failed to create blog post due to an unexpected error'
      })
    }
  }

  // Get blog by slug
  async getBySlug(req: Request, res: Response): Promise<Response> {
    let dbTimer;
    
    try {
      dbTimer = trackDbOperation('read', 'blog');
      const { slug } = req.params;
      if (!slug) {
        return res.status(400).json({
          message: 'Slug parameter is required',
          details: 'The slug parameter is missing from the request URL'
        });
      }
      const blog = await this.blogService.getBlogBySlug(slug, req.user?.id, resolveViewerId(req))
      // Track blog view
      if (blog.published) {
        trackBlogView(blog.id);
      }
      
      const response = res.json(blog);
      dbTimer.end();
      return response;
    } catch (error) {
      if (typeof dbTimer !== 'undefined') {
        dbTimer.end('failure');
      }
      logger.error({ err: error }, 'Error fetching blog')
      
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
      
      logger.error({ err: error }, 'Unexpected error fetching blog')
      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to fetch blog post due to an unexpected error'
      })
    }
  }

  // Update blog
  async update(req: Request, res: Response): Promise<Response> {
    let dbTimer;
    let fileUploadTimer;
    
    try {
      const validatedInput = updateBlogSchema.parse(req.body)
      const { id } = req.params
      if (!id) {
        return res.status(400).json({
          message: 'Blog ID is required',
          details: 'The blog ID parameter is missing from the request URL'
        });
      }
      // Track file upload if exists
      if (req.file) {
        fileUploadTimer = trackMinioOperation('upload');
      }

      dbTimer = trackDbOperation('update', 'blog');
      const blog = await this.blogService.updateBlog(id, req.user!.id, {
        ...validatedInput,
        file: req.file,
      });
      dbTimer.end();
      
      if (fileUploadTimer) {
        fileUploadTimer.end();
      }

      return res.json(blog)
    } catch (error) {
      if (dbTimer) {
        dbTimer.end('failure');
      }
      if (fileUploadTimer) {
        fileUploadTimer.end('failure');
      }
      logger.error({ err: error }, 'Error updating blog')
      
      // Input validation errors
      if (error instanceof z.ZodError) {
        trackError('validation', 'update_blog', 'blog-service');
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
        trackError('business_logic', error.message, 'blog-service');
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
      logger.error({ err: error }, 'Unexpected error in blog update')
      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to update blog post due to an unexpected error'
      })
    }
  }

  // Update blog visibility (admin moderation - no author-ownership check,
  // see BlogService.setVisibility)
  async updateVisibility(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params
      if (!id) {
        return res.status(400).json({
          message: 'Blog ID is required',
          details: 'The blog ID parameter is missing from the request URL'
        });
      }

      const published = z.boolean().parse(req.body.published)

      const dbTimer = trackDbOperation('update', 'blog');
      const blog = await this.blogService.setVisibility(id, published);
      dbTimer.end();

      return res.json(blog)
    } catch (error) {
      logger.error({ err: error }, 'Error updating blog visibility')

      if (error instanceof z.ZodError) {
        trackError('validation', 'update_blog_visibility', 'blog-service');
        return res.status(400).json({
          message: 'Invalid input data',
          errors: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        })
      }

      if (error instanceof Error && error.message === 'Blog not found') {
        return res.status(404).json({
          message: 'Blog not found',
          details: 'The specified blog post does not exist'
        })
      }

      logger.error({ err: error }, 'Unexpected error updating blog visibility')
      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to update blog visibility due to an unexpected error'
      })
    }
  }

  // Delete blog
  async delete(req: Request, res: Response): Promise<Response> {
    let dbTimer;
    const { id } = req.params
    if (!id) {
      return res.status(400).json({
        message: 'Blog ID is required',
        details: 'The blog ID parameter is missing from the request URL'
      });
    }

    try {
      dbTimer = trackDbOperation('delete', 'blog');
      const blog = await this.blogService.deleteBlog(id, req.user!.id);
      dbTimer.end();
      
      // Decrement active blog count if it was published
      if (blog.published) {
        updateActiveBlogCount(-1);
      }

      return res.json({ message: 'Blog deleted successfully' })
    } catch (error) {
      if (dbTimer) {
        dbTimer.end('failure');
      }
      logger.error({ err: error }, 'Error deleting blog')
      if (error instanceof Error) {
        trackError('business_logic', error.message, 'blog-service');
      } else {
        trackError('unexpected', 'delete_blog', 'blog-service');
      }
      
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
      
      logger.error({ err: error }, 'Unexpected error deleting blog')
      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to delete blog post due to an unexpected error'
      })
    }
  }

  // Search blogs
  async search(req: Request, res: Response): Promise<Response> {
    let searchTimer;
    
    try {
      const params = searchQuerySchema.parse(req.query)
      searchTimer = trackSearchOperation('search');
      const results = await this.searchService.searchBlogs({
        ...params,
        authorId: req.query['author'] as string,
      })
      searchTimer.end('success');
      return res.json(results)
    } catch (error) {
      if (typeof searchTimer !== 'undefined') {
        searchTimer.end('failure');
      }
      logger.error({ err: error }, 'Error searching blogs')
      
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
      
      logger.error({ err: error }, 'Unexpected error in search')
      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to perform search due to an unexpected error'
      })
    }
  }

  // Trigger a full search index rebuild (admin only) - fire-and-forget,
  // single pass, no job queue. Guards against overlapping runs and refuses
  // to start if Elasticsearch is unreachable.
  async reindex(req: Request, res: Response): Promise<Response> {
    if (reindexInProgress) {
      return res.status(409).json({ status: 'reindex_in_progress' });
    }

    try {
      await guardedEs((c) => c.ping());
    } catch (error) {
      logger.error({ err: error }, 'Reindex precheck failed: Elasticsearch unavailable');
      return res.status(503).json({ status: 'search_unavailable' });
    }

    reindexInProgress = true;
    syncBlogsToElasticsearch()
      .then(() => logger.info('reindex complete'))
      .catch((err) => logger.error({ err }, 'reindex failed'))
      .finally(() => {
        reindexInProgress = false;
      });

    return res.status(202).json({ status: 'reindex_started' });
  }

  // Get popular tags
  async getPopularTags(req: Request, res: Response): Promise<Response> {
    let searchTimer;
    
    try {
      searchTimer = trackSearchOperation('popular_tags');
      const tags = await this.searchService.getPopularTags()
      searchTimer.end('success');
      return res.json(tags)
    } catch (error) {
      if (searchTimer) {
        searchTimer.end('failure');
      }
      logger.error({ err: error }, 'Error fetching popular tags')
      trackError('search', 'popular_tags', 'blog-service');
      
      if (error instanceof Error) {
        if (error.message === 'Cache error') {
            return res.status(503).json({
              message: 'Service temporarily unavailable',
              details: 'Unable to fetch tags due to cache service issues'
            })
        }
      }
      
      logger.error({ err: error }, 'Unexpected error fetching tags')
      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to fetch popular tags due to an unexpected error'
      })
    }
  }

  // Get suggested blogs
  async getSuggestedBlogs(req: Request, res: Response): Promise<Response> {
    let searchTimer;
    const { blogId } = req.params
    if (!blogId) {
      return res.status(400).json({
        message: 'Blog ID is required',
        details: 'The blog ID parameter is missing from the request URL'
      });
    }
    try {
      searchTimer = trackSearchOperation('suggestions');
      const blogs = await this.searchService.getSuggestedBlogs(blogId)
      searchTimer.end('success');
      return res.json(blogs)
    } catch (error) {
      if (searchTimer) {
        searchTimer.end('failure');
      }
      logger.error({ err: error }, 'Error fetching suggested blogs')
      trackError('search', 'suggested_blogs', 'blog-service');
      
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
      
      logger.error({ err: error }, 'Unexpected error fetching suggestions')
      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to fetch suggested blogs due to an unexpected error'
      })
    }
  }

  // Get user's blogs
  async getUserBlogs(req: Request, res: Response): Promise<Response> {
    let searchTimer;
    
    try {
      const requestedUserId = req.params['userId'] ?? req.user?.id;
      if (!requestedUserId) {
        return res.status(401).json({
          message: 'Authentication required',
          details: 'You must be logged in to fetch your own blogs'
        });
      }

      searchTimer = trackSearchOperation('user_blogs');
      const result = await this.searchService.getUserBlogs({
        userId: requestedUserId,
        currentUserId: req.user?.id,
        page: req.query['page'] ? parseInt(req.query['page'] as string, 10) : undefined,
        limit: req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : undefined,
      })
      searchTimer.end('success');
      return res.json(result)
    } catch (error) {
      if (searchTimer) {
        searchTimer.end('failure');
      }
      logger.error({ err: error }, 'Error fetching user blogs')
      trackError('search', 'user_blogs', 'blog-service');
      
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
      
      logger.error({ err: error }, 'Unexpected error fetching user blogs')
      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to fetch user blogs due to an unexpected error'
      })
    }
  }

  // Admin moderation delete (no author-ownership check, mirrors
  // updateVisibility exactly - see BlogService.adminDelete)
  async moderateDelete(req: Request, res: Response): Promise<Response> {
    const { id } = req.params
    if (!id) {
      return res.status(400).json({
        message: 'Blog ID is required',
        details: 'The blog ID parameter is missing from the request URL'
      });
    }

    try {
      const dbTimer = trackDbOperation('delete', 'blog');
      await this.blogService.adminDelete(id);
      dbTimer.end();

      return res.json({ message: 'Blog deleted', id })
    } catch (error) {
      logger.error({ err: error }, 'Error moderating (admin-deleting) blog')

      if (error instanceof Error) {
        trackError('business_logic', error.message, 'blog-service');
        if (error.message === 'Blog not found') {
          return res.status(404).json({
            message: 'Blog not found',
            details: 'The specified blog post does not exist'
          })
        }
      }

      logger.error({ err: error }, 'Unexpected error moderating blog')
      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to delete blog post due to an unexpected error'
      })
    }
  }

  // Like a blog (idempotent)
  async like(req: Request, res: Response): Promise<Response> {
    let dbTimer;
    const { id } = req.params
    if (!id) {
      return res.status(400).json({
        message: 'Blog ID is required',
        details: 'The blog ID parameter is missing from the request URL'
      });
    }

    try {
      dbTimer = trackDbOperation('create', 'like');
      const result = await this.blogService.likeBlog(id, req.user!.id);
      dbTimer.end();
      return res.json(result)
    } catch (error) {
      if (dbTimer) dbTimer.end('failure');
      logger.error({ err: error }, 'Error liking blog')

      if (error instanceof Error) {
        trackError('business_logic', error.message, 'blog-service');
        if (error.message === 'Blog not found') {
          return res.status(404).json({
            message: 'Blog not found',
            details: 'The specified blog post does not exist'
          })
        }
      }

      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to like blog post due to an unexpected error'
      })
    }
  }

  // Unlike a blog (idempotent)
  async unlike(req: Request, res: Response): Promise<Response> {
    let dbTimer;
    const { id } = req.params
    if (!id) {
      return res.status(400).json({
        message: 'Blog ID is required',
        details: 'The blog ID parameter is missing from the request URL'
      });
    }

    try {
      dbTimer = trackDbOperation('delete', 'like');
      const result = await this.blogService.unlikeBlog(id, req.user!.id);
      dbTimer.end();
      return res.json(result)
    } catch (error) {
      if (dbTimer) dbTimer.end('failure');
      logger.error({ err: error }, 'Error unliking blog')

      if (error instanceof Error) {
        trackError('business_logic', error.message, 'blog-service');
        if (error.message === 'Blog not found') {
          return res.status(404).json({
            message: 'Blog not found',
            details: 'The specified blog post does not exist'
          })
        }
      }

      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to unlike blog post due to an unexpected error'
      })
    }
  }

  // Bookmark a blog (idempotent)
  async bookmark(req: Request, res: Response): Promise<Response> {
    const { id } = req.params
    if (!id) {
      return res.status(400).json({
        message: 'Blog ID is required',
        details: 'The blog ID parameter is missing from the request URL'
      });
    }

    try {
      const result = await this.blogService.bookmarkBlog(id, req.user!.id);
      return res.json(result)
    } catch (error) {
      logger.error({ err: error }, 'Error bookmarking blog')

      if (error instanceof Error && error.message === 'Blog not found') {
        return res.status(404).json({
          message: 'Blog not found',
          details: 'The specified blog post does not exist'
        })
      }

      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to bookmark blog post due to an unexpected error'
      })
    }
  }

  // Remove a bookmark (idempotent)
  async unbookmark(req: Request, res: Response): Promise<Response> {
    const { id } = req.params
    if (!id) {
      return res.status(400).json({
        message: 'Blog ID is required',
        details: 'The blog ID parameter is missing from the request URL'
      });
    }

    try {
      const result = await this.blogService.unbookmarkBlog(id, req.user!.id);
      return res.json(result)
    } catch (error) {
      logger.error({ err: error }, 'Error removing bookmark')

      if (error instanceof Error && error.message === 'Blog not found') {
        return res.status(404).json({
          message: 'Blog not found',
          details: 'The specified blog post does not exist'
        })
      }

      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to remove bookmark due to an unexpected error'
      })
    }
  }

  // List the current user's bookmarked blogs
  async getBookmarks(req: Request, res: Response): Promise<Response> {
    try {
      const { page, limit } = paginationQuerySchema.parse(req.query)
      const result = await this.blogService.getUserBookmarks(req.user!.id, page, limit);
      return res.json(result)
    } catch (error) {
      logger.error({ err: error }, 'Error fetching bookmarks')

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: 'Invalid query parameters',
          errors: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        })
      }

      if (error instanceof Error && error.message === 'Invalid pagination') {
        return res.status(400).json({
          message: 'Invalid pagination parameters',
          details: 'Page or limit values are invalid'
        })
      }

      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to fetch bookmarks due to an unexpected error'
      })
    }
  }

  // Trending blogs (public) - could be Redis-cached with a short TTL later
  // if traffic warranted it; not needed at current scale.
  async getTrending(req: Request, res: Response): Promise<Response> {
    try {
      const { limit } = trendingQuerySchema.parse(req.query)
      const blogs = await this.blogService.getTrendingBlogs(limit ?? 10);
      return res.json(blogs)
    } catch (error) {
      logger.error({ err: error }, 'Error fetching trending blogs')

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: 'Invalid query parameters',
          errors: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        })
      }

      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to fetch trending blogs due to an unexpected error'
      })
    }
  }

  // Recent blogs, Postgres-realtime (public) - backs the home Featured feed
  // so its view/read-time counters never lag behind the ES search index.
  async getRecent(req: Request, res: Response): Promise<Response> {
    try {
      const { page, limit } = recentQuerySchema.parse(req.query)
      const result = await this.blogService.getRecentBlogs(page, limit);
      return res.json(result)
    } catch (error) {
      logger.error({ err: error }, 'Error fetching recent blogs')

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: 'Invalid query parameters',
          errors: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        })
      }

      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to fetch recent blogs due to an unexpected error'
      })
    }
  }

  // Report a blog for moderation review
  async report(req: Request, res: Response): Promise<Response> {
    const { id } = req.params
    if (!id) {
      return res.status(400).json({
        message: 'Blog ID is required',
        details: 'The blog ID parameter is missing from the request URL'
      });
    }

    try {
      const { reason } = reportBlogSchema.parse(req.body)
      const report = await this.blogService.reportBlog(id, req.user!.id, reason);
      return res.status(201).json(report)
    } catch (error) {
      logger.error({ err: error }, 'Error reporting blog')

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: 'Invalid input data',
          errors: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        })
      }

      if (error instanceof Error) {
        switch (error.message) {
          case 'Blog not found':
            return res.status(404).json({
              message: 'Blog not found',
              details: 'The specified blog post does not exist'
            })
          case 'Report already exists':
            return res.status(409).json({
              message: 'Report already exists',
              details: 'You have already reported this blog post and it is still under review'
            })
        }
      }

      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to report blog post due to an unexpected error'
      })
    }
  }

  // Redirect to a short-lived presigned GET URL for a cover image stored in
  // the (private, in cloud deployments) MinIO bucket - see
  // utils/minio.ts's getImageObjectUrl.
  async getImage(req: Request, res: Response): Promise<Response | void> {
    const { key } = req.params
    if (!key) {
      return res.status(400).json({
        message: 'Image key is required',
        details: 'The image key parameter is missing from the request URL'
      });
    }

    try {
      const url = await getImageObjectUrl(key)
      return res.redirect(302, url)
    } catch (error) {
      logger.error({ err: error }, 'Error presigning image URL')
      return res.status(404).json({
        message: 'Image not found',
        details: 'Failed to generate a URL for the specified image'
      })
    }
  }
}
