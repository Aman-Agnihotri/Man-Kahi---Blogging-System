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

describe('AdminController - User Analytics', () => {
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
      query: {},
      params: { userId: 'user-123' }
    };

    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  describe('getUserAnalytics', () => {
    const mockUserBlogs = [
      { id: 'blog-1', title: 'Blog 1' },
      { id: 'blog-2', title: 'Blog 2' }
    ];

    const mockBlogAnalytics = {
      data: {
        id: 'analytics-123',
        blogId: 'blog-1',
        views: 1000,
        uniqueViews: 800,
        reads: 600,
        readProgress: 0.75,
        linkClicks: 150,
        shareCount: 50,
        commentCount: 75,
        likeCount: 200,
        engagement: 0.85,
        deviceStats: { desktop: 600, mobile: 350, tablet: 50 },
        referrerStats: {
          'google.com': 400,
          'twitter.com': 300
        },
        timeSpentStats: {
          '0-30s': 200,
          '30s-2m': 400
        }
      }
    };

    it('should return analytics for all user blogs successfully', async () => {
      ((prisma.blog.findMany as jest.MockedFunction<any>).mockResolvedValue(mockUserBlogs));
      ((axios.get as jest.MockedFunction<any>).mockResolvedValue(mockBlogAnalytics));

      await adminController.getUserAnalytics(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(prisma.blog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            authorId: 'user-123',
            published: true
          }
        })
      );

      mockUserBlogs.forEach(blog => {
        expect(axios.get).toHaveBeenCalledWith(
          expect.stringContaining(`/blog/${blog.id}`),
          expect.any(Object)
        );
      });

      expect(jsonMock).toHaveBeenCalledWith({
        blogs: expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            title: expect.any(String),
            analytics: expect.any(Object)
          })
        ])
      });
    });

    it('should handle user with no blogs', async () => {
      ((prisma.blog.findMany as jest.MockedFunction<any>).mockResolvedValue([]));

      await adminController.getUserAnalytics(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(jsonMock).toHaveBeenCalledWith({
        blogs: []
      });
    });

    it('should handle custom timeframe correctly', async () => {
      if (mockRequest.query) {
        mockRequest.query['timeframe'] = '7d';
      }
      ((prisma.blog.findMany as jest.MockedFunction<any>).mockResolvedValue([mockUserBlogs[0]]));
      ((axios.get as jest.MockedFunction<any>).mockResolvedValue(mockBlogAnalytics));

      await adminController.getUserAnalytics(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(axios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: { timeframe: '7d' }
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
      ((prisma.blog.findMany as jest.MockedFunction<any>).mockResolvedValue([mockUserBlogs[0]]));
      ((axios.get as jest.MockedFunction<any>).mockResolvedValue(mockBlogAnalytics));

      await adminController.getUserAnalytics(
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

    it('should handle analytics service errors gracefully', async () => {
      ((prisma.blog.findMany as jest.MockedFunction<any>).mockResolvedValue(mockUserBlogs));
      
      const axiosError = new Error('Service unavailable');
      (axiosError as any).isAxiosError = true;
      ((axios.get as jest.MockedFunction<any>).mockRejectedValue(axiosError));

      await adminController.getUserAnalytics(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(502);
      expect(jsonMock).toHaveBeenCalledWith({
        message: 'Service unavailable',
        details: 'Analytics service is not responding'
      });
      expect(trackAdminError).toHaveBeenCalledWith('analytics_service_error');
      expect(logger.error).toHaveBeenCalledWith(
        'Error fetching user analytics:',
        axiosError
      );
    });

    it('should return 404 for non-existent user', async () => {
      const notFoundError = new Error('No published blogs');
      ((prisma.blog.findMany as jest.MockedFunction<any>).mockRejectedValue(notFoundError));

      await adminController.getUserAnalytics(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith({
        message: 'No analytics available',
        details: 'User has no published blogs to analyze'
      });
      expect(logger.error).toHaveBeenCalledWith(
        'Error fetching user analytics:',
        notFoundError
      );
    });

    it('should return 400 for invalid timeframe', async () => {
      if (mockRequest.query) {
        mockRequest.query['timeframe'] = 'invalid';
      }

      await adminController.getUserAnalytics(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        message: 'Invalid input data',
        errors: [{
          field: '',
          message: "Invalid enum value. Expected '1h' | '24h' | '7d' | '30d' | 'all', received 'invalid'"
        }]
      });
      expect(trackAdminError).toHaveBeenCalledWith('user_analytics_validation_error');
      expect(logger.error).toHaveBeenCalledWith(
        'Error fetching user analytics:',
        expect.any(Error)
      );
    });

    it('should return 400 for invalid date range', async () => {
      if (mockRequest.query) {
        mockRequest.query['dateRange'] = 'invalid-json';
      }

      await adminController.getUserAnalytics(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        message: 'Invalid input data',
        errors: [{
          field: '',
          message: 'Expected object, received string'
        }]
      });
      expect(trackAdminError).toHaveBeenCalledWith('user_analytics_validation_error');
      expect(logger.error).toHaveBeenCalledWith(
        'Error fetching user analytics:',
        expect.any(Error)
      );
    });

    it('should handle database errors gracefully', async () => {
      const dbError = new Error('Database error');
      ((prisma.blog.findMany as jest.MockedFunction<any>).mockRejectedValue(dbError));

      await adminController.getUserAnalytics(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        message: 'Internal server error',
        details: 'Failed to fetch user analytics'
      });
      expect(trackAdminError).toHaveBeenCalledWith('user_analytics_fetch_error');
      expect(logger.error).toHaveBeenCalledWith(
        'Error fetching user analytics:',
        dbError
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Unexpected error fetching user analytics:',
        dbError
      );
    });

    it('should return 500 for missing userId parameter', async () => {
      const validationRequest = {
        ...mockRequest,
        params: {}
      };

      await adminController.getUserAnalytics(
        validationRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        message: 'Internal server error',
        details: 'Failed to fetch user analytics'
      });
      expect(trackAdminError).toHaveBeenCalledWith('user_analytics_fetch_error');
      expect(logger.error).toHaveBeenCalledWith(
        'Error fetching user analytics:',
        expect.any(Error)
      );
    });

    it('should handle analytics service failures', async () => {
      ((prisma.blog.findMany as jest.MockedFunction<any>).mockResolvedValue(mockUserBlogs));
      
      const axiosError = new Error('Service unavailable');
      (axiosError as any).isAxiosError = true;
      ((axios.get as jest.MockedFunction<any>).mockRejectedValue(axiosError));

      await adminController.getUserAnalytics(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(502);
      expect(jsonMock).toHaveBeenCalledWith({
        message: 'Service unavailable',
        details: 'Analytics service is not responding'
      });
      expect(trackAdminError).toHaveBeenCalledWith('analytics_service_error');
      expect(logger.error).toHaveBeenCalledWith(
        'Error fetching user analytics:',
        axiosError
      );
    });
  });
});
