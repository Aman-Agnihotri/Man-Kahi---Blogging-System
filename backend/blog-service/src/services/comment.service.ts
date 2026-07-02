import { prisma } from '@shared/utils/prismaClient'
import logger from '@shared/utils/logger'

const AUTHOR_SELECT = {
  id: true,
  username: true,
  profileImage: true,
} as const

export class CommentService {
  async listComments(blogId: string, page = 1, limit = 20) {
    logger.debug(`Listing comments for blog ${blogId}`, { page, limit })

    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error('Invalid pagination')
    }

    const blog = await prisma.blog.findUnique({
      where: { id: blogId, deletedAt: null },
      select: { id: true },
    })
    if (!blog) {
      logger.warn(`Blog not found when listing comments: ${blogId}`)
      throw new Error('Blog not found')
    }

    const [comments, total] = await Promise.all([
      prisma.comment.findMany({
        where: { blogId, parentId: null, deletedAt: null },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: AUTHOR_SELECT },
          replies: {
            where: { deletedAt: null },
            orderBy: { createdAt: 'asc' },
            include: { user: { select: AUTHOR_SELECT } },
          },
        },
      }),
      prisma.comment.count({ where: { blogId, parentId: null, deletedAt: null } }),
    ])

    return {
      comments,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    }
  }

  async createComment(blogId: string, userId: string, content: string, parentId?: string) {
    logger.debug(`Creating comment on blog ${blogId}`, { userId, parentId })

    const blog = await prisma.blog.findUnique({
      where: { id: blogId, deletedAt: null },
      select: { id: true },
    })
    if (!blog) {
      logger.warn(`Blog not found when creating comment: ${blogId}`)
      throw new Error('Blog not found')
    }

    if (parentId) {
      const parent = await prisma.comment.findUnique({ where: { id: parentId } })
      if (!parent || parent.blogId !== blogId || parent.deletedAt) {
        throw new Error('Parent comment not found')
      }
      // Only one level of nesting is supported - a reply itself has a
      // non-null parentId, so replying to a reply is rejected here.
      if (parent.parentId !== null) {
        throw new Error('Cannot reply to a reply')
      }
    }

    const comment = await prisma.comment.create({
      data: { blogId, userId, content, parentId: parentId ?? null },
      include: { user: { select: AUTHOR_SELECT } },
    })

    await prisma.blogAnalytics.update({
      where: { blogId },
      data: { comments: { increment: 1 } },
    })

    logger.info(`Comment ${comment.id} created on blog ${blogId}`)
    return comment
  }

  async updateComment(commentId: string, userId: string, content: string) {
    logger.debug(`Updating comment ${commentId}`, { userId })

    const comment = await prisma.comment.findUnique({ where: { id: commentId } })
    if (!comment || comment.deletedAt) {
      throw new Error('Comment not found')
    }
    if (comment.userId !== userId) {
      logger.warn(`Unauthorized comment update attempt for ${commentId} by ${userId}`)
      throw new Error('Not authorized')
    }

    return prisma.comment.update({
      where: { id: commentId },
      data: { content },
      include: { user: { select: AUTHOR_SELECT } },
    })
  }

  async deleteComment(commentId: string, requesterId: string, requesterRoles: string[]) {
    logger.debug(`Deleting comment ${commentId}`, { requesterId })

    const comment = await prisma.comment.findUnique({ where: { id: commentId } })
    if (!comment || comment.deletedAt) {
      throw new Error('Comment not found')
    }

    const isAdmin = requesterRoles.some(role => role.toLowerCase() === 'admin')
    if (comment.userId !== requesterId && !isAdmin) {
      logger.warn(`Unauthorized comment deletion attempt for ${commentId} by ${requesterId}`)
      throw new Error('Not authorized')
    }

    const deletedAt = new Date()
    await prisma.comment.update({ where: { id: commentId }, data: { deletedAt } })

    // Only decrements for the deleted comment itself, not any replies it may
    // have - keeps the counter logic simple (one decrement per delete call)
    // at the cost of BlogAnalytics.comments going slightly stale when a
    // top-level comment with replies is deleted. Acceptable for a first pass.
    await prisma.blogAnalytics.update({
      where: { blogId: comment.blogId },
      data: { comments: { decrement: 1 } },
    })

    logger.info(`Comment ${commentId} deleted by ${requesterId}`)
    return { id: commentId }
  }

  async reportComment(commentId: string, reporterId: string, reason: string) {
    logger.debug(`Reporting comment ${commentId}`, { reporterId })

    const comment = await prisma.comment.findUnique({ where: { id: commentId } })
    if (!comment || comment.deletedAt) {
      throw new Error('Comment not found')
    }

    const existingOpenReport = await prisma.report.findFirst({
      where: { targetType: 'comment', targetId: commentId, reporterId, status: 'open' },
    })
    if (existingOpenReport) {
      throw new Error('Report already exists')
    }

    return prisma.report.create({
      data: { targetType: 'comment', targetId: commentId, reporterId, reason },
    })
  }
}
