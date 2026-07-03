import { CommentService } from '@services/comment.service';
import { prisma } from '@shared/utils/prismaClient';
import { blogCache } from '@shared/config/redis';

const prismaMock = prisma as unknown as {
  blog: {
    findUnique: jest.Mock;
  };
  blogAnalytics: {
    update: jest.Mock;
  };
  comment: {
    count: jest.Mock;
    create: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  report: {
    create: jest.Mock;
    findFirst: jest.Mock;
  };
};

const cacheMock = blogCache as unknown as {
  invalidate: jest.Mock;
};

describe('CommentService.listComments', () => {
  it('returns top-level comments with their replies, paginated', async () => {
    const service = new CommentService();
    prismaMock.blog.findUnique.mockResolvedValue({ id: 'blog-1', published: true, authorId: 'author-1' });
    const comments = [{ id: 'comment-1', replies: [] }];
    prismaMock.comment.findMany.mockResolvedValue(comments);
    prismaMock.comment.count.mockResolvedValue(1);

    const result = await service.listComments('blog-1', 1, 20);

    expect(prismaMock.comment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { blogId: 'blog-1', parentId: null, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    }));
    expect(result).toEqual({ comments, total: 1, page: 1, totalPages: 1 });
  });

  it('throws Blog not found for a missing or deleted blog', async () => {
    const service = new CommentService();
    prismaMock.blog.findUnique.mockResolvedValue(null);
    await expect(service.listComments('missing')).rejects.toThrow('Blog not found');
  });

  it('rejects invalid pagination', async () => {
    const service = new CommentService();
    await expect(service.listComments('blog-1', 0, 20)).rejects.toThrow('Invalid pagination');
    await expect(service.listComments('blog-1', 1, 500)).rejects.toThrow('Invalid pagination');
  });

  // Regression test: the list endpoint is intentionally public (no auth
  // required), but that must not let anyone enumerate comments on someone
  // else's unpublished draft just by knowing its ID.
  it('treats an unpublished blog as not found for an anonymous or non-author viewer', async () => {
    const service = new CommentService();
    prismaMock.blog.findUnique.mockResolvedValue({ id: 'blog-1', published: false, authorId: 'author-1' });

    await expect(service.listComments('blog-1', 1, 20)).rejects.toThrow('Blog not found');
    await expect(service.listComments('blog-1', 1, 20, 'someone-else')).rejects.toThrow('Blog not found');
  });

  it('lets the draft author list comments on their own unpublished blog', async () => {
    const service = new CommentService();
    prismaMock.blog.findUnique.mockResolvedValue({ id: 'blog-1', published: false, authorId: 'author-1' });
    prismaMock.comment.findMany.mockResolvedValue([]);
    prismaMock.comment.count.mockResolvedValue(0);

    await expect(service.listComments('blog-1', 1, 20, 'author-1')).resolves.toEqual({
      comments: [], total: 0, page: 1, totalPages: 0,
    });
  });
});

