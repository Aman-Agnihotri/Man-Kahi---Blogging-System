import { Request, Response } from 'express';
import { z } from 'zod';
import type { ExtendedBlog, Blog, User, Tag } from '@shared/utils/prismaClient';
import prisma from '@shared/utils/prismaClient';
import logger from '@shared/utils/logger';
import axios from 'axios';
import { 
  trackAdminError, 
  trackDbOperation, 
  trackExternalCall 
} from '../middlewares/metrics.middleware';

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
  recentVisitors: any;
  avgTimeOnPage: number;
  bounceRate: number;
  completionRate: number;
  commentCount: number;
  likeCount: number;
  engagement: number;
  deviceStats: Record<string, number>;
  referrerStats: Record<string, number>;
  timeSpentStats: Record<string, number>;
  interactionEvents: Record<string, number>;
  readingDepth: Record<string, number>;
  scrollDepth: Record<string, number>;
  exitPoints: Record<string, number>;
  likes: number;
  comments: number;
  shares: number;
}

interface Analytics extends BaseAnalytics {}

interface AnalyticsResponse extends Omit<BaseAnalytics, 'lastUpdated'> {
  lastUpdated: string;
}

type BlogWithAnalytics = ExtendedBlog & {
  analytics: Analytics;
};

type AnalyticsItem = Analytics;

type BlogTagRelation = {
  blog: {
    id: string;
  };
};

const timeframeSchema = z.enum(['1h', '24h', '7d', '30d', 'all']).default('24h');
const dateRangeSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
}).optional();

export class AdminController {
  private readonly analyticsServiceUrl: string;

  constructor() {
    this.analyticsServiceUrl = process.env.ANALYTICS_SERVICE_URL ?? 'http://analytics-service:3003';
  }

