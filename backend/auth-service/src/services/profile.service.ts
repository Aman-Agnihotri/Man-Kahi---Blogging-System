import { prisma, Prisma } from '@shared/utils/prismaClient'
import { verifyPassword } from '@utils/password'
import { tokenBlacklist } from '@shared/config/redis'
import { getTokenExpiryInSeconds } from '@shared/utils/jwt'
import logger from '@shared/utils/logger'
import { trackDbOperation, trackError, trackRedisOperation } from '@middlewares/metrics.middleware'
import {
    SocialLinks,
    NotificationPrefs,
    ProfileResponse,
    UpdateProfileInput,
    PublicProfileResponse,
    FollowResult,
    PaginatedUsers,
} from '@/types/profile.types'

// Default notification preferences applied whenever User.notificationPrefs
// is null (i.e. the user has never customized them). There is no actual
// email-sending infrastructure in this codebase yet - these are purely
// stored-preference stubs for when/if notification delivery is built later.
// Defaults chosen: comment/follow notifications on by default (direct,
// low-volume social signals), like notifications off by default (can be
// high-volume/noisy).
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
    emailOnComment: true,
    emailOnFollow: true,
    emailOnLike: false,
}

type UserRecord = {
    id: string
    username: string
    email: string
    bio: string | null
    profileImage: string | null
    socialLinks: unknown
    notificationPrefs: unknown
    createdAt: Date
    deletedAt: Date | null
}

export class ProfileService {
    private toProfileResponse(user: UserRecord): ProfileResponse {
        return {
            id: user.id,
            username: user.username,
            email: user.email,
            bio: user.bio,
            profileImage: user.profileImage,
            socialLinks: (user.socialLinks as SocialLinks | null) ?? null,
            notificationPrefs: {
                ...DEFAULT_NOTIFICATION_PREFS,
                ...((user.notificationPrefs as NotificationPrefs | null) ?? {}),
            },
            createdAt: user.createdAt,
        }
    }

    async getProfile(userId: string): Promise<ProfileResponse> {
        const dbTimer = trackDbOperation('select', 'user')
        const user = await prisma.user.findUnique({ where: { id: userId } })
        dbTimer.end()

        if (!user || user.deletedAt) {
            trackError('auth', 'user_not_found', 'get_profile')
            throw new Error('User not found')
        }

        return this.toProfileResponse(user)
    }

    // Note: username/email changes are deliberately NOT supported by this
    // endpoint - both have uniqueness constraints and (for email) would
    // ideally require re-verification, which is outside this batch's scope.
    async updateProfile(userId: string, input: UpdateProfileInput): Promise<ProfileResponse> {
        const dbTimer = trackDbOperation('select', 'user')
        const existing = await prisma.user.findUnique({ where: { id: userId } })
        dbTimer.end()

        if (!existing || existing.deletedAt) {
            trackError('auth', 'user_not_found', 'update_profile')
            throw new Error('User not found')
        }

        const data: Prisma.UserUpdateInput = {}
        if (input.bio !== undefined) {
            data.bio = input.bio
        }
        if (input.socialLinks !== undefined) {
            data.socialLinks = input.socialLinks as Prisma.InputJsonValue
        }

        const updateTimer = trackDbOperation('update', 'user')
        const updated = await prisma.user.update({ where: { id: userId }, data })
        updateTimer.end()

        return this.toProfileResponse(updated)
    }

    async updateAvatar(userId: string, imageUrl: string): Promise<string> {
        const dbTimer = trackDbOperation('update', 'user')
        try {
            const updated = await prisma.user.update({
                where: { id: userId },
                data: { profileImage: imageUrl },
            })
            dbTimer.end()
            return updated.profileImage as string
        } catch (error) {
            dbTimer.end()
            logger.error({ err: error }, 'Update avatar error')
            throw error
        }
    }

    async follow(followerId: string, followingId: string): Promise<FollowResult> {
        if (followerId === followingId) {
            trackError('auth', 'self_follow', 'follow')
            throw new Error('Cannot follow yourself')
        }

        const dbTimer = trackDbOperation('select', 'user')
        const target = await prisma.user.findUnique({ where: { id: followingId } })
        dbTimer.end()

        if (!target || target.deletedAt) {
            trackError('auth', 'user_not_found', 'follow')
            throw new Error('User not found')
        }

        const followTimer = trackDbOperation('upsert', 'follow')
        // Idempotent create: following an already-followed user is a no-op,
        // not an error.
        await prisma.follow.upsert({
            where: { followerId_followingId: { followerId, followingId } },
            update: {},
            create: { followerId, followingId },
        })
        followTimer.end()

        const followersCount = await prisma.follow.count({ where: { followingId } })
        return { following: true, followersCount }
    }

    async unfollow(followerId: string, followingId: string): Promise<FollowResult> {
        if (followerId === followingId) {
            trackError('auth', 'self_unfollow', 'unfollow')
            throw new Error('Cannot unfollow yourself')
        }

        const dbTimer = trackDbOperation('delete', 'follow')
        // Idempotent delete: unfollowing a user you don't currently follow
        // (or one that no longer exists) is a no-op, not an error.
        await prisma.follow.deleteMany({ where: { followerId, followingId } })
        dbTimer.end()

        const followersCount = await prisma.follow.count({ where: { followingId } })
        return { following: false, followersCount }
    }

