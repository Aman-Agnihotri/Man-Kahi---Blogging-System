import { Request, Response } from 'express';
import { AdminController } from '@controllers/admin.controller';
import prisma from '@shared/utils/prismaClient';
import { jest } from '@jest/globals';
import { trackAdminError } from '@middlewares/metrics.middleware';

describe('AdminController - Manage Users', () => {
  let adminController: AdminController;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let jsonMock: jest.MockedFunction<any>;

  const adminUser = {
    id: 'admin-1',
    email: 'admin@test.com',
    username: 'admin',
    roles: ['admin'],
    createdAt: new Date(),
    updatedAt: new Date()
  };

  beforeEach(() => {
    adminController = new AdminController();
    jsonMock = jest.fn();
    mockResponse = {
      json: jsonMock,
      status: jest.fn().mockReturnThis(),
    } as Partial<Response>;
    mockRequest = { query: {}, params: {}, body: {}, user: adminUser } as unknown as Partial<Request>;
  });

  describe('listUsers', () => {
    it('lists users excluding soft-deleted ones by default', async () => {
      const users = [{ id: 'u1', username: 'alice', email: 'alice@test.com' }];
      (prisma as any).user.findMany.mockResolvedValue(users);
      (prisma as any).user.count.mockResolvedValue(1);

      await adminController.listUsers(mockRequest as Request, mockResponse as Response);

      expect((prisma as any).user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { deletedAt: null } })
      );
      expect(jsonMock).toHaveBeenCalledWith({ users, total: 1, page: 1, totalPages: 1 });
    });

    it('filters by status=deleted to surface soft-deleted accounts', async () => {
      (prisma as any).user.findMany.mockResolvedValue([]);
      (prisma as any).user.count.mockResolvedValue(0);

      await adminController.listUsers(
        { ...mockRequest, query: { status: 'deleted' } } as unknown as Request,
        mockResponse as Response
      );

      expect((prisma as any).user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { deletedAt: { not: null } } })
      );
    });

    it('filters by status=suspended', async () => {
      (prisma as any).user.findMany.mockResolvedValue([]);
      (prisma as any).user.count.mockResolvedValue(0);

      await adminController.listUsers(
        { ...mockRequest, query: { status: 'suspended' } } as unknown as Request,
        mockResponse as Response
      );

      expect((prisma as any).user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletedAt: null, suspendedAt: { not: null } }
        })
      );
    });

    it('applies a case-insensitive search across username and email', async () => {
      (prisma as any).user.findMany.mockResolvedValue([]);
      (prisma as any).user.count.mockResolvedValue(0);

      await adminController.listUsers(
        { ...mockRequest, query: { search: 'ali' } } as unknown as Request,
        mockResponse as Response
      );

      expect((prisma as any).user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            deletedAt: null,
            OR: [
              { username: { contains: 'ali', mode: 'insensitive' } },
              { email: { contains: 'ali', mode: 'insensitive' } }
            ]
          }
        })
      );
    });

    it('returns 400 for an invalid status filter', async () => {
      await adminController.listUsers(
        { ...mockRequest, query: { status: 'banned' } } as unknown as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(trackAdminError).toHaveBeenCalledWith('list_users_validation_error');
    });

    it('returns 500 on database error', async () => {
      (prisma as any).user.findMany.mockRejectedValue(new Error('db down'));

      await adminController.listUsers(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(trackAdminError).toHaveBeenCalledWith('list_users_error');
    });
  });

  describe('suspendUser', () => {
    beforeEach(() => {
      mockRequest = {
        ...mockRequest,
        params: { userId: 'u1' },
        body: { reason: 'Repeated harassment of other users' }
      };
    });

    it('suspends an active user and records an audit log entry', async () => {
      (prisma as any).user.findUnique.mockResolvedValue({ id: 'u1', suspendedAt: null });
      const updated = {
        id: 'u1',
        username: 'alice',
        email: 'alice@test.com',
        suspendedAt: new Date(),
        suspendedReason: 'Repeated harassment of other users'
      };
      (prisma as any).user.update.mockResolvedValue(updated);

      await adminController.suspendUser(mockRequest as Request, mockResponse as Response);

      expect((prisma as any).user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u1' },
          data: expect.objectContaining({ suspendedReason: 'Repeated harassment of other users' })
        })
      );
      expect(jsonMock).toHaveBeenCalledWith(updated);
      expect((prisma as any).auditLog.create).toHaveBeenCalledWith({
        data: {
          actorId: 'admin-1',
          action: 'user.suspend',
          targetType: 'user',
          targetId: 'u1',
          metadata: { reason: 'Repeated harassment of other users' }
        }
      });
    });

    it('returns 404 when the user does not exist', async () => {
      (prisma as any).user.findUnique.mockResolvedValue(null);

      await adminController.suspendUser(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(trackAdminError).toHaveBeenCalledWith('user_not_found_error');
    });

    it('returns 400 when the user is already suspended', async () => {
      (prisma as any).user.findUnique.mockResolvedValue({ id: 'u1', suspendedAt: new Date() });

      await adminController.suspendUser(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({ message: 'User already suspended' });
      expect((prisma as any).user.update).not.toHaveBeenCalled();
    });

    it('returns 400 when the reason is too short', async () => {
      await adminController.suspendUser(
        { ...mockRequest, body: { reason: 'hi' } } as unknown as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(trackAdminError).toHaveBeenCalledWith('suspend_user_validation_error');
      expect((prisma as any).user.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('unsuspendUser', () => {
    beforeEach(() => {
      mockRequest = { ...mockRequest, params: { userId: 'u1' } };
    });

    it('reverses a suspension and records an audit log entry', async () => {
      (prisma as any).user.findUnique.mockResolvedValue({ id: 'u1', suspendedAt: new Date() });
      const updated = {
        id: 'u1',
        username: 'alice',
        email: 'alice@test.com',
        suspendedAt: null,
        suspendedReason: null
      };
      (prisma as any).user.update.mockResolvedValue(updated);

      await adminController.unsuspendUser(mockRequest as Request, mockResponse as Response);

      expect((prisma as any).user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u1' },
          data: { suspendedAt: null, suspendedReason: null }
        })
      );
      expect(jsonMock).toHaveBeenCalledWith(updated);
      expect((prisma as any).auditLog.create).toHaveBeenCalledWith({
        data: {
          actorId: 'admin-1',
          action: 'user.unsuspend',
          targetType: 'user',
          targetId: 'u1',
          metadata: undefined
        }
      });
    });

    it('returns 404 when the user does not exist', async () => {
      (prisma as any).user.findUnique.mockResolvedValue(null);

      await adminController.unsuspendUser(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
    });

    it('returns 400 when the user is not currently suspended', async () => {
      (prisma as any).user.findUnique.mockResolvedValue({ id: 'u1', suspendedAt: null });

      await adminController.unsuspendUser(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({ message: 'User is not suspended' });
      expect((prisma as any).user.update).not.toHaveBeenCalled();
    });
  });
});
