import { z } from 'zod'
import { ProfileService } from '@services/profile.service'
import { processAvatarImage } from '@config/upload'
import logger from '@shared/utils/logger'
import { AuthenticatedRequest } from '@shared/middlewares/auth'
import { RequestHandler } from 'express-serve-static-core'
import { trackError } from '@middlewares/metrics.middleware'

const socialLinksSchema = z
    .object({
        twitter: z.string().url().optional(),
        github: z.string().url().optional(),
        website: z.string().url().optional(),
        linkedin: z.string().url().optional(),
    })
    .strict()

const updateProfileSchema = z.object({
    bio: z.string().max(500).optional(),
    socialLinks: socialLinksSchema.optional(),
})

const paginationSchema = z.object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
})

// Arbitrary boolean preference keys - see profile.service.ts's
// DEFAULT_NOTIFICATION_PREFS for the currently-known keys, but this
// endpoint doesn't hard-restrict to them so new keys can be added later
// without a matching Zod schema change here.
const notificationPrefsSchema = z.record(z.string(), z.boolean())

const deleteAccountSchema = z.object({
    password: z.string().min(1),
})

export class ProfileController {
    private readonly profileService: ProfileService

    constructor() {
        this.profileService = new ProfileService()
    }

    getProfile: RequestHandler = async (req, res) => {
        try {
            const authReq = req as AuthenticatedRequest
            const profile = await this.profileService.getProfile(authReq.user.id)
            res.json(profile)
        } catch (error) {
            logger.error({ err: error }, 'Get profile controller error')

            if (error instanceof Error && error.message === 'User not found') {
                trackError('user_not_found', 'get_profile_failed', 'auth')
                res.status(404).json({ message: error.message })
                return
            }

            trackError('server', 'get_profile_failed', 'auth')
            res.status(500).json({ message: 'Internal server error' })
        }
    }

    updateProfile: RequestHandler = async (req, res) => {
        try {
            const authReq = req as AuthenticatedRequest
            // username/email are deliberately not accepted here - see
            // profile.service.ts's updateProfile for why.
            const validatedInput = updateProfileSchema.parse(req.body)

            const profile = await this.profileService.updateProfile(authReq.user.id, validatedInput)
            res.json(profile)
        } catch (error) {
            logger.error({ err: error }, 'Update profile controller error')

            if (error instanceof z.ZodError) {
                trackError('validation', 'update_profile_validation_failed', 'auth')
                res.status(400).json({ message: 'Invalid input', errors: error.errors })
                return
            }

            if (error instanceof Error && error.message === 'User not found') {
                trackError('user_not_found', 'update_profile_failed', 'auth')
                res.status(404).json({ message: error.message })
                return
            }

            trackError('server', 'update_profile_failed', 'auth')
            res.status(500).json({ message: 'Internal server error' })
        }
    }

    uploadAvatar: RequestHandler = async (req, res) => {
        try {
            const authReq = req as AuthenticatedRequest

            if (!req.file) {
                trackError('validation', 'avatar_missing_file', 'auth')
                res.status(400).json({ message: 'No image file provided' })
                return
            }

            const imageUrl = await processAvatarImage(req.file)
            const profileImage = await this.profileService.updateAvatar(authReq.user.id, imageUrl)

            res.json({ profileImage })
        } catch (error) {
            logger.error({ err: error }, 'Upload avatar controller error')
            trackError('server', 'upload_avatar_failed', 'auth')
            res.status(500).json({ message: 'Internal server error' })
        }
    }

    followUser: RequestHandler = async (req, res) => {
        try {
            const authReq = req as AuthenticatedRequest
            const userId = req.params['userId'] as string

            const result = await this.profileService.follow(authReq.user.id, userId)
            res.json(result)
        } catch (error) {
            logger.error({ err: error }, 'Follow user controller error')

            if (error instanceof Error) {
                if (error.message === 'Cannot follow yourself') {
                    trackError('validation', 'self_follow', 'auth')
                    res.status(400).json({ message: error.message })
                    return
                }
                if (error.message === 'User not found') {
                    trackError('user_not_found', 'follow_failed', 'auth')
                    res.status(404).json({ message: error.message })
                    return
                }
            }

            trackError('server', 'follow_failed', 'auth')
            res.status(500).json({ message: 'Internal server error' })
        }
    }

    unfollowUser: RequestHandler = async (req, res) => {
        try {
            const authReq = req as AuthenticatedRequest
            const userId = req.params['userId'] as string

            const result = await this.profileService.unfollow(authReq.user.id, userId)
            res.json(result)
        } catch (error) {
            logger.error({ err: error }, 'Unfollow user controller error')

            if (error instanceof Error && error.message === 'Cannot unfollow yourself') {
                trackError('validation', 'self_unfollow', 'auth')
                res.status(400).json({ message: error.message })
                return
            }

            trackError('server', 'unfollow_failed', 'auth')
            res.status(500).json({ message: 'Internal server error' })
        }
    }

