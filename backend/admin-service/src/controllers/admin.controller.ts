import { Request, Response } from 'express';
import { z } from 'zod';
import type { ExtendedBlog, Blog, User, Tag } from '@shared/utils/prismaClient';
import prisma from '@shared/utils/prismaClient';
import logger from '@shared/utils/logger';
import axios from 'axios';

type BlogWithAnalytics = ExtendedBlog & {
  analytics: {
    views: number;
    reads: number;
  };
};

type AnalyticsItem = {
  blogId: string;
  views: number;
  reads: number;
};

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

      // Get total blogs count
      const totalBlogs = await (prisma as any).blog.count({
        where: {
          published: true
        }
      });

      // Get total users count
      const totalUsers = await (prisma as any).user.count({
        where: {
          emailVerified: true
        }
      });

      // Get total views and reads from analytics service
      const analyticsResponse = await axios.get(
        `${this.analyticsServiceUrl}/api/analytics/stats/overall`,
        { 
          params: dateRange ? {
            start: dateRange.start,
            end: dateRange.end
          } : { timeframe }
        }
      );

      return res.json({
        totalBlogs,
        totalUsers,
        analytics: analyticsResponse.data
      });
    } catch (error) {
      logger.error('Error fetching dashboard stats:', error);
      return res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
    }
  }

  // Get blog analytics
  async getBlogAnalytics(req: Request, res: Response): Promise<Response> {
    try {
      const { blogId } = req.params;
      const timeframe = timeframeSchema.parse(req.query.timeframe);
      const dateRange = dateRangeSchema.parse(req.query.dateRange);

      const analyticsResponse = await axios.get(
        `${this.analyticsServiceUrl}/api/analytics/blog/${blogId}`,
        { 
          params: dateRange ? {
            start: dateRange.start,
            end: dateRange.end
          } : { timeframe }
        }
      );

      return res.json(analyticsResponse.data);
    } catch (error) {
      logger.error('Error fetching blog analytics:', error);
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

      // Get analytics for each blog
      const analyticsPromises = blogs.map((blog) => 
        axios.get(`${this.analyticsServiceUrl}/api/analytics/blog/${blog.id}`, {
          params: dateRange ? {
            start: dateRange.start,
            end: dateRange.end
          } : { timeframe }
        })
      );

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
      return res.status(500).json({ error: 'Failed to fetch user analytics' });
    }
  }

  // Get trending content
  async getTrendingContent(req: Request, res: Response): Promise<Response> {
    try {
      const timeframe = timeframeSchema.parse(req.query.timeframe);
      const dateRange = dateRangeSchema.parse(req.query.dateRange);

      const analyticsResponse = await axios.get(
        `${this.analyticsServiceUrl}/api/analytics/trending`,
        { 
          params: dateRange ? {
            start: dateRange.start,
            end: dateRange.end
          } : { timeframe }
        }
      );

      // Enrich analytics data with blog details
      const blogIds = analyticsResponse.data.map((item: AnalyticsItem) => item.blogId);
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

      // Combine analytics with blog details
      const enrichedData: BlogWithAnalytics[] = analyticsResponse.data.map((analytics: AnalyticsItem) => {
        const blog = blogs.find((b) => b.id === analytics.blogId);
        if (!blog) {
          throw new Error(`Blog not found with id: ${analytics.blogId}`);
        }
        return {
          ...blog,
          analytics: {
            views: analytics.views,
            reads: analytics.reads
          }
        };
      });

      return res.json(enrichedData);
    } catch (error) {
      logger.error('Error fetching trending content:', error);
      return res.status(500).json({ error: 'Failed to fetch trending content' });
    }
  }

  // Get tag analytics
  async getTagAnalytics(req: Request, res: Response): Promise<Response> {
    try {
      const timeframe = timeframeSchema.parse(req.query.timeframe);
      const dateRange = dateRangeSchema.parse(req.query.dateRange);

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

      // Get analytics for each tag's blogs
      const tagAnalytics = await Promise.all(
        tags.map(async (tag) => {
          const blogIds = tag.blogs.map((b: BlogTagRelation) => b.blog.id);
          
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
      return res.status(500).json({ error: 'Failed to fetch tag analytics' });
    }
  }

  // Update blog visibility
  async updateBlogVisibility(req: Request, res: Response): Promise<Response> {
    try {
      const { blogId } = req.params;
      const { visible } = req.body;

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

      return res.json(blog);
    } catch (error) {
      logger.error('Error updating blog visibility:', error);
      return res.status(500).json({ error: 'Failed to update blog visibility' });
    }
  }
}
