import type { PrismaClient } from '@prisma/client'
import { VerbrauchRepository } from '../repositories/verbrauch.repository.js'
import { NotFoundError, ValidationError } from '../../../utils/errors.js'
import { writeAudit } from '../../../utils/audit.js'
import { buildMeta } from '../../../utils/pagination.js'
import type { RequestContext } from '../../../types/common.js'
import type { CreateVerbrauchInput, UpdateVerbrauchInput, ListVerbrauchQuery, CreateOelZukaufInput } from '../schemas/verbrauch.schema.js'

export class VerbrauchService {
  private repo: VerbrauchRepository

  constructor(private readonly prisma: PrismaClient) {
    this.repo = new VerbrauchRepository(prisma)
  }

  async list(ctx: RequestContext, query: ListVerbrauchQuery) {
    const { items, total, page, pageSize } = await this.repo.findMany(ctx.tenantId, query)
    return {
      data: items.map(serializeVerbrauch),
      meta: buildMeta(total, page, pageSize),
    }
  }

  async getById(ctx: RequestContext, id: string) {
    const item = await this.repo.findById(id, ctx.tenantId)
    if (!item) throw new NotFoundError('Verbrauchserfassung', id)
    return { data: serializeVerbrauch(item) }
  }

  async upsert(ctx: RequestContext, input: CreateVerbrauchInput) {
    // Verify objekt + zeitraum belong to tenant
    const objekt = await this.prisma.objekt.findFirst({
      where: { id: input.objektId, tenantId: ctx.tenantId, deletedAt: null },
    })
    if (!objekt) throw new NotFoundError('Objekt', input.objektId)

    const zeitraum = await this.prisma.abrechnungszeitraum.findFirst({
      where: { id: input.zeitraumId, tenantId: ctx.tenantId, deletedAt: null },
    })
    if (!zeitraum) throw new NotFoundError('Abrechnungszeitraum', input.zeitraumId)

    const result = await this.repo.upsert(ctx.tenantId, ctx.userId, input)
    await writeAudit({ prisma: this.prisma, ctx, entityType: 'Verbrauchserfassung', entityId: result.id, action: 'CREATE', newData: input })
    return { data: serializeVerbrauch(result) }
  }

  async update(ctx: RequestContext, id: string, input: UpdateVerbrauchInput) {
    const existing = await this.repo.findById(id, ctx.tenantId)
    if (!existing) throw new NotFoundError('Verbrauchserfassung', id)

    const updated = await this.repo.update(id, input)

    // Recalculate if Öl and both Bestände now set
    if (existing.verbrauchstyp === 'oel') {
      await this.repo.recalculateOelVerbrauch(id)
    }

    await writeAudit({ prisma: this.prisma, ctx, entityType: 'Verbrauchserfassung', entityId: id, action: 'UPDATE', oldData: existing, newData: input })
    const refreshed = await this.repo.findById(id, ctx.tenantId)
    return { data: serializeVerbrauch(refreshed!) }
  }

  async addOelZukauf(ctx: RequestContext, id: string, input: CreateOelZukaufInput) {
    const erfassung = await this.repo.findById(id, ctx.tenantId)
    if (!erfassung) throw new NotFoundError('Verbrauchserfassung', id)

    if (erfassung.verbrauchstyp !== 'oel') {
      throw new ValidationError('Öl-Zukäufe können nur bei Verbrauchstyp "oel" hinzugefügt werden')
    }

    // Verify kostenposition if provided
    if (input.kostenpositionId) {
      const kp = await this.prisma.kostenposition.findFirst({
        where: { id: input.kostenpositionId, tenantId: ctx.tenantId },
      })
      if (!kp) throw new NotFoundError('Kostenposition', input.kostenpositionId)
    }

    const zukauf = await this.repo.addOelZukauf(id, input)
    await this.repo.recalculateOelVerbrauch(id)

    await writeAudit({ prisma: this.prisma, ctx, entityType: 'OelZukauf', entityId: zukauf.id, action: 'CREATE', newData: input })

    const refreshed = await this.repo.findById(id, ctx.tenantId)
    return { data: serializeVerbrauch(refreshed!) }
  }
}

// ─── Decimal serializer ────────────────────────────────────────
function serializeVerbrauch(item: ReturnType<typeof Object.assign> | any): unknown {
  return {
    ...item,
    anfangsbestand:     item.anfangsbestand     ? Number(item.anfangsbestand)     : null,
    endbestand:         item.endbestand         ? Number(item.endbestand)         : null,
    verbrauchBerechnet: item.verbrauchBerechnet ? Number(item.verbrauchBerechnet) : null,
    oelZukaeufe: (item.oelZukaeufe ?? []).map((z: any) => ({
      ...z,
      mengeLiter:  Number(z.mengeLiter),
      preisJeLiter: z.preisJeLiter ? Number(z.preisJeLiter) : null,
      preisGesamt: Number(z.preisGesamt),
    })),
  }
}
