import type { PrismaClient, Prisma } from '@prisma/client'
import type { CreateObjektInput, UpdateObjektInput, ListObjekteQuery } from '../schemas/objekte.schema.js'
import { parsePagination } from '../../../utils/pagination.js'

export class ObjekteRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findMany(tenantId: string, query: ListObjekteQuery) {
    const { skip, take, page, pageSize } = parsePagination(query)
    const where: Prisma.ObjektWhereInput = {
      tenantId,
      deletedAt: null,
      ...(query.aktiv !== undefined ? { aktiv: query.aktiv === 'true' } : {}),
      ...(query.firmaId ? { firmaId: query.firmaId } : {}),
      ...(query.search ? {
        OR: [
          { bezeichnung: { contains: query.search, mode: 'insensitive' } },
          { strasse: { contains: query.search, mode: 'insensitive' } },
          { stadt: { contains: query.search, mode: 'insensitive' } },
        ],
      } : {}),
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.objekt.findMany({
        where, skip, take,
        orderBy: { bezeichnung: 'asc' },
        include: {
          firma: { select: { id: true, name: true } },
          _count: { select: { einheiten: { where: { deletedAt: null } } } },
        },
      }),
      this.prisma.objekt.count({ where }),
    ])
    return { items, total, page, pageSize }
  }

  async findById(id: string, tenantId: string) {
    return this.prisma.objekt.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        einheiten: { where: { deletedAt: null }, orderBy: { bezeichnung: 'asc' } },
        _count: { select: { einheiten: { where: { deletedAt: null } } } },
      },
    })
  }

  async create(tenantId: string, userId: string, data: CreateObjektInput) {
    return this.prisma.objekt.create({
      data: {
        tenantId, erstelltVon: userId,
        firmaId: data.firmaId,
        bezeichnung: data.bezeichnung,
        strasse: data.strasse, hausnummer: data.hausnummer,
        plz: data.plz, stadt: data.stadt, bundesland: data.bundesland,
        baujahr: data.baujahr, heizungsart: data.heizungsart,
        wohnflaecheGesamtM2: data.wohnflaecheGesamtM2 ?? 0,
        nutzflaecheGesamtM2: data.nutzflaecheGesamtM2,
        meaGesamt: data.meaGesamt, notizen: data.notizen,
      },
    })
  }

  async update(id: string, data: UpdateObjektInput) {
    return this.prisma.objekt.update({
      where: { id },
      data: { ...data, geaendertAm: new Date() },
    })
  }

  async softDelete(id: string) {
    return this.prisma.objekt.update({
      where: { id },
      data: { deletedAt: new Date(), aktiv: false, geaendertAm: new Date() },
    })
  }

  async existsForTenant(id: string, tenantId: string): Promise<boolean> {
    const n = await this.prisma.objekt.count({ where: { id, tenantId, deletedAt: null } })
    return n > 0
  }
}
