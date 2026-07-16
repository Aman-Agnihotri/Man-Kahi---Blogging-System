import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import { BlogController } from '@controllers/blog.controller';
import { CommentController } from '@controllers/comment.controller';
import { RevisionController } from '@controllers/revision.controller';
import { CategoryController } from '@controllers/category.controller';
import { authenticate } from '@shared/middlewares/auth';
import { createServiceRateLimit, createEndpointRateLimit } from '@shared/middlewares/rateLimit';
import { upload } from '@config/upload';
import {
  trackBlogView,
  trackReadProgress,
  trackLinkClick,
  addAnalyticsHeaders
} from '@middlewares/analytics.middleware';
import { trackBlogOperation } from '@middlewares/metrics.middleware';
import { metricsHandler } from '@config/metrics';

const router = Router();
const blogController = new BlogController();
const commentController = new CommentController();
const revisionController = new RevisionController();
const categoryController = new CategoryController();

// Service Rate Limit Middleware
const serviceRateLimit = createServiceRateLimit('blog');

const optionalAuthenticate: RequestHandler = (req, res, next) => {
  if (!req.headers.authorization?.startsWith('Bearer ')) {
    next();
    return;
  }

  (authenticate() as RequestHandler)(req, res, next);
};

// Initialize routes
router.use(addAnalyticsHeaders as RequestHandler);
router.use(serviceRateLimit);

// Metrics endpoint
router.get('/metrics', metricsHandler as RequestHandler);

// Track reading progress
router.post(
  '/analytics/progress',
  createEndpointRateLimit('blog:progress') as RequestHandler,
  trackBlogOperation('track_progress') as RequestHandler,
  trackReadProgress as RequestHandler,
  ((req: Request, res: Response) => {
    res.json({ success: true });
  }) as RequestHandler
);

// Track link clicks
router.post(
  '/analytics/link',
  createEndpointRateLimit('blog:link') as RequestHandler,
  trackBlogOperation('track_link') as RequestHandler,
  trackLinkClick as RequestHandler,
  ((req: Request, res: Response) => {
    res.json({ success: true });
  }) as RequestHandler
);

// Search blogs
router.get(
  '/search',
  createEndpointRateLimit('blog:search') as RequestHandler,
  trackBlogOperation('search') as RequestHandler,
  ((req: Request, res: Response, next: NextFunction) => {
    blogController.search(req, res).catch(next);
  }) as RequestHandler
);

// Trigger a full search index rebuild (admin only) - fire-and-forget, see
// BlogController.reindex
router.post(
  '/search/reindex',
  authenticate({ roles: ['admin'] }) as RequestHandler,
  createServiceRateLimit('admin') as RequestHandler,
  trackBlogOperation('reindex') as RequestHandler,
  ((req: Request, res: Response, next: NextFunction) => {
    blogController.reindex(req, res).catch(next);
  }) as RequestHandler
);

// Get popular tags
router.get(
  '/tags/popular',
  trackBlogOperation('get_popular_tags') as RequestHandler,
  ((req: Request, res: Response, next: NextFunction) => {
    blogController.getPopularTags(req, res).catch(next);
  }) as RequestHandler
);

// Get suggested blogs
router.get(
  '/suggested/:blogId',
  trackBlogOperation('get_suggested_blogs') as RequestHandler,
  trackBlogView as RequestHandler,
  ((req: Request, res: Response, next: NextFunction) => {
    blogController.getSuggestedBlogs(req, res).catch(next);
  }) as RequestHandler
);

// Get current user's blogs
router.get(
  '/user',
  authenticate() as RequestHandler,
  trackBlogOperation('get_user_blogs') as RequestHandler,
  ((req: Request, res: Response, next: NextFunction) => {
    blogController.getUserBlogs(req, res).catch(next);
  }) as RequestHandler
);

