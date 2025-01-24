import { Router } from 'express'
import { BlogController } from '../controllers/blog.controller'
import { authenticate, authorize } from '../middlewares/auth.middleware'
import { upload } from '../config/upload'
import { apiRateLimit } from '../middlewares/rate-limit.middleware'

const router = Router()
const blogController = new BlogController()

// Public routes
router.get('/search', apiRateLimit, blogController.search)
router.get('/tags/popular', apiRateLimit, blogController.getPopularTags)
router.get('/suggested/:blogId', apiRateLimit, blogController.getSuggestedBlogs)
router.get('/:slug', apiRateLimit, blogController.getBySlug)

// Auth required routes
router.post(
  '/',
  authenticate,
  apiRateLimit,
  upload.single('image'),
  blogController.create
)

router.put(
  '/:id',
  authenticate,
  apiRateLimit,
  upload.single('image'),
  blogController.update
)

router.delete(
  '/:id',
  authenticate,
  apiRateLimit,
  blogController.delete
)

// Get user's blogs (auth optional)
router.get(
  '/user/:userId?',
  apiRateLimit,
  blogController.getUserBlogs
)

// Admin routes
router.put(
  '/:id/visibility',
  authenticate,
  authorize(['admin']),
  apiRateLimit,
  blogController.update
)

export default router
