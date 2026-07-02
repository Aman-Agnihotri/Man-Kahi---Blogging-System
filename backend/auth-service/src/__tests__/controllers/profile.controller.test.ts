import { Request, Response } from 'express';
import { ProfileController } from '@controllers/profile.controller';
import { processAvatarImage } from '@config/upload';

type ServiceMock = {
  getProfile: jest.Mock;
  updateProfile: jest.Mock;
  updateAvatar: jest.Mock;
  follow: jest.Mock;
  unfollow: jest.Mock;
  getFollowers: jest.Mock;
  getFollowing: jest.Mock;
  getPublicProfile: jest.Mock;
  getNotificationPrefs: jest.Mock;
  updateNotificationPrefs: jest.Mock;
  deleteAccount: jest.Mock;
};

describe('ProfileController', () => {
  let controller: ProfileController;
  let serviceMock: ServiceMock;
  let mockRequest: Partial<Request> & Record<string, unknown>;
  let mockResponse: Partial<Response>;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    controller = new ProfileController();
    serviceMock = {
      getProfile: jest.fn(),
      updateProfile: jest.fn(),
      updateAvatar: jest.fn(),
      follow: jest.fn(),
      unfollow: jest.fn(),
      getFollowers: jest.fn(),
      getFollowing: jest.fn(),
      getPublicProfile: jest.fn(),
      getNotificationPrefs: jest.fn(),
      updateNotificationPrefs: jest.fn(),
      deleteAccount: jest.fn(),
    };
    (controller as unknown as { profileService: ServiceMock }).profileService = serviceMock;

    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    mockResponse = { json: jsonMock, status: statusMock } as Partial<Response>;
    mockRequest = {
      body: {},
      params: {},
      query: {},
      headers: {},
      user: {
        id: 'user-1',
        username: 'testuser',
        email: 'test@example.com',
        roles: ['reader'],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };
  });

  const next = jest.fn();

  describe('getProfile', () => {
    it('returns the profile on success', async () => {
      serviceMock.getProfile.mockResolvedValue({ id: 'user-1', username: 'testuser' });

      await controller.getProfile(mockRequest as Request, mockResponse as Response, next);

      expect(serviceMock.getProfile).toHaveBeenCalledWith('user-1');
      expect(jsonMock).toHaveBeenCalledWith({ id: 'user-1', username: 'testuser' });
    });

    it('returns 404 when the user no longer exists', async () => {
      serviceMock.getProfile.mockRejectedValue(new Error('User not found'));

      await controller.getProfile(mockRequest as Request, mockResponse as Response, next);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith({ message: 'User not found' });
    });
  });

  describe('updateProfile', () => {
    it('validates input and returns the updated profile', async () => {
      mockRequest.body = { bio: 'hello world' };
      serviceMock.updateProfile.mockResolvedValue({ id: 'user-1', bio: 'hello world' });

      await controller.updateProfile(mockRequest as Request, mockResponse as Response, next);

      expect(serviceMock.updateProfile).toHaveBeenCalledWith('user-1', { bio: 'hello world' });
      expect(jsonMock).toHaveBeenCalledWith({ id: 'user-1', bio: 'hello world' });
    });

    it('returns 400 when bio exceeds the max length', async () => {
      mockRequest.body = { bio: 'x'.repeat(501) };

      await controller.updateProfile(mockRequest as Request, mockResponse as Response, next);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(serviceMock.updateProfile).not.toHaveBeenCalled();
    });

    it('returns 400 when a socialLinks entry is not a valid URL', async () => {
      mockRequest.body = { socialLinks: { twitter: 'not-a-url' } };

      await controller.updateProfile(mockRequest as Request, mockResponse as Response, next);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(serviceMock.updateProfile).not.toHaveBeenCalled();
    });

    it('does not accept username/email changes through this endpoint', async () => {
      mockRequest.body = { username: 'newname', email: 'new@example.com', bio: 'ok' };

      await controller.updateProfile(mockRequest as Request, mockResponse as Response, next);

      expect(serviceMock.updateProfile).toHaveBeenCalledWith('user-1', { bio: 'ok' });
    });
  });

  describe('uploadAvatar', () => {
    it('processes the uploaded file and returns the new avatar URL', async () => {
      mockRequest.file = { buffer: Buffer.from('fake') } as Express.Multer.File;
      (processAvatarImage as jest.Mock).mockResolvedValue('http://minio/avatars/abc.jpg');
      serviceMock.updateAvatar.mockResolvedValue('http://minio/avatars/abc.jpg');

      await controller.uploadAvatar(mockRequest as Request, mockResponse as Response, next);

      expect(processAvatarImage).toHaveBeenCalledWith(mockRequest.file);
      expect(serviceMock.updateAvatar).toHaveBeenCalledWith('user-1', 'http://minio/avatars/abc.jpg');
      expect(jsonMock).toHaveBeenCalledWith({ profileImage: 'http://minio/avatars/abc.jpg' });
    });

    it('returns 400 when no file is provided', async () => {
      mockRequest.file = undefined;

      await controller.uploadAvatar(mockRequest as Request, mockResponse as Response, next);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(processAvatarImage).not.toHaveBeenCalled();
    });
  });

  describe('followUser', () => {
    it('follows the target user', async () => {
      mockRequest.params = { userId: 'user-2' };
      serviceMock.follow.mockResolvedValue({ following: true, followersCount: 1 });

      await controller.followUser(mockRequest as Request, mockResponse as Response, next);

      expect(serviceMock.follow).toHaveBeenCalledWith('user-1', 'user-2');
      expect(jsonMock).toHaveBeenCalledWith({ following: true, followersCount: 1 });
    });

    it('returns 400 for a self-follow attempt', async () => {
      mockRequest.params = { userId: 'user-1' };
      serviceMock.follow.mockRejectedValue(new Error('Cannot follow yourself'));

      await controller.followUser(mockRequest as Request, mockResponse as Response, next);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({ message: 'Cannot follow yourself' });
    });

    it('returns 404 when the target user does not exist', async () => {
      mockRequest.params = { userId: 'ghost' };
      serviceMock.follow.mockRejectedValue(new Error('User not found'));

      await controller.followUser(mockRequest as Request, mockResponse as Response, next);

      expect(statusMock).toHaveBeenCalledWith(404);
    });
  });

  describe('unfollowUser', () => {
    it('unfollows the target user', async () => {
      mockRequest.params = { userId: 'user-2' };
      serviceMock.unfollow.mockResolvedValue({ following: false, followersCount: 0 });

      await controller.unfollowUser(mockRequest as Request, mockResponse as Response, next);

      expect(jsonMock).toHaveBeenCalledWith({ following: false, followersCount: 0 });
    });

    it('returns 400 for a self-unfollow attempt', async () => {
      mockRequest.params = { userId: 'user-1' };
      serviceMock.unfollow.mockRejectedValue(new Error('Cannot unfollow yourself'));

      await controller.unfollowUser(mockRequest as Request, mockResponse as Response, next);

      expect(statusMock).toHaveBeenCalledWith(400);
    });
  });

  describe('getFollowers', () => {
    it('returns a paginated followers list', async () => {
      mockRequest.params = { userId: 'user-2' };
      mockRequest.query = { page: '2', limit: '10' };
      serviceMock.getFollowers.mockResolvedValue({ users: [], total: 0, page: 2, totalPages: 0 });

      await controller.getFollowers(mockRequest as Request, mockResponse as Response, next);

      expect(serviceMock.getFollowers).toHaveBeenCalledWith('user-2', 2, 10);
    });

    it('returns 400 for an invalid page value', async () => {
      mockRequest.params = { userId: 'user-2' };
      mockRequest.query = { page: 'not-a-number' };

      await controller.getFollowers(mockRequest as Request, mockResponse as Response, next);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(serviceMock.getFollowers).not.toHaveBeenCalled();
    });

    it('returns 404 when the target user does not exist', async () => {
      mockRequest.params = { userId: 'ghost' };
      serviceMock.getFollowers.mockRejectedValue(new Error('User not found'));

      await controller.getFollowers(mockRequest as Request, mockResponse as Response, next);

      expect(statusMock).toHaveBeenCalledWith(404);
    });
  });

  describe('getFollowing', () => {
    it('returns a paginated following list', async () => {
      mockRequest.params = { userId: 'user-1' };
      serviceMock.getFollowing.mockResolvedValue({ users: [], total: 0, page: 1, totalPages: 0 });

      await controller.getFollowing(mockRequest as Request, mockResponse as Response, next);

      expect(serviceMock.getFollowing).toHaveBeenCalledWith('user-1', 1, 20);
    });
  });

  describe('getPublicProfile', () => {
    it('returns the public profile for an unauthenticated caller', async () => {
      const req = { params: { username: 'testuser' }, headers: {} } as unknown as Request;
      serviceMock.getPublicProfile.mockResolvedValue({ id: 'user-1', username: 'testuser' });

      await controller.getPublicProfile(req, mockResponse as Response, next);

      expect(serviceMock.getPublicProfile).toHaveBeenCalledWith('testuser', undefined);
    });

    it('passes the requesting user id through when authenticated', async () => {
      mockRequest.params = { username: 'testuser' };
      serviceMock.getPublicProfile.mockResolvedValue({ id: 'user-2', username: 'testuser' });

      await controller.getPublicProfile(mockRequest as Request, mockResponse as Response, next);

      expect(serviceMock.getPublicProfile).toHaveBeenCalledWith('testuser', 'user-1');
    });

    it('returns 404 when the profile does not exist', async () => {
      mockRequest.params = { username: 'ghost' };
      serviceMock.getPublicProfile.mockRejectedValue(new Error('User not found'));

      await controller.getPublicProfile(mockRequest as Request, mockResponse as Response, next);

      expect(statusMock).toHaveBeenCalledWith(404);
    });
  });

  describe('getNotificationPreferences', () => {
    it('returns the stored preferences', async () => {
      serviceMock.getNotificationPrefs.mockResolvedValue({ emailOnComment: true });

      await controller.getNotificationPreferences(mockRequest as Request, mockResponse as Response, next);

      expect(jsonMock).toHaveBeenCalledWith({ emailOnComment: true });
    });
  });

  describe('updateNotificationPreferences', () => {
    it('merges and returns the updated preferences', async () => {
      mockRequest.body = { emailOnLike: true };
      serviceMock.updateNotificationPrefs.mockResolvedValue({ emailOnLike: true });

      await controller.updateNotificationPreferences(mockRequest as Request, mockResponse as Response, next);

      expect(serviceMock.updateNotificationPrefs).toHaveBeenCalledWith('user-1', { emailOnLike: true });
    });

    it('returns 400 for a non-boolean preference value', async () => {
      mockRequest.body = { emailOnLike: 'yes' };

      await controller.updateNotificationPreferences(mockRequest as Request, mockResponse as Response, next);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(serviceMock.updateNotificationPrefs).not.toHaveBeenCalled();
    });
  });

  describe('deleteAccount', () => {
    it('deletes the account when the password is correct', async () => {
      mockRequest.body = { password: 'Password123' };
      mockRequest.headers = { authorization: 'Bearer sometoken' };
      serviceMock.deleteAccount.mockResolvedValue(undefined);

      await controller.deleteAccount(mockRequest as Request, mockResponse as Response, next);

      expect(serviceMock.deleteAccount).toHaveBeenCalledWith('user-1', 'Password123', 'sometoken');
      expect(jsonMock).toHaveBeenCalledWith({ message: 'Account deleted successfully' });
    });

    it('returns 401 when the password is wrong', async () => {
      mockRequest.body = { password: 'WrongPassword' };
      mockRequest.headers = { authorization: 'Bearer sometoken' };
      serviceMock.deleteAccount.mockRejectedValue(new Error('Invalid credentials'));

      await controller.deleteAccount(mockRequest as Request, mockResponse as Response, next);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({ message: 'Invalid credentials' });
    });

    it('returns 400 when no token is present', async () => {
      mockRequest.body = { password: 'Password123' };
      mockRequest.headers = {};

      await controller.deleteAccount(mockRequest as Request, mockResponse as Response, next);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(serviceMock.deleteAccount).not.toHaveBeenCalled();
    });

    it('returns 400 when the password field is missing', async () => {
      mockRequest.body = {};
      mockRequest.headers = { authorization: 'Bearer sometoken' };

      await controller.deleteAccount(mockRequest as Request, mockResponse as Response, next);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(serviceMock.deleteAccount).not.toHaveBeenCalled();
    });
  });
});
