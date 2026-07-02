import { Request, Response } from 'express'
import { z } from 'zod'
import logger from '@shared/utils/logger'
import { CommentService } from '@services/comment.service'
import { trackDbOperation, trackError } from '@middlewares/metrics.middleware'

const createCommentSchema = z.object({
  content: z.string().min(1).max(2000),
  parentId: z.string().optional(),
})

const updateCommentSchema = z.object({
  content: z.string().min(1).max(2000),
})

const paginationQuerySchema = z.object({
  page: z.string().transform(Number).optional(),
  limit: z.string().transform(Number).optional(),
})

const reportCommentSchema = z.object({
  reason: z.string().min(10).max(500),
})

export class CommentController {
  private readonly commentService: CommentService

  constructor() {
    this.commentService = new CommentService()
  }

  // List top-level comments (with one level of replies) for a blog (public)
  async list(req: Request, res: Response): Promise<Response> {
    const { id } = req.params
    if (!id) {
      return res.status(400).json({
        message: 'Blog ID is required',
        details: 'The blog ID parameter is missing from the request URL'
      });
    }

    try {
      const { page, limit } = paginationQuerySchema.parse(req.query)
      const result = await this.commentService.listComments(id, page, limit, req.user?.id);
      return res.json(result)
    } catch (error) {
      logger.error('Error listing comments:', error)

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: 'Invalid query parameters',
          errors: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        })
      }

      if (error instanceof Error) {
        switch (error.message) {
          case 'Blog not found':
            return res.status(404).json({
              message: 'Blog not found',
              details: 'The specified blog post does not exist'
            })
          case 'Invalid pagination':
            return res.status(400).json({
              message: 'Invalid pagination parameters',
              details: 'Page or limit values are invalid'
            })
        }
      }

      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to fetch comments due to an unexpected error'
      })
    }
  }

  // Create a comment or (via parentId) a single-level reply
  async create(req: Request, res: Response): Promise<Response> {
    const { id } = req.params
    if (!id) {
      return res.status(400).json({
        message: 'Blog ID is required',
        details: 'The blog ID parameter is missing from the request URL'
      });
    }

    let dbTimer;
    try {
      const validatedInput = createCommentSchema.parse(req.body)
      dbTimer = trackDbOperation('create', 'comment');
      const comment = await this.commentService.createComment(
        id,
        req.user!.id,
        validatedInput.content,
        validatedInput.parentId
      );
      dbTimer.end();
      return res.status(201).json(comment)
    } catch (error) {
      if (dbTimer) dbTimer.end('failure');
      logger.error('Error creating comment:', error)

      if (error instanceof z.ZodError) {
        trackError('validation', 'create_comment', 'blog-service');
        return res.status(400).json({
          message: 'Invalid input data',
          errors: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        })
      }

      if (error instanceof Error) {
        trackError('business_logic', error.message, 'blog-service');
        switch (error.message) {
          case 'Blog not found':
            return res.status(404).json({
              message: 'Blog not found',
              details: 'The specified blog post does not exist'
            })
          case 'Parent comment not found':
            return res.status(400).json({
              message: 'Invalid parent comment',
              details: 'The specified parent comment does not exist on this blog post'
            })
          case 'Cannot reply to a reply':
            return res.status(400).json({
              message: 'Cannot reply to a reply',
              details: 'Comments only support one level of replies'
            })
        }
      }

      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to create comment due to an unexpected error'
      })
    }
  }

  // Edit a comment (author only)
  async update(req: Request, res: Response): Promise<Response> {
    const { commentId } = req.params
    if (!commentId) {
      return res.status(400).json({
        message: 'Comment ID is required',
        details: 'The comment ID parameter is missing from the request URL'
      });
    }

    try {
      const { content } = updateCommentSchema.parse(req.body)
      const comment = await this.commentService.updateComment(commentId, req.user!.id, content);
      return res.json(comment)
    } catch (error) {
      logger.error('Error updating comment:', error)

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: 'Invalid input data',
          errors: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        })
      }

      if (error instanceof Error) {
        switch (error.message) {
          case 'Comment not found':
            return res.status(404).json({
              message: 'Comment not found',
              details: 'The specified comment does not exist'
            })
          case 'Not authorized':
            return res.status(403).json({
              message: 'Not authorized',
              details: 'You do not have permission to edit this comment'
            })
        }
      }

      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to update comment due to an unexpected error'
      })
    }
  }

  // Soft-delete a comment (author or admin)
  async delete(req: Request, res: Response): Promise<Response> {
    const { commentId } = req.params
    if (!commentId) {
      return res.status(400).json({
        message: 'Comment ID is required',
        details: 'The comment ID parameter is missing from the request URL'
      });
    }

    try {
      await this.commentService.deleteComment(commentId, req.user!.id, req.user!.roles);
      return res.json({ message: 'Comment deleted successfully' })
    } catch (error) {
      logger.error('Error deleting comment:', error)

      if (error instanceof Error) {
        switch (error.message) {
          case 'Comment not found':
            return res.status(404).json({
              message: 'Comment not found',
              details: 'The specified comment does not exist'
            })
          case 'Not authorized':
            return res.status(403).json({
              message: 'Not authorized',
              details: 'You do not have permission to delete this comment'
            })
        }
      }

      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to delete comment due to an unexpected error'
      })
    }
  }

  // Report a comment for moderation review
  async report(req: Request, res: Response): Promise<Response> {
    const { commentId } = req.params
    if (!commentId) {
      return res.status(400).json({
        message: 'Comment ID is required',
        details: 'The comment ID parameter is missing from the request URL'
      });
    }

    try {
      const { reason } = reportCommentSchema.parse(req.body)
      const report = await this.commentService.reportComment(commentId, req.user!.id, reason);
      return res.status(201).json(report)
    } catch (error) {
      logger.error('Error reporting comment:', error)

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: 'Invalid input data',
          errors: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        })
      }

      if (error instanceof Error) {
        switch (error.message) {
          case 'Comment not found':
            return res.status(404).json({
              message: 'Comment not found',
              details: 'The specified comment does not exist'
            })
          case 'Report already exists':
            return res.status(409).json({
              message: 'Report already exists',
              details: 'You have already reported this comment and it is still under review'
            })
        }
      }

      return res.status(500).json({
        message: 'Internal server error',
        details: 'Failed to report comment due to an unexpected error'
      })
    }
  }
}
