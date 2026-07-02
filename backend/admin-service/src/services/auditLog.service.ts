import prisma from '@shared/utils/prismaClient';
import logger from '@shared/utils/logger';

/**
 * Records an admin-initiated moderation action to the audit log
 * (`AuditLog` table - see backend/shared/prisma/schema.prisma).
 *
 * This is a best-effort side effect, not part of the moderation action's
 * transaction: a failure to write the audit trail must never block or
 * roll back the action it's documenting (the same reasoning applies here
 * as it does to `searchCache.invalidateAll()` failures elsewhere in this
 * codebase - the primary write already succeeded, so we log and move on
 * rather than surfacing a 500 for something the caller can't fix).
 */
export async function recordAuditLog(
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  metadata?: object
): Promise<void> {
  try {
    await (prisma as any).auditLog.create({
      data: {
        actorId,
        action,
        targetType,
        targetId,
        metadata: metadata ?? undefined,
      },
    });
  } catch (error) {
    logger.error('Failed to record audit log entry:', error);
  }
}
