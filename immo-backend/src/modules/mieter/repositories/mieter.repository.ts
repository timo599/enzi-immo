import type { PrismaClient, Prisma } from '@prisma/client'
import type { CreateMieterInput, UpdateMieterInput, ListMieterQuery } from '../schemas/mieter.schema.js'
import { parsePagination } from '../../../utils/pagination.js'

// Fields returned by default – IBAN is sensitive, included but role-gated in service
const MIETER_SELECT = {
  id: true, tenantId: true, anrede: true, vorname: true, nachname: true,
  firmenname: true, zusatz: true, strasse: true, hausnummer: true,
  plz: true, stadt: true, email: true, telefon: true, iban: true,
  steuernummer: true, erstelltAm: true, geaendertAm: true,
  // notizen excluded by default – only shown to admin/verwalter
} as const

export class MieterRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findMany(tenantId: string, query: ListMieterQuery) {
    const { skip, take, page, pageSize } = parsePagination(query)
    const where: Prisma.MieterWhereInput = {
      tenantId, deletedAt: null,
      ...(query.search ? {
        OR: [
          { nachname: { contains: query.search, mode: 'insensitive' } },
          { vorname: { contains: query.search, mode: 'insensitive' } },
          { firmenname: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
        ],
      } : {}),
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.mieter.findMany({ where, skip, take, orderBy: { nachname: 'asc' }, select: MIETER_SELECT }),
      this.prisma.mieter.count({ where }),
    ])
    return { items, total, page, pageSize }
  }

  async findById(id: string, tenantId: string, withNotizen = false) {
    return this.prisma.mieter.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { ...MIETER_SELECT, notizen: withNotizen },
    })
  }

  async create(tenantId: string, data: CreateMieterInput) {
    return this.prisma.mieter.create({ data: { tenantId, ...data }, select: MIETER_SELECT })
  }

  async update(id: string, data: UpdateMieterInput) {
    return this.prisma.mieter.update({ where: { id }, data: { ...data, geaendertAm: new Date() }, select: MIETER_SELECT })
  }

  async softDelete(id: string) {
    // DSGVO soft-delete: pseudonymise sensitive fields
    const uuid = id.slice(0, 8)
    return this.prisma.mieter.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        nachname: `GELOESCHT_${uuid}`,
        vorname: null, email: null, telefon: null, iban: null,
        strasse: null, hausnummer: null, plz: null, stadt: null,
        notizen: null, geaendertAm: new Date(),
      },
    })
  }

  async existsForTenant(id: string, tenantId: string): Promise<boolean> {
    const n = await this.prisma.mieter.count({ where: { id, tenantId, deletedAt: null } })
    return n > 0
  }
}