describe('CommentService.createComment', () => {
  it('creates a top-level comment and increments the analytics counter', async () => {
    const service = new CommentService();
    prismaMock.blog.findUnique.mockResolvedValue({ id: 'blog-1', slug: 'blog-1-slug', published: true, authorId: 'author-1' });
    const comment = { id: 'comment-1', blogId: 'blog-1', userId: 'user-1', content: 'Nice post' };
    prismaMock.comment.create.mockResolvedValue(comment);

    const result = await service.createComment('blog-1', 'user-1', 'Nice post');

    expect(prismaMock.comment.create).toHaveBeenCalledWith({
      data: { blogId: 'blog-1', userId: 'user-1', content: 'Nice post', parentId: null },
      include: { user: { select: { id: true, username: true, profileImage: true } } },
    });
    expect(prismaMock.blogAnalytics.update).toHaveBeenCalledWith({
      where: { blogId: 'blog-1' },
      data: { comments: { increment: 1 } },
    });
    expect(result).toBe(comment);
  });

  // Regression test: the blog-by-slug response is Redis-cached and embeds
  // analytics.comments, which previously went stale forever after the
  // first comment posted post-cache-fill, since createComment never
  // invalidated it.
  it('invalidates the blog-by-slug cache after posting a comment', async () => {
    const service = new CommentService();
    prismaMock.blog.findUnique.mockResolvedValue({ id: 'blog-1', slug: 'blog-1-slug', published: true, authorId: 'author-1' });
    prismaMock.comment.create.mockResolvedValue({ id: 'comment-1', blogId: 'blog-1', userId: 'user-1', content: 'Nice post' });

    await service.createComment('blog-1', 'user-1', 'Nice post');

    expect(cacheMock.invalidate).toHaveBeenCalledWith('blog-1-slug');
  });

  it('creates a reply when parentId points to a valid top-level comment on the same blog', async () => {
    const service = new CommentService();
    prismaMock.blog.findUnique.mockResolvedValue({ id: 'blog-1', published: true, authorId: 'author-1' });
    prismaMock.comment.findUnique.mockResolvedValue({ id: 'parent-1', blogId: 'blog-1', parentId: null, deletedAt: null });
    prismaMock.comment.create.mockResolvedValue({ id: 'reply-1' });

    await service.createComment('blog-1', 'user-1', 'A reply', 'parent-1');

    expect(prismaMock.comment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ parentId: 'parent-1' }),
    }));
  });

  it('rejects replying to a reply (only one level of nesting supported)', async () => {
    const service = new CommentService();
    prismaMock.blog.findUnique.mockResolvedValue({ id: 'blog-1', published: true, authorId: 'author-1' });
    prismaMock.comment.findUnique.mockResolvedValue({ id: 'reply-1', blogId: 'blog-1', parentId: 'parent-1', deletedAt: null });

    await expect(service.createComment('blog-1', 'user-1', 'nested reply', 'reply-1'))
      .rejects.toThrow('Cannot reply to a reply');
    expect(prismaMock.comment.create).not.toHaveBeenCalled();
  });

  it('rejects a parentId that does not exist on this blog', async () => {
    const service = new CommentService();
    prismaMock.blog.findUnique.mockResolvedValue({ id: 'blog-1', published: true, authorId: 'author-1' });
    prismaMock.comment.findUnique.mockResolvedValue({ id: 'parent-1', blogId: 'other-blog', parentId: null, deletedAt: null });

    await expect(service.createComment('blog-1', 'user-1', 'reply', 'parent-1'))
      .rejects.toThrow('Parent comment not found');
  });

  it('throws Blog not found for a missing blog', async () => {
    const service = new CommentService();
    prismaMock.blog.findUnique.mockResolvedValue(null);
    await expect(service.createComment('missing', 'user-1', 'hello')).rejects.toThrow('Blog not found');
  });

  it('rejects commenting on someone else\'s unpublished draft', async () => {
    const service = new CommentService();
    prismaMock.blog.findUnique.mockResolvedValue({ id: 'blog-1', published: false, authorId: 'author-1' });

    await expect(service.createComment('blog-1', 'someone-else', 'hello'))
      .rejects.toThrow('Blog not found');
    expect(prismaMock.comment.create).not.toHaveBeenCalled();
  });
});

describe('CommentService.updateComment', () => {
  it('allows the comment author to edit it', async () => {
    const service = new CommentService();
    prismaMock.comment.findUnique.mockResolvedValue({ id: 'comment-1', userId: 'author-1', deletedAt: null });
    const updated = { id: 'comment-1', content: 'edited' };
    prismaMock.comment.update.mockResolvedValue(updated);

    const result = await service.updateComment('comment-1', 'author-1', 'edited');
    expect(result).toBe(updated);
  });

  it('rejects edits from a non-author', async () => {
    const service = new CommentService();
    prismaMock.comment.findUnique.mockResolvedValue({ id: 'comment-1', userId: 'author-1', deletedAt: null });

    await expect(service.updateComment('comment-1', 'someone-else', 'edited')).rejects.toThrow('Not authorized');
  });

  it('throws Comment not found for a missing or already-deleted comment', async () => {
    const service = new CommentService();
    prismaMock.comment.findUnique.mockResolvedValue(null);
    await expect(service.updateComment('missing', 'author-1', 'x')).rejects.toThrow('Comment not found');

    prismaMock.comment.findUnique.mockResolvedValue({ id: 'comment-1', userId: 'author-1', deletedAt: new Date() });
    await expect(service.updateComment('comment-1', 'author-1', 'x')).rejects.toThrow('Comment not found');
  });
});