// Get a specific user's public blogs
router.get(
  '/user/:userId',
  trackBlogOperation('get_user_blogs') as RequestHandler,
  ((req: Request, res: Response, next: NextFunction) => {
    blogController.getUserBlogs(req, res).catch(next);
  }) as RequestHandler
);

// Get trending blogs (public) - single-segment route, must be registered
// before the "/:slug" catch-all below or it would be swallowed as a slug
// lookup for a blog literally titled "trending".
router.get(
  '/trending',
  createEndpointRateLimit('blog:trending') as RequestHandler,
  trackBlogOperation('get_trending') as RequestHandler,
  ((req: Request, res: Response, next: NextFunction) => {
    blogController.getTrending(req, res).catch(next);
  }) as RequestHandler
);

// List categories (public) - same "/:slug" catch-all ordering concern as
// above.
router.get(
  '/categories',
  trackBlogOperation('list_categories') as RequestHandler,
  ((req: Request, res: Response, next: NextFunction) => {
    categoryController.list(req, res).catch(next);
  }) as RequestHandler
);

// Create/update/delete categories (admin only)
router.post(
  '/categories',
  authenticate({ roles: ['admin'] }) as RequestHandler,
  createServiceRateLimit('admin') as RequestHandler,
  trackBlogOperation('create_category') as RequestHandler,
  ((req: Request, res: Response, next: NextFunction) => {
    categoryController.create(req, res).catch(next);
  }) as RequestHandler
);

router.put(
  '/categories/:id',
  authenticate({ roles: ['admin'] }) as RequestHandler,
  createServiceRateLimit('admin') as RequestHandler,
  trackBlogOperation('update_category') as RequestHandler,
  ((req: Request, res: Response, next: NextFunction) => {
    categoryController.update(req, res).catch(next);
  }) as RequestHandler
);

router.delete(
  '/categories/:id',
  authenticate({ roles: ['admin'] }) as RequestHandler,
  createServiceRateLimit('admin') as RequestHandler,
  trackBlogOperation('delete_category') as RequestHandler,
  ((req: Request, res: Response, next: NextFunction) => {
    categoryController.delete(req, res).catch(next);
  }) as RequestHandler
);

// List the current user's bookmarked blogs - single-segment route, same
// "/:slug" catch-all ordering concern as above.
router.get(
  '/bookmarks',
  authenticate() as RequestHandler,
  trackBlogOperation('get_bookmarks') as RequestHandler,
  ((req: Request, res: Response, next: NextFunction) => {
    blogController.getBookmarks(req, res).catch(next);
  }) as RequestHandler
);

// Report a comment for moderation review (registered ahead of the
// "/:id/comments" block purely for readability - no ordering hazard since
// its literal "comments" first segment and 3-segment shape don't collide
// with any "/:id/..." pattern)
router.post(
  '/comments/:commentId/report',
  authenticate() as RequestHandler,
  createEndpointRateLimit('blog:comment:report') as RequestHandler,
  trackBlogOperation('report_comment') as RequestHandler,
  ((req: Request, res: Response, next: NextFunction) => {
    commentController.report(req, res).catch(next);
  }) as RequestHandler
);

// Edit/delete a comment by its own ID
router.put(
  '/comments/:commentId',
  authenticate() as RequestHandler,
  createEndpointRateLimit('blog:comment:update') as RequestHandler,
  trackBlogOperation('update_comment') as RequestHandler,
  ((req: Request, res: Response, next: NextFunction) => {
    commentController.update(req, res).catch(next);
  }) as RequestHandler
);

router.delete(
  '/comments/:commentId',
  authenticate() as RequestHandler,
  createEndpointRateLimit('blog:comment:delete') as RequestHandler,
  trackBlogOperation('delete_comment') as RequestHandler,
  ((req: Request, res: Response, next: NextFunction) => {
    commentController.delete(req, res).catch(next);
  }) as RequestHandler
);

