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