    async getFollowers(userId: string, page: number, limit: number): Promise<PaginatedUsers> {
        const dbTimer = trackDbOperation('select', 'user')
        const target = await prisma.user.findUnique({ where: { id: userId } })
        dbTimer.end()

        if (!target || target.deletedAt) {
            trackError('auth', 'user_not_found', 'get_followers')
            throw new Error('User not found')
        }

        const skip = (page - 1) * limit
        const listTimer = trackDbOperation('select', 'follow')
        const [follows, total] = await Promise.all([
            prisma.follow.findMany({
                where: { followingId: userId },
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    follower: { select: { id: true, username: true, profileImage: true } },
                },
            }),
            prisma.follow.count({ where: { followingId: userId } }),
        ])
        listTimer.end()

        return {
            users: follows.map(f => f.follower),
            total,
            page,
            totalPages: Math.ceil(total / limit),
        }
    }

    async getFollowing(userId: string, page: number, limit: number): Promise<PaginatedUsers> {
        const dbTimer = trackDbOperation('select', 'user')
        const target = await prisma.user.findUnique({ where: { id: userId } })
        dbTimer.end()

        if (!target || target.deletedAt) {
            trackError('auth', 'user_not_found', 'get_following')
            throw new Error('User not found')
        }

        const skip = (page - 1) * limit
        const listTimer = trackDbOperation('select', 'follow')
        const [follows, total] = await Promise.all([
            prisma.follow.findMany({
                where: { followerId: userId },
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    following: { select: { id: true, username: true, profileImage: true } },
                },
            }),
            prisma.follow.count({ where: { followerId: userId } }),
        ])
        listTimer.end()

        return {
            users: follows.map(f => f.following),
            total,
            page,
            totalPages: Math.ceil(total / limit),
        }
    }

    async getPublicProfile(username: string, requestingUserId?: string): Promise<PublicProfileResponse> {
        const dbTimer = trackDbOperation('select', 'user')
        const user = await prisma.user.findUnique({ where: { username } })
        dbTimer.end()

        if (!user || user.deletedAt || user.suspendedAt) {
            trackError('auth', 'user_not_found', 'get_public_profile')
            throw new Error('User not found')
        }

        const isSelf = requestingUserId === user.id
        const countsTimer = trackDbOperation('select', 'follow')
        const [followersCount, followingCount, followRecord] = await Promise.all([
            prisma.follow.count({ where: { followingId: user.id } }),
            prisma.follow.count({ where: { followerId: user.id } }),
            requestingUserId && !isSelf
                ? prisma.follow.findUnique({
                    where: { followerId_followingId: { followerId: requestingUserId, followingId: user.id } },
                })
                : Promise.resolve(null),
        ])
        countsTimer.end()

        return {
            id: user.id,
            username: user.username,
            bio: user.bio,
            profileImage: user.profileImage,
            socialLinks: (user.socialLinks as SocialLinks | null) ?? null,
            createdAt: user.createdAt,
            followersCount,
            followingCount,
            isFollowedByMe: !isSelf && Boolean(followRecord),
        }
    }

    async getNotificationPrefs(userId: string): Promise<NotificationPrefs> {
        const dbTimer = trackDbOperation('select', 'user')
        const user = await prisma.user.findUnique({ where: { id: userId } })
        dbTimer.end()

        if (!user || user.deletedAt) {
            trackError('auth', 'user_not_found', 'get_notification_prefs')
            throw new Error('User not found')
        }

        return {
            ...DEFAULT_NOTIFICATION_PREFS,
            ...((user.notificationPrefs as NotificationPrefs | null) ?? {}),
        }
    }

    async updateNotificationPrefs(userId: string, partial: NotificationPrefs): Promise<NotificationPrefs> {
        const dbTimer = trackDbOperation('select', 'user')
        const existing = await prisma.user.findUnique({ where: { id: userId } })
        dbTimer.end()

        if (!existing || existing.deletedAt) {
            trackError('auth', 'user_not_found', 'update_notification_prefs')
            throw new Error('User not found')
        }

        const merged: NotificationPrefs = {
            ...DEFAULT_NOTIFICATION_PREFS,
            ...((existing.notificationPrefs as NotificationPrefs | null) ?? {}),
            ...partial,
        }

        const updateTimer = trackDbOperation('update', 'user')
        await prisma.user.update({ where: { id: userId }, data: { notificationPrefs: merged } })
        updateTimer.end()

        return merged
    }

    async deleteAccount(userId: string, password: string, accessToken: string): Promise<void> {
        const dbTimer = trackDbOperation('select', 'user')
        const user = await prisma.user.findUnique({ where: { id: userId } })
        dbTimer.end()

        if (!user || user.deletedAt) {
            trackError('auth', 'user_not_found', 'delete_account')
            throw new Error('User not found')
        }

        // OAuth-only accounts have no password set - there is nothing to
        // re-confirm against, so treat as a credential mismatch rather than
        // a 500 or (worse) allowing deletion without any check.
        if (!user.password) {
            trackError('auth', 'invalid_credentials', 'delete_account')
            throw new Error('Invalid credentials')
        }

        const isValid = await verifyPassword(user.password, password)
        if (!isValid) {
            trackError('auth', 'invalid_credentials', 'delete_account')
            throw new Error('Invalid credentials')
        }

        const updateTimer = trackDbOperation('update', 'user')
        await prisma.user.update({ where: { id: userId }, data: { deletedAt: new Date() } })
        updateTimer.end()

        // Blacklist the token used to make this request, mirroring
        // AuthService.logout, so the just-deleted account's existing
        // session can't keep making authenticated requests.
        const redisTimer = trackRedisOperation('blacklist')
        try {
            const expiryInSeconds = getTokenExpiryInSeconds(accessToken)
            if (expiryInSeconds > 0) {
                await tokenBlacklist.add(accessToken, expiryInSeconds)
            }
        } finally {
            redisTimer.end()
        }
    }
}
