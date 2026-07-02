import { Request, Response } from 'express';
import { AdminController } from '@controllers/admin.controller';
import prisma from '@shared/utils/prismaClient';
import { jest } from '@jest/globals';
import { trackAdminError } from '@middlewares/metrics.middleware';

describe('AdminController - Reported Content', () => {
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

  describe('listReports', () => {
    it('defaults to listing open reports, newest-first', async () => {
      const reports = [{ id: 'r1', status: 'open', reporter: { id: 'u1', username: 'alice' } }];
      (prisma as any).report.findMany.mockResolvedValue(reports);
      (prisma as any).report.count.mockResolvedValue(1);

      await adminController.listReports(mockRequest as Request, mockResponse as Response);

      expect((prisma as any).report.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'open' }, orderBy: { createdAt: 'desc' } })
      );
      expect(jsonMock).toHaveBeenCalledWith({ reports, total: 1, page: 1, totalPages: 1 });
    });

    it('filters by an explicit status', async () => {
      (prisma as any).report.findMany.mockResolvedValue([]);
      (prisma as any).report.count.mockResolvedValue(0);

      await adminController.listReports(
        { ...mockRequest, query: { status: 'dismissed' } } as unknown as Request,
        mockResponse as Response
      );

      expect((prisma as any).report.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'dismissed' } })
      );
    });

    it('returns 400 for an invalid status filter', async () => {
      await adminController.listReports(
        { ...mockRequest, query: { status: 'archived' } } as unknown as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(trackAdminError).toHaveBeenCalledWith('list_reports_validation_error');
    });
  });

  describe('resolveReport', () => {
    beforeEach(() => {
      mockRequest = { ...mockRequest, params: { reportId: 'r1' }, body: { actionTaken: 'removed content' } };
    });

    it('resolves an open report and records an audit log entry', async () => {
      (prisma as any).report.findUnique.mockResolvedValue({ id: 'r1', status: 'open' });
      const updated = { id: 'r1', status: 'resolved', resolvedBy: 'admin-1' };
      (prisma as any).report.update.mockResolvedValue(updated);

      await adminController.resolveReport(mockRequest as Request, mockResponse as Response);

      expect((prisma as any).report.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'r1' },
          data: expect.objectContaining({ status: 'resolved', resolvedBy: 'admin-1' })
        })
      );
      expect(jsonMock).toHaveBeenCalledWith(updated);
      expect((prisma as any).auditLog.create).toHaveBeenCalledWith({
        data: {
          actorId: 'admin-1',
          action: 'report.resolve',
          targetType: 'report',
          targetId: 'r1',
          metadata: { actionTaken: 'removed content' }
        }
      });
    });

    it('returns 404 when the report does not exist', async () => {
      (prisma as any).report.findUnique.mockResolvedValue(null);

      await adminController.resolveReport(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
    });

    it('returns 400 when the report is already resolved', async () => {
      (prisma as any).report.findUnique.mockResolvedValue({ id: 'r1', status: 'resolved' });

      await adminController.resolveReport(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({ message: 'Report is not open' });
      expect((prisma as any).report.update).not.toHaveBeenCalled();
    });
  });

  describe('dismissReport', () => {
    beforeEach(() => {
      mockRequest = { ...mockRequest, params: { reportId: 'r1' } };
    });

    it('dismisses an open report and records an audit log entry', async () => {
      (prisma as any).report.findUnique.mockResolvedValue({ id: 'r1', status: 'open' });
      const updated = { id: 'r1', status: 'dismissed', resolvedBy: 'admin-1' };
      (prisma as any).report.update.mockResolvedValue(updated);

      await adminController.dismissReport(mockRequest as Request, mockResponse as Response);

      expect((prisma as any).report.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'r1' },
          data: expect.objectContaining({ status: 'dismissed', resolvedBy: 'admin-1' })
        })
      );
      expect(jsonMock).toHaveBeenCalledWith(updated);
      expect((prisma as any).auditLog.create).toHaveBeenCalledWith({
        data: {
          actorId: 'admin-1',
          action: 'report.dismiss',
          targetType: 'report',
          targetId: 'r1',
          metadata: undefined
        }
      });
    });

    it('returns 400 when the report has already been dismissed', async () => {
      (prisma as any).report.findUnique.mockResolvedValue({ id: 'r1', status: 'dismissed' });

      await adminController.dismissReport(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({ message: 'Report is not open' });
    });

    it('returns 404 when the report does not exist', async () => {
      (prisma as any).report.findUnique.mockResolvedValue(null);

      await adminController.dismissReport(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
    });
  });
});
