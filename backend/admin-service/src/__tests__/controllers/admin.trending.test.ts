import { Request, Response } from 'express';
import { AdminController } from '@controllers/admin.controller';
import prisma from '@shared/utils/prismaClient';
import axios from 'axios';
import { jest } from '@jest/globals';
import { trackAdminError } from '@middlewares/metrics.middleware';
import logger from '@shared/utils/logger';

// Mock logger
jest.mock('@shared/utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
}));

describe('AdminController - Trending Content', () => {
  let adminController: AdminController;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let jsonMock: jest.MockedFunction<any>;

  beforeEach(() => {
    adminController = new AdminController();
    jsonMock = jest.fn();
    mockResponse = {
      json: jsonMock,
      status: jest.fn().mockReturnThis(),
    } as Partial<Response>;
    mockRequest = {
      query: {}
    };

    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  describe('getTrendingContent', () => {
    const mockAnalyticsData = [
      {
        blogId: 'blog-1',
        views: 1500,
        uniqueViews: 1200,
        reads: 900,
        readProgress: 0.85,
        linkClicks: 200,
        shareCount: 75,
        likeCount: 250,
        commentCount: 100,
        engagement: 0.9,
        lastUpdated: '2024-02-06T00:00:00Z',
        deviceStats: {
          desktop: 800,
          mobile: 600,
          tablet: 100
        },
        referrerStats: {
          'google.com': 500,
          'twitter.com': 400
        },
        timeSpentStats: {
          '0-30s': 300,
          '30s-2m': 600
        }
      },
      {
        blogId: 'blog-2',
        views: 1000,
        uniqueViews: 800,
        reads: 600,
        readProgress: 0.75,
        linkClicks: 150,
        shareCount: 50,
        likeCount: 180,
        commentCount: 70,
        engagement: 0.8,
        lastUpdated: '2024-02-06T00:00:00Z',
        deviceStats: {
          desktop: 500,
          mobile: 400,
          tablet: 100
        },
        referrerStats: {
          'google.com': 300,
          'twitter.com': 200
        },
        timeSpentStats: {
          '0-30s': 200,
          '30s-2m': 400
        }
      }
    ];

    const mockBlogData = [
      {
        id: 'blog-1',
        title: 'Popular Blog 1',
        author: {
          id: 'author-1',
          username: 'writer1'
        },
        category: {
          id: 'cat-1',
          name: 'Technology'
        },
        tags: [
          {
            tag: {
              id: 'tag-1',
              name: 'JavaScript'
            }
          }
        ]
      },
      {
        id: 'blog-2',
        title: 'Popular Blog 2',
        author: {
          id: 'author-2',
          username: 'writer2'
        },
        category: {
          id: 'cat-2',
          name: 'Programming'
        },
        tags: [
          {
            tag: {
              id: 'tag-2',
              name: 'TypeScript'
            }
          }
        ]
      }
    ];

    it('should return trending content with enriched data successfully', async () => {
      ((axios.get as jest.MockedFunction<any>).mockResolvedValue({ data: mockAnalyticsData }));
      ((prisma.blog.findMany as jest.MockedFunction<any>).mockResolvedValue(mockBlogData));

      await adminController.getTrendingContent(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/trending'),
        expect.any(Object)
      );

      expect(prisma.blog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: { in: ['blog-1', 'blog-2'] },
            published: true
          }
        })
      );

      expect(jsonMock).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'blog-1',
            title: 'Popular Blog 1',
            author: expect.any(Object),
            category: expect.any(Object),
            tags: expect.any(Array),
            analytics: expect.objectContaining({
              views: expect.any(Number),
              uniqueViews: expect.any(Number)
            })
          })
        ])
      );
    });

    it('should handle custom timeframe correctly', async () => {
      if (mockRequest.query) {
        mockRequest.query['timeframe'] = '30d';
      }
      ((axios.get as jest.MockedFunction<any>).mockResolvedValue({ data: mockAnalyticsData }));
      ((prisma.blog.findMany as jest.MockedFunction<any>).mockResolvedValue(mockBlogData));

      await adminController.getTrendingContent(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(axios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: { timeframe: '30d' }
        })
      );
    });

    it('should handle custom date range correctly', async () => {
      const dateRange = {
        start: '2024-01-01T00:00:00Z',
        end: '2024-01-31T23:59:59Z'
      };
      if (mockRequest.query) {
        mockRequest.query['dateRange'] = dateRange;
      }
      ((axios.get as jest.MockedFunction<any>).mockResolvedValue({ data: mockAnalyticsData }));
      ((prisma.blog.findMany as jest.MockedFunction<any>).mockResolvedValue(mockBlogData));

      await adminController.getTrendingContent(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(axios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: dateRange
        })
      );
    });

    it('should handle analytics service errors', async () => {
      const axiosError = new Error('Service unavailable');
      (axiosError as any).isAxiosError = true;
      ((axios.get as jest.MockedFunction<any>).mockRejectedValue(axiosError));

      await adminController.getTrendingContent(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(502);
      expect(jsonMock).toHaveBeenCalledWith({ 
        error: 'Analytics service unavailable' 
      });
      expect(trackAdminError).toHaveBeenCalledWith('analytics_service_error');
      expect(logger.error).toHaveBeenCalledWith(
        'Error fetching trending content:',
        axiosError
      );
    });

    it('should handle database enrichment errors', async () => {
      ((axios.get as jest.MockedFunction<any>).mockResolvedValue({ data: mockAnalyticsData }));
      const dbError = new Error('Database error');
      ((prisma.blog.findMany as jest.MockedFunction<any>).mockRejectedValue(dbError));

      await adminController.getTrendingContent(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({ 
        error: 'Failed to fetch trending content' 
      });
      expect(trackAdminError).toHaveBeenCalledWith('trending_content_fetch_error');
      expect(logger.error).toHaveBeenCalledWith(
        'Error fetching trending content:',
        dbError
      );
    });

    it('should handle case when no trending content exists', async () => {
      ((axios.get as jest.MockedFunction<any>).mockResolvedValue({ data: [] }));
      ((prisma.blog.findMany as jest.MockedFunction<any>).mockResolvedValue([]));

      await adminController.getTrendingContent(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(jsonMock).toHaveBeenCalledWith([]);
    });

    it('should handle missing blog data during enrichment', async () => {
      ((axios.get as jest.MockedFunction<any>).mockResolvedValue({ data: mockAnalyticsData }));
      ((prisma.blog.findMany as jest.MockedFunction<any>).mockResolvedValue([mockBlogData[0]]));

      await adminController.getTrendingContent(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(jsonMock).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'blog-1',
            analytics: expect.any(Object)
          })
        ])
      );
      expect(logger.warn).toHaveBeenCalledWith(
        'Blog not found during enrichment: blog-2'
      );
      expect(trackAdminError).toHaveBeenCalledWith('blog_not_found');
    });

    it('should return 400 for invalid timeframe', async () => {
      if (mockRequest.query) {
        mockRequest.query['timeframe'] = 'invalid';
      }

      await adminController.getTrendingContent(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({ 
        error: 'Invalid time parameters' 
      });
      expect(trackAdminError).toHaveBeenCalledWith('trending_content_validation_error');
      expect(logger.error).toHaveBeenCalledWith(
        'Error fetching trending content:',
        expect.any(Error)
      );
    });

    it('should return 400 for invalid date range', async () => {
      if (mockRequest.query) {
        mockRequest.query['dateRange'] = 'invalid-json';
      }

      await adminController.getTrendingContent(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({ 
        error: 'Invalid time parameters' 
      });
      expect(trackAdminError).toHaveBeenCalledWith('trending_content_validation_error');
      expect(logger.error).toHaveBeenCalledWith(
        'Error fetching trending content:',
        expect.any(Error)
      );
    });
  });
});
