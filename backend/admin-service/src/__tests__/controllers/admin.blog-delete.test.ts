import { Request, Response } from 'express';
import { AdminController } from '@controllers/admin.controller';
import axios from 'axios';
import { jest } from '@jest/globals';
import { trackAdminError, trackExternalCall } from '@middlewares/metrics.middleware';
import logger from '@shared/utils/logger';
import prisma from '@shared/utils/prismaClient';

describe('AdminController - Delete Blog (moderation takedown)', () => {
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
      headers: { authorization: 'Bearer test-token' },
      user: {
        id: 'admin-1',
        email: 'admin@test.com',
        username: 'admin',
        roles: ['admin'],
        createdAt: new Date(),
        updatedAt: new Date()
      }
    } as unknown as Partial<Request>;
  });

  it('deletes a blog by delegating to blog-service moderate endpoint', async () => {
    const deletedBlog = { id: 'cm3x9k2p40000ab12cd34ef56', deleted: true };
    (axios.delete as jest.MockedFunction<any>).mockResolvedValue({ data: deletedBlog });

    await adminController.deleteBlog(mockRequest as Request, mockResponse as Response);

    expect(axios.delete).toHaveBeenCalledWith(
      expect.stringContaining('/api/blogs/cm3x9k2p40000ab12cd34ef56/moderate'),
      { headers: { Authorization: 'Bearer test-token' } }
    );
    expect(jsonMock).toHaveBeenCalledWith(deletedBlog);
    expect(trackExternalCall).toHaveBeenCalledWith('blog', 'moderate_delete');
    expect((prisma as any).auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'admin-1',
        action: 'blog.delete',
        targetType: 'blog',
        targetId: 'cm3x9k2p40000ab12cd34ef56',
        metadata: undefined
      }
    });
  });

  it('returns 404 when blog-service reports the blog does not exist', async () => {
    const notFoundError = Object.assign(new Error('Request failed with status code 404'), {
      isAxiosError: true,
      response: { status: 404 }
    });
    (axios.delete as jest.MockedFunction<any>).mockRejectedValue(notFoundError);

    await adminController.deleteBlog(mockRequest as Request, mockResponse as Response);

    expect(mockResponse.status).toHaveBeenCalledWith(404);
    expect(jsonMock).toHaveBeenCalledWith({
      message: 'Blog not found',
      details: 'The specified blog does not exist'
    });
    expect(trackAdminError).toHaveBeenCalledWith('blog_not_found_error');
    expect((prisma as any).auditLog.create).not.toHaveBeenCalled();
  });

  it('returns 502 when blog-service is unreachable', async () => {
    const networkError = Object.assign(new Error('connect ECONNREFUSED'), {
      isAxiosError: true
    });
    (axios.delete as jest.MockedFunction<any>).mockRejectedValue(networkError);

    await adminController.deleteBlog(mockRequest as Request, mockResponse as Response);

    expect(mockResponse.status).toHaveBeenCalledWith(502);
    expect(jsonMock).toHaveBeenCalledWith({
      message: 'Service unavailable',
      details: 'Blog service is not responding'
    });
    expect(trackAdminError).toHaveBeenCalledWith('blog_delete_error');
  });

  it('validates the blog ID format before calling blog-service', async () => {
    const invalidRequest = {
      ...mockRequest,
      params: { blogId: 'not/a valid id' }
    };

    await adminController.deleteBlog(invalidRequest as Request, mockResponse as Response);

    expect(axios.delete).not.toHaveBeenCalled();
    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith({
      message: 'Invalid input data',
      details: 'Invalid blog ID format'
    });
  });

  it('handles missing blogId parameter', async () => {
    const invalidRequest = { ...mockRequest, params: {} };

    await adminController.deleteBlog(invalidRequest as Request, mockResponse as Response);

    expect(axios.delete).not.toHaveBeenCalled();
    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith({
      message: 'Invalid input data',
      details: 'Blog ID is required'
    });
  });

  it('handles unexpected errors gracefully', async () => {
    const unexpectedError = new Error('Something else went wrong');
    (axios.delete as jest.MockedFunction<any>).mockRejectedValue(unexpectedError);

    await adminController.deleteBlog(mockRequest as Request, mockResponse as Response);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith({
      message: 'Internal server error',
      details: 'Failed to delete blog'
    });
    expect(logger.error).toHaveBeenCalledWith({ err: unexpectedError }, 'Error deleting blog (moderation)');
  });
});
