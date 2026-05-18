import type { PrismaClient } from '@prisma/client'
import type { CreateMieterInput, UpdateMieterInput, ListMieterQuery } from '../schemas/mieter.schema.js'
import { MieterRepository } from '../repositories/mieter.repository.js'
import { NotFoundError, ValidationError } from '../../../utils/errors.js'
import { writeAudit } from '../../../utils/audit.js'
import { buildMeta } from '../../../utils/pagination.js'
import type { RequestContext } from '../../../types/common.js'

export class MieterService {
  private repo: MieterRepository

  constructor(private readonly prisma: PrismaClient) {
    this.repo = new MieterRepository(prisma)
  }

  async list(ctx: RequestContext, query: ListMieterQuery) {
    const { items, total, page, pageSize } = await this.repo.findMany(ctx.tenantId, query)
    return { data: items, meta: buildMeta(total, page, pageSize) }
  }

  async getById(ctx: RequestContext, id: string, rolle: string) {
    // notizen only for admin/verwalter
    const withNotizen = ['admin', 'verwalter'].includes(rolle)
    const mieter = await this.repo.findById(id, ctx.tenantId, withNotizen)
    if (!mieter) throw new NotFoundError('Mieter', id)
    // Audit: viewing sensitive data
    await writeAudit({ prisma: this.prisma, ctx, entityType: 'Mieter', entityId: id, action: 'VIEW_SENSITIVE' })
    return { data: mieter }
  }

  async create(ctx: RequestContext, input: CreateMieterInput) {
    const mieter = await this.repo.create(ctx.tenantId, input)
    await writeAudit({ prisma: this.prisma, ctx, entityType: 'Mieter', entityId: mieter.id, action: 'CREATE', newData: { ...mieter, iban: '***' } })
    return { data: mieter }
  }

  async update(ctx: RequestContext, id: string, input: UpdateMieterInput) {
    const existing = await this.repo.findById(id, ctx.tenantId)
    if (!existing) throw new NotFoundError('Mieter', id)
    const updated = await this.repo.update(id, input)
    await writeAudit({ prisma: this.prisma, ctx, entityType: 'Mieter', entityId: id, action: 'UPDATE', oldData: { ...existing, iban: '***' }, newData: { ...updated, iban: '***' } })
    return { data: updated }
  }

  async delete(ctx: RequestContext, id: string) {
    const existing = await this.repo.findById(id, ctx.tenantId)
    if (!existing) throw new NotFoundError('Mieter', id)

    // Block if active contract
    const activeContract = await this.prisma.mietvertrag.findFirst({
      where: { mietvertragMieter: { some: { mieterId: id } }, deletedAt: null, vertragsende: null },
    })
    if (activeContract) {
      throw new ValidationError('Mieter kann nicht gelöscht werden – aktiver Mietvertrag vorhanden')
    }

    await this.repo.softDelete(id)
    await writeAudit({ prisma: this.prisma, ctx, entityType: 'Mieter', entityId: id, action: 'SOFT_DELETE' })
    return { data: { id, deleted: true } }
  }
}
