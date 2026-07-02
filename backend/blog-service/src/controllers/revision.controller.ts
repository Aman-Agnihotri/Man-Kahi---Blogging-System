import { Request, Response } from 'express'
import logger from '@shared/utils/logger'
import { BlogService } from '@services/blog.service'
import { trackDbOperation, trackError } from '@middlewares/metrics.middleware'

// Revision endpoints are a thin controller over BlogService, since the
// revision-capture logic is tightly coupled to updateBlog and lives there
// (see BlogService.captureRevision/listRevisions/getRevision/restoreRevision).
export class RevisionController {
  private readonly blogService: BlogService

  constructor() {
    this.blogService = new BlogService()
  }

  // List revisions for a blog (author or admin only)
  async list(req: Request, res: Response): Promise<Response> {
    const { id } = req.params
    if (!id) {
      return res.status(400).json({
        message: 'Blog ID is required',
        details: 'The blog ID parameter is missing from the request URL'
      });
    }

    try {
      const dbTimer = trackDbOperation('read', 'blog_revision');
      const revisions = await this.blogService.listRevisions(id, req.user!.id, req.user!.roles);
      dbTimer.end();
      return res.json(revisions)
    } catch (error) {
      logger.error('Error listing blog revisions:', error)

      if (error instanceof Error) {
        trackError('business_logic', error.message, 'blog-service');
        switch (error.message) {
          case 'Blog not found':
            return res.status(404).json({
              message: 'Blog not found',
              details: 'The specified blog post does not exist'
            })
          case 'Not authorized':
            return res.status(403).json({
              message: 'Not authorized',
              details: 'You do not have permission to view this blog post\'s revisions'
            })
        }
      }

      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to fetch blog revisions due to an unexpected error'
      })
    }
  }

  // Get a single revision, including its full content (author or admin only)
  async getOne(req: Request, res: Response): Promise<Response> {
    const { id, revisionId } = req.params
    if (!id || !revisionId) {
      return res.status(400).json({
        message: 'Blog ID and revision ID are required',
        details: 'The blog ID or revision ID parameter is missing from the request URL'
      });
    }

    try {
      const dbTimer = trackDbOperation('read', 'blog_revision');
      const revision = await this.blogService.getRevision(id, revisionId, req.user!.id, req.user!.roles);
      dbTimer.end();
      return res.json(revision)
    } catch (error) {
      logger.error('Error fetching blog revision:', error)

      if (error instanceof Error) {
        trackError('business_logic', error.message, 'blog-service');
        switch (error.message) {
          case 'Blog not found':
            return res.status(404).json({
              message: 'Blog not found',
              details: 'The specified blog post does not exist'
            })
          case 'Revision not found':
            return res.status(404).json({
              message: 'Revision not found',
              details: 'The specified revision does not exist for this blog post'
            })
          case 'Not authorized':
            return res.status(403).json({
              message: 'Not authorized',
              details: 'You do not have permission to view this blog post\'s revisions'
            })
        }
      }

      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to fetch blog revision due to an unexpected error'
      })
    }
  }

  // Restore a blog to a prior revision (author only, not admin - this
  // rewrites the author's own content)
  async restore(req: Request, res: Response): Promise<Response> {
    const { id, revisionId } = req.params
    if (!id || !revisionId) {
      return res.status(400).json({
        message: 'Blog ID and revision ID are required',
        details: 'The blog ID or revision ID parameter is missing from the request URL'
      });
    }

    let dbTimer;
    try {
      dbTimer = trackDbOperation('update', 'blog');
      const blog = await this.blogService.restoreRevision(id, revisionId, req.user!.id);
      dbTimer.end();
      return res.json(blog)
    } catch (error) {
      if (dbTimer) dbTimer.end('failure');
      logger.error('Error restoring blog revision:', error)

      if (error instanceof Error) {
        trackError('business_logic', error.message, 'blog-service');
        switch (error.message) {
          case 'Blog not found':
            return res.status(404).json({
              message: 'Blog not found',
              details: 'The specified blog post does not exist'
            })
          case 'Revision not found':
            return res.status(404).json({
              message: 'Revision not found',
              details: 'The specified revision does not exist for this blog post'
            })
          case 'Not authorized':
            return res.status(403).json({
              message: 'Not authorized',
              details: 'You do not have permission to restore this blog post'
            })
          case 'Invalid markdown content':
            return res.status(400).json({
              message: 'Invalid markdown content format',
              details: 'The revision content contains invalid syntax or formatting'
            })
        }
      }

      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to restore blog revision due to an unexpected error'
      })
    }
  }
}
