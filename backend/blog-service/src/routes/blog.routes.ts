import { Router, RequestHandler } from 'express';
import { BlogController } from '../controllers/blog.controller';
import { authenticate } from '@shared/middlewares/auth';
import { createServiceRateLimit, createEndpointRateLimit } from '@shared/middlewares/rateLimit';
import { upload } from '../config/upload';
import {
  trackBlogView,
  trackReadProgress,
  trackLinkClick,
  addAnalyticsHeaders
} from '../middlewares/analytics.middleware';
import { trackOperationMetrics } from '../middlewares/metrics.middleware';
import { metricsHandler } from '../config/metrics';

const router = Router();
const blogController = new BlogController();

/**
 * @swagger
 * components:
 *   schemas:
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           description: Short error description
 *         details:
 *           type: string
 *           description: Detailed error explanation
 *         errors:
 *           type: array
 *           description: Validation errors if applicable
 *           items:
 *             type: object
 *             properties:
 *               field:
 *                 type: string
 *               message:
 *                 type: string
 * 
 *     BlogResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: Unique identifier of the blog post
 *         title:
 *           type: string
 *           description: Title of the blog post
 *         slug:
 *           type: string
 *           description: URL-friendly version of the title
 *         content:
 *           type: string
 *           description: Blog post content in markdown format
 *         description:
 *           type: string
 *           description: Short description or excerpt
 *         imageUrl:
 *           type: string
 *           format: uri
 *           description: URL of the blog's featured image
 *         published:
 *           type: boolean
 *           description: Whether the blog is publicly visible
 *         authorId:
 *           type: string
 *           description: ID of the blog author
 *         author:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *             username:
 *               type: string
 *         categoryId:
 *           type: string
 *           description: ID of the blog's category
 *         category:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *             name:
 *               type: string
 *         tags:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *               name:
 *                 type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

// Apply analytics headers and service-wide rate limiting
router.use(addAnalyticsHeaders);
router.use(createServiceRateLimit('blog') as unknown as RequestHandler);

// Metrics endpoint
router.get('/metrics', metricsHandler);

/**
 * @swagger
 * /blog/analytics/progress:
 *   post:
 *     tags:
 *       - Blog Analytics
 *     summary: Track reading progress
 *     description: Track a user's reading progress for a specific blog post
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - blogId
 *               - progress
 *             properties:
 *               blogId:
 *                 type: string
 *                 description: ID of the blog being read
 *               progress:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 100
 *                 description: Reading progress percentage (0-100)
 *     responses:
 *       200:
 *         description: Progress tracked successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: Invalid input - missing blogId or invalid progress value
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  '/analytics/progress',
  createEndpointRateLimit('blog:progress') as unknown as RequestHandler,
  trackOperationMetrics('blog', 'track_progress'),
  trackReadProgress,
  ((_req, res) => { res.json({ success: true }); }) as RequestHandler
);

/**
 * @swagger
 * /blog/analytics/link:
 *   post:
 *     tags:
 *       - Blog Analytics
 *     summary: Track link clicks
 *     description: Track when a user clicks a link within a blog post
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - blogId
 *               - url
 *             properties:
 *               blogId:
 *                 type: string
 *                 description: ID of the blog containing the clicked link
 *               url:
 *                 type: string
 *                 format: uri
 *                 description: URL that was clicked
 *     responses:
 *       200:
 *         description: Link click tracked successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: Invalid input - missing blogId or invalid URL
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  '/analytics/link',
  createEndpointRateLimit('blog:progress') as unknown as RequestHandler,
  trackOperationMetrics('blog', 'track_link'),
  trackLinkClick,
  ((_req, res) => { res.json({ success: true }); }) as RequestHandler
);

// Public routes with analytics and search-specific rate limiting
/**
 * @swagger
 * /blog/search:
 *   get:
 *     tags:
 *       - Blog
 *     summary: Search blogs
 *     description: Search for blog posts with filtering and pagination
 *     parameters:
 *       - in: query
 *         name: query
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 1
 *         description: Search query string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Number of items per page
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category ID
 *       - in: query
 *         name: tags
 *         schema:
 *           type: string
 *         description: Comma-separated list of tag names
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [recent, popular, relevant]
 *         description: Sort order for the results
 *       - in: query
 *         name: author
 *         schema:
 *           type: string
 *         description: Filter by author ID
 *     responses:
 *       200:
 *         description: List of blog posts matching the search criteria
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/BlogResponse'
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *       400:
 *         description: Invalid search parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: Search rate limit exceeded
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  '/search',
  createEndpointRateLimit('blog:search') as unknown as RequestHandler,
  trackOperationMetrics('search', 'search'),
  (req, res, next) => {
    blogController.search(req, res).catch(next);
  }
);

/**
 * @swagger
 * components:
 *   schemas:
 *     TagResponse:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           description: Name of the tag
 *         count:
 *           type: integer
 *           description: Number of blogs using this tag
 *         trend:
 *           type: number
 *           description: Trend score based on recent usage
 */

