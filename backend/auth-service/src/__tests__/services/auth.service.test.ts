import { AuthService } from '@services/auth.service';
import { prismaMock } from '../setup';
import { verifyPassword } from '@utils/password';
import { tokenBlacklist } from '@shared/config/redis';

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService();
  });

  const baseUser = {
    id: 'user-1',
    username: 'testuser',
    email: 'test@example.com',
    password: 'hashed:Password123',
    loginAttempts: 0,
    lockedUntil: null as Date | null,
    roles: [{ role: { name: 'reader' } }],
  };

  describe('register', () => {
    it('creates a user with the default reader role and returns tokens', async () => {
      (prismaMock.user.findFirst as jest.Mock).mockResolvedValue(null);
      (prismaMock.user.create as jest.Mock).mockResolvedValue({
        ...baseUser,
        roles: [{ role: { name: 'reader' } }],
      });
      (prismaMock.user.findUnique as jest.Mock).mockResolvedValue({
        ...baseUser,
        roles: [{ role: { name: 'reader' } }],
      });

      const result = await authService.register({
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123',
      });

      expect(result.user.email).toBe('test@example.com');
      expect(result.token).toEqual(expect.any(String));
      expect(result.refreshToken).toEqual(expect.any(String));
    });

    it('rejects registration when the email or username already exists', async () => {
      (prismaMock.user.findFirst as jest.Mock).mockResolvedValue(baseUser);

      await expect(
        authService.register({
          username: 'testuser',
          email: 'test@example.com',
          password: 'Password123',
        })
      ).rejects.toThrow('User with this email or username already exists');
    });
  });

  describe('login', () => {
    it('logs in successfully with correct credentials and resets attempt tracking', async () => {
      (prismaMock.user.findUnique as jest.Mock)
        .mockResolvedValueOnce({ ...baseUser }) // login lookup
        .mockResolvedValueOnce({ ...baseUser }) // generateToken lookup
        .mockResolvedValueOnce({ ...baseUser }); // generateRefreshToken lookup
      (prismaMock.user.update as jest.Mock).mockResolvedValue(baseUser);

      const result = await authService.login({
        email: 'test@example.com',
        password: 'Password123',
      });

      expect(result.user.email).toBe('test@example.com');
      expect(verifyPassword).toHaveBeenCalledWith(baseUser.password, 'Password123');
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: baseUser.id },
        data: { lastLoginAt: expect.any(Date), loginAttempts: 0, lockedUntil: null },
      });
    });

    it('rejects an unknown email with "Invalid credentials"', async () => {
      (prismaMock.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        authService.login({ email: 'nobody@example.com', password: 'whatever' })
      ).rejects.toThrow('Invalid credentials');
    });

    it('increments loginAttempts and does not lock before the 5th failure', async () => {
      (prismaMock.user.findUnique as jest.Mock).mockResolvedValue({
        ...baseUser,
        loginAttempts: 2,
      });
      (prismaMock.user.update as jest.Mock).mockResolvedValue(baseUser);

      await expect(
        authService.login({ email: 'test@example.com', password: 'WrongPassword' })
      ).rejects.toThrow('Invalid credentials');

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: baseUser.id },
        data: { loginAttempts: 3, lockedUntil: null },
      });
    });

    it('locks the account for 30 minutes after the 5th consecutive failed attempt', async () => {
      (prismaMock.user.findUnique as jest.Mock).mockResolvedValue({
        ...baseUser,
        loginAttempts: 4,
      });
      (prismaMock.user.update as jest.Mock).mockResolvedValue(baseUser);

      await expect(
        authService.login({ email: 'test@example.com', password: 'WrongPassword' })
      ).rejects.toThrow('Invalid credentials');

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: baseUser.id },
        data: { loginAttempts: 5, lockedUntil: expect.any(Date) },
      });
      const call = (prismaMock.user.update as jest.Mock).mock.calls[0][0];
      const lockedUntil = call.data.lockedUntil as Date;
      expect(lockedUntil.getTime()).toBeGreaterThan(Date.now());
    });

    it('rejects login while the account is still locked, without checking the password', async () => {
      (prismaMock.user.findUnique as jest.Mock).mockResolvedValue({
        ...baseUser,
        loginAttempts: 5,
        lockedUntil: new Date(Date.now() + 10 * 60 * 1000),
      });

      await expect(
        authService.login({ email: 'test@example.com', password: 'Password123' })
      ).rejects.toThrow('Account is locked');

      expect(verifyPassword).not.toHaveBeenCalled();
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it('resets the attempt count once an expired lock is encountered', async () => {
      (prismaMock.user.findUnique as jest.Mock).mockResolvedValue({
        ...baseUser,
        loginAttempts: 5,
        lockedUntil: new Date(Date.now() - 60 * 1000), // expired
      });
      (prismaMock.user.update as jest.Mock).mockResolvedValue(baseUser);

      await expect(
        authService.login({ email: 'test@example.com', password: 'WrongPassword' })
      ).rejects.toThrow('Invalid credentials');

      // Treated as a fresh first failure, not a re-lock
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: baseUser.id },
        data: { loginAttempts: 1, lockedUntil: null },
      });
    });

    it('allows login to succeed again once an expired lock has passed', async () => {
      (prismaMock.user.findUnique as jest.Mock)
        .mockResolvedValueOnce({
          ...baseUser,
          loginAttempts: 5,
          lockedUntil: new Date(Date.now() - 60 * 1000),
        })
        .mockResolvedValueOnce({ ...baseUser })
        .mockResolvedValueOnce({ ...baseUser });
      (prismaMock.user.update as jest.Mock).mockResolvedValue(baseUser);

      const result = await authService.login({
        email: 'test@example.com',
        password: 'Password123',
      });

      expect(result.user.email).toBe('test@example.com');
    });
  });

  describe('logout', () => {
    it('blacklists the token when it has remaining validity', async () => {
      const { generateToken } = await import('@shared/utils/jwt');
      const token = generateToken({ id: 'user-1', type: 'access' });

      await authService.logout(token);

      expect(tokenBlacklist.add).toHaveBeenCalledWith(token, expect.any(Number));
    });
  });

  describe('refreshToken', () => {
    it('issues a new access/refresh token pair for a valid refresh token', async () => {
      const { generateToken } = await import('@shared/utils/jwt');
      const refreshToken = generateToken({ id: baseUser.id, type: 'refresh' });

      (prismaMock.user.findUnique as jest.Mock).mockResolvedValue({ ...baseUser });

      const result = await authService.refreshToken(refreshToken);

      expect(result.user.id).toBe(baseUser.id);
      expect(result.token).toEqual(expect.any(String));
      expect(result.refreshToken).toEqual(expect.any(String));
    });

    it('rejects a token that is not of type "refresh"', async () => {
      const { generateToken } = await import('@shared/utils/jwt');
      const accessToken = generateToken({ id: baseUser.id, type: 'access' });

      await expect(authService.refreshToken(accessToken)).rejects.toThrow(
        'Invalid refresh token'
      );
    });
  });
});
