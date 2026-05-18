import type { PrismaClient, Prisma } from '@prisma/client'
import type { CreateMietvertragInput, UpdateMietvertragInput, ListMietvertraegeQuery } from '../schemas/mietvertraege.schema.js'
import { parsePagination } from '../../../utils/pagination.js'

const INCLUDE_FULL = {
  einheit: {
    select: { id: true, bezeichnung: true, wohnflaecheM2: true, einheitenTyp: true,
      objekt: { select: { id: true, bezeichnung: true, strasse: true, plz: true, stadt: true } } },
  },
  mietvertragMieter: {
    include: { mieter: { select: { id: true, anrede: true, vorname: true, nachname: true, email: true } } },
  },
  vertragsklauseln: true,
} as const

export class MietvertraegeRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findMany(tenantId: string, query: ListMietvertraegeQuery) {
    const { skip, take, page, pageSize } = parsePagination(query)
    const now = new Date()

    const where: Prisma.MietvertragWhereInput = {
      tenantId, deletedAt: null,
      ...(query.einheitId ? { einheitId: query.einheitId } : {}),
      ...(query.mietart ? { mietart: query.mietart } : {}),
      ...(query.objektId ? { einheit: { objektId: query.objektId } } : {}),
      ...(query.aktiv === 'true' ? {
        vertragsbeginn: { lte: now },
        OR: [{ vertragsende: null }, { vertragsende: { gte: now } }],
      } : {}),
      ...(query.aktiv === 'false' ? {
        OR: [{ vertragsbeginn: { gt: now } }, { vertragsende: { lt: now } }],
      } : {}),
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.mietvertrag.findMany({
        where, skip, take,
        orderBy: { vertragsbeginn: 'desc' },
        include: INCLUDE_FULL,
      }),
      this.prisma.mietvertrag.count({ where }),
    ])
    return { items, total, page, pageSize }
  }

  async findById(id: string, tenantId: string) {
    return this.prisma.mietvertrag.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: INCLUDE_FULL,
    })
  }

  async create(tenantId: string, userId: string, data: CreateMietvertragInput) {
    return this.prisma.$transaction(async (tx) => {
      const vertrag = await tx.mietvertrag.create({
        data: {
          tenantId,
          erstelltVon: userId,
          einheitId: data.einheitId,
          mietart: data.mietart,
          vertragsbeginn: new Date(data.vertragsbeginn),
          vertragsende: data.vertragsende ? new Date(data.vertragsende) : null,
          nettomiete: data.nettomiete,
          nkVorauszahlung: data.nkVorauszahlung,
          kaution: data.kaution,
          indexKlausel: data.indexKlausel,
          indexTyp: data.indexTyp,
          indexBasisjahr: data.indexBasisjahr,
          indexBasiswert: data.indexBasiswert,
          kuendigungsfristMieter: data.kuendigungsfristMieter,
          kuendigungsfristVerm: data.kuendigungsfristVerm,
          notizen: data.notizen,
        },
      })

      // Create mieter associations
      await tx.mietvertragMieter.createMany({
        data: data.mieter.map((m) => ({
          mietvertragId: vertrag.id,
          mieterId: m.mieterId,
          rolle: m.rolle,
          seit: new Date(m.seit),
          bis: m.bis ? new Date(m.bis) : null,
        })),
      })

      // Create klauseln if provided
      if (data.klauseln?.length) {
        await tx.vertragsklausel.createMany({
          data: data.klauseln.map((k) => ({
            tenantId,
            mietvertragId: vertrag.id,
            klauselTyp: k.klauselTyp,
            inhalt: k.inhalt,
            gueltigAb: k.gueltigAb ? new Date(k.gueltigAb) : null,
            gueltigBis: k.gueltigBis ? new Date(k.gueltigBis) : null,
            betrag: k.betrag,
            manuellPruefen: k.manuellPruefen,
          })),
        })
      }

      return tx.mietvertrag.findFirstOrThrow({ where: { id: vertrag.id }, include: INCLUDE_FULL })
    })
  }

  async update(id: string, data: UpdateMietvertragInput) {
    const updateData: Prisma.MietvertragUpdateInput = {
      geaendertAm: new Date(),
    }
    if (data.vertragsbeginn !== undefined) updateData.vertragsbeginn = new Date(data.vertragsbeginn)
    if (data.vertragsende !== undefined) updateData.vertragsende = data.vertragsende ? new Date(data.vertragsende) : null
    if (data.nettomiete !== undefined) updateData.nettomiete = data.nettomiete
    if (data.nkVorauszahlung !== undefined) updateData.nkVorauszahlung = data.nkVorauszahlung
    if (data.kaution !== undefined) updateData.kaution = data.kaution
    if (data.indexKlausel !== undefined) updateData.indexKlausel = data.indexKlausel
    if (data.indexTyp !== undefined) updateData.indexTyp = data.indexTyp
    if (data.indexBasisjahr !== undefined) updateData.indexBasisjahr = data.indexBasisjahr
    if (data.indexBasiswert !== undefined) updateData.indexBasiswert = data.indexBasiswert
    if (data.kuendigungsfristMieter !== undefined) updateData.kuendigungsfristMieter = data.kuendigungsfristMieter
    if (data.kuendigungsfristVerm !== undefined) updateData.kuendigungsfristVerm = data.kuendigungsfristVerm
    if (data.notizen !== undefined) updateData.notizen = data.notizen

    return this.prisma.mietvertrag.update({ where: { id }, data: updateData, include: INCLUDE_FULL })
  }

  async softDelete(id: string) {
    return this.prisma.mietvertrag.update({
      where: { id },
      data: { deletedAt: new Date(), geaendertAm: new Date() },
    })
  }
}
