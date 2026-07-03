export interface User {
  id: string;
  email: string;
  username: string;
  roles: string[];
}

export interface AuthResponse {
  token: string;
  refreshToken: string;
  user: User;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials extends LoginCredentials {
  username: string;
}

export interface AuthError {
  message: string;
  code: string;
}

export interface AuthState {
  user: User | null;
  loading: boolean;
  error: AuthError | null;
  token: string | null;
  refreshToken: string | null;
}

// --- Profile ----------------------------------------------------------

export interface SocialLinks {
  twitter?: string;
  github?: string;
  website?: string;
  linkedin?: string;
}

/** The current user's own full profile (GET /api/auth/profile). */
export interface OwnProfile {
  id: string;
  username: string;
  email: string;
  bio: string | null;
  profileImage: string | null;
  socialLinks: SocialLinks | null;
  notificationPrefs: NotificationPrefs | null;
  createdAt: string;
}

export interface UpdateProfileInput {
  bio?: string;
  socialLinks?: SocialLinks;
}

/** Another user's public profile, looked up by username (GET /api/auth/users/:username). */
export interface PublicProfile {
  id: string;
  username: string;
  bio: string | null;
  profileImage: string | null;
  socialLinks: SocialLinks | null;
  createdAt: string;
  followersCount: number;
  followingCount: number;
  isFollowedByMe: boolean;
}

export interface FollowResult {
  following: boolean;
  followersCount: number;
}

export interface FollowUser {
  id: string;
  username: string;
  profileImage: string | null;
}

export interface PaginatedFollowUsers {
  users: FollowUser[];
  total: number;
  page: number;
  totalPages: number;
}

export interface NotificationPrefs {
  emailOnComment: boolean;
  emailOnFollow: boolean;
  emailOnLike: boolean;
}