  // Get dashboard overview
  async getDashboardStats(req: Request, res: Response): Promise<Response> {
    try {
      const timeframe = timeframeSchema.parse(req.query.timeframe);
      const dateRange = dateRangeSchema.parse(req.query.dateRange);

      const dbTimer = trackDbOperation('count', 'blog');
      const totalBlogs = await (prisma as any).blog.count({
        where: {
          published: true
        }
      });
      dbTimer.end();

      // Get total users count
      const usersDbTimer = trackDbOperation('count', 'user');
      const totalUsers = await (prisma as any).user.count({
        where: {
          emailVerified: true
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
          } : { timeframe }
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
        return res.status(400).json({ error: 'Invalid time parameters' });
      } else if (axios.isAxiosError(error)) {
        trackAdminError('analytics_service_error');
        return res.status(502).json({ error: 'Analytics service unavailable' });
      }
      trackAdminError('dashboard_stats_fetch_error');
      return res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
    }
  }

  // Get blog analytics
  async getBlogAnalytics(req: Request, res: Response): Promise<Response> {
    try {
      const { blogId } = req.params;
      const timeframe = timeframeSchema.parse(req.query.timeframe);
      const dateRange = dateRangeSchema.parse(req.query.dateRange);

      const analyticsTimer = trackExternalCall('analytics', `blog/${blogId}`);
      const analyticsResponse = await axios.get(
        `${this.analyticsServiceUrl}/api/analytics/blog/${blogId}`,
        { 
          params: dateRange ? {
            start: dateRange.start,
            end: dateRange.end
          } : { timeframe }
        }
      );
      analyticsTimer.end();

      return res.json(analyticsResponse.data);
    } catch (error) {
      logger.error('Error fetching blog analytics:', error);
      if (error instanceof z.ZodError) {
        trackAdminError('blog_analytics_validation_error');
        return res.status(400).json({ error: 'Invalid time parameters' });
      } else if (axios.isAxiosError(error)) {
        trackAdminError('analytics_service_error');
        return res.status(502).json({ error: 'Analytics service unavailable' });
      }
      trackAdminError('blog_analytics_fetch_error');
      return res.status(500).json({ error: 'Failed to fetch blog analytics' });
    }
  }

  // Get user activity analytics
  async getUserAnalytics(req: Request, res: Response): Promise<Response> {
    try {
      const { userId } = req.params;
      const timeframe = timeframeSchema.parse(req.query.timeframe);
      const dateRange = dateRangeSchema.parse(req.query.dateRange);

      // Get user's blogs
      const dbTimer = trackDbOperation('findMany', 'blog');
      const blogs = await (prisma as any).blog.findMany({
        where: {
          authorId: userId,
          published: true
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
          } : { timeframe }
        });
        timer.end();
        return response;
      });

      const analyticsResponses = await Promise.all(analyticsPromises);
      const blogAnalytics = blogs.map((blog, index) => ({
        ...blog,
        analytics: analyticsResponses[index].data
      }));

      return res.json({
        blogs: blogAnalytics
      });
    } catch (error) {
      logger.error('Error fetching user analytics:', error);
      if (error instanceof z.ZodError) {
        trackAdminError('user_analytics_validation_error');
        return res.status(400).json({ error: 'Invalid time parameters' });
      } else if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          trackAdminError('user_not_found_error');
          return res.status(404).json({ error: 'User not found' });
        }
        trackAdminError('analytics_service_error');
        return res.status(502).json({ error: 'Analytics service unavailable' });
      }
      trackAdminError('user_analytics_fetch_error');
      return res.status(500).json({ error: 'Failed to fetch user analytics' });
    }
  }

  // Get trending content
  async getTrendingContent(req: Request, res: Response): Promise<Response> {
    try {
      const timeframe = timeframeSchema.parse(req.query.timeframe);
      const dateRange = dateRangeSchema.parse(req.query.dateRange);

      const analyticsTimer = trackExternalCall('analytics', 'trending');
      const analyticsResponse = await axios.get(
        `${this.analyticsServiceUrl}/api/analytics/trending`,
        { 
          params: dateRange ? {
            start: dateRange.start,
            end: dateRange.end
          } : { timeframe }
        }
      );
      analyticsTimer.end();

      // Enrich analytics data with blog details
      const blogIds = analyticsResponse.data.map((item: AnalyticsItem) => item.blogId);
      const dbTimer = trackDbOperation('findMany', 'blog');
      const blogs = await (prisma as any).blog.findMany({
        where: {
          id: { in: blogIds },
          published: true
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
              timeSpentStats: analytics.timeSpentStats || {},
              interactionEvents: analytics.interactionEvents || {},
              readingDepth: analytics.readingDepth || {},
              scrollDepth: analytics.scrollDepth || {},
              exitPoints: analytics.exitPoints || {},
              likes: analytics.likeCount || 0,
              comments: analytics.commentCount || 0,
              shares: analytics.shareCount || 0
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
      const timeframe = timeframeSchema.parse(req.query.timeframe);
      const dateRange = dateRangeSchema.parse(req.query.dateRange);

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
              }
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
        return res.status(400).json({ error: 'Invalid time parameters' });
      } else if (axios.isAxiosError(error)) {
        trackAdminError('analytics_service_error');
        return res.status(502).json({ error: 'Analytics service unavailable' });
      }
      trackAdminError('tag_analytics_fetch_error');
      return res.status(500).json({ error: 'Failed to fetch tag analytics' });
    }
  }

  // Update blog visibility
  async updateBlogVisibility(req: Request, res: Response): Promise<Response> {
    try {
      const { blogId } = req.params;
      const { visible } = req.body;

      const dbTimer = trackDbOperation('update', 'blog');
      const blog = await (prisma as any).blog.update({
        where: { id: blogId },
        data: { published: visible },
        include: {
          author: {
            select: {
              id: true,
              username: true,
              email: true
            }
          }
        }
      }) as Blog & { author: Pick<User, 'id' | 'username' | 'email'> };
      dbTimer.end();

      return res.json(blog);
    } catch (error) {
      logger.error('Error updating blog visibility:', error);
      if (error instanceof Error && error.name === 'PrismaClientKnownRequestError') {
        trackAdminError('blog_not_found_error');
        return res.status(404).json({ error: 'Blog not found' });
      }
      trackAdminError('blog_visibility_update_error');
      return res.status(500).json({ error: 'Failed to update blog visibility' });
    }
  }
}
