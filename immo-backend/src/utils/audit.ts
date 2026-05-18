import type { PrismaClient } from '@prisma/client'
import type { RequestContext } from '../types/common.js'

type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'SOFT_DELETE'
  | 'LOGIN'
  | 'LOGOUT'
  | 'EXPORT'
  | 'VIEW_SENSITIVE'
  | 'RESTORE'
  | 'AI_EXTRACT'
  | 'MATCHING_CONFIRM'

interface AuditParams {
  prisma: PrismaClient
  ctx: RequestContext
  entityType: string
  entityId: string
  action: AuditAction
  oldData?: unknown
  newData?: unknown
}

/**
 * Write an audit log entry.
 * Must be called within the same Prisma transaction when changes are made.
 * Audit logs are INSERT-ONLY – no updates or deletes ever.
 */
export async function writeAudit({
  prisma,
  ctx,
  entityType,
  entityId,
  action,
  oldData,
  newData,
}: AuditParams): Promise<void> {
  await prisma.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      entityType,
      entityId,
      action,
      oldData: oldData ? (oldData as object) : undefined,
      newData: newData ? (newData as object) : undefined,
      changedBy: ctx.userId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    },
  })
}
