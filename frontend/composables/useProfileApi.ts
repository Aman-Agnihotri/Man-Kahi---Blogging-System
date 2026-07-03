import type {
  OwnProfile,
  UpdateProfileInput,
  PublicProfile,
  FollowResult,
  PaginatedFollowUsers,
  NotificationPrefs,
} from '~/types/auth';

export function useProfileApi() {
  const api = useApi();

  return {
    getProfile: () => api.get<OwnProfile>('/api/auth/profile'),
    updateProfile: (input: UpdateProfileInput) => api.put<OwnProfile>('/api/auth/profile', input),

    uploadAvatar: (file: File) => {
      const form = new FormData();
      form.set('avatar', file);
      return api.postForm<{ profileImage: string }>('/api/auth/profile/avatar', form);
    },

    getPublicProfile: (username: string) => api.get<PublicProfile>(`/api/auth/users/${username}`),

    follow: (userId: string) => api.post<FollowResult>(`/api/auth/users/${userId}/follow`),
    unfollow: (userId: string) => api.del<FollowResult>(`/api/auth/users/${userId}/follow`),
    getFollowers: (userId: string, page?: number, limit?: number) =>
      api.get<PaginatedFollowUsers>(`/api/auth/users/${userId}/followers`, { page, limit }),
    getFollowing: (userId: string, page?: number, limit?: number) =>
      api.get<PaginatedFollowUsers>(`/api/auth/users/${userId}/following`, { page, limit }),

    getNotificationPrefs: () => api.get<NotificationPrefs>('/api/auth/notifications/preferences'),
    updateNotificationPrefs: (prefs: Partial<NotificationPrefs>) =>
      api.put<NotificationPrefs>('/api/auth/notifications/preferences', prefs),

    deleteAccount: (password: string) =>
      api.delWithBody<{ message: string }>('/api/auth/account', { password }),
  };
}