/**
 * @swagger
 * /blog/tags/popular:
 *   get:
 *     tags:
 *       - Blog
 *     summary: Get popular tags
 *     description: Retrieve a list of popular tags sorted by usage count
 *     responses:
 *       200:
 *         description: List of popular tags
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/TagResponse'
 *       503:
 *         description: Service temporarily unavailable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  '/tags/popular',
  trackOperationMetrics('search', 'get_popular_tags'),
  (req, res, next) => {
    blogController.getPopularTags(req, res).catch(next);
  }
);

/**
 * @swagger
 * /blog/suggested/{blogId}:
 *   get:
 *     tags:
 *       - Blog
 *     summary: Get suggested blogs
 *     description: Get similar blog posts based on content and tags
 *     parameters:
 *       - in: path
 *         name: blogId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the blog post to get suggestions for
 *     responses:
 *       200:
 *         description: List of suggested blog posts
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/BlogResponse'
 *       400:
 *         description: Invalid blog ID format
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Blog post not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Failed to fetch suggestions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  '/suggested/:blogId',
  trackOperationMetrics('search', 'get_suggested_blogs'),
  trackBlogView,
  (req, res, next) => {
    blogController.getSuggestedBlogs(req, res).catch(next);
  }
);

/**
 * @swagger
 * /blog/{slug}:
 *   get:
 *     tags:
 *       - Blog
 *     summary: Get blog by slug
 *     description: Retrieve a blog post using its URL slug
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         description: URL-friendly slug of the blog post
 *     responses:
 *       200:
 *         description: Blog post retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BlogResponse'
 *       403:
 *         description: Blog post is not publicly accessible
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Blog post not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  '/:slug',
  trackOperationMetrics('blog', 'get_blog'),
  trackBlogView,
  (req, res, next) => {
    blogController.getBySlug(req, res).catch(next);
  }
);

/**
 * @swagger
 * /blog:
 *   post:
 *     tags:
 *       - Blog
 *     summary: Create new blog
 *     description: Create a new blog post with optional image upload
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - content
 *             properties:
 *               title:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 200
 *                 description: Blog post title
 *               content:
 *                 type: string
 *                 minLength: 100
 *                 description: Blog post content in markdown format
 *               description:
 *                 type: string
 *                 maxLength: 500
 *                 description: Short description or excerpt
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Featured image file
 *               categoryId:
 *                 type: string
 *                 description: ID of the blog category
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of tag names
 *               published:
 *                 type: boolean
 *                 description: Whether to publish immediately
 *     responses:
 *       201:
 *         description: Blog created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BlogResponse'
 *       400:
 *         description: Invalid input data or file upload failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Tag limit exceeded
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  '/',
  authenticate() as unknown as RequestHandler,
  createEndpointRateLimit('blog:create') as unknown as RequestHandler,
  upload.single('image'),
  trackOperationMetrics('blog', 'create_blog'),
  (req, res, next) => {
    blogController.create(req, res).catch(next);
  }
);

/**
 * @swagger
 * /blog/{id}:
 *   put:
 *     tags:
 *       - Blog
 *     summary: Update blog
 *     description: Update an existing blog post
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the blog post to update
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 200
 *                 description: Blog post title
 *               content:
 *                 type: string
 *                 minLength: 100
 *                 description: Blog post content in markdown format
 *               description:
 *                 type: string
 *                 maxLength: 500
 *                 description: Short description or excerpt
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Featured image file
 *               categoryId:
 *                 type: string
 *                 description: ID of the blog category
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of tag names
 *               published:
 *                 type: boolean
 *                 description: Whether the blog is publicly visible
 *     responses:
 *       200:
 *         description: Blog updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BlogResponse'
 *       400:
 *         description: Invalid input data or file upload failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Not authorized to update this blog
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Blog post not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Version conflict or tag limit exceeded
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put(
  '/:id',
  authenticate() as unknown as RequestHandler,
  createEndpointRateLimit('blog:update') as unknown as RequestHandler,
  upload.single('image'),
  trackOperationMetrics('blog', 'update_blog'),
  (req, res, next) => {
    blogController.update(req, res).catch(next);
  }
);

/**
 * @swagger
 * /blog/{id}:
 *   delete:
 *     tags:
 *       - Blog
 *     summary: Delete blog
 *     description: Delete an existing blog post (only allowed for the author)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the blog post to delete
 *     responses:
 *       200:
 *         description: Blog deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Blog deleted successfully
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Not authorized to delete this blog
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Blog post not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Blog has dependent content
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete(
  '/:id',
  authenticate() as unknown as RequestHandler,
  createEndpointRateLimit('blog:delete') as unknown as RequestHandler,
  trackOperationMetrics('blog', 'delete_blog'),
  (req, res, next) => {
    blogController.delete(req, res).catch(next);
  }
);

/**
 * @swagger
 * /blog/user/{userId}:
 *   get:
 *     tags:
 *       - Blog
 *     summary: Get user's blogs
 *     description: Get all blogs by a specific user or the authenticated user
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: false
 *         schema:
 *           type: string
 *         description: ID of the user whose blogs to fetch (defaults to authenticated user)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: List of user's blog posts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/BlogResponse'
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *       400:
 *         description: Invalid user ID or pagination parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  '/user/:userId?',
  trackOperationMetrics('blog', 'get_user_blogs'),
  (req, res, next) => {
    blogController.getUserBlogs(req, res).catch(next);
  }
);

/**
 * @swagger
 * components:
 *   schemas:
 *     BlogAnalytics:
 *       type: object
 *       properties:
 *         views:
 *           type: integer
 *           description: Total number of views
 *         uniqueViews:
 *           type: integer
 *           description: Number of unique visitors
 *         avgReadTime:
 *           type: number
 *           description: Average reading time in minutes
 *         completionRate:
 *           type: number
 *           description: Percentage of readers who finished reading
 *         linkClicks:
 *           type: object
 *           additionalProperties:
 *             type: integer
 *           description: Count of clicks per link URL
 *         viewsByDate:
 *           type: object
 *           additionalProperties:
 *             type: integer
 *           description: Views grouped by date
 */