// Redirect to a presigned image URL (public, no auth) - single-segment
// "images" prefix + key, must be registered before the "/:slug" catch-all
// below or it would be swallowed as a slug lookup.
router.get(
  '/images/:key',
  ((req: Request, res: Response, next: NextFunction) => {
    blogController.getImage(req, res).catch(next);
  }) as RequestHandler
);

// Get blog by slug
router.get(
  '/:slug',
  optionalAuthenticate,
  trackBlogOperation('get_blog') as RequestHandler,
  trackBlogView as RequestHandler,
  ((req: Request, res: Response, next: NextFunction) => {
    blogController.getBySlug(req, res).catch(next);
  }) as RequestHandler
);

// Create new blog
router.post(
  '/',
  authenticate() as RequestHandler,
  createEndpointRateLimit('blog:create') as RequestHandler,
  upload.single('image'),
  trackBlogOperation('create_blog') as RequestHandler,
  ((req: Request, res: Response, next: NextFunction) => {
    blogController.create(req, res).catch(next);
  }) as RequestHandler
);

// Update blog
router.put(
  '/:id',
  authenticate() as RequestHandler,
  createEndpointRateLimit('blog:update') as RequestHandler,
  upload.single('image'),
  trackBlogOperation('update_blog') as RequestHandler,
  ((req: Request, res: Response, next: NextFunction) => {
    blogController.update(req, res).catch(next);
  }) as RequestHandler
);

// Like / unlike a blog (idempotent toggle)
router.post(
  '/:id/like',
  authenticate() as RequestHandler,
  createEndpointRateLimit('blog:like') as RequestHandler,
  trackBlogOperation('like_blog') as RequestHandler,
  ((req: Request, res: Response, next: NextFunction) => {
    blogController.like(req, res).catch(next);
  }) as RequestHandler
);

router.delete(
  '/:id/like',
  authenticate() as RequestHandler,
  createEndpointRateLimit('blog:unlike') as RequestHandler,
  trackBlogOperation('unlike_blog') as RequestHandler,
  ((req: Request, res: Response, next: NextFunction) => {
    blogController.unlike(req, res).catch(next);
  }) as RequestHandler
);

// Bookmark / unbookmark a blog (idempotent toggle)
router.post(
  '/:id/bookmark',
  authenticate() as RequestHandler,
  createEndpointRateLimit('blog:bookmark') as RequestHandler,
  trackBlogOperation('bookmark_blog') as RequestHandler,
  ((req: Request, res: Response, next: NextFunction) => {
    blogController.bookmark(req, res).catch(next);
  }) as RequestHandler
);

router.delete(
  '/:id/bookmark',
  authenticate() as RequestHandler,
  createEndpointRateLimit('blog:unbookmark') as RequestHandler,
  trackBlogOperation('unbookmark_blog') as RequestHandler,
  ((req: Request, res: Response, next: NextFunction) => {
    blogController.unbookmark(req, res).catch(next);
  }) as RequestHandler
);

// List / create comments on a blog (list is public, create requires auth).
// optionalAuthenticate so an author viewing their own draft's comments is
// recognized - the service layer still enforces published-or-author
// visibility either way, this just lets it know who's asking.
router.get(
  '/:id/comments',
  optionalAuthenticate,
  trackBlogOperation('list_comments') as RequestHandler,
  ((req: Request, res: Response, next: NextFunction) => {
    commentController.list(req, res).catch(next);
  }) as RequestHandler
);

router.post(
  '/:id/comments',
  authenticate() as RequestHandler,
  createEndpointRateLimit('blog:comment:create') as RequestHandler,
  trackBlogOperation('create_comment') as RequestHandler,
  ((req: Request, res: Response, next: NextFunction) => {
    commentController.create(req, res).catch(next);
  }) as RequestHandler
);