describe('CommentService.deleteComment', () => {
  it('allows the comment author to soft-delete it and decrements the counter', async () => {
    const service = new CommentService();
    prismaMock.comment.findUnique.mockResolvedValue({ id: 'comment-1', userId: 'author-1', blogId: 'blog-1', deletedAt: null });
    prismaMock.blog.findUnique.mockResolvedValue({ slug: 'blog-1-slug' });

    const result = await service.deleteComment('comment-1', 'author-1', ['user']);

    expect(prismaMock.comment.update).toHaveBeenCalledWith({
      where: { id: 'comment-1' },
      data: { deletedAt: expect.any(Date) },
    });
    expect(prismaMock.blogAnalytics.update).toHaveBeenCalledWith({
      where: { blogId: 'blog-1' },
      data: { comments: { decrement: 1 } },
    });
    expect(result).toEqual({ id: 'comment-1' });
    // Regression: comment deletion previously never invalidated the
    // Redis-cached blog-by-slug response, so its embedded comment count
    // stayed stale after a delete just like it did after a create.
    expect(cacheMock.invalidate).toHaveBeenCalledWith('blog-1-slug');
  });

  it('allows an admin to delete someone else\'s comment', async () => {
    const service = new CommentService();
    prismaMock.comment.findUnique.mockResolvedValue({ id: 'comment-1', userId: 'author-1', blogId: 'blog-1', deletedAt: null });

    await expect(service.deleteComment('comment-1', 'admin-1', ['Admin'])).resolves.toEqual({ id: 'comment-1' });
  });

  it('rejects deletion from a non-author, non-admin requester', async () => {
    const service = new CommentService();
    prismaMock.comment.findUnique.mockResolvedValue({ id: 'comment-1', userId: 'author-1', blogId: 'blog-1', deletedAt: null });

    await expect(service.deleteComment('comment-1', 'someone-else', ['user'])).rejects.toThrow('Not authorized');
    expect(prismaMock.comment.update).not.toHaveBeenCalled();
  });

  it('throws Comment not found for a missing comment', async () => {
    const service = new CommentService();
    prismaMock.comment.findUnique.mockResolvedValue(null);
    await expect(service.deleteComment('missing', 'author-1', [])).rejects.toThrow('Comment not found');
  });
});

describe('CommentService.reportComment', () => {
  it('creates a report against a comment', async () => {
    const service = new CommentService();
    prismaMock.comment.findUnique.mockResolvedValue({ id: 'comment-1', deletedAt: null });
    prismaMock.report.findFirst.mockResolvedValue(null);
    const report = { id: 'report-1' };
    prismaMock.report.create.mockResolvedValue(report);

    const result = await service.reportComment('comment-1', 'user-1', 'This comment is abusive');

    expect(prismaMock.report.create).toHaveBeenCalledWith({
      data: { targetType: 'comment', targetId: 'comment-1', reporterId: 'user-1', reason: 'This comment is abusive' },
    });
    expect(result).toBe(report);
  });

  it('rejects a duplicate open report', async () => {
    const service = new CommentService();
    prismaMock.comment.findUnique.mockResolvedValue({ id: 'comment-1', deletedAt: null });
    prismaMock.report.findFirst.mockResolvedValue({ id: 'existing' });

    await expect(service.reportComment('comment-1', 'user-1', 'duplicate reason text here'))
      .rejects.toThrow('Report already exists');
  });

  it('throws Comment not found for a missing or deleted comment', async () => {
    const service = new CommentService();
    prismaMock.comment.findUnique.mockResolvedValue(null);
    await expect(service.reportComment('missing', 'user-1', 'some reason text')).rejects.toThrow('Comment not found');
  });
});
