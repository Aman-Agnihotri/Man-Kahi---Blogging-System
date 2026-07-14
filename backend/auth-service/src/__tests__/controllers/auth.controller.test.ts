import { Request, Response } from 'express';
import { AuthController } from '@controllers/auth.controller';

describe('AuthController - login', () => {
  let authController: AuthController;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;
  let loginMock: jest.Mock;

  beforeEach(() => {
    authController = new AuthController();
    loginMock = jest.fn();
    (authController as unknown as { authService: { login: jest.Mock } }).authService.login = loginMock;

    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    mockResponse = { json: jsonMock, status: statusMock } as Partial<Response>;
    mockRequest = {
      body: { email: 'test@example.com', password: 'Password123' },
    };
  });

  it('returns 423 when the account is locked', async () => {
    loginMock.mockRejectedValue(
      new Error('Account is locked due to too many failed login attempts. Please try again later.')
    );

    await authController.login(mockRequest as Request, mockResponse as Response, jest.fn());

    expect(statusMock).toHaveBeenCalledWith(423);
    expect(jsonMock).toHaveBeenCalledWith({
      message: 'Account is locked due to too many failed login attempts. Please try again later.',
    });
  });

  it('returns 401 for invalid credentials', async () => {
    loginMock.mockRejectedValue(new Error('Invalid credentials'));

    await authController.login(mockRequest as Request, mockResponse as Response, jest.fn());

    expect(statusMock).toHaveBeenCalledWith(401);
    expect(jsonMock).toHaveBeenCalledWith({ message: 'Invalid credentials' });
  });

  it('returns 400 for invalid input', async () => {
    mockRequest.body = { email: 'not-an-email' };

    await authController.login(mockRequest as Request, mockResponse as Response, jest.fn());

    expect(statusMock).toHaveBeenCalledWith(400);
    expect(loginMock).not.toHaveBeenCalled();
  });
});

describe('AuthController - forgotPassword', () => {
  let authController: AuthController;
  let mockResponse: Partial<Response>;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;
  let requestPasswordResetMock: jest.Mock;

  beforeEach(() => {
    authController = new AuthController();
    requestPasswordResetMock = jest.fn().mockResolvedValue(undefined);
    (authController as unknown as { authService: { requestPasswordReset: jest.Mock } }).authService.requestPasswordReset = requestPasswordResetMock;

    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    mockResponse = { json: jsonMock, status: statusMock } as Partial<Response>;
  });

  it('returns the same generic message for a valid-looking email regardless of whether it exists', async () => {
    const mockRequest = { body: { email: 'anyone@example.com' } } as Request;

    await authController.forgotPassword(mockRequest, mockResponse as Response, jest.fn());

    expect(requestPasswordResetMock).toHaveBeenCalledWith('anyone@example.com');
    expect(jsonMock).toHaveBeenCalledWith({
      message: 'If that email is registered, a password reset link has been sent.',
    });
  });

  it('returns 400 for a malformed email', async () => {
    const mockRequest = { body: { email: 'not-an-email' } } as Request;

    await authController.forgotPassword(mockRequest, mockResponse as Response, jest.fn());

    expect(statusMock).toHaveBeenCalledWith(400);
    expect(requestPasswordResetMock).not.toHaveBeenCalled();
  });
});

describe('AuthController - resetPassword', () => {
  let authController: AuthController;
  let mockResponse: Partial<Response>;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;
  let resetPasswordMock: jest.Mock;

  beforeEach(() => {
    authController = new AuthController();
    resetPasswordMock = jest.fn();
    (authController as unknown as { authService: { resetPassword: jest.Mock } }).authService.resetPassword = resetPasswordMock;

    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    mockResponse = { json: jsonMock, status: statusMock } as Partial<Response>;
  });

  it('resets the password and returns a success message', async () => {
    resetPasswordMock.mockResolvedValue(undefined);
    const mockRequest = { body: { token: 'raw-token', newPassword: 'NewPassword123' } } as Request;

    await authController.resetPassword(mockRequest, mockResponse as Response, jest.fn());

    expect(resetPasswordMock).toHaveBeenCalledWith('raw-token', 'NewPassword123');
    expect(jsonMock).toHaveBeenCalledWith({
      message: 'Password reset successfully. You can now log in with your new password.',
    });
  });

  it('returns 400 for an invalid or expired token', async () => {
    resetPasswordMock.mockRejectedValue(new Error('Invalid or expired reset token'));
    const mockRequest = { body: { token: 'bad-token', newPassword: 'NewPassword123' } } as Request;

    await authController.resetPassword(mockRequest, mockResponse as Response, jest.fn());

    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith({ message: 'Invalid or expired reset token' });
  });

  it('returns 400 for a weak new password', async () => {
    const mockRequest = { body: { token: 'raw-token', newPassword: 'weak' } } as Request;

    await authController.resetPassword(mockRequest, mockResponse as Response, jest.fn());

    expect(statusMock).toHaveBeenCalledWith(400);
    expect(resetPasswordMock).not.toHaveBeenCalled();
  });
});

describe('AuthController - refreshToken', () => {
  let authController: AuthController;
  let mockResponse: Partial<Response>;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;
  let cookieMock: jest.Mock;
  let refreshTokenMock: jest.Mock;

  beforeEach(() => {
    authController = new AuthController();
    refreshTokenMock = jest.fn();
    (authController as unknown as { authService: { refreshToken: jest.Mock } }).authService.refreshToken = refreshTokenMock;

    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    cookieMock = jest.fn();
    mockResponse = { json: jsonMock, status: statusMock, cookie: cookieMock } as Partial<Response>;
  });

  it('rotates the cookie when the refresh token arrives via the cookie only', async () => {
    refreshTokenMock.mockResolvedValue({ accessToken: 'a-token', refreshToken: 'r-token' });
    const mockRequest = {
      body: {},
      cookies: { refresh_token: 'cookie-token' },
    } as unknown as Request;

    await authController.refreshToken(mockRequest, mockResponse as Response, jest.fn());

    expect(refreshTokenMock).toHaveBeenCalledWith('cookie-token');
    expect(cookieMock).toHaveBeenCalledWith(
      'refresh_token',
      'r-token',
      expect.objectContaining({ httpOnly: true, path: '/api/auth', sameSite: 'lax' })
    );
    expect(jsonMock).toHaveBeenCalledWith({ accessToken: 'a-token', refreshToken: 'r-token' });
  });

  it('falls back to the body field when there is no cookie', async () => {
    refreshTokenMock.mockResolvedValue({ accessToken: 'a-token', refreshToken: 'r-token' });
    const mockRequest = {
      body: { refreshToken: 'body-token' },
      cookies: {},
    } as unknown as Request;

    await authController.refreshToken(mockRequest, mockResponse as Response, jest.fn());

    expect(refreshTokenMock).toHaveBeenCalledWith('body-token');
    expect(jsonMock).toHaveBeenCalledWith({ accessToken: 'a-token', refreshToken: 'r-token' });
  });

  it('returns 400 when neither the cookie nor the body carries a refresh token', async () => {
    const mockRequest = {
      body: {},
      cookies: {},
    } as unknown as Request;

    await authController.refreshToken(mockRequest, mockResponse as Response, jest.fn());

    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith({ message: 'Refresh token is required' });
    expect(refreshTokenMock).not.toHaveBeenCalled();
  });
});
