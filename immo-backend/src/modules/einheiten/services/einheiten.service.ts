import type { PrismaClient } from '@prisma/client'
import type { CreateEinheitInput, UpdateEinheitInput, ListEinheitenQuery } from '../schemas/einheiten.schema.js'
import { EinheitenRepository } from '../repositories/einheiten.repository.js'
import { NotFoundError, ValidationError } from '../../../utils/errors.js'
import { writeAudit } from '../../../utils/audit.js'
import { buildMeta } from '../../../utils/pagination.js'
import type { RequestContext } from '../../../types/common.js'

export class EinheitenService {
  private repo: EinheitenRepository

  constructor(private readonly prisma: PrismaClient) {
    this.repo = new EinheitenRepository(prisma)
  }

  async list(ctx: RequestContext, query: ListEinheitenQuery) {
    const { items, total, page, pageSize } = await this.repo.findMany(ctx.tenantId, query)
    return { data: items, meta: buildMeta(total, page, pageSize) }
  }

  async getById(ctx: RequestContext, id: string) {
    const einheit = await this.repo.findById(id, ctx.tenantId)
    if (!einheit) throw new NotFoundError('Einheit', id)
    return { data: einheit }
  }

  async create(ctx: RequestContext, input: CreateEinheitInput) {
    // Verify objekt belongs to tenant
    const objekt = await this.prisma.objekt.findFirst({
      where: { id: input.objektId, tenantId: ctx.tenantId, deletedAt: null },
    })
    if (!objekt) throw new NotFoundError('Objekt', input.objektId)

    const einheit = await this.repo.create(ctx.tenantId, input)
    await writeAudit({ prisma: this.prisma, ctx, entityType: 'Einheit', entityId: einheit.id, action: 'CREATE', newData: einheit })
    return { data: einheit }
  }

  async update(ctx: RequestContext, id: string, input: UpdateEinheitInput) {
    const existing = await this.repo.findById(id, ctx.tenantId)
    if (!existing) throw new NotFoundError('Einheit', id)

    const updated = await this.repo.update(id, input)
    await writeAudit({ prisma: this.prisma, ctx, entityType: 'Einheit', entityId: id, action: 'UPDATE', oldData: existing, newData: updated })
    return { data: updated }
  }

  async delete(ctx: RequestContext, id: string) {
    const existing = await this.repo.findById(id, ctx.tenantId)
    if (!existing) throw new NotFoundError('Einheit', id)

    // Block delete if active contract exists
    const activeContract = await this.prisma.mietvertrag.findFirst({
      where: { einheitId: id, deletedAt: null, vertragsende: null },
    })
    if (activeContract) {
      throw new ValidationError('Einheit kann nicht gelöscht werden – aktiver Mietvertrag vorhanden')
    }

    await this.repo.softDelete(id)
    await writeAudit({ prisma: this.prisma, ctx, entityType: 'Einheit', entityId: id, action: 'SOFT_DELETE', oldData: existing })
    return { data: { id, deleted: true } }
  }
}
