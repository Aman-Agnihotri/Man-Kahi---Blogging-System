import { Router } from 'express'
import { AuthController } from '../controllers/auth.controller'
import { authenticate, authorize } from '../middlewares/auth.middleware'
import { authRateLimit, apiRateLimit } from '../middlewares/rate-limit.middleware'
import { RequestHandler } from 'express'

const router = Router()
const authController = new AuthController()

// Public routes with rate limiting
router.post('/register', authRateLimit, authController.register)
router.post('/login', authRateLimit, authController.login)

// Protected routes
router.post('/logout', authenticate as RequestHandler, apiRateLimit, authController.logout)

// Admin only routes
router.post(
  '/roles',
  authenticate as RequestHandler,
  authorize(['admin']) as RequestHandler,
  apiRateLimit,
  authController.addRole as RequestHandler
)

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'auth' })
})

export default router
