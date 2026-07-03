import { Request, Response } from 'express';
import { AdminController } from '@controllers/admin.controller';
import prisma, { Prisma } from '@shared/utils/prismaClient';
import { jest } from '@jest/globals';
import { trackAdminError } from '@middlewares/metrics.middleware';

describe('AdminController - Manage Roles', () => {
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

  describe('listRoles', () => {
    it('lists roles with their permissions', async () => {
      const roles = [
        {
          id: 'role-1',
          name: 'Editor',
          slug: 'editor',
          description: 'Can edit content',
          isSystem: false,
          permissions: [
            { permission: { id: 'perm-1', name: 'Edit Blogs', slug: 'edit-blogs' } }
          ]
        }
      ];
      (prisma as any).role.findMany.mockResolvedValue(roles);

      await adminController.listRoles(mockRequest as Request, mockResponse as Response);

      expect(jsonMock).toHaveBeenCalledWith([
        {
          id: 'role-1',
          name: 'Editor',
          slug: 'editor',
          description: 'Can edit content',
          isSystem: false,
          permissions: [{ id: 'perm-1', name: 'Edit Blogs', slug: 'edit-blogs' }]
        }
      ]);
    });

    it('returns 500 on database error', async () => {
      (prisma as any).role.findMany.mockRejectedValue(new Error('db down'));

      await adminController.listRoles(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(trackAdminError).toHaveBeenCalledWith('list_roles_error');
    });
  });

  describe('assignRole', () => {
    beforeEach(() => {
      mockRequest = { ...mockRequest, params: { userId: 'u1' }, body: { roleId: 'role-1' } };
    });

    it('assigns a role to a user and records an audit log entry', async () => {
      (prisma as any).user.findUnique.mockResolvedValue({ id: 'u1' });
      (prisma as any).role.findUnique.mockResolvedValue({ id: 'role-1' });
      const created = { id: 'ur-1', userId: 'u1', roleId: 'role-1', assignedBy: 'admin-1' };
      (prisma as any).userRole.create.mockResolvedValue(created);

      await adminController.assignRole(mockRequest as Request, mockResponse as Response);

      expect((prisma as any).userRole.create).toHaveBeenCalledWith({
        data: { userId: 'u1', roleId: 'role-1', assignedBy: 'admin-1' }
      });
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(jsonMock).toHaveBeenCalledWith(created);
      expect((prisma as any).auditLog.create).toHaveBeenCalledWith({
        data: {
          actorId: 'admin-1',
          action: 'role.assign',
          targetType: 'user',
          targetId: 'u1',
          metadata: { roleId: 'role-1' }
        }
      });
    });

    it('returns 404 when the user does not exist', async () => {
      (prisma as any).user.findUnique.mockResolvedValue(null);
      (prisma as any).role.findUnique.mockResolvedValue({ id: 'role-1' });

      await adminController.assignRole(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith({
        message: 'User not found',
        details: 'The specified user does not exist'
      });
    });

    it('returns 404 when the role does not exist', async () => {
      (prisma as any).user.findUnique.mockResolvedValue({ id: 'u1' });
      (prisma as any).role.findUnique.mockResolvedValue(null);

      await adminController.assignRole(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith({
        message: 'Role not found',
        details: 'The specified role does not exist'
      });
    });

    it('returns 409 when the user already has the role (unique constraint)', async () => {
      (prisma as any).user.findUnique.mockResolvedValue({ id: 'u1' });
      (prisma as any).role.findUnique.mockResolvedValue({ id: 'role-1' });
      const constraintError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`userId`,`roleId`)',
        { code: 'P2002', clientVersion: '6.3.0' }
      );
      (prisma as any).userRole.create.mockRejectedValue(constraintError);

      await adminController.assignRole(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(409);
      expect(jsonMock).toHaveBeenCalledWith({ message: 'User already has this role' });
      expect(trackAdminError).toHaveBeenCalledWith('role_already_assigned_error');
    });

    it('returns 400 when roleId is missing from the body', async () => {
      await adminController.assignRole(
        { ...mockRequest, body: {} } as unknown as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(trackAdminError).toHaveBeenCalledWith('assign_role_validation_error');
    });
  });

  describe('revokeRole', () => {
    beforeEach(() => {
      mockRequest = { ...mockRequest, params: { userId: 'u1', roleId: 'role-1' } };
    });

    it('revokes a role from a user and records an audit log entry', async () => {
      (prisma as any).userRole.findUnique.mockResolvedValue({ id: 'ur-1', userId: 'u1', roleId: 'role-1' });
      (prisma as any).userRole.delete.mockResolvedValue({ id: 'ur-1' });

      await adminController.revokeRole(mockRequest as Request, mockResponse as Response);

      expect((prisma as any).userRole.findUnique).toHaveBeenCalledWith({
        where: { userId_roleId: { userId: 'u1', roleId: 'role-1' } }
      });
      expect((prisma as any).userRole.delete).toHaveBeenCalledWith({ where: { id: 'ur-1' } });
      expect(jsonMock).toHaveBeenCalledWith({ success: true });
      expect((prisma as any).auditLog.create).toHaveBeenCalledWith({
        data: {
          actorId: 'admin-1',
          action: 'role.revoke',
          targetType: 'user',
          targetId: 'u1',
          metadata: { roleId: 'role-1' }
        }
      });
    });

    it('returns 404 when the user does not have that role', async () => {
      (prisma as any).userRole.findUnique.mockResolvedValue(null);

      await adminController.revokeRole(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect((prisma as any).userRole.delete).not.toHaveBeenCalled();
    });
  });
});
