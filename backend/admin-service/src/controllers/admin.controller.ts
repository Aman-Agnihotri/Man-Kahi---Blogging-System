import { Request, Response } from 'express';
import { z } from 'zod';
import type { ExtendedBlog, Blog, Tag } from '@shared/utils/prismaClient';
import prisma from '@shared/utils/prismaClient';
import logger from '@shared/utils/logger';
import axios from 'axios';
import { 
  trackAdminError, 
  trackDbOperation, 
  trackExternalCall 
} from '@middlewares/metrics.middleware';

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
      logger.error('Error listing blogs for moderation:', error);
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
      logger.error('Error fetching dashboard stats:', error);
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
      logger.error('Unexpected error fetching dashboard stats:', error);
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
      logger.error('Error fetching blog analytics:', error);
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
      logger.error('Unexpected error fetching blog analytics:', error);
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
      logger.error('Error fetching user analytics:', error);
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
      logger.error('Unexpected error fetching user analytics:', error);
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
      logger.error('Error fetching trending content:', error);
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
      logger.error('Error fetching tag analytics:', error);
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
      logger.error('Unexpected error fetching tag analytics:', error);
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

      return res.json(response.data);
    } catch (error) {
      logger.error('Error updating blog visibility:', error);

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
      logger.error('Unexpected error updating blog visibility:', error);
      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to update blog visibility'
      });
    }
  }
}