/**
 * @swagger
 * /blog/{id}/analytics:
 *   get:
 *     tags:
 *       - Blog Analytics
 *     summary: Get blog analytics
 *     description: Get detailed analytics for a specific blog post (requires authentication)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the blog to get analytics for
 *     responses:
 *       200:
 *         description: Blog analytics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BlogAnalytics'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Blog post not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Failed to fetch analytics data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  '/:id/analytics',
  authenticate() as unknown as RequestHandler,
  createEndpointRateLimit('blog:analytics') as unknown as RequestHandler,
  trackOperationMetrics('blog', 'get_blog_analytics'),
  (async (req, res) => {
    const { analyticsClient } = await import('../utils/analytics');
    try {
      const data = await analyticsClient.getBlogAnalytics(req.params.id);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  }) as RequestHandler
);

/**
 * @swagger
 * /blog/{id}/visibility:
 *   put:
 *     tags:
 *       - Blog
 *     summary: Update blog visibility
 *     description: Update the visibility status of a blog post (admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the blog post to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - published
 *             properties:
 *               published:
 *                 type: boolean
 *                 description: Whether the blog should be publicly visible
 *     responses:
 *       200:
 *         description: Blog visibility updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BlogResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Not authorized - admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Blog post not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put(
  '/:id/visibility',
  authenticate({ roles: ['admin'] }) as unknown as RequestHandler,
  createServiceRateLimit('admin') as unknown as RequestHandler,
  trackOperationMetrics('blog', 'update_blog_visibility'),
  (req, res, next) => {
    blogController.update(req, res).catch(next);
  }
);

export default router;
