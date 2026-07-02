import { Request, Response } from 'express';
import { AnalyticsController } from '@controllers/analytics.controller';
import { prisma } from '@shared/utils/prismaClient';
import { analytics as analyticsRedis } from '@shared/config/redis';
import { jest } from '@jest/globals';

describe('AnalyticsController', () => {
  let analyticsController: AnalyticsController;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let jsonMock: jest.MockedFunction<any>;
  let statusMock: jest.MockedFunction<any>;

  beforeEach(() => {
    analyticsController = new AnalyticsController();
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    mockResponse = {
      status: statusMock,
    } as Partial<Response>;
    mockRequest = {
      headers: {},
      ip: '127.0.0.1',
      params: {},
      query: {},
      body: {},
    };
  });

  describe('trackEvent', () => {
    it('should track a view event successfully', async () => {
      mockRequest.body = {
        blogId: 'blog-1',
        type: 'view',
        path: '/blog-1',
        deviceId: 'device-1',
      };
      ((prisma.analyticsEvent.create as jest.MockedFunction<any>).mockResolvedValue({ id: 'event-1' }));

      await analyticsController.trackEvent(mockRequest as Request, mockResponse as Response);

      expect(prisma.analyticsEvent.create).toHaveBeenCalledWith({
        data: {
          blogId: 'blog-1',
          type: 'view',
          metadata: {},
          deviceId: 'device-1',
          path: '/blog-1',
        },
      });
      expect(analyticsRedis.trackView).toHaveBeenCalledWith('blog-1', 'device-1');
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith({ success: true });
    });

    it('should generate a device id when none is provided', async () => {
      mockRequest.body = {
        blogId: 'blog-1',
        type: 'view',
        path: '/blog-1',
      };
      ((prisma.analyticsEvent.create as jest.MockedFunction<any>).mockResolvedValue({ id: 'event-1' }));

      await analyticsController.trackEvent(mockRequest as Request, mockResponse as Response);

      expect(prisma.analyticsEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ deviceId: expect.any(String) }),
        })
      );
      expect(statusMock).toHaveBeenCalledWith(200);
    });

    it('should return 400 for invalid input data', async () => {
      mockRequest.body = {
        blogId: 'blog-1',
        type: 'view',
        // missing required "path"
      };

      await analyticsController.trackEvent(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Invalid input data' })
      );
      expect(prisma.analyticsEvent.create).not.toHaveBeenCalled();
    });
  });

  describe('trackProgress', () => {
    it('should record progress without creating a read event below 90%', async () => {
      mockRequest.body = {
        blogId: 'blog-1',
        progress: 50,
        deviceId: 'device-1',
        path: '/blog-1',
      };

      await analyticsController.trackProgress(mockRequest as Request, mockResponse as Response);

      expect(analyticsRedis.trackReadProgress).toHaveBeenCalledWith('blog-1', 50);
      expect(prisma.analyticsEvent.create).not.toHaveBeenCalled();
      expect(prisma.blogAnalytics.upsert).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith({ success: true });
    });

    it('should count progress >= 90 as a read', async () => {
      mockRequest.body = {
        blogId: 'blog-1',
        progress: 95,
        deviceId: 'device-1',
        path: '/blog-1',
      };
      ((prisma.analyticsEvent.create as jest.MockedFunction<any>).mockResolvedValue({ id: 'event-1' }));
      ((prisma.blogAnalytics.upsert as jest.MockedFunction<any>).mockResolvedValue({}));

      await analyticsController.trackProgress(mockRequest as Request, mockResponse as Response);

      expect(prisma.analyticsEvent.create).toHaveBeenCalledWith({
        data: {
          blogId: 'blog-1',
          type: 'read',
          metadata: { progress: 95 },
          deviceId: 'device-1',
          path: '/blog-1',
        },
      });
      expect(prisma.blogAnalytics.upsert).toHaveBeenCalledWith({
        where: { blogId: 'blog-1' },
        create: { blogId: 'blog-1', reads: 1 },
        update: { reads: { increment: 1 } },
      });
      expect(statusMock).toHaveBeenCalledWith(200);
    });

    it('should return 400 for invalid progress value', async () => {
      mockRequest.body = {
        blogId: 'blog-1',
        progress: 150,
        deviceId: 'device-1',
        path: '/blog-1',
      };

      await analyticsController.trackProgress(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Invalid input data' })
      );
    });
  });

  describe('trackLink', () => {
    it('should track a link click successfully', async () => {
      mockRequest.body = {
        blogId: 'blog-1',
        url: 'https://example.com',
        path: '/blog-1',
      };
      ((prisma.analyticsEvent.create as jest.MockedFunction<any>).mockResolvedValue({ id: 'event-1' }));
      ((prisma.blogAnalytics.upsert as jest.MockedFunction<any>).mockResolvedValue({}));

      await analyticsController.trackLink(mockRequest as Request, mockResponse as Response);

      expect(analyticsRedis.trackLinkClick).toHaveBeenCalledWith('blog-1', 'https://example.com');
      expect(prisma.analyticsEvent.create).toHaveBeenCalledWith({
        data: {
          blogId: 'blog-1',
          type: 'click',
          metadata: { url: 'https://example.com' },
          deviceId: expect.any(String),
          path: '/blog-1',
        },
      });
      expect(prisma.blogAnalytics.upsert).toHaveBeenCalledWith({
        where: { blogId: 'blog-1' },
        create: { blogId: 'blog-1', linkClicks: 1 },
        update: { linkClicks: { increment: 1 } },
      });
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith({ success: true });
    });

    it('should return 400 for an invalid url', async () => {
      mockRequest.body = {
        blogId: 'blog-1',
        url: 'not-a-url',
        path: '/blog-1',
      };

      await analyticsController.trackLink(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Invalid input data' })
      );
    });
  });

  describe('getBlogAnalytics', () => {
    it('should read blogId from params and merge realtime redis counters', async () => {
      mockRequest.params = { blogId: 'blog-1' };
      mockRequest.query = { timeframe: '24h' };

      const dbRow = {
        id: 'analytics-1',
        blogId: 'blog-1',
        views: 100,
        uniqueViews: 80,
        reads: 40,
        readProgress: 55,
        linkClicks: 10,
        shareCount: 5,
        likes: 20,
        comments: 3,
        shares: 2,
        engagement: 0.5,
        deviceStats: { desktop: 50 },
        referrerStats: { direct: 30 },
        timeSpentStats: { '0-30s': 10 },
        lastUpdated: new Date('2024-01-01T00:00:00Z'),
      };
      ((prisma.blogAnalytics.findUnique as jest.MockedFunction<any>).mockResolvedValue(dbRow));
      ((analyticsRedis.getRealTimeStats as jest.MockedFunction<any>).mockResolvedValue({
        views: 150,
        uniqueViews: 60,
        readProgress: 70,
        isHot: true,
      }));

      await analyticsController.getBlogAnalytics(mockRequest as Request, mockResponse as Response);

      expect(prisma.blogAnalytics.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { blogId: 'blog-1' } })
      );
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'analytics-1',
          blogId: 'blog-1',
          views: 150, // max(100, 150) from redis
          uniqueViews: 80, // max(80, 60) from db
          reads: 40,
          likes: 20,
          comments: 3,
          shares: 2,
        })
      );
    });

    it('should return a zeroed-out object when no BlogAnalytics row exists yet', async () => {
      mockRequest.params = { blogId: 'brand-new-blog' };
      mockRequest.query = {};
      ((prisma.blogAnalytics.findUnique as jest.MockedFunction<any>).mockResolvedValue(null));
      ((analyticsRedis.getRealTimeStats as jest.MockedFunction<any>).mockResolvedValue({
        views: 0,
        uniqueViews: 0,
        readProgress: 0,
        isHot: false,
      }));

      await analyticsController.getBlogAnalytics(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: '',
          blogId: 'brand-new-blog',
          views: 0,
          uniqueViews: 0,
          reads: 0,
          readProgress: 0,
          linkClicks: 0,
          shareCount: 0,
          likes: 0,
          comments: 0,
          shares: 0,
          engagement: 0,
          deviceStats: null,
          referrerStats: null,
          timeSpentStats: null,
        })
      );
    });

    it('should return 400 when blogId param is missing', async () => {
      mockRequest.params = {};

      await analyticsController.getBlogAnalytics(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
    });
  });

  describe('getOverallStats', () => {
    it('should return platform-wide aggregate stats', async () => {
      ((prisma.blogAnalytics.aggregate as jest.MockedFunction<any>).mockResolvedValue({
        _sum: { views: 1000, uniqueViews: 800, reads: 400, linkClicks: 90 },
        _avg: { readProgress: 62.5, engagement: 0.42 },
      }));
      ((prisma.blogAnalytics.count as jest.MockedFunction<any>).mockResolvedValue(25));

      await analyticsController.getOverallStats(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith({
        views: 1000,
        uniqueViews: 800,
        reads: 400,
        linkClicks: 90,
        avgReadProgress: 62.5,
        avgEngagement: 0.42,
        trackedBlogs: 25,
      });
    });

    it('should default sums/averages to 0 when there is no analytics data yet', async () => {
      ((prisma.blogAnalytics.aggregate as jest.MockedFunction<any>).mockResolvedValue({
        _sum: { views: null, uniqueViews: null, reads: null, linkClicks: null },
        _avg: { readProgress: null, engagement: null },
      }));
      ((prisma.blogAnalytics.count as jest.MockedFunction<any>).mockResolvedValue(0));

      await analyticsController.getOverallStats(mockRequest as Request, mockResponse as Response);

      expect(jsonMock).toHaveBeenCalledWith({
        views: 0,
        uniqueViews: 0,
        reads: 0,
        linkClicks: 0,
        avgReadProgress: 0,
        avgEngagement: 0,
        trackedBlogs: 0,
      });
    });
  });

  describe('getTrending', () => {
    it('should return top blogs ordered by views descending', async () => {
      const rows = [
        { blogId: 'blog-1', views: 500 },
        { blogId: 'blog-2', views: 300 },
      ];
      ((prisma.blogAnalytics.findMany as jest.MockedFunction<any>).mockResolvedValue(rows));

      await analyticsController.getTrending(mockRequest as Request, mockResponse as Response);

      expect(prisma.blogAnalytics.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { views: 'desc' },
          take: 10,
        })
      );
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(rows);
    });
  });

  describe('getMultiBlogAnalytics', () => {
    it('should accept a comma-separated blogIds string', async () => {
      mockRequest.query = { blogIds: 'blog-1,blog-2, blog-3' };
      const rows = [{ blogId: 'blog-1' }, { blogId: 'blog-2' }, { blogId: 'blog-3' }];
      ((prisma.blogAnalytics.findMany as jest.MockedFunction<any>).mockResolvedValue(rows));

      await analyticsController.getMultiBlogAnalytics(mockRequest as Request, mockResponse as Response);

      expect(prisma.blogAnalytics.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { blogId: { in: ['blog-1', 'blog-2', 'blog-3'] } },
        })
      );
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(rows);
    });

    it('should accept blogIds as an array (repeated query params)', async () => {
      mockRequest.query = { blogIds: ['blog-1', 'blog-2'] } as any;
      const rows = [{ blogId: 'blog-1' }, { blogId: 'blog-2' }];
      ((prisma.blogAnalytics.findMany as jest.MockedFunction<any>).mockResolvedValue(rows));

      await analyticsController.getMultiBlogAnalytics(mockRequest as Request, mockResponse as Response);

      expect(prisma.blogAnalytics.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { blogId: { in: ['blog-1', 'blog-2'] } },
        })
      );
      expect(statusMock).toHaveBeenCalledWith(200);
    });

    it('should return 400 when blogIds is missing', async () => {
      mockRequest.query = {};

      await analyticsController.getMultiBlogAnalytics(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
    });
  });
});
