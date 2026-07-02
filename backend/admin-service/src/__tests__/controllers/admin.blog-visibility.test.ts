import { Request, Response } from 'express';
import { AdminController } from '@controllers/admin.controller';
import axios from 'axios';
import { jest } from '@jest/globals';
import { trackAdminError, trackExternalCall } from '@middlewares/metrics.middleware';
import logger from '@shared/utils/logger';

// Mock logger
jest.mock('@shared/utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
}));

describe('AdminController - Blog Visibility', () => {
  let adminController: AdminController;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let jsonMock: jest.MockedFunction<any>;

  beforeEach(() => {
    adminController = new AdminController();
    jsonMock = jest.fn();
    mockResponse = {
      json: jsonMock,
      status: jest.fn().mockReturnThis(),
    } as Partial<Response>;
    mockRequest = {
      params: { blogId: 'cm3x9k2p40000ab12cd34ef56' },
      body: { visible: true },
      headers: { authorization: 'Bearer test-token' }
    };

    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  const mockBlogData = {
    id: 'cm3x9k2p40000ab12cd34ef56',
    title: 'Test Blog',
    published: true,
    author: {
      id: 'author-1',
      username: 'testuser',
      email: 'test@example.com'
    }
  };

  it('should update blog visibility successfully by delegating to blog-service', async () => {
    ((axios.put as jest.MockedFunction<any>).mockResolvedValue({ data: mockBlogData }));

    await adminController.updateBlogVisibility(
      mockRequest as Request,
      mockResponse as Response
    );

    expect(axios.put).toHaveBeenCalledWith(
      expect.stringContaining('/api/blogs/cm3x9k2p40000ab12cd34ef56/visibility'),
      { published: true },
      { headers: { Authorization: 'Bearer test-token' } }
    );
    expect(jsonMock).toHaveBeenCalledWith(mockBlogData);
    expect(trackExternalCall).toHaveBeenCalledWith('blog', 'visibility');
  });

  it('should return 404 for non-existent blog', async () => {
    const notFoundError = Object.assign(new Error('Request failed with status code 404'), {
      isAxiosError: true,
      response: { status: 404 }
    });
    ((axios.put as jest.MockedFunction<any>).mockRejectedValue(notFoundError));

    await adminController.updateBlogVisibility(
      mockRequest as Request,
      mockResponse as Response
    );

    expect(mockResponse.status).toHaveBeenCalledWith(404);
    expect(jsonMock).toHaveBeenCalledWith({
      message: 'Blog not found',
      details: 'The specified blog does not exist'
    });
    expect(trackAdminError).toHaveBeenCalledWith('blog_not_found_error');
    expect(logger.error).toHaveBeenCalledWith(
      'Error updating blog visibility:',
      notFoundError
    );
  });

  it('should return 502 when blog-service is unreachable', async () => {
    const networkError = Object.assign(new Error('connect ECONNREFUSED'), {
      isAxiosError: true
    });
    ((axios.put as jest.MockedFunction<any>).mockRejectedValue(networkError));

    await adminController.updateBlogVisibility(
      mockRequest as Request,
      mockResponse as Response
    );

    expect(mockResponse.status).toHaveBeenCalledWith(502);
    expect(jsonMock).toHaveBeenCalledWith({
      message: 'Service unavailable',
      details: 'Blog service is not responding'
    });
    expect(trackAdminError).toHaveBeenCalledWith('blog_visibility_update_error');
  });

  it('should return 400 for invalid visibility value', async () => {
    await adminController.updateBlogVisibility(
      {
        ...mockRequest,
        body: { visible: 'not-a-boolean' }
      } as Request,
      mockResponse as Response
    );

    expect(axios.put).not.toHaveBeenCalled();
    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith({
      message: 'Invalid visibility state',
      details: 'The visibility value must be true or false'
    });
    expect(logger.error).toHaveBeenCalledWith(
      'Error updating blog visibility:',
      expect.any(Error)
    );
  });

  it('should handle missing blogId parameter', async () => {
    const invalidRequest = {
      ...mockRequest,
      params: {}
    };

    await adminController.updateBlogVisibility(
      invalidRequest as Request,
      mockResponse as Response
    );

    expect(axios.put).not.toHaveBeenCalled();
    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith({
      message: 'Invalid input data',
      details: 'Blog ID is required'
    });
    expect(trackAdminError).toHaveBeenCalledWith('blog_visibility_update_error');
    expect(logger.error).toHaveBeenCalledWith(
      'Error updating blog visibility:',
      expect.any(Error)
    );
  });

  it('should handle missing visibility in request body', async () => {
    const invalidRequest = {
      ...mockRequest,
      body: {}
    };

    await adminController.updateBlogVisibility(
      invalidRequest as Request,
      mockResponse as Response
    );

    expect(axios.put).not.toHaveBeenCalled();
    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith({
      message: 'Invalid input data',
      details: 'Visibility state is required'
    });
    expect(trackAdminError).toHaveBeenCalledWith('blog_visibility_update_error');
    expect(logger.error).toHaveBeenCalledWith(
      'Error updating blog visibility:',
      expect.any(Error)
    );
  });

  it('should validate blog ID format', async () => {
    const invalidRequest = {
      ...mockRequest,
      // Contains a slash and a space, which no valid ID scheme (cuid or
      // otherwise) would ever produce - genuinely exercises the regex
      // rather than relying on a hardcoded "blog-" prefix that was never real.
      params: { blogId: 'not/a valid id' }
    };

    await adminController.updateBlogVisibility(
      invalidRequest as Request,
      mockResponse as Response
    );

    expect(axios.put).not.toHaveBeenCalled();
    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith({
      message: 'Invalid input data',
      details: 'Invalid blog ID format'
    });
    expect(trackAdminError).toHaveBeenCalledWith('blog_visibility_update_error');
    expect(logger.error).toHaveBeenCalledWith(
      'Error updating blog visibility:',
      expect.any(Error)
    );
  });

  it('should handle unexpected errors gracefully', async () => {
    const unexpectedError = new Error('Something else went wrong');
    ((axios.put as jest.MockedFunction<any>).mockRejectedValue(unexpectedError));

    await adminController.updateBlogVisibility(
      mockRequest as Request,
      mockResponse as Response
    );

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith({
      message: 'Internal server error',
      details: 'Failed to update blog visibility'
    });
    expect(trackAdminError).toHaveBeenCalledWith('blog_visibility_update_error');
    expect(logger.error).toHaveBeenCalledWith(
      'Error updating blog visibility:',
      unexpectedError
    );
  });
});
