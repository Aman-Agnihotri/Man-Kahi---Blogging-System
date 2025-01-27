import axios from 'axios';
import logger from '@shared/utils/logger';

const ANALYTICS_SERVICE_URL = process.env.ANALYTICS_SERVICE_URL ?? 'http://analytics-service:3003';

class AnalyticsClient {
  private async sendEvent(endpoint: string, data: any): Promise<void> {
    try {
      await axios.post(`${ANALYTICS_SERVICE_URL}/api/analytics/${endpoint}`, data);
    } catch (error) {
      logger.error('Error sending analytics event:', error);
      // Don't throw - analytics failures shouldn't break the main flow
    }
  }

  async trackView(blogId: string, visitorId: string): Promise<void> {
    await this.sendEvent('event', {
      blogId,
      type: 'view',
      visitorId,
      metadata: {
        timestamp: new Date().toISOString()
      }
    });
  }

  async trackRead(blogId: string, visitorId: string): Promise<void> {
    await this.sendEvent('event', {
      blogId,
      type: 'read',
      visitorId,
      metadata: {
        timestamp: new Date().toISOString()
      }
    });
  }

  async trackProgress(blogId: string, visitorId: string, progress: number): Promise<void> {
    await this.sendEvent('progress', {
      blogId,
      visitorId,
      progress
    });
  }

  async trackLinkClick(blogId: string, url: string): Promise<void> {
    await this.sendEvent('link', {
      blogId,
      url
    });
  }

  async getBlogAnalytics(blogId: string, timeframe: string = '24h'): Promise<any> {
    try {
      const response = await axios.get(
        `${ANALYTICS_SERVICE_URL}/api/analytics/blog/${blogId}`,
        { params: { timeframe } }
      );
      return response.data;
    } catch (error) {
      logger.error('Error fetching blog analytics:', error);
      throw error;
    }
  }
}

export const analyticsClient = new AnalyticsClient();