// Report a blog for moderation review
router.post(
  '/:id/report',
  authenticate() as RequestHandler,
  createEndpointRateLimit('blog:report') as RequestHandler,
  trackBlogOperation('report_blog') as RequestHandler,
  ((req: Request, res: Response, next: NextFunction) => {
    blogController.report(req, res).catch(next);
  }) as RequestHandler
);

// List / view / restore blog content revisions (author or admin - the
// per-action authorization check happens in BlogService, since "author or
// admin" for list/get but "author only" for restore isn't expressible via
// the authenticate({roles}) route gate alone)
router.get(
  '/:id/revisions',
  authenticate() as RequestHandler,
  createEndpointRateLimit('blog:revisions') as RequestHandler,
  trackBlogOperation('list_blog_revisions') as RequestHandler,
  ((req: Request, res: Response, next: NextFunction) => {
    revisionController.list(req, res).catch(next);
  }) as RequestHandler
);

router.get(
  '/:id/revisions/:revisionId',
  authenticate() as RequestHandler,
  createEndpointRateLimit('blog:revisions') as RequestHandler,
  trackBlogOperation('get_blog_revision') as RequestHandler,
  ((req: Request, res: Response, next: NextFunction) => {
    revisionController.getOne(req, res).catch(next);
  }) as RequestHandler
);

router.post(
  '/:id/revisions/:revisionId/restore',
  authenticate() as RequestHandler,
  createEndpointRateLimit('blog:revision:restore') as RequestHandler,
  trackBlogOperation('restore_blog_revision') as RequestHandler,
  ((req: Request, res: Response, next: NextFunction) => {
    revisionController.restore(req, res).catch(next);
  }) as RequestHandler
);

// Delete blog
router.delete(
  '/:id',
  authenticate() as RequestHandler,
  createEndpointRateLimit('blog:delete') as RequestHandler,
  trackBlogOperation('delete_blog') as RequestHandler,
  ((req: Request, res: Response, next: NextFunction) => {
    blogController.delete(req, res).catch(next);
  }) as RequestHandler
);

// Get blog analytics
router.get(
  '/:id/analytics',
  authenticate() as RequestHandler,
  createEndpointRateLimit('blog:analytics') as RequestHandler,
  trackBlogOperation('get_blog_analytics') as RequestHandler,
  (async (req: Request, res: Response) => {
    const { analyticsClient } = await import('../utils/analytics');
    try {
      const id = req.params['id'];
      if (!id) {
        res.status(400).json({ error: 'Blog id is missing' });
        return;
      }
      const data = await analyticsClient.getBlogAnalytics(id);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  }) as RequestHandler
);

// Update blog visibility (admin only)
router.put(
  '/:id/visibility',
  authenticate({ roles: ['admin'] }) as RequestHandler,
  createServiceRateLimit('admin') as RequestHandler,
  trackBlogOperation('update_blog_visibility') as RequestHandler,
  ((req: Request, res: Response, next: NextFunction) => {
    blogController.updateVisibility(req, res).catch(next);
  }) as RequestHandler
);

// Admin moderation takedown (admin only) - grouped here with the other
// admin-only blog route for readability. Registration order relative to
// the author-only "DELETE /:id" route above doesn't matter: Express only
// matches "/:id/moderate" against a request with exactly two segments
// where the second is literally "moderate", so it can never be shadowed
// by "/:id" regardless of which is registered first. Called by
// admin-service (DELETE http://blog-service:3002/api/blogs/:id/moderate)
// with the caller's forwarded bearer token, the same way it already calls
// PUT /:id/visibility.
router.delete(
  '/:id/moderate',
  authenticate({ roles: ['admin'] }) as RequestHandler,
  createServiceRateLimit('admin') as RequestHandler,
  trackBlogOperation('moderate_delete_blog') as RequestHandler,
  ((req: Request, res: Response, next: NextFunction) => {
    blogController.moderateDelete(req, res).catch(next);
  }) as RequestHandler
);

export default router;
