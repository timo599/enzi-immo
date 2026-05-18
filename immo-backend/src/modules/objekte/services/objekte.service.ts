import type { PrismaClient } from '@prisma/client'
import type { CreateObjektInput, UpdateObjektInput, ListObjekteQuery } from '../schemas/objekte.schema.js'
import { ObjekteRepository } from '../repositories/objekte.repository.js'
import { NotFoundError, TenantMismatchError } from '../../../utils/errors.js'
import { writeAudit } from '../../../utils/audit.js'
import { buildMeta } from '../../../utils/pagination.js'
import type { RequestContext } from '../../../types/common.js'

export class ObjekteService {
  private repo: ObjekteRepository

  constructor(private readonly prisma: PrismaClient) {
    this.repo = new ObjekteRepository(prisma)
  }

  async list(ctx: RequestContext, query: ListObjekteQuery) {
    const { items, total, page, pageSize } = await this.repo.findMany(ctx.tenantId, query)
    return { data: items, meta: buildMeta(total, page, pageSize) }
  }

  async getById(ctx: RequestContext, id: string) {
    const objekt = await this.repo.findById(id, ctx.tenantId)
    if (!objekt) throw new NotFoundError('Objekt', id)
    return { data: objekt }
  }

  async create(ctx: RequestContext, input: CreateObjektInput) {
    const objekt = await this.repo.create(ctx.tenantId, ctx.userId, input)
    await writeAudit({ prisma: this.prisma, ctx, entityType: 'Objekt', entityId: objekt.id, action: 'CREATE', newData: objekt })
    return { data: objekt }
  }

  async update(ctx: RequestContext, id: string, input: UpdateObjektInput) {
    const existing = await this.repo.findById(id, ctx.tenantId)
    if (!existing) throw new NotFoundError('Objekt', id)

    const updated = await this.repo.update(id, input)
    await writeAudit({ prisma: this.prisma, ctx, entityType: 'Objekt', entityId: id, action: 'UPDATE', oldData: existing, newData: updated })
    return { data: updated }
  }

  async delete(ctx: RequestContext, id: string) {
    const existing = await this.repo.findById(id, ctx.tenantId)
    if (!existing) throw new NotFoundError('Objekt', id)

    await this.repo.softDelete(id)
    await writeAudit({ prisma: this.prisma, ctx, entityType: 'Objekt', entityId: id, action: 'SOFT_DELETE', oldData: existing })
    return { data: { id, deleted: true } }
  }
}
