import { Request, Response } from 'express';
import { z } from 'zod';
// Prisma (for instanceof checks against PrismaClientKnownRequestError, etc.)
// must come from @shared/utils/prismaClient, NOT a bare '@prisma/client'
// import - Node resolves a bare '@prisma/client' specifier relative to THIS
// file's own directory, landing on this service's own node_modules copy,
// which is a different module instance (and therefore a different
// constructor reference) than the one backend/shared/utils/prismaClient.ts
// actually uses to create the client and throw its errors. `instanceof`
// against the wrong copy's error class silently fails even though both
// are logically "the same" package version - confirmed live: a duplicate
// role assignment threw a real P2002 error that this exact instanceof
// check failed to catch, falling through to a generic 500 instead of the
// intended 409.
import type { ExtendedBlog, Blog, Tag } from '@shared/utils/prismaClient';
import prisma, { Prisma } from '@shared/utils/prismaClient';
import logger from '@shared/utils/logger';
import axios from 'axios';
import {
  trackAdminError,
  trackDbOperation,
  trackExternalCall
} from '@middlewares/metrics.middleware';
import { recordAuditLog } from '../services/auditLog.service';

// Mirrors the real Prisma `BlogAnalytics` columns exactly (see
// backend/shared/prisma/schema.prisma) - this is also the exact flat shape
// returned by analytics-service's blog/trending/multi endpoints. Do not add
// fields here that don't exist on that model; deleted fields
// (avgTimeOnPage, bounceRate, completionRate, commentCount, likeCount,
// recentVisitors, interactionEvents, readingDepth, scrollDepth, exitPoints)
// were never real - they had no backing column and no data source.
interface BaseAnalytics {
  id: string;
  blogId: string;
  views: number;
  uniqueViews: number;
  reads: number;
  readProgress: number;
  linkClicks: number;
  shareCount: number;
  lastUpdated: Date;
  engagement: number;
  deviceStats: Record<string, number> | null;
  referrerStats: Record<string, number> | null;
  timeSpentStats: Record<string, number> | null;
  likes: number;
  comments: number;
  shares: number;
}

interface Analytics extends BaseAnalytics {}

interface AnalyticsResponse extends Omit<BaseAnalytics, 'lastUpdated'> {
  lastUpdated: string;
}

type BlogWithAnalytics = Omit<ExtendedBlog, 'analytics'> & {
  analytics: Analytics;
};

type AnalyticsItem = Analytics;

type BlogTagRelation = {
  blog: {
    id: string;
  };
};

const timeframeSchema = z.enum(['1h', '24h', '7d', '30d', 'all']).default('24h');
const dateRangeSchema = z.preprocess((val) => {
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  }
  return val;
}, z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
})).optional();

// User management (section 3)
const userStatusSchema = z.enum(['active', 'suspended', 'deleted']).optional();
const suspendUserSchema = z.object({
  reason: z.string().min(5, 'Reason must be at least 5 characters long'),
});

// Role management (section 4)
const assignRoleSchema = z.object({
  roleId: z.string().min(1, 'roleId is required'),
});

// Reported content (section 5)
const reportStatusSchema = z.enum(['open', 'resolved', 'dismissed']);
const resolveReportSchema = z.object({
  actionTaken: z.string().optional(),
});

export class AdminController {
  private readonly analyticsServiceUrl: string;
  private readonly blogServiceUrl: string;

  constructor() {
    this.analyticsServiceUrl = process.env['ANALYTICS_SERVICE_URL'] ?? 'http://analytics-service:3003';
    this.blogServiceUrl = process.env['BLOG_SERVICE_URL'] ?? 'http://blog-service:3002';
  }

  // analytics-service's /stats/overall, /blog/:id, /trending and /multi
  // routes all require a JWT with an admin/analyst role - every call site
  // below was calling them with no Authorization header at all, so they
  // always 401'd. These routes are only ever reached via admin.routes.ts,
  // which has already authenticated the caller as an admin, so forwarding
  // that same bearer token through is correct rather than minting a
  // separate service credential.
  private authHeaders(req: Request): { Authorization: string } | undefined {
    const header = req.headers?.authorization;
    return header ? { Authorization: header } : undefined;
  }

  // List blogs for moderation, regardless of published state. Every other
  // blog-listing surface (blog-service's /search, /user/:userId) only ever
  // returns published blogs, so there was previously no way for an admin to
  // find an already-hidden blog to restore it.
  async listBlogs(req: Request, res: Response): Promise<Response> {
    try {
      const page = Math.max(1, Number(req.query['page']) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query['limit']) || 20));
      const publishedParam = req.query['published'];
      const publishedFilter =
        publishedParam === 'true' ? true : publishedParam === 'false' ? false : undefined;

