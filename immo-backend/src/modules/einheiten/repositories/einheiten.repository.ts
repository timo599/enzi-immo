import type { PrismaClient, Prisma } from '@prisma/client'
import type { CreateEinheitInput, UpdateEinheitInput, ListEinheitenQuery } from '../schemas/einheiten.schema.js'
import { parsePagination } from '../../../utils/pagination.js'

export class EinheitenRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findMany(tenantId: string, query: ListEinheitenQuery) {
    const { skip, take, page, pageSize } = parsePagination(query)
    const where: Prisma.EinheitWhereInput = {
      tenantId, deletedAt: null,
      ...(query.objektId ? { objektId: query.objektId } : {}),
      ...(query.search ? { bezeichnung: { contains: query.search, mode: 'insensitive' } } : {}),
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.einheit.findMany({
        where, skip, take,
        orderBy: { bezeichnung: 'asc' },
        include: {
          objekt: { select: { id: true, bezeichnung: true, plz: true, stadt: true } },
          _count: { select: { mietvertraege: { where: { deletedAt: null } } } },
        },
      }),
      this.prisma.einheit.count({ where }),
    ])
    return { items, total, page, pageSize }
  }

  async findById(id: string, tenantId: string) {
    return this.prisma.einheit.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        objekt: { select: { id: true, bezeichnung: true, wohnflaecheGesamtM2: true, heizungsart: true } },
        mietvertraege: {
          where: { deletedAt: null },
          include: { mietvertragMieter: { include: { mieter: { select: { id: true, vorname: true, nachname: true } } } } },
        },
      },
    })
  }

  async create(tenantId: string, data: CreateEinheitInput) {
    return this.prisma.einheit.create({
      data: { tenantId, ...data },
    })
  }

  async update(id: string, data: UpdateEinheitInput) {
    return this.prisma.einheit.update({ where: { id }, data: { ...data, geaendertAm: new Date() } })
  }

  async softDelete(id: string) {
    return this.prisma.einheit.update({ where: { id }, data: { deletedAt: new Date(), aktiv: false, geaendertAm: new Date() } })
  }

  async existsForTenant(id: string, tenantId: string): Promise<boolean> {
    const n = await this.prisma.einheit.count({ where: { id, tenantId, deletedAt: null } })
    return n > 0
  }
}
