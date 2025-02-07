import { Request, Response } from 'express';
import { AdminController } from '@controllers/admin.controller';
import prisma from '@shared/utils/prismaClient';
import { jest } from '@jest/globals';
import { trackAdminError, trackDbOperation } from '@middlewares/metrics.middleware';
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
      params: { blogId: 'blog-123' },
      body: { visible: true }
    };

    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  const mockBlogData = {
    id: 'blog-123',
    title: 'Test Blog',
    published: true,
    author: {
      id: 'author-1',
      username: 'testuser',
      email: 'test@example.com'
    }
  };

  it('should update blog visibility successfully', async () => {
    ((prisma.blog.update as jest.MockedFunction<any>).mockResolvedValue(mockBlogData));

    await adminController.updateBlogVisibility(
      mockRequest as Request,
      mockResponse as Response
    );

    expect(prisma.blog.update).toHaveBeenCalledWith({
      where: { id: 'blog-123' },
      data: { published: true },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            email: true
          }
        }
      }
    });
    expect(jsonMock).toHaveBeenCalledWith(mockBlogData);
    expect(trackDbOperation).toHaveBeenCalledWith('update', 'blog');
  });

  it('should return 404 for non-existent blog', async () => {
    const notFoundError = new Error('Blog not found');
    (notFoundError as any).name = 'PrismaClientKnownRequestError';
    ((prisma.blog.update as jest.MockedFunction<any>).mockRejectedValue(notFoundError));

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

  it('should return 403 for unauthorized update', async () => {
    const authError = new Error('Not authorized');
    ((prisma.blog.update as jest.MockedFunction<any>).mockRejectedValue(authError));

    await adminController.updateBlogVisibility(
      mockRequest as Request,
      mockResponse as Response
    );

    expect(mockResponse.status).toHaveBeenCalledWith(403);
    expect(jsonMock).toHaveBeenCalledWith({
      message: 'Not authorized',
      details: 'You do not have permission to update this blog'
    });
    expect(logger.error).toHaveBeenCalledWith(
      'Error updating blog visibility:',
      authError
    );
  });

  it('should return 400 for invalid visibility value', async () => {
    const invalidVisibilityError = new Error('Invalid visibility state');
    ((prisma.blog.update as jest.MockedFunction<any>).mockRejectedValue(invalidVisibilityError));

    await adminController.updateBlogVisibility(
      {
        ...mockRequest,
        body: { visible: 'not-a-boolean' }
      } as Request,
      mockResponse as Response
    );

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith({
      message: 'Invalid visibility state',
      details: 'The visibility value must be true or false'
    });
    expect(logger.error).toHaveBeenCalledWith(
      'Error updating blog visibility:',
      invalidVisibilityError
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
      params: { blogId: '123-invalid' }
    };

    await adminController.updateBlogVisibility(
      invalidRequest as Request,
      mockResponse as Response
    );

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

  it('should handle database errors gracefully', async () => {
    const dbError = new Error('Database error');
    ((prisma.blog.update as jest.MockedFunction<any>).mockRejectedValue(dbError));

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
      dbError
    );
  });
});