      const where = {
        deletedAt: null,
        ...(publishedFilter !== undefined && { published: publishedFilter }),
      };

      const dbTimer = trackDbOperation('findMany', 'blog');
      const [blogs, total] = await Promise.all([
        (prisma as any).blog.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            author: { select: { id: true, username: true, profileImage: true } },
          },
        }),
        (prisma as any).blog.count({ where }),
      ]);
      dbTimer.end();

      return res.json({
        blogs,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      });
    } catch (error) {
      trackAdminError('list_blogs_error');
      logger.error({ err: error }, 'Error listing blogs for moderation');
      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to list blogs'
      });
    }
  }

  // Get dashboard overview
  async getDashboardStats(req: Request, res: Response): Promise<Response> {
    try {
      const timeframe = timeframeSchema.parse(req.query['timeframe']);
      const dateRange = dateRangeSchema.parse(req.query['dateRange']);

      const dbTimer = trackDbOperation('count', 'blog');
      const totalBlogs = await (prisma as any).blog.count({
        where: {
          published: true,
          deletedAt: null
        }
      });
      dbTimer.end();

      // Get total users count. Not filtered by emailVerified: there is no
      // email verification flow implemented yet (see Phase 4), so every
      // user's emailVerified defaults to false and this would otherwise
      // always read 0 regardless of real signups.
      const usersDbTimer = trackDbOperation('count', 'user');
      const totalUsers = await (prisma as any).user.count({
        where: {
          deletedAt: null
        }
      });
      usersDbTimer.end();

      // Get total views and reads from analytics service
      const analyticsTimer = trackExternalCall('analytics', 'stats/overall');
      const analyticsResponse = await axios.get(
        `${this.analyticsServiceUrl}/api/analytics/stats/overall`,
        {
          params: dateRange ? {
            start: dateRange.start,
            end: dateRange.end
          } : { timeframe },
          headers: this.authHeaders(req)
        }
      );
      analyticsTimer.end();

      return res.json({
        totalBlogs,
        totalUsers,
        analytics: analyticsResponse.data
      });
    } catch (error) {
      logger.error({ err: error }, 'Error fetching dashboard stats');
      if (error instanceof z.ZodError) {
        trackAdminError('dashboard_stats_validation_error');
        return res.status(400).json({
          message: 'Invalid input data',
          errors: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        });
      }
      
      if (axios.isAxiosError(error)) {
        trackAdminError('analytics_service_error');
        return res.status(502).json({
          message: 'Service unavailable',
          details: 'Analytics service is not responding'
        });
      }
      
      if (error instanceof Error) {
        switch (error.message) {
          case 'Invalid date range':
            return res.status(400).json({
              message: 'Invalid date range',
              details: 'The specified date range is invalid or too large'
            });
          case 'Data unavailable':
            return res.status(503).json({
              message: 'Data temporarily unavailable',
              details: 'Dashboard statistics are being generated'
            });
        }
      }
      
      trackAdminError('dashboard_stats_fetch_error');
      logger.error({ err: error }, 'Unexpected error fetching dashboard stats');
      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to fetch dashboard statistics'
      });
    }
  }

  // Get blog analytics
  async getBlogAnalytics(req: Request, res: Response): Promise<Response> {
    try {
      const { blogId } = req.params;
      const timeframe = timeframeSchema.parse(req.query['timeframe']);
      const dateRange = dateRangeSchema.parse(req.query['dateRange']);

      const analyticsTimer = trackExternalCall('analytics', `blog/${blogId}`);
      const analyticsResponse = await axios.get(
        `${this.analyticsServiceUrl}/api/analytics/blog/${blogId}`,
        {
          params: dateRange ? {
            start: dateRange.start,
            end: dateRange.end
          } : { timeframe },
          headers: this.authHeaders(req)
        }
      );
      analyticsTimer.end();

      return res.json(analyticsResponse.data);
    } catch (error) {
      logger.error({ err: error }, 'Error fetching blog analytics');
      if (error instanceof z.ZodError) {
        trackAdminError('blog_analytics_validation_error');
        return res.status(400).json({
          message: 'Invalid input data',
          errors: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        });
      }
      
      if (axios.isAxiosError(error)) {
        trackAdminError('analytics_service_error');
        return res.status(502).json({
          message: 'Service unavailable',
          details: 'Analytics service is not responding'
        });
      }
      
      if (error instanceof Error) {
        switch (error.message) {
          case 'Blog not found':
            return res.status(404).json({
              message: 'Blog not found',
              details: 'The specified blog does not exist'
            });
          case 'Invalid timeframe':
            return res.status(400).json({
              message: 'Invalid timeframe',
              details: 'The specified timeframe is not supported'
            });
        }
      }
      
      trackAdminError('blog_analytics_fetch_error');
      logger.error({ err: error }, 'Unexpected error fetching blog analytics');
      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to fetch blog analytics'
      });
    }
  }

  // Get user activity analytics
  async getUserAnalytics(req: Request, res: Response): Promise<Response> {
    try {
      const { userId } = req.params;
      const timeframe = timeframeSchema.parse(req.query['timeframe']);
      const dateRange = dateRangeSchema.parse(req.query['dateRange']);

      // Get user's blogs
      const dbTimer = trackDbOperation('findMany', 'blog');
      const blogs = await (prisma as any).blog.findMany({
        where: {
          authorId: userId,
          published: true,
          deletedAt: null
        },
        select: {
          id: true,
          title: true
        }
      }) as Pick<Blog, 'id' | 'title'>[];
      dbTimer.end();

      // Get analytics for each blog
      const analyticsPromises = blogs.map(async (blog) => {
        const timer = trackExternalCall('analytics', `blog/${blog.id}`);
        const response = await axios.get(`${this.analyticsServiceUrl}/api/analytics/blog/${blog.id}`, {
          params: dateRange ? {
            start: dateRange.start,
            end: dateRange.end
          } : { timeframe },
          headers: this.authHeaders(req)
        });
        timer.end();
        return response;
      });

      const analyticsResponses = await Promise.all(analyticsPromises);
      const blogAnalytics = blogs.map((blog, index) => ({
        ...blog,
        analytics: analyticsResponses[index]?.data ?? {}
      }));

      return res.json({
        blogs: blogAnalytics
      });
    } catch (error) {
      logger.error({ err: error }, 'Error fetching user analytics');
      if (error instanceof z.ZodError) {
        trackAdminError('user_analytics_validation_error');
        return res.status(400).json({
          message: 'Invalid input data',
          errors: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        });
      }
      
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          trackAdminError('user_not_found_error');
          return res.status(404).json({
            message: 'User not found',
            details: 'The specified user does not exist'
          });
        }
        trackAdminError('analytics_service_error');
        return res.status(502).json({
          message: 'Service unavailable',
          details: 'Analytics service is not responding'
        });
      }
      
      if (error instanceof Error) {
        switch (error.message) {
          case 'Invalid user ID':
            return res.status(400).json({
              message: 'Invalid user ID',
              details: 'The provided user ID is not valid'
            });
          case 'No published blogs':
            return res.status(404).json({
              message: 'No analytics available',
              details: 'User has no published blogs to analyze'
            });
        }
      }
      
      trackAdminError('user_analytics_fetch_error');
      logger.error({ err: error }, 'Unexpected error fetching user analytics');
      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to fetch user analytics'
      });
    }
  }

  // Get trending content
  async getTrendingContent(req: Request, res: Response): Promise<Response> {
    try {
      const timeframe = timeframeSchema.parse(req.query['timeframe']);
      const dateRange = dateRangeSchema.parse(req.query['dateRange']);

      const analyticsTimer = trackExternalCall('analytics', 'trending');
      const analyticsResponse = await axios.get(
        `${this.analyticsServiceUrl}/api/analytics/trending`,
        {
          params: dateRange ? {
            start: dateRange.start,
            end: dateRange.end
          } : { timeframe },
          headers: this.authHeaders(req)
        }
      );
      analyticsTimer.end();

      // Enrich analytics data with blog details
      const blogIds = analyticsResponse.data.map((item: AnalyticsItem) => item.blogId);
      const dbTimer = trackDbOperation('findMany', 'blog');
      const blogs = await (prisma as any).blog.findMany({
        where: {
          id: { in: blogIds },
          published: true,
          deletedAt: null
        },
        include: {
          author: {
            select: {
              id: true,
              username: true
            }
          },
          category: true,
          tags: {
            include: {
              tag: true
            }
          }
        }
      }) as ExtendedBlog[];
      dbTimer.end();

      // Combine analytics with blog details
      const enrichedData: BlogWithAnalytics[] = [];
      for (const analytics of analyticsResponse.data) {
        const blog = blogs.find((b) => b.id === analytics.blogId);
        if (!blog) {
          trackAdminError('blog_not_found');
          logger.warn(`Blog not found during enrichment: ${analytics.blogId}`);
          continue;
        }
        enrichedData.push({
          ...blog,
            analytics: {
              ...analytics,
              lastUpdated: new Date(analytics.lastUpdated),
              deviceStats: analytics.deviceStats || {},
              referrerStats: analytics.referrerStats || {},
              timeSpentStats: analytics.timeSpentStats || {}
            } as Analytics
        });
      }

      return res.json(enrichedData);
    } catch (error) {
      logger.error({ err: error }, 'Error fetching trending content');
      if (error instanceof z.ZodError) {
        trackAdminError('trending_content_validation_error');
        return res.status(400).json({ error: 'Invalid time parameters' });
      } else if (axios.isAxiosError(error)) {
        trackAdminError('analytics_service_error');
        return res.status(502).json({ error: 'Analytics service unavailable' });
      }
      trackAdminError('trending_content_fetch_error');
      return res.status(500).json({ error: 'Failed to fetch trending content' });
    }
  }

  // Get tag analytics
  async getTagAnalytics(req: Request, res: Response): Promise<Response> {
    try {
      const timeframe = timeframeSchema.parse(req.query['timeframe']);
      const dateRange = dateRangeSchema.parse(req.query['dateRange']);

      const dbTimer = trackDbOperation('findMany', 'tag');
      const tags = await (prisma as any).tag.findMany({
        include: {
          blogs: {
            include: {
              blog: {
                select: {
                  id: true
                }
              }
            }
          }
        }
      }) as (Tag & { blogs: BlogTagRelation[] })[];
      dbTimer.end();

      // Get analytics for each tag's blogs
      const tagAnalytics = await Promise.all(
        tags.map(async (tag) => {
          const blogIds = tag.blogs.map((b: BlogTagRelation) => b.blog.id);
          
          const timer = trackExternalCall('analytics', 'multi');
          const analyticsResponse = await axios.get(
            `${this.analyticsServiceUrl}/api/analytics/multi`,
            {
              params: dateRange ? {
                blogIds,
                start: dateRange.start,
                end: dateRange.end
              } : {
                blogIds,
                timeframe
              },
              headers: this.authHeaders(req)
            }
          );
          timer.end();

          return {
            tag: {
              id: tag.id,
              name: tag.name
            },
            analytics: analyticsResponse.data
          };
        })
      );

      return res.json(tagAnalytics);
    } catch (error) {
      logger.error({ err: error }, 'Error fetching tag analytics');
      if (error instanceof z.ZodError) {
        trackAdminError('tag_analytics_validation_error');
        return res.status(400).json({
          message: 'Invalid input data',
          errors: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        });
      }
      
      if (axios.isAxiosError(error)) {
        trackAdminError('analytics_service_error');
        return res.status(502).json({
          message: 'Service unavailable',
          details: 'Analytics service is not responding'
        });
      }
      
      if (error instanceof Error) {
        switch (error.message) {
          case 'Tag not found':
            return res.status(404).json({
              message: 'Tag not found',
              details: 'The specified tag does not exist'
            });
          case 'No tagged blogs':
            return res.status(404).json({
              message: 'No analytics available',
              details: 'Tag has no associated published blogs'
            });
        }
      }
      
      trackAdminError('tag_analytics_fetch_error');
      logger.error({ err: error }, 'Unexpected error fetching tag analytics');
      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to fetch tag analytics'
      });
    }
  }

  // Update blog visibility. Delegates to blog-service's PUT
  // /api/blogs/:id/visibility rather than writing `published` directly via
  // Prisma here: blog-service's write path is what keeps the Elasticsearch
  // index and Redis caches in sync, and neither of those is reachable from
  // here (Elasticsearch client setup lives only in blog-service). Writing
  // straight to Postgres, as this used to do, left a hidden blog fully
  // visible on the home page and search results indefinitely - confirmed
  // live: toggling "Hide" flipped the DB row but the post kept showing up
  // everywhere reads come from Elasticsearch.
  async updateBlogVisibility(req: Request, res: Response): Promise<Response> {
    try {
      // Check required parameters first
      if (!req.params['blogId']) {
        trackAdminError('blog_visibility_update_error');
        throw new Error('Blog ID is required');
      }

      if (!('visible' in req.body)) {
        trackAdminError('blog_visibility_update_error');
        throw new Error('Visibility state is required');
      }

      // Validate blog ID format. Real Prisma IDs are cuid()-generated
      // (e.g. "cm3x9k2p40000ab12cd34ef56"), not prefixed with "blog-".
      // Keep this generic rather than over-fitting to cuid's exact shape,
      // in case the ID scheme ever changes.
      const blogIdSchema = z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/);
      try {
        await blogIdSchema.parseAsync(req.params['blogId']);
      } catch {
        trackAdminError('blog_visibility_update_error');
        throw new Error('Invalid blog ID format');
      }

      // Validate visibility
      const visibilitySchema = z.boolean();
      let visible: boolean;
      try {
        visible = await visibilitySchema.parseAsync(req.body.visible);
      } catch {
        throw new Error('Invalid visibility state');
      }

      const externalTimer = trackExternalCall('blog', 'visibility');
      const response = await axios.put(
        `${this.blogServiceUrl}/api/blogs/${req.params['blogId']}/visibility`,
        { published: visible },
        { headers: this.authHeaders(req) }
      );
      externalTimer.end();

      await recordAuditLog(
        req.user!.id,
        'blog.visibility',
        'blog',
        req.params['blogId'] as string,
        { visible }
      );

      return res.json(response.data);
    } catch (error) {
      logger.error({ err: error }, 'Error updating blog visibility');

      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          trackAdminError('blog_not_found_error');
          return res.status(404).json({
            message: 'Blog not found',
            details: 'The specified blog does not exist'
          });
        }
        trackAdminError('blog_visibility_update_error');
        return res.status(502).json({
          message: 'Service unavailable',
          details: 'Blog service is not responding'
        });
      }

      if (error instanceof Error) {
        switch (error.message) {
          case 'Invalid visibility state':
            return res.status(400).json({
              message: 'Invalid visibility state',
              details: 'The visibility value must be true or false'
            });
          case 'Invalid blog ID format':
            return res.status(400).json({
              message: 'Invalid input data',
              details: 'Invalid blog ID format'
            });
          case 'Blog ID is required':
            return res.status(400).json({
              message: 'Invalid input data',
              details: 'Blog ID is required'
            });
          case 'Visibility state is required':
            return res.status(400).json({
              message: 'Invalid input data',
              details: 'Visibility state is required'
            });
        }
      }

      trackAdminError('blog_visibility_update_error');
      logger.error({ err: error }, 'Unexpected error updating blog visibility');
      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to update blog visibility'
      });
    }
  }

  // Delete abusive content (admin hard takedown). Delegates to blog-service's
  // DELETE /api/blogs/:blogId/moderate rather than deleting the row directly
  // here, for the same reason updateBlogVisibility delegates to blog-service
  // for visibility changes: blog-service owns the Elasticsearch index and
  // Redis cache invalidation for blog writes, and this service has no way
  // to reach either of those directly.
  async deleteBlog(req: Request, res: Response): Promise<Response> {
    try {
      if (!req.params['blogId']) {
        trackAdminError('blog_delete_error');
        throw new Error('Blog ID is required');
      }

      // Same validation block as updateBlogVisibility - real Prisma IDs are
      // cuid()-generated, kept generic rather than over-fitting cuid's exact
      // shape in case the ID scheme ever changes.
      const blogIdSchema = z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/);
      try {
        await blogIdSchema.parseAsync(req.params['blogId']);
      } catch {
        trackAdminError('blog_delete_error');
        throw new Error('Invalid blog ID format');
      }

      const externalTimer = trackExternalCall('blog', 'moderate_delete');
      const response = await axios.delete(
        `${this.blogServiceUrl}/api/blogs/${req.params['blogId']}/moderate`,
        { headers: this.authHeaders(req) }
      );
      externalTimer.end();

      await recordAuditLog(
        req.user!.id,
        'blog.delete',
        'blog',
        req.params['blogId'] as string
      );

      return res.json(response.data);
    } catch (error) {
      logger.error({ err: error }, 'Error deleting blog (moderation)');

      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          trackAdminError('blog_not_found_error');
          return res.status(404).json({
            message: 'Blog not found',
            details: 'The specified blog does not exist'
          });
        }
        trackAdminError('blog_delete_error');
        return res.status(502).json({
          message: 'Service unavailable',
          details: 'Blog service is not responding'
        });
      }

      if (error instanceof Error) {
        switch (error.message) {
          case 'Invalid blog ID format':
            return res.status(400).json({
              message: 'Invalid input data',
              details: 'Invalid blog ID format'
            });
          case 'Blog ID is required':
            return res.status(400).json({
              message: 'Invalid input data',
              details: 'Blog ID is required'
            });
        }
      }

      trackAdminError('blog_delete_error');
      logger.error({ err: error }, 'Unexpected error deleting blog');
      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to delete blog'
      });
    }
  }

  // List users for admin management. Excludes soft-deleted users
  // (deletedAt set) by default - same convention as listBlogs excluding
  // deleted blogs - unless status=deleted is explicitly requested.
  async listUsers(req: Request, res: Response): Promise<Response> {
    try {
      const page = Math.max(1, Number(req.query['page']) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query['limit']) || 20));
      const search = typeof req.query['search'] === 'string' ? req.query['search'] : undefined;
      const status = userStatusSchema.parse(req.query['status']);

      const where: Record<string, unknown> = {};
      if (status === 'deleted') {
        where['deletedAt'] = { not: null };
      } else if (status === 'suspended') {
        where['deletedAt'] = null;
        where['suspendedAt'] = { not: null };
      } else if (status === 'active') {
        where['deletedAt'] = null;
        where['suspendedAt'] = null;
      } else {
        where['deletedAt'] = null;
      }

      if (search) {
        where['OR'] = [
          { username: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ];
      }

      const dbTimer = trackDbOperation('findMany', 'user');
      const [users, total] = await Promise.all([
        (prisma as any).user.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            username: true,
            email: true,
            createdAt: true,
            lastLoginAt: true,
            suspendedAt: true,
            deletedAt: true,
          },
        }),
        (prisma as any).user.count({ where }),
      ]);
      dbTimer.end();

      return res.json({
        users,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        trackAdminError('list_users_validation_error');
        return res.status(400).json({
          message: 'Invalid input data',
          errors: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }

      trackAdminError('list_users_error');
      logger.error({ err: error }, 'Error listing users for management');
      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to list users',
      });
    }
  }

  // Suspend a user (admin-initiated, reversible - distinct from the
  // pre-existing self-service deletedAt path). Enforcement (blocking login
  // for suspended users) is wired up separately in auth-service; this is
  // just the admin-side CRUD.
  async suspendUser(req: Request, res: Response): Promise<Response> {
    try {
      const { userId } = req.params;
      const { reason } = suspendUserSchema.parse(req.body);

      const dbTimer = trackDbOperation('findUnique', 'user');
      const user = await (prisma as any).user.findUnique({ where: { id: userId } });
      dbTimer.end();

      if (!user) {
        trackAdminError('user_not_found_error');
        return res.status(404).json({
          message: 'User not found',
          details: 'The specified user does not exist',
        });
      }

      if (user.suspendedAt) {
        trackAdminError('user_already_suspended_error');
        return res.status(400).json({ message: 'User already suspended' });
      }

      const updateTimer = trackDbOperation('update', 'user');
      const updated = await (prisma as any).user.update({
        where: { id: userId },
        data: { suspendedAt: new Date(), suspendedReason: reason },
        select: {
          id: true,
          username: true,
          email: true,
          suspendedAt: true,
          suspendedReason: true,
        },
      });
      updateTimer.end();

      await recordAuditLog(req.user!.id, 'user.suspend', 'user', userId as string, { reason });

      return res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        trackAdminError('suspend_user_validation_error');
        return res.status(400).json({
          message: 'Invalid input data',
          errors: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }

      trackAdminError('suspend_user_error');
      logger.error({ err: error }, 'Error suspending user');
      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to suspend user',
      });
    }
  }

  // Reverse a suspension. Guards on suspendedAt rather than trusting the
  // caller, so an accidental double-unsuspend call is a no-op 400 rather
  // than silently succeeding.
  async unsuspendUser(req: Request, res: Response): Promise<Response> {
    try {
      const { userId } = req.params;

      const dbTimer = trackDbOperation('findUnique', 'user');
      const user = await (prisma as any).user.findUnique({ where: { id: userId } });
      dbTimer.end();

      if (!user) {
        trackAdminError('user_not_found_error');
        return res.status(404).json({
          message: 'User not found',
          details: 'The specified user does not exist',
        });
      }

      if (!user.suspendedAt) {
        trackAdminError('user_not_suspended_error');
        return res.status(400).json({ message: 'User is not suspended' });
      }

      const updateTimer = trackDbOperation('update', 'user');
      const updated = await (prisma as any).user.update({
        where: { id: userId },
        data: { suspendedAt: null, suspendedReason: null },
        select: {
          id: true,
          username: true,
          email: true,
          suspendedAt: true,
          suspendedReason: true,
        },
      });
      updateTimer.end();

      await recordAuditLog(req.user!.id, 'user.unsuspend', 'user', userId as string);

      return res.json(updated);
    } catch (error) {
      trackAdminError('unsuspend_user_error');
      logger.error({ err: error }, 'Error unsuspending user');
      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to unsuspend user',
      });
    }
  }

  // List all roles with their permissions. Small, fixed set of rows - no
  // pagination, unlike the user/blog/report listings above.
  async listRoles(_req: Request, res: Response): Promise<Response> {
    try {
      const dbTimer = trackDbOperation('findMany', 'role');
      const roles = await (prisma as any).role.findMany({
        include: {
          permissions: {
            include: { permission: true },
          },
        },
        orderBy: { priority: 'desc' },
      });
      dbTimer.end();

      const shaped = roles.map((role: any) => ({
        id: role.id,
        name: role.name,
        slug: role.slug,
        description: role.description,
        isSystem: role.isSystem,
        permissions: role.permissions.map((rp: any) => ({
          id: rp.permission.id,
          name: rp.permission.name,
          slug: rp.permission.slug,
        })),
      }));

      return res.json(shaped);
    } catch (error) {
      trackAdminError('list_roles_error');
      logger.error({ err: error }, 'Error listing roles');
      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to list roles',
      });
    }
  }

  // Assign a role to a user. @@unique([userId, roleId]) on UserRole means a
  // duplicate assignment throws a Prisma P2002 - caught below and mapped to
  // a 409 rather than a generic 500.
  async assignRole(req: Request, res: Response): Promise<Response> {
    try {
      const { userId } = req.params;
      const { roleId } = assignRoleSchema.parse(req.body);

      const dbTimer = trackDbOperation('findUnique', 'user');
      const [user, role] = await Promise.all([
        (prisma as any).user.findUnique({ where: { id: userId } }),
        (prisma as any).role.findUnique({ where: { id: roleId } }),
      ]);
      dbTimer.end();

      if (!user) {
        trackAdminError('user_not_found_error');
        return res.status(404).json({
          message: 'User not found',
          details: 'The specified user does not exist',
        });
      }

      if (!role) {
        trackAdminError('role_not_found_error');
        return res.status(404).json({
          message: 'Role not found',
          details: 'The specified role does not exist',
        });
      }

      const createTimer = trackDbOperation('create', 'userRole');
      let userRole;
      try {
        userRole = await (prisma as any).userRole.create({
          data: {
            userId,
            roleId,
            assignedBy: req.user!.id,
          },
        });
      } finally {
        createTimer.end();
      }

      await recordAuditLog(req.user!.id, 'role.assign', 'user', userId as string, { roleId });

      return res.status(201).json(userRole);
    } catch (error) {
      if (error instanceof z.ZodError) {
        trackAdminError('assign_role_validation_error');
        return res.status(400).json({
          message: 'Invalid input data',
          errors: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }

      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        trackAdminError('role_already_assigned_error');
        return res.status(409).json({
          message: 'User already has this role',
        });
      }

      trackAdminError('assign_role_error');
      logger.error({ err: error }, 'Error assigning role to user');
      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to assign role',
      });
    }
  }

  // Revoke a role from a user.
  async revokeRole(req: Request, res: Response): Promise<Response> {
    try {
      const { userId, roleId } = req.params;

      const dbTimer = trackDbOperation('findUnique', 'userRole');
      const userRole = await (prisma as any).userRole.findUnique({
        where: { userId_roleId: { userId, roleId } },
      });
      dbTimer.end();

      if (!userRole) {
        trackAdminError('user_role_not_found_error');
        return res.status(404).json({
          message: 'Role assignment not found',
          details: 'The specified user does not have this role',
        });
      }

      const deleteTimer = trackDbOperation('delete', 'userRole');
      await (prisma as any).userRole.delete({ where: { id: userRole.id } });
      deleteTimer.end();

      await recordAuditLog(req.user!.id, 'role.revoke', 'user', userId as string, { roleId });

      return res.status(200).json({ success: true });
    } catch (error) {
      trackAdminError('revoke_role_error');
      logger.error({ err: error }, 'Error revoking role from user');
      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to revoke role',
      });
    }
  }

  // List reported content, newest-first. Defaults to open reports since
  // that's the admin's actionable queue.
  async listReports(req: Request, res: Response): Promise<Response> {
    try {
      const page = Math.max(1, Number(req.query['page']) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query['limit']) || 20));
      const status = reportStatusSchema.default('open').parse(req.query['status']);

      const where = { status };

      const dbTimer = trackDbOperation('findMany', 'report');
      const [reports, total] = await Promise.all([
        (prisma as any).report.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            reporter: { select: { id: true, username: true } },
          },
        }),
        (prisma as any).report.count({ where }),
      ]);
      dbTimer.end();

      return res.json({
        reports,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        trackAdminError('list_reports_validation_error');
        return res.status(400).json({
          message: 'Invalid input data',
          errors: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }

      trackAdminError('list_reports_error');
      logger.error({ err: error }, 'Error listing reports');
      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to list reports',
      });
    }
  }

  // Resolve an open report - action was taken on the underlying content.
  async resolveReport(req: Request, res: Response): Promise<Response> {
    try {
      const { reportId } = req.params;
      const { actionTaken } = resolveReportSchema.parse(req.body ?? {});

      const dbTimer = trackDbOperation('findUnique', 'report');
      const report = await (prisma as any).report.findUnique({ where: { id: reportId } });
      dbTimer.end();

      if (!report) {
        trackAdminError('report_not_found_error');
        return res.status(404).json({
          message: 'Report not found',
          details: 'The specified report does not exist',
        });
      }

      if (report.status !== 'open') {
        trackAdminError('report_not_open_error');
        return res.status(400).json({ message: 'Report is not open' });
      }

      const updateTimer = trackDbOperation('update', 'report');
      const updated = await (prisma as any).report.update({
        where: { id: reportId },
        data: {
          status: 'resolved',
          resolvedAt: new Date(),
          resolvedBy: req.user!.id,
        },
      });
      updateTimer.end();

      await recordAuditLog(req.user!.id, 'report.resolve', 'report', reportId as string, { actionTaken });

      return res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        trackAdminError('resolve_report_validation_error');
        return res.status(400).json({
          message: 'Invalid input data',
          errors: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }

      trackAdminError('resolve_report_error');
      logger.error({ err: error }, 'Error resolving report');
      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to resolve report',
      });
    }
  }

  // Dismiss an open report - no action warranted on the underlying content.
  async dismissReport(req: Request, res: Response): Promise<Response> {
    try {
      const { reportId } = req.params;

      const dbTimer = trackDbOperation('findUnique', 'report');
      const report = await (prisma as any).report.findUnique({ where: { id: reportId } });
      dbTimer.end();

      if (!report) {
        trackAdminError('report_not_found_error');
        return res.status(404).json({
          message: 'Report not found',
          details: 'The specified report does not exist',
        });
      }

      if (report.status !== 'open') {
        trackAdminError('report_not_open_error');
        return res.status(400).json({ message: 'Report is not open' });
      }

      const updateTimer = trackDbOperation('update', 'report');
      const updated = await (prisma as any).report.update({
        where: { id: reportId },
        data: {
          status: 'dismissed',
          resolvedAt: new Date(),
          resolvedBy: req.user!.id,
        },
      });
      updateTimer.end();

      await recordAuditLog(req.user!.id, 'report.dismiss', 'report', reportId as string);

      return res.json(updated);
    } catch (error) {
      trackAdminError('dismiss_report_error');
      logger.error({ err: error }, 'Error dismissing report');
      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to dismiss report',
      });
    }
  }

  // List audit log entries, newest-first, optionally filtered by action
  // and/or actor.
  async getAuditLog(req: Request, res: Response): Promise<Response> {
    try {
      const page = Math.max(1, Number(req.query['page']) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query['limit']) || 20));
      const action = typeof req.query['action'] === 'string' ? req.query['action'] : undefined;
      const actorId = typeof req.query['actorId'] === 'string' ? req.query['actorId'] : undefined;

      const where: Record<string, unknown> = {};
      if (action) where['action'] = action;
      if (actorId) where['actorId'] = actorId;

      const dbTimer = trackDbOperation('findMany', 'auditLog');
      const [logs, total] = await Promise.all([
        (prisma as any).auditLog.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            actor: { select: { id: true, username: true } },
          },
        }),
        (prisma as any).auditLog.count({ where }),
      ]);
      dbTimer.end();

      return res.json({
        logs,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      });
    } catch (error) {
      trackAdminError('list_audit_log_error');
      logger.error({ err: error }, 'Error listing audit log');
      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to list audit log',
      });
    }
  }
}
