import { Router } from 'express'
import { passport } from '../controllers/passport.controller'
import { AuthService } from '../services/auth.service'
import { logger } from '../utils/logger'

const router = Router()
const authService = new AuthService()

// Google OAuth routes
router.get(
  '/google',
  (req, res, next) => {
    const state = req.query.linkToken as string | undefined // For account linking
    passport.authenticate('google', {
      scope: ['profile', 'email'],
      ...(state && { state }), // Pass token as state if linking account
    })(req, res, next)
  }
)

router.get(
  '/google/callback',
  passport.authenticate('google', { session: false }),
  async (req: any, res) => {
    try {
      // Get user from passport
      const user = req.user
      
      // Generate tokens
      const accessToken = await authService.generateToken(user.id)
      const refreshToken = await authService.generateRefreshToken(user.id)

      // For account linking, token is in authInfo
      const linkToken = req.authInfo?.token

      // Redirect URL with tokens
      const frontendURL = process.env.FRONTEND_URL ?? 'http://localhost:3000'
      const params = new URLSearchParams({
        accessToken,
        refreshToken,
        ...(linkToken && { linkToken }),
      })

      res.redirect(`${frontendURL}/auth/callback?${params.toString()}`)
    } catch (error) {
      logger.error('OAuth callback error:', error)
      const frontendURL = process.env.FRONTEND_URL ?? 'http://localhost:3000'
      res.redirect(
        `${frontendURL}/auth/callback?error=Authentication failed`
      )
    }
  }
)

// Link OAuth provider to existing account
router.post(
  '/link/:provider',
  async (req, res) => {
    try {
      const { provider } = req.params
      const { token } = req.body

      if (!token) {
        res.status(400).json({ message: 'Token is required' })
        return
      }

      // Redirect to OAuth provider with token in state
      const authURL = `/auth/${provider}?linkToken=${token}`
      res.json({ url: authURL })
    } catch (error) {
      logger.error('Link provider error:', error)
      res.status(500).json({ message: 'Failed to initiate provider linking' })
    }
  }
)

// Unlink OAuth provider from account
router.delete(
  '/unlink/:provider',
  async (req: any, res) => {
    try {
      const { provider } = req.params
      const userId = req.user.id

      await authService.unlinkProvider(userId, provider)
      res.json({ message: 'Provider unlinked successfully' })
    } catch (error) {
      logger.error('Unlink provider error:', error)
      res.status(500).json({ message: 'Failed to unlink provider' })
    }
  }
)

export { router as oauthRoutes }
