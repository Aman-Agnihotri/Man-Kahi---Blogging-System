import { Request, Response } from 'express';
import { AdminController } from '@controllers/admin.controller';
import prisma from '@shared/utils/prismaClient';
import axios from 'axios';
import { jest } from '@jest/globals';
import { trackAdminError, trackDbOperation, trackExternalCall } from '@middlewares/metrics.middleware';

describe('AdminController', () => {
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
      params: {}
    };
  });

  describe('getDashboardStats', () => {
    const mockAnalyticsResponse = {
      data: {
        views: 1000,
        uniqueVisitors: 750,
        avgTimeOnSite: 180,
        bounceRate: 0.35
      }
    };

    it('should return dashboard stats successfully with default timeframe', async () => {
      // Mock database calls
      ((prisma.blog.count as jest.MockedFunction<any>).mockResolvedValue(100));
      ((prisma.user.count as jest.MockedFunction<any>).mockResolvedValue(50));
      
      // Mock analytics service call
      ((axios.get as jest.MockedFunction<any>).mockResolvedValue(mockAnalyticsResponse));

      await adminController.getDashboardStats(
        mockRequest as Request,
        mockResponse as Response
      );

      // Verify response
      expect(jsonMock).toHaveBeenCalledWith({
        totalBlogs: 100,
        totalUsers: 50,
        analytics: mockAnalyticsResponse.data
      });

      // Verify metrics were tracked
      expect(trackDbOperation).toHaveBeenCalledWith('count', 'blog');
      expect(trackDbOperation).toHaveBeenCalledWith('count', 'user');
      expect(trackExternalCall).toHaveBeenCalledWith('analytics', 'stats/overall');
    });

    it('should handle custom timeframe correctly', async () => {
      mockRequest.query = { timeframe: '7d' };
      
      ((prisma.blog.count as jest.MockedFunction<any>).mockResolvedValue(100));
      ((prisma.user.count as jest.MockedFunction<any>).mockResolvedValue(50));
      ((axios.get as jest.MockedFunction<any>).mockResolvedValue(mockAnalyticsResponse));

      await adminController.getDashboardStats(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/stats/overall'),
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
      mockRequest.query = { dateRange: JSON.stringify(dateRange) };
      
      ((prisma.blog.count as jest.MockedFunction<any>).mockResolvedValue(100));
      ((prisma.user.count as jest.MockedFunction<any>).mockResolvedValue(50));
      ((axios.get as jest.MockedFunction<any>).mockResolvedValue(mockAnalyticsResponse));

      await adminController.getDashboardStats(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/stats/overall'),
        expect.objectContaining({
          params: dateRange
        })
      );
    });

    it('should return 400 for invalid timeframe', async () => {
      mockRequest.query = { timeframe: 'invalid' };

      await adminController.getDashboardStats(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Invalid input data'
      }));
      expect(trackAdminError).toHaveBeenCalledWith('dashboard_stats_validation_error');
    });

    it('should return 502 when analytics service is down', async () => {
      ((prisma.blog.count as jest.MockedFunction<any>).mockResolvedValue(100));
      ((prisma.user.count as jest.MockedFunction<any>).mockResolvedValue(50));
      
      const axiosError = new Error('Service unavailable');
      (axiosError as any).isAxiosError = true;
      ((axios.get as jest.MockedFunction<any>).mockRejectedValue(axiosError));

      await adminController.getDashboardStats(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(502);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Service unavailable',
        details: 'Analytics service is not responding'
      }));
      expect(trackAdminError).toHaveBeenCalledWith('analytics_service_error');
    });

    it('should return 500 for database errors', async () => {
      ((prisma.blog.count as jest.MockedFunction<any>).mockRejectedValue(new Error('Database error')));

      await adminController.getDashboardStats(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Internal server error'
      }));
      expect(trackAdminError).toHaveBeenCalledWith('dashboard_stats_fetch_error');
    });

    it('should return 400 for invalid date range format', async () => {
      mockRequest.query = { 
        dateRange: JSON.stringify({
          start: 'invalid-date',
          end: '2024-01-31T23:59:59Z'
        })
      };

      await adminController.getDashboardStats(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Invalid input data'
      }));
      expect(trackAdminError).toHaveBeenCalledWith('dashboard_stats_validation_error');
    });
  });
});
