import { Request, Response } from 'express';
import { AdminController } from '@controllers/admin.controller';
import prisma from '@shared/utils/prismaClient';
import { jest } from '@jest/globals';

describe('AdminController - List Blogs (moderation)', () => {
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
    mockRequest = { query: {} };
  });

  it('lists blogs regardless of published state by default', async () => {
    const blogs = [{ id: 'blog-1', published: true }, { id: 'blog-2', published: false }];
    (prisma.blog.findMany as jest.MockedFunction<any>).mockResolvedValue(blogs);
    (prisma.blog.count as jest.MockedFunction<any>).mockResolvedValue(2);

    await adminController.listBlogs(mockRequest as Request, mockResponse as Response);

    expect(prisma.blog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null },
      })
    );
    expect(jsonMock).toHaveBeenCalledWith({
      blogs,
      total: 2,
      page: 1,
      totalPages: 1,
    });
  });

  it('filters by published=false to surface hidden blogs for moderation', async () => {
    (prisma.blog.findMany as jest.MockedFunction<any>).mockResolvedValue([]);
    (prisma.blog.count as jest.MockedFunction<any>).mockResolvedValue(0);

    await adminController.listBlogs(
      { query: { published: 'false' } } as unknown as Request,
      mockResponse as Response
    );

    expect(prisma.blog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null, published: false },
      })
    );
  });

  it('returns 500 on database error', async () => {
    (prisma.blog.findMany as jest.MockedFunction<any>).mockRejectedValue(new Error('db down'));

    await adminController.listBlogs(mockRequest as Request, mockResponse as Response);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
  });
});
