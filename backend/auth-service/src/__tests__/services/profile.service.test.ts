import { ProfileService, DEFAULT_NOTIFICATION_PREFS } from '@services/profile.service';
import { prismaMock } from '../setup';
import { verifyPassword } from '@utils/password';
import { tokenBlacklist } from '@shared/config/redis';

describe('ProfileService', () => {
  let profileService: ProfileService;

  beforeEach(() => {
    profileService = new ProfileService();
  });

  const baseUser = {
    id: 'user-1',
    username: 'testuser',
    email: 'test@example.com',
    password: 'hashed:Password123',
    bio: null as string | null,
    profileImage: null as string | null,
    socialLinks: null as unknown,
    notificationPrefs: null as unknown,
    deletedAt: null as Date | null,
    suspendedAt: null as Date | null,
    suspendedReason: null as string | null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
  };

  describe('getProfile', () => {
    it('returns the full profile with default notification prefs when unset', async () => {
      (prismaMock.user.findUnique as jest.Mock).mockResolvedValue({ ...baseUser });

      const result = await profileService.getProfile('user-1');

      expect(result).toEqual({
        id: 'user-1',
        username: 'testuser',
        email: 'test@example.com',
        bio: null,
        profileImage: null,
        socialLinks: null,
        notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
        createdAt: baseUser.createdAt,
      });
    });

    it('throws "User not found" for a soft-deleted user', async () => {
      (prismaMock.user.findUnique as jest.Mock).mockResolvedValue({
        ...baseUser,
        deletedAt: new Date(),
      });

      await expect(profileService.getProfile('user-1')).rejects.toThrow('User not found');
    });

    it('throws "User not found" when no user exists', async () => {
      (prismaMock.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(profileService.getProfile('missing')).rejects.toThrow('User not found');
    });
  });

  describe('updateProfile', () => {
    it('updates only the bio when socialLinks is omitted', async () => {
      (prismaMock.user.findUnique as jest.Mock).mockResolvedValue({ ...baseUser });
      (prismaMock.user.update as jest.Mock).mockResolvedValue({
        ...baseUser,
        bio: 'New bio',
      });

      const result = await profileService.updateProfile('user-1', { bio: 'New bio' });

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { bio: 'New bio' },
      });
      expect(result.bio).toBe('New bio');
    });

    it('updates socialLinks', async () => {
      (prismaMock.user.findUnique as jest.Mock).mockResolvedValue({ ...baseUser });
      const socialLinks = { twitter: 'https://twitter.com/test' };
      (prismaMock.user.update as jest.Mock).mockResolvedValue({
        ...baseUser,
        socialLinks,
      });

      const result = await profileService.updateProfile('user-1', { socialLinks });

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { socialLinks },
      });
      expect(result.socialLinks).toEqual(socialLinks);
    });

    it('rejects updating a non-existent user', async () => {
      (prismaMock.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        profileService.updateProfile('missing', { bio: 'x' })
      ).rejects.toThrow('User not found');
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });
  });

  describe('updateAvatar', () => {
    it('sets profileImage to the given URL', async () => {
      (prismaMock.user.update as jest.Mock).mockResolvedValue({
        ...baseUser,
        profileImage: 'http://minio/avatars/abc.jpg',
      });

      const result = await profileService.updateAvatar('user-1', 'http://minio/avatars/abc.jpg');

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { profileImage: 'http://minio/avatars/abc.jpg' },
      });
      expect(result).toBe('http://minio/avatars/abc.jpg');
    });
  });

  describe('follow', () => {
    it('creates a follow relationship and returns the followers count', async () => {
      (prismaMock.user.findUnique as jest.Mock).mockResolvedValue({ ...baseUser, id: 'user-2' });
      (prismaMock.follow.upsert as jest.Mock).mockResolvedValue({});
      (prismaMock.follow.count as jest.Mock).mockResolvedValue(3);

      const result = await profileService.follow('user-1', 'user-2');

      expect(prismaMock.follow.upsert).toHaveBeenCalledWith({
        where: { followerId_followingId: { followerId: 'user-1', followingId: 'user-2' } },
        update: {},
        create: { followerId: 'user-1', followingId: 'user-2' },
      });
      expect(result).toEqual({ following: true, followersCount: 3 });
    });

    it('rejects following yourself with a 400-mappable error', async () => {
      await expect(profileService.follow('user-1', 'user-1')).rejects.toThrow(
        'Cannot follow yourself'
      );
      expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    });

    it('rejects following a user that does not exist', async () => {
      (prismaMock.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(profileService.follow('user-1', 'ghost')).rejects.toThrow('User not found');
    });

    it('rejects following a soft-deleted user', async () => {
      (prismaMock.user.findUnique as jest.Mock).mockResolvedValue({
        ...baseUser,
        id: 'user-2',
        deletedAt: new Date(),
      });

      await expect(profileService.follow('user-1', 'user-2')).rejects.toThrow('User not found');
    });
  });

  describe('unfollow', () => {
    it('deletes the follow relationship idempotently and returns the followers count', async () => {
      (prismaMock.follow.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prismaMock.follow.count as jest.Mock).mockResolvedValue(2);

      const result = await profileService.unfollow('user-1', 'user-2');

      expect(prismaMock.follow.deleteMany).toHaveBeenCalledWith({
        where: { followerId: 'user-1', followingId: 'user-2' },
      });
      expect(result).toEqual({ following: false, followersCount: 2 });
    });

    it('rejects unfollowing yourself', async () => {
      await expect(profileService.unfollow('user-1', 'user-1')).rejects.toThrow(
        'Cannot unfollow yourself'
      );
      expect(prismaMock.follow.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('getFollowers', () => {
    it('returns a paginated list of follower summaries', async () => {
      (prismaMock.user.findUnique as jest.Mock).mockResolvedValue({ ...baseUser, id: 'user-2' });
      (prismaMock.follow.findMany as jest.Mock).mockResolvedValue([
        { follower: { id: 'user-1', username: 'testuser', profileImage: null } },
      ]);
      (prismaMock.follow.count as jest.Mock).mockResolvedValue(1);

      const result = await profileService.getFollowers('user-2', 1, 20);

      expect(result).toEqual({
        users: [{ id: 'user-1', username: 'testuser', profileImage: null }],
        total: 1,
        page: 1,
        totalPages: 1,
      });
    });

    it('throws "User not found" for a non-existent target user', async () => {
      (prismaMock.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(profileService.getFollowers('missing', 1, 20)).rejects.toThrow(
        'User not found'
      );
    });
  });

  describe('getFollowing', () => {
    it('returns a paginated list of followed-user summaries', async () => {
      (prismaMock.user.findUnique as jest.Mock).mockResolvedValue({ ...baseUser, id: 'user-1' });
      (prismaMock.follow.findMany as jest.Mock).mockResolvedValue([
        { following: { id: 'user-2', username: 'other', profileImage: null } },
      ]);
      (prismaMock.follow.count as jest.Mock).mockResolvedValue(1);

      const result = await profileService.getFollowing('user-1', 1, 20);

      expect(result).toEqual({
        users: [{ id: 'user-2', username: 'other', profileImage: null }],
        total: 1,
        page: 1,
        totalPages: 1,
      });
    });
  });

  describe('getPublicProfile', () => {
    it('returns the public profile with isFollowedByMe=true when the requester follows them', async () => {
      (prismaMock.user.findUnique as jest.Mock).mockResolvedValue({ ...baseUser });
      (prismaMock.follow.count as jest.Mock).mockResolvedValueOnce(5).mockResolvedValueOnce(2);
      (prismaMock.follow.findUnique as jest.Mock).mockResolvedValue({ id: 'follow-1' });

      const result = await profileService.getPublicProfile('testuser', 'requester-1');

      expect(result).toEqual({
        id: 'user-1',
        username: 'testuser',
        bio: null,
        profileImage: null,
        socialLinks: null,
        createdAt: baseUser.createdAt,
        followersCount: 5,
        followingCount: 2,
        isFollowedByMe: true,
      });
    });

    it('returns isFollowedByMe=false for an unauthenticated caller', async () => {
      (prismaMock.user.findUnique as jest.Mock).mockResolvedValue({ ...baseUser });
      (prismaMock.follow.count as jest.Mock).mockResolvedValue(0);

      const result = await profileService.getPublicProfile('testuser', undefined);

      expect(result.isFollowedByMe).toBe(false);
      expect(prismaMock.follow.findUnique).not.toHaveBeenCalled();
    });

    it('returns isFollowedByMe=false when viewing your own profile', async () => {
      (prismaMock.user.findUnique as jest.Mock).mockResolvedValue({ ...baseUser });
      (prismaMock.follow.count as jest.Mock).mockResolvedValue(0);

      const result = await profileService.getPublicProfile('testuser', 'user-1');

      expect(result.isFollowedByMe).toBe(false);
      expect(prismaMock.follow.findUnique).not.toHaveBeenCalled();
    });

    it('throws "User not found" for a soft-deleted user', async () => {
      (prismaMock.user.findUnique as jest.Mock).mockResolvedValue({
        ...baseUser,
        deletedAt: new Date(),
      });

      await expect(profileService.getPublicProfile('testuser')).rejects.toThrow(
        'User not found'
      );
    });

    it('throws "User not found" for a suspended user', async () => {
      (prismaMock.user.findUnique as jest.Mock).mockResolvedValue({
        ...baseUser,
        suspendedAt: new Date(),
      });

      await expect(profileService.getPublicProfile('testuser')).rejects.toThrow(
        'User not found'
      );
    });
  });

  describe('getNotificationPrefs', () => {
    it('returns the defaults when nothing has been stored', async () => {
      (prismaMock.user.findUnique as jest.Mock).mockResolvedValue({ ...baseUser });

      const result = await profileService.getNotificationPrefs('user-1');

      expect(result).toEqual(DEFAULT_NOTIFICATION_PREFS);
    });

    it('overlays stored preferences on top of the defaults', async () => {
      (prismaMock.user.findUnique as jest.Mock).mockResolvedValue({
        ...baseUser,
        notificationPrefs: { emailOnLike: true },
      });

      const result = await profileService.getNotificationPrefs('user-1');

      expect(result).toEqual({ ...DEFAULT_NOTIFICATION_PREFS, emailOnLike: true });
    });
  });

  describe('updateNotificationPrefs', () => {
    it('merges the partial update into existing preferences rather than replacing them', async () => {
      (prismaMock.user.findUnique as jest.Mock).mockResolvedValue({
        ...baseUser,
        notificationPrefs: { emailOnComment: false },
      });
      (prismaMock.user.update as jest.Mock).mockResolvedValue({});

      const result = await profileService.updateNotificationPrefs('user-1', { emailOnLike: true });

      expect(result).toEqual({
        ...DEFAULT_NOTIFICATION_PREFS,
        emailOnComment: false,
        emailOnLike: true,
      });
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { notificationPrefs: result },
      });
    });
  });

  describe('deleteAccount', () => {
    it('soft-deletes the account and blacklists the access token on correct password', async () => {
      (prismaMock.user.findUnique as jest.Mock).mockResolvedValue({ ...baseUser });
      (prismaMock.user.update as jest.Mock).mockResolvedValue({
        ...baseUser,
        deletedAt: new Date(),
      });
      const { generateToken } = await import('@shared/utils/jwt');
      const token = generateToken({ id: 'user-1', type: 'access' });

      await profileService.deleteAccount('user-1', 'Password123', token);

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { deletedAt: expect.any(Date) },
      });
      expect(tokenBlacklist.add).toHaveBeenCalledWith(token, expect.any(Number));
    });

    it('rejects with "Invalid credentials" on the wrong password', async () => {
      (prismaMock.user.findUnique as jest.Mock).mockResolvedValue({ ...baseUser });

      await expect(
        profileService.deleteAccount('user-1', 'WrongPassword', 'sometoken')
      ).rejects.toThrow('Invalid credentials');
      expect(prismaMock.user.update).not.toHaveBeenCalled();
      expect(tokenBlacklist.add).not.toHaveBeenCalled();
    });

    it('rejects OAuth-only accounts (no password set) rather than allowing deletion unchecked', async () => {
      (prismaMock.user.findUnique as jest.Mock).mockResolvedValue({
        ...baseUser,
        password: null,
      });

      await expect(
        profileService.deleteAccount('user-1', 'anything', 'sometoken')
      ).rejects.toThrow('Invalid credentials');
      expect(verifyPassword).not.toHaveBeenCalled();
    });

    it('rejects when the user no longer exists', async () => {
      (prismaMock.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        profileService.deleteAccount('missing', 'Password123', 'sometoken')
      ).rejects.toThrow('User not found');
    });
  });
});
