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

describe('AdminController - Tag Analytics', () => {
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

  describe('getTagAnalytics', () => {
    const mockTags = [
      {
        id: 'tag-1',
        name: 'JavaScript',
        blogs: [
          { blog: { id: 'blog-1' } },
          { blog: { id: 'blog-2' } }
        ]
      },
      {
        id: 'tag-2',
        name: 'TypeScript',
        blogs: [
          { blog: { id: 'blog-3' } }
        ]
      }
    ];

    const mockAnalyticsResponse = {
      data: {
        totalViews: 2500,
        totalReads: 1500,
        blogs: [
          {
            blogId: 'blog-1',
            views: 1000,
            reads: 600,
            engagement: 0.85,
            lastUpdated: '2024-02-06T00:00:00Z'
          },
          {
            blogId: 'blog-2',
            views: 800,
            reads: 500,
            engagement: 0.75,
            lastUpdated: '2024-02-06T00:00:00Z'
          },
          {
            blogId: 'blog-3',
            views: 700,
            reads: 400,
            engagement: 0.70,
            lastUpdated: '2024-02-06T00:00:00Z'
          }
        ]
      }
    };

    it('should return tag analytics successfully with default timeframe', async () => {
      ((prisma.tag.findMany as jest.MockedFunction<any>).mockResolvedValue(mockTags));
      ((axios.get as jest.MockedFunction<any>).mockResolvedValue(mockAnalyticsResponse));

      await adminController.getTagAnalytics(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(prisma.tag.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
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
        })
      );

      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/multi'),
        expect.objectContaining({
          params: expect.objectContaining({
            blogIds: expect.arrayContaining(['blog-1', 'blog-2'])
          })
        })
      );

      expect(jsonMock).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            tag: expect.objectContaining({
              id: expect.any(String),
              name: expect.any(String)
            }),
            analytics: expect.any(Object)
          })
        ])
      );
    });

    it('should handle custom timeframe correctly', async () => {
      if (mockRequest.query) {
        mockRequest.query['timeframe'] = '7d';
      }
      ((prisma.tag.findMany as jest.MockedFunction<any>).mockResolvedValue([mockTags[0]]));
      ((axios.get as jest.MockedFunction<any>).mockResolvedValue(mockAnalyticsResponse));

      await adminController.getTagAnalytics(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(axios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({
            timeframe: '7d'
          })
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
      ((prisma.tag.findMany as jest.MockedFunction<any>).mockResolvedValue([mockTags[0]]));
      ((axios.get as jest.MockedFunction<any>).mockResolvedValue(mockAnalyticsResponse));

      await adminController.getTagAnalytics(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(axios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({
            ...dateRange,
            blogIds: expect.any(Array)
          })
        })
      );
    });

    it('should handle analytics service errors', async () => {
      ((prisma.tag.findMany as jest.MockedFunction<any>).mockResolvedValue(mockTags));
      
      const axiosError = new Error('Service unavailable');
      (axiosError as any).isAxiosError = true;
      ((axios.get as jest.MockedFunction<any>).mockRejectedValue(axiosError));

      await adminController.getTagAnalytics(
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
        'Error fetching tag analytics:',
        axiosError
      );
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Database error');
      ((prisma.tag.findMany as jest.MockedFunction<any>).mockRejectedValue(dbError));

      await adminController.getTagAnalytics(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        message: 'Internal server error',
        details: 'Failed to fetch tag analytics'
      });
      expect(trackAdminError).toHaveBeenCalledWith('tag_analytics_fetch_error');
      expect(logger.error).toHaveBeenCalledWith(
        'Error fetching tag analytics:',
        dbError
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Unexpected error fetching tag analytics:',
        dbError
      );
    });

    it('should return 400 for invalid timeframe', async () => {
      if (mockRequest.query) {
        mockRequest.query['timeframe'] = 'invalid';
      }

      await adminController.getTagAnalytics(
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
      expect(trackAdminError).toHaveBeenCalledWith('tag_analytics_validation_error');
      expect(logger.error).toHaveBeenCalledWith(
        'Error fetching tag analytics:',
        expect.any(Error)
      );
    });

    it('should return 400 for invalid date range format', async () => {
      if (mockRequest.query) {
        mockRequest.query['dateRange'] = 'invalid-json';
      }

      await adminController.getTagAnalytics(
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
      expect(trackAdminError).toHaveBeenCalledWith('tag_analytics_validation_error');
      expect(logger.error).toHaveBeenCalledWith(
        'Error fetching tag analytics:',
        expect.any(Error)
      );
    });

    it('should handle tags with no associated blogs', async () => {
      const emptyTag = {
        id: 'tag-empty',
        name: 'Empty Tag',
        blogs: []
      };
      ((prisma.tag.findMany as jest.MockedFunction<any>).mockResolvedValue([emptyTag]));
      ((axios.get as jest.MockedFunction<any>).mockResolvedValue({
        data: {
          totalViews: 0,
          totalReads: 0,
          blogs: []
        }
      }));

      await adminController.getTagAnalytics(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(jsonMock).toHaveBeenCalledWith([
        expect.objectContaining({
          tag: {
            id: 'tag-empty',
            name: 'Empty Tag'
          },
          analytics: expect.objectContaining({
            totalViews: 0,
            totalReads: 0,
            blogs: []
          })
        })
      ]);
    });
  });
});
