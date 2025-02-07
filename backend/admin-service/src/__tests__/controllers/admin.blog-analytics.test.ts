import { Request, Response } from 'express';
import { AdminController } from '@controllers/admin.controller';
import axios from 'axios';
import { jest } from '@jest/globals';
import { trackAdminError, trackExternalCall } from '@middlewares/metrics.middleware';
import logger from '@shared/utils/logger';

// Mock logger
jest.mock('@shared/utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
}));

describe('AdminController - Blog Analytics', () => {
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
      params: { blogId: 'blog-123' }
    };

    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  describe('getBlogAnalytics', () => {
    const mockAnalyticsResponse = {
      data: {
        id: 'analytics-123',
        blogId: 'blog-123',
        views: 1000,
        uniqueViews: 800,
        reads: 600,
        readProgress: 0.75,
        linkClicks: 150,
        shareCount: 50,
        likeCount: 200,
        commentCount: 75,
        engagement: 0.85,
        deviceStats: {
          desktop: 600,
          mobile: 350,
          tablet: 50
        },
        referrerStats: {
          'google.com': 400,
          'twitter.com': 300
        },
        timeSpentStats: {
          '0-30s': 200,
          '30s-2m': 400
        },
        lastUpdated: '2024-02-06T00:00:00Z'
      }
    };

    it('should return blog analytics successfully with default timeframe', async () => {
      ((axios.get as jest.MockedFunction<any>).mockResolvedValue(mockAnalyticsResponse));

      await adminController.getBlogAnalytics(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(jsonMock).toHaveBeenCalledWith(mockAnalyticsResponse.data);
      expect(trackExternalCall).toHaveBeenCalledWith('analytics', 'blog/blog-123');
    });

    it('should handle custom timeframe correctly', async () => {
      if (mockRequest.query) {
        mockRequest.query['timeframe'] = '30d';
      }
      ((axios.get as jest.MockedFunction<any>).mockResolvedValue(mockAnalyticsResponse));

      await adminController.getBlogAnalytics(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/blog/blog-123'),
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
      ((axios.get as jest.MockedFunction<any>).mockResolvedValue(mockAnalyticsResponse));

      await adminController.getBlogAnalytics(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/blog/blog-123'),
        expect.objectContaining({
          params: dateRange
        })
      );
    });

    it('should return 400 for invalid timeframe', async () => {
      mockRequest.query = { timeframe: 'invalid' };

      await adminController.getBlogAnalytics(
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
      expect(trackAdminError).toHaveBeenCalledWith('blog_analytics_validation_error');
      expect(logger.error).toHaveBeenCalledWith(
        'Error fetching blog analytics:',
        expect.any(Error)
      );
    });

    it('should return 502 when analytics service is down', async () => {
      const axiosError = new Error('Service unavailable');
      (axiosError as any).isAxiosError = true;
      ((axios.get as jest.MockedFunction<any>).mockRejectedValue(axiosError));

      await adminController.getBlogAnalytics(
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
        'Error fetching blog analytics:',
        axiosError
      );
    });

    it('should return 404 when blog is not found', async () => {
      const notFoundError = new Error('Blog not found');
      ((axios.get as jest.MockedFunction<any>).mockRejectedValue(notFoundError));

      await adminController.getBlogAnalytics(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith({
        message: 'Blog not found',
        details: 'The specified blog does not exist'
      });
      expect(logger.error).toHaveBeenCalledWith(
        'Error fetching blog analytics:',
        notFoundError
      );
    });

    it('should return 400 for invalid date range format', async () => {
      if (mockRequest.query) {
        mockRequest.query['dateRange'] = 'invalid-json';
      }

      await adminController.getBlogAnalytics(
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
      expect(trackAdminError).toHaveBeenCalledWith('blog_analytics_validation_error');
      expect(logger.error).toHaveBeenCalledWith(
        'Error fetching blog analytics:',
        expect.any(Error)
      );
    });

    it('should return 500 for unexpected errors', async () => {
      const unexpectedError = new Error('Unexpected error');
      ((axios.get as jest.MockedFunction<any>).mockRejectedValue(unexpectedError));

      await adminController.getBlogAnalytics(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        message: 'Internal server error',
        details: 'Failed to fetch blog analytics'
      });
      expect(trackAdminError).toHaveBeenCalledWith('blog_analytics_fetch_error');
      expect(logger.error).toHaveBeenCalledWith(
        'Error fetching blog analytics:',
        unexpectedError
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Unexpected error fetching blog analytics:',
        unexpectedError
      );
    });

    it('should return 500 for missing blogId parameter', async () => {
      const validationRequest = {
        ...mockRequest,
        params: {}
      };

      await adminController.getBlogAnalytics(
        validationRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        message: 'Internal server error',
        details: 'Failed to fetch blog analytics'
      });
      expect(trackAdminError).toHaveBeenCalledWith('blog_analytics_fetch_error');
      expect(logger.error).toHaveBeenCalledWith(
        'Error fetching blog analytics:',
        expect.any(Error)
      );
    });

    it('should handle analytics data enrichment', async () => {
      const enrichedAnalytics = {
        ...mockAnalyticsResponse.data,
        deviceStats: undefined,
        referrerStats: undefined,
        timeSpentStats: undefined
      };

      ((axios.get as jest.MockedFunction<any>).mockResolvedValue({ data: enrichedAnalytics }));

      await adminController.getBlogAnalytics(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(jsonMock).toHaveBeenCalledWith(enrichedAnalytics);
    });
  });
});
