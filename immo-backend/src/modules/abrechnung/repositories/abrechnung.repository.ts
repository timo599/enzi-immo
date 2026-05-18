import type { PrismaClient, Prisma, AbrechnungStatus } from '@prisma/client'
import type { ListAbrechnungenQuery } from '../schemas/abrechnung.schema.js'
import { parsePagination } from '../../../utils/pagination.js'
import type { MieterAbrechnung } from '../../../lib/calculation/types.js'

const INCLUDE_FULL = {
  mietvertrag: {
    include: {
      mietvertragMieter: {
        include: { mieter: { select: { id: true, vorname: true, nachname: true } } },
      },
    },
  },
  einheit: { select: { id: true, bezeichnung: true, wohnflaecheM2: true } },
  positionen: {
    include: { kostenart: { select: { kuerzel: true, bezeichnung: true } } },
    orderBy: { kostenart: { bezeichnung: 'asc' as const } },
  },
} satisfies Prisma.NkAbrechnungInclude

export class AbrechnungRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findMany(tenantId: string, query: ListAbrechnungenQuery) {
    const { skip, take, page, pageSize } = parsePagination(query)
    const where: Prisma.NkAbrechnungWhereInput = {
      tenantId,
      ...(query.zeitraumId    ? { zeitraumId:    query.zeitraumId }    : {}),
      ...(query.mietvertragId ? { mietvertragId: query.mietvertragId } : {}),
      ...(query.status        ? { status: query.status as AbrechnungStatus } : {}),
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.nkAbrechnung.findMany({
        where, skip, take,
        orderBy: { erstelltAm: 'desc' },
        include: {
          mietvertrag: { include: { mietvertragMieter: { include: { mieter: { select: { vorname: true, nachname: true } } } } } },
          einheit:     { select: { bezeichnung: true } },
          _count:      { select: { positionen: true } },
        },
      }),
      this.prisma.nkAbrechnung.count({ where }),
    ])
    return { items, total, page, pageSize }
  }

  async findById(id: string, tenantId: string) {
    return this.prisma.nkAbrechnung.findFirst({
      where: { id, tenantId },
      include: INCLUDE_FULL,
    })
  }

  async findByZeitraum(zeitraumId: string, tenantId: string) {
    return this.prisma.nkAbrechnung.findMany({
      where: { zeitraumId, tenantId },
      include: INCLUDE_FULL,
    })
  }

  /** Persist a full calculation result inside a transaction. */
  async persistBerechnungsErgebnis(
    prisma:      Prisma.TransactionClient,
    tenantId:    string,
    userId:      string,
    zeitraumId:  string,
    rechnung:    MieterAbrechnung,
  ) {
    // Delete existing draft if present
    await prisma.nkAbrechnung.deleteMany({
      where: { zeitraumId, mietvertragId: rechnung.mietvertragId, tenantId, status: 'entwurf' },
    })

    return prisma.nkAbrechnung.create({
      data: {
        tenantId,
        zeitraumId,
        mietvertragId:           rechnung.mietvertragId,
        einheitId:               rechnung.einheitId,
        status:                  'entwurf',
        abrechnungsbeginn:       rechnung.abrechnungsbeginn,
        abrechnungsende:         rechnung.abrechnungsende,
        bewohnungstage:          rechnung.bewohnungstage,
        zeitraumTage:            rechnung.zeitraumTage,
        anteilsfaktor:           rechnung.anteilsfaktor,
        gesamtkostenAnteil:      rechnung.gesamtkostenAnteil,
        vorauszahlungenGesamt:   rechnung.vorauszahlungenGesamt,
        nachzahlungOderGuthaben: rechnung.nachzahlungOderGuthaben,
        formelLog:               rechnung.formelLog as object,
        erstelltVon:             userId,
        positionen: {
          create: rechnung.positionen.map((p) => ({
            kostenpositionId:    null,
            kostenartId:         p.kostenartId,
            gesamtbetragObjekt:  p.gesamtbetragObjekt,
            anteilFaktor:        p.anteilFaktor,
            anteilFormel:        p.formelText,
            betragEinheit:       p.betragEinheit,
            vorauszahlungAnteil: p.vorauszahlungAnteil,
            saldo:               p.saldo,
          })),
        },
      },
    })
  }

  async updateStatus(id: string, status: AbrechnungStatus, userId: string) {
    return this.prisma.nkAbrechnung.update({
      where: { id },
      data: {
        status,
        ...(status === 'freigegeben' ? { freigegebenAm: new Date(), freigegebenVon: userId } : {}),
      },
    })
  }
}
