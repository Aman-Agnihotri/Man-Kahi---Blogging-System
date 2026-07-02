// Types shared between ProfileService and ProfileController for the
// self-service profile/follow/notification-preferences/account-deletion
// features. Kept separate from auth.types.ts since those are strictly about
// the register/login/token flows.

export interface SocialLinks {
    twitter?: string
    github?: string
    website?: string
    linkedin?: string
}

// Notification preference keys are intentionally loose (Record<string, boolean>)
// rather than a fixed interface: there is no notification-delivery
// infrastructure in this codebase yet, so this is a forward-looking stored
// preference stub and new keys may be added later without a schema change.
export type NotificationPrefs = Record<string, boolean>

export interface ProfileResponse {
    id: string
    username: string
    email: string
    bio: string | null
    profileImage: string | null
    socialLinks: SocialLinks | null
    notificationPrefs: NotificationPrefs
    createdAt: Date
}

export interface UpdateProfileInput {
    bio?: string
    socialLinks?: SocialLinks
}

export interface PublicProfileResponse {
    id: string
    username: string
    bio: string | null
    profileImage: string | null
    socialLinks: SocialLinks | null
    createdAt: Date
    followersCount: number
    followingCount: number
    isFollowedByMe: boolean
}

export interface FollowResult {
    following: boolean
    followersCount: number
}

export interface FollowUserSummary {
    id: string
    username: string
    profileImage: string | null
}

export interface PaginatedUsers {
    users: FollowUserSummary[]
    total: number
    page: number
    totalPages: number
}
