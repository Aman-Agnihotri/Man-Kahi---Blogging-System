import { Router, Request, Response, NextFunction } from 'express';
import { ProfileController } from '@controllers/profile.controller';
import { authenticate } from '@shared/middlewares/auth';
import { createEndpointRateLimit } from '@shared/middlewares/rateLimit';
import { avatarUpload } from '@config/upload';
import type { RequestHandler } from 'express';

const router = Router();
const profileController = new ProfileController();

// Mirrors blog-service's blog.routes.ts optionalAuthenticate: attaches
// req.user when a valid bearer token is present, but doesn't reject the
// request when it's absent (or invalid) - used for endpoints that are
// public but behave differently for a logged-in caller
// (GET /users/:username's isFollowedByMe).
const optionalAuthenticate: RequestHandler = (req, res, next) => {
    if (!req.headers.authorization?.startsWith('Bearer ')) {
        next();
        return;
    }

    (authenticate() as RequestHandler)(req, res, next);
};

/**
 * @swagger
 * /auth/profile:
 *   get:
 *     tags:
 *       - Profile
 *     summary: Get the current user's own profile
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The current user's profile
 *       401:
 *         description: Unauthorized
 */
router.get(
    '/profile',
    authenticate() as unknown as RequestHandler,
    createEndpointRateLimit('auth:profile:get') as unknown as RequestHandler,
    (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(profileController.getProfile(req, res, next));
    }
);

/**
 * @swagger
 * /auth/profile:
 *   put:
 *     tags:
 *       - Profile
 *     summary: Update the current user's bio/social links
 *     description: Partial update. Does NOT support username/email changes.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The updated profile
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 */
router.put(
    '/profile',
    authenticate() as unknown as RequestHandler,
    createEndpointRateLimit('auth:profile:update') as unknown as RequestHandler,
    (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(profileController.updateProfile(req, res, next));
    }
);

/**
 * @swagger
 * /auth/profile/avatar:
 *   post:
 *     tags:
 *       - Profile
 *     summary: Upload/replace the current user's avatar
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               avatar:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: The new avatar URL
 *       400:
 *         description: No image file provided / invalid file
 *       401:
 *         description: Unauthorized
 */
router.post(
    '/profile/avatar',
    authenticate() as unknown as RequestHandler,
    createEndpointRateLimit('auth:profile:avatar') as unknown as RequestHandler,
    avatarUpload.single('avatar'),
    (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(profileController.uploadAvatar(req, res, next));
    }
);

/**
 * @swagger
 * /auth/users/{userId}/follow:
 *   post:
 *     tags:
 *       - Follow
 *     summary: Follow a user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Now following the user (idempotent)
 *       400:
 *         description: Cannot follow yourself
 *       404:
 *         description: Target user not found
 */
router.post(
    '/users/:userId/follow',
    authenticate() as unknown as RequestHandler,
    createEndpointRateLimit('auth:follow') as unknown as RequestHandler,
    (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(profileController.followUser(req, res, next));
    }
);

/**
 * @swagger
 * /auth/users/{userId}/follow:
 *   delete:
 *     tags:
 *       - Follow
 *     summary: Unfollow a user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: No longer following the user (idempotent)
 *       400:
 *         description: Cannot unfollow yourself
 */
router.delete(
    '/users/:userId/follow',
    authenticate() as unknown as RequestHandler,
    createEndpointRateLimit('auth:follow') as unknown as RequestHandler,
    (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(profileController.unfollowUser(req, res, next));
    }
);

/**
 * @swagger
 * /auth/users/{userId}/followers:
 *   get:
 *     tags:
 *       - Follow
 *     summary: List a user's followers (paginated)
 *     responses:
 *       200:
 *         description: Paginated list of followers
 *       404:
 *         description: User not found
 */
router.get(
    '/users/:userId/followers',
    createEndpointRateLimit('auth:follow:list') as unknown as RequestHandler,
    (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(profileController.getFollowers(req, res, next));
    }
);

/**
 * @swagger
 * /auth/users/{userId}/following:
 *   get:
 *     tags:
 *       - Follow
 *     summary: List the users a user follows (paginated)
 *     responses:
 *       200:
 *         description: Paginated list of followed users
 *       404:
 *         description: User not found
 */
router.get(
    '/users/:userId/following',
    createEndpointRateLimit('auth:follow:list') as unknown as RequestHandler,
    (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(profileController.getFollowing(req, res, next));
    }
);

/**
 * @swagger
 * /auth/notifications/preferences:
 *   get:
 *     tags:
 *       - Notifications
 *     summary: Get the current user's notification preferences
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The current preferences (defaults applied where unset)
 *       401:
 *         description: Unauthorized
 */
router.get(
    '/notifications/preferences',
    authenticate() as unknown as RequestHandler,
    createEndpointRateLimit('auth:notifications:get') as unknown as RequestHandler,
    (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(profileController.getNotificationPreferences(req, res, next));
    }
);

/**
 * @swagger
 * /auth/notifications/preferences:
 *   put:
 *     tags:
 *       - Notifications
 *     summary: Update (merge) the current user's notification preferences
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The merged preferences
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 */
router.put(
    '/notifications/preferences',
    authenticate() as unknown as RequestHandler,
    createEndpointRateLimit('auth:notifications:update') as unknown as RequestHandler,
    (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(profileController.updateNotificationPreferences(req, res, next));
    }
);

/**
 * @swagger
 * /auth/account:
 *   delete:
 *     tags:
 *       - Account
 *     summary: Soft-delete (deactivate) the current user's account
 *     description: Requires re-confirming the account password. Blacklists the access token used for the request.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Account deleted
 *       401:
 *         description: Wrong password / unauthorized
 */
router.delete(
    '/account',
    authenticate() as unknown as RequestHandler,
    createEndpointRateLimit('auth:account:delete') as unknown as RequestHandler,
    (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(profileController.deleteAccount(req, res, next));
    }
);

/**
 * @swagger
 * /auth/users/{username}:
 *   get:
 *     tags:
 *       - Profile
 *     summary: Look up a user's public profile by username
 *     description: >
 *       The returned "id" is the real Prisma cuid, intended to be passed to
 *       blog-service's GET /api/blogs/user/:userId for that author's posts.
 *     responses:
 *       200:
 *         description: The public profile
 *       404:
 *         description: User not found (or deleted/suspended)
 */
router.get(
    '/users/:username',
    optionalAuthenticate,
    createEndpointRateLimit('auth:profile:public') as unknown as RequestHandler,
    (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(profileController.getPublicProfile(req, res, next));
    }
);

/**
 * @swagger
 * /auth/avatars/{key}:
 *   get:
 *     tags:
 *       - Profile
 *     summary: Redirect to a presigned URL for an avatar image
 *     responses:
 *       302:
 *         description: Redirect to a short-lived presigned GET URL
 *       404:
 *         description: Failed to generate a URL for the specified image
 */
router.get(
    '/avatars/:key',
    (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(profileController.getAvatar(req, res, next));
    }
);

export default router;
