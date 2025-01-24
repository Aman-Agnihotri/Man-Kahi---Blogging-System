import { Router } from 'express'
import { AuthController } from '../controllers/auth.controller'
import { authenticate, authorize } from '../middlewares/auth.middleware'
import { authRateLimit, apiRateLimit } from '../middlewares/rate-limit.middleware'

const router = Router()
const authController = new AuthController()

// Public routes with rate limiting
router.post('/register', authRateLimit, authController.register)
router.post('/login', authRateLimit, authController.login)

// Protected routes
router.post('/logout', authenticate, apiRateLimit, authController.logout)

// Admin only routes
router.post(
  '/roles',
  authenticate,
  authorize(['admin']),
  apiRateLimit,
  authController.addRole
)

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'auth' })
})

export default router