    getFollowers: RequestHandler = async (req, res) => {
        try {
            const userId = req.params['userId'] as string
            const { page, limit } = paginationSchema.parse(req.query)

            const result = await this.profileService.getFollowers(userId, page, limit)
            res.json(result)
        } catch (error) {
            logger.error({ err: error }, 'Get followers controller error')

            if (error instanceof z.ZodError) {
                trackError('validation', 'get_followers_validation_failed', 'auth')
                res.status(400).json({ message: 'Invalid input', errors: error.errors })
                return
            }

            if (error instanceof Error && error.message === 'User not found') {
                trackError('user_not_found', 'get_followers_failed', 'auth')
                res.status(404).json({ message: error.message })
                return
            }

            trackError('server', 'get_followers_failed', 'auth')
            res.status(500).json({ message: 'Internal server error' })
        }
    }

    getFollowing: RequestHandler = async (req, res) => {
        try {
            const userId = req.params['userId'] as string
            const { page, limit } = paginationSchema.parse(req.query)

            const result = await this.profileService.getFollowing(userId, page, limit)
            res.json(result)
        } catch (error) {
            logger.error({ err: error }, 'Get following controller error')

            if (error instanceof z.ZodError) {
                trackError('validation', 'get_following_validation_failed', 'auth')
                res.status(400).json({ message: 'Invalid input', errors: error.errors })
                return
            }

            if (error instanceof Error && error.message === 'User not found') {
                trackError('user_not_found', 'get_following_failed', 'auth')
                res.status(404).json({ message: error.message })
                return
            }

            trackError('server', 'get_following_failed', 'auth')
            res.status(500).json({ message: 'Internal server error' })
        }
    }

    getPublicProfile: RequestHandler = async (req, res) => {
        try {
            const username = req.params['username'] as string
            // optionalAuthenticate (see routes/profile.routes.ts) only
            // populates req.user when a valid bearer token is present.
            const requestingUserId = (req as Partial<AuthenticatedRequest>).user?.id

            const profile = await this.profileService.getPublicProfile(username, requestingUserId)
            res.json(profile)
        } catch (error) {
            logger.error({ err: error }, 'Get public profile controller error')

            if (error instanceof Error && error.message === 'User not found') {
                trackError('user_not_found', 'get_public_profile_failed', 'auth')
                res.status(404).json({ message: error.message })
                return
            }

            trackError('server', 'get_public_profile_failed', 'auth')
            res.status(500).json({ message: 'Internal server error' })
        }
    }

    getNotificationPreferences: RequestHandler = async (req, res) => {
        try {
            const authReq = req as AuthenticatedRequest
            const prefs = await this.profileService.getNotificationPrefs(authReq.user.id)
            res.json(prefs)
        } catch (error) {
            logger.error({ err: error }, 'Get notification preferences controller error')

            if (error instanceof Error && error.message === 'User not found') {
                trackError('user_not_found', 'get_notification_prefs_failed', 'auth')
                res.status(404).json({ message: error.message })
                return
            }

            trackError('server', 'get_notification_prefs_failed', 'auth')
            res.status(500).json({ message: 'Internal server error' })
        }
    }

    updateNotificationPreferences: RequestHandler = async (req, res) => {
        try {
            const authReq = req as AuthenticatedRequest
            const validatedInput = notificationPrefsSchema.parse(req.body)

            const prefs = await this.profileService.updateNotificationPrefs(authReq.user.id, validatedInput)
            res.json(prefs)
        } catch (error) {
            logger.error({ err: error }, 'Update notification preferences controller error')

            if (error instanceof z.ZodError) {
                trackError('validation', 'update_notification_prefs_validation_failed', 'auth')
                res.status(400).json({ message: 'Invalid input', errors: error.errors })
                return
            }

            if (error instanceof Error && error.message === 'User not found') {
                trackError('user_not_found', 'update_notification_prefs_failed', 'auth')
                res.status(404).json({ message: error.message })
                return
            }

            trackError('server', 'update_notification_prefs_failed', 'auth')
            res.status(500).json({ message: 'Internal server error' })
        }
    }

    deleteAccount: RequestHandler = async (req, res) => {
        try {
            const authReq = req as AuthenticatedRequest
            const validatedInput = deleteAccountSchema.parse(req.body)

            const token = req.headers.authorization?.split(' ')[1]
            if (!token) {
                trackError('missing_token', 'delete_account_failed', 'auth')
                res.status(400).json({ message: 'No token provided' })
                return
            }

            await this.profileService.deleteAccount(authReq.user.id, validatedInput.password, token)
            res.json({ message: 'Account deleted successfully' })
        } catch (error) {
            logger.error({ err: error }, 'Delete account controller error')

            if (error instanceof z.ZodError) {
                trackError('validation', 'delete_account_validation_failed', 'auth')
                res.status(400).json({ message: 'Invalid input', errors: error.errors })
                return
            }

            if (error instanceof Error) {
                if (error.message === 'Invalid credentials') {
                    trackError('invalid_credentials', 'delete_account_failed', 'auth')
                    res.status(401).json({ message: error.message })
                    return
                }
                if (error.message === 'User not found') {
                    trackError('user_not_found', 'delete_account_failed', 'auth')
                    res.status(404).json({ message: error.message })
                    return
                }
            }

            trackError('server', 'delete_account_failed', 'auth')
            res.status(500).json({ message: 'Internal server error' })
        }
    }
}
