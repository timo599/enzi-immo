import type { PrismaClient } from '@prisma/client'
import type { CreateMietvertragInput, UpdateMietvertragInput, ListMietvertraegeQuery } from '../schemas/mietvertraege.schema.js'
import { MietvertraegeRepository } from '../repositories/mietvertraege.repository.js'
import { NotFoundError, ValidationError, ConflictError } from '../../../utils/errors.js'
import { writeAudit } from '../../../utils/audit.js'
import { buildMeta } from '../../../utils/pagination.js'
import type { RequestContext } from '../../../types/common.js'

export class MietvertraegeService {
  private repo: MietvertraegeRepository

  constructor(private readonly prisma: PrismaClient) {
    this.repo = new MietvertraegeRepository(prisma)
  }

  async list(ctx: RequestContext, query: ListMietvertraegeQuery) {
    const { items, total, page, pageSize } = await this.repo.findMany(ctx.tenantId, query)
    return { data: items, meta: buildMeta(total, page, pageSize) }
  }

  async getById(ctx: RequestContext, id: string) {
    const vertrag = await this.repo.findById(id, ctx.tenantId)
    if (!vertrag) throw new NotFoundError('Mietvertrag', id)
    return { data: vertrag }
  }

  async create(ctx: RequestContext, input: CreateMietvertragInput) {
    // 1. Verify einheit belongs to tenant
    const einheit = await this.prisma.einheit.findFirst({
      where: { id: input.einheitId, tenantId: ctx.tenantId, deletedAt: null },
    })
    if (!einheit) throw new NotFoundError('Einheit', input.einheitId)

    // 2. Check for overlapping active contract on this einheit
    const overlap = await this.prisma.mietvertrag.findFirst({
      where: {
        einheitId: input.einheitId,
        deletedAt: null,
        AND: [
          { vertragsbeginn: { lte: input.vertragsende ? new Date(input.vertragsende) : new Date('9999-12-31') } },
          { OR: [{ vertragsende: null }, { vertragsende: { gte: new Date(input.vertragsbeginn) } }] },
        ],
      },
    })
    if (overlap) {
      throw new ConflictError(`Überlappender Mietvertrag für diese Einheit im angegebenen Zeitraum (ID: ${overlap.id})`)
    }

    // 3. Verify all mieter belong to tenant
    for (const m of input.mieter) {
      const mieter = await this.prisma.mieter.findFirst({
        where: { id: m.mieterId, tenantId: ctx.tenantId, deletedAt: null },
      })
      if (!mieter) throw new NotFoundError('Mieter', m.mieterId)
    }

    // 4. Warn if gewerbe (juristische Prüfung)
    // Note: we don't block, but the response carries a warning flag
    const requiresLegalReview = input.mietart === 'gewerbe'

    const vertrag = await this.repo.create(ctx.tenantId, ctx.userId, input)
    await writeAudit({ prisma: this.prisma, ctx, entityType: 'Mietvertrag', entityId: vertrag.id, action: 'CREATE', newData: vertrag })

    return {
      data: vertrag,
      warnings: requiresLegalReview
        ? ['Gewerbe-Mietvertrag: Mieterhöhungen nur nach individueller juristischer Prüfung.']
        : [],
    }
  }

  async update(ctx: RequestContext, id: string, input: UpdateMietvertragInput) {
    const existing = await this.repo.findById(id, ctx.tenantId)
    if (!existing) throw new NotFoundError('Mietvertrag', id)

    const updated = await this.repo.update(id, input)
    await writeAudit({ prisma: this.prisma, ctx, entityType: 'Mietvertrag', entityId: id, action: 'UPDATE', oldData: existing, newData: updated })
    return { data: updated }
  }

  async delete(ctx: RequestContext, id: string) {
    const existing = await this.repo.findById(id, ctx.tenantId)
    if (!existing) throw new NotFoundError('Mietvertrag', id)

    // Block if there are NK-Abrechnungen for this contract
    const hasAbrechnungen = await this.prisma.nkAbrechnung.count({
      where: { mietvertragId: id, status: { not: 'entwurf' } },
    })
    if (hasAbrechnungen > 0) {
      throw new ValidationError('Mietvertrag kann nicht gelöscht werden – freigegebene Abrechnungen vorhanden')
    }

    await this.repo.softDelete(id)
    await writeAudit({ prisma: this.prisma, ctx, entityType: 'Mietvertrag', entityId: id, action: 'SOFT_DELETE', oldData: existing })
    return { data: { id, deleted: true } }
  }
}
