import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { analyticsClient } from '@utils/analytics';
import logger from '@shared/utils/logger';

// Generate visitor ID from request data
function generateVisitorId(req: Request): string {
  const ip = req.ip;
  const userAgent = req.headers['user-agent'] ?? '';
  return crypto
    .createHash('sha256')
    .update(`${ip}-${userAgent}`)
    .digest('hex');
}

// Track blog views
export const trackBlogView = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const blogId = req.params['id'] ?? req.params['blogId'];
    if (!blogId) {
      return next();
    }

    const visitorId = generateVisitorId(req);
    
    // Track view asynchronously - don't wait for it
    analyticsClient.trackView(blogId, visitorId)
      .catch(error => {
        logger.error('Error tracking blog view:', error);
      });

    next();
  } catch (error) {
    // Don't block the request if analytics fails
    logger.error('Error in view tracking middleware:', error);
    next();
  }
};

// Track read progress
export const trackReadProgress = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { blogId, progress } = req.body;
    if (!blogId || typeof progress !== 'number') {
      return next();
    }

    const visitorId = generateVisitorId(req);
    
    // Track progress asynchronously
    analyticsClient.trackProgress(blogId, visitorId, progress)
      .catch(error => {
        logger.error('Error tracking read progress:', error);
      });

    // If progress is >= 90%, consider it as "read"
    if (progress >= 90) {
      analyticsClient.trackRead(blogId, visitorId)
        .catch(error => {
          logger.error('Error tracking blog read:', error);
        });
    }

    next();
  } catch (error) {
    logger.error('Error in progress tracking middleware:', error);
    next();
  }
};

// Track link clicks
export const trackLinkClick = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { blogId, url } = req.body;
    if (!blogId || !url) {
      return next();
    }

    // Track link click asynchronously
    analyticsClient.trackLinkClick(blogId, url)
      .catch(error => {
        logger.error('Error tracking link click:', error);
      });

    next();
  } catch (error) {
    logger.error('Error in link click tracking middleware:', error);
    next();
  }
};

// Analytics headers middleware
export const addAnalyticsHeaders = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Add visitor ID to response headers for client-side tracking
  const visitorId = generateVisitorId(req);
  res.setHeader('X-Visitor-ID', visitorId);
  next();
};
