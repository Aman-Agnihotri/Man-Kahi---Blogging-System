import { Request, Response } from 'express';
import { AdminController } from '@controllers/admin.controller';
import prisma from '@shared/utils/prismaClient';
import { jest } from '@jest/globals';
import { trackAdminError } from '@middlewares/metrics.middleware';

describe('AdminController - Audit Log', () => {
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

  it('lists audit log entries newest-first, including the actor', async () => {
    const logs = [
      {
        id: 'log-1',
        action: 'blog.visibility',
        targetType: 'blog',
        targetId: 'blog-1',
        actor: { id: 'admin-1', username: 'admin' }
      }
    ];
    (prisma as any).auditLog.findMany.mockResolvedValue(logs);
    (prisma as any).auditLog.count.mockResolvedValue(1);

    await adminController.getAuditLog(mockRequest as Request, mockResponse as Response);

    expect((prisma as any).auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
        orderBy: { createdAt: 'desc' },
        include: { actor: { select: { id: true, username: true } } }
      })
    );
    expect(jsonMock).toHaveBeenCalledWith({ logs, total: 1, page: 1, totalPages: 1 });
  });

  it('filters by action and actorId when provided', async () => {
    (prisma as any).auditLog.findMany.mockResolvedValue([]);
    (prisma as any).auditLog.count.mockResolvedValue(0);

    await adminController.getAuditLog(
      { query: { action: 'user.suspend', actorId: 'admin-1' } } as unknown as Request,
      mockResponse as Response
    );

    expect((prisma as any).auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { action: 'user.suspend', actorId: 'admin-1' } })
    );
  });

  it('returns 500 on database error', async () => {
    (prisma as any).auditLog.findMany.mockRejectedValue(new Error('db down'));

    await adminController.getAuditLog(mockRequest as Request, mockResponse as Response);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(trackAdminError).toHaveBeenCalledWith('list_audit_log_error');
  });
});
