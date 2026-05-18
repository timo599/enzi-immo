import type { PrismaClient } from '@prisma/client'
import type { MieterhoehungListQuery, AktualisiereMieterhoehungInput } from '../schemas/mieterhoehung.schema.js'

export class MieterhoehungRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findVertragFuerBerechnung(tenantId: string, mietvertragId: string) {
    return this.prisma.mietvertrag.findFirst({
      where: { id: mietvertragId, tenantId, deletedAt: null },
      include: {
        einheit: {
          include: { objekt: { select: { id: true, bezeichnung: true, heizungsart: true } } },
        },
        mietvertragMieter: {
          include: { mieter: { select: { vorname: true, nachname: true } } },
          where: { bis: null },
        },
        mieterhoehungen: {
          orderBy: { erstelltAm: 'desc' },
          take: 1,
        },
      },
    })
  }

  async upsertMieterhoehung(
    tenantId: string,
    mietvertragId: string,
    daten: {
      erhoehungstyp:             string
      mietart:                   string
      naechstmoeglichesDatum:    Date
      letzteErhoehungDatum?:     Date | null
      aktuelleMiete:             number
      neueMiete?:                number | null
      erhoehungsbetrag?:         number | null
      ampelStatus:               string
      juristischePruefungNoetig: boolean
      pruefungshinweis?:         string | null
      berechnungLog:             object
      erstelltVon?:              string
    }
  ) {
    // Immer neuen Eintrag erstellen (Audit-Trail)
    return this.prisma.mieterhoehung.create({
      data: {
        tenantId,
        mietvertragId,
        erhoehungstyp:             daten.erhoehungstyp as never,
        mietart:                   daten.mietart as never,
        naechstmoeglichesDatum:    daten.naechstmoeglichesDatum,
        letzteErhoehungDatum:      daten.letzteErhoehungDatum,
        aktuelleMiete:             daten.aktuelleMiete,
        neueMiete:                 daten.neueMiete,
        erhoehungsbetrag:          daten.erhoehungsbetrag,
        ampelStatus:               daten.ampelStatus as never,
        juristischePruefungNoetig: daten.juristischePruefungNoetig,
        pruefungshinweis:          daten.pruefungshinweis,
        berechnungLog:             daten.berechnungLog,
        erstelltVon:               daten.erstelltVon,
      },
    })
  }

  async findMany(tenantId: string, query: MieterhoehungListQuery) {
    const where = {
      tenantId,
      ...(query.mietvertragId ? { mietvertragId: query.mietvertragId } : {}),
      ...(query.ampelStatus   ? { ampelStatus: query.ampelStatus as never } : {}),
      ...(query.objektId
        ? { mietvertrag: { einheit: { objektId: query.objektId } } }
        : {}),
    }

    const [items, total] = await Promise.all([
      this.prisma.mieterhoehung.findMany({
        where,
        include: {
          mietvertrag: {
            include: {
              einheit: { select: { bezeichnung: true, objektId: true } },
              mietvertragMieter: {
                include: { mieter: { select: { vorname: true, nachname: true } } },
                where: { bis: null },
              },
            },
          },
        },
        orderBy: { naechstmoeglichesDatum: 'asc' },
        skip:  (query.page - 1) * query.pageSize,
        take:  query.pageSize,
      }),
      this.prisma.mieterhoehung.count({ where }),
    ])

    return { items, total }
  }

  async findById(tenantId: string, id: string) {
    return this.prisma.mieterhoehung.findFirst({
      where: { id, tenantId },
      include: {
        mietvertrag: {
          include: {
            einheit: { include: { objekt: true } },
            mietvertragMieter: {
              include: { mieter: true },
              where: { bis: null },
            },
          },
        },
      },
    })
  }

  async update(tenantId: string, id: string, daten: AktualisiereMieterhoehungInput) {
    const existing = await this.prisma.mieterhoehung.findFirst({ where: { id, tenantId } })
    if (!existing) return null

    const update: Record<string, unknown> = { geaendertAm: new Date() }
    if (daten.neueMiete !== undefined) {
      update['neueMiete'] = daten.neueMiete
      update['erhoehungsbetrag'] = daten.neueMiete - Number(existing.aktuelleMiete)
    }
    if (daten.indexAktuellerWert !== undefined) update['indexAktuellerWert'] = daten.indexAktuellerWert
    if (daten.indexQuelle !== undefined)        update['indexQuelle'] = daten.indexQuelle
    if (daten.pruefungshinweis !== undefined)   update['pruefungshinweis'] = daten.pruefungshinweis
    if (daten.status !== undefined)             update['status'] = daten.status

    return this.prisma.mieterhoehung.update({ where: { id }, data: update })
  }
}
