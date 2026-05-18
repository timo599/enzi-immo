import type { PrismaClient } from '@prisma/client'

export class DashboardRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getKpiDaten(tenantId: string, objektId?: string) {
    const heute = new Date()
    const objektFilter = objektId ? { objektId } : {}

    const [einheitenGesamt, einheitenVermietet] = await Promise.all([
      this.prisma.einheit.count({
        where: { tenantId, aktiv: true, deletedAt: null, ...objektFilter },
      }),
      this.prisma.einheit.count({
        where: {
          tenantId,
          aktiv: true,
          deletedAt: null,
          ...objektFilter,
          mietvertraege: {
            some: {
              deletedAt: null,
              vertragsbeginn: { lte: heute },
              OR: [{ vertragsende: null }, { vertragsende: { gte: heute } }],
            },
          },
        },
      }),
    ])

    const offenePostenAgg = await this.prisma.offenerPosten.aggregate({
      where: {
        tenantId,
        status: { in: ['offen', 'teilbezahlt'] },
      },
      _sum: { sollBetrag: true, istBetrag: true },
      _count: true,
    })

    const abrechnungenNachStatus = await this.prisma.nkAbrechnung.groupBy({
      by: ['status'],
      where: { tenantId },
      _count: true,
    })

    // Unreviewed = Dokumente deren Extraktion noch nicht reviewed wurde,
    // oder Dokumente mit needs_review Status
    const unreviewed = await this.prisma.dokument.count({
      where: {
        tenantId,
        extractionStatus: { in: ['needs_review', 'extracted'] },
        extraktion: { reviewed: false },
      },
    })

    const aktiveVertraege = await this.prisma.mietvertrag.count({
      where: {
        tenantId,
        deletedAt: null,
        vertragsbeginn: { lte: heute },
        OR: [{ vertragsende: null }, { vertragsende: { gte: heute } }],
        ...(objektId ? { einheit: { objektId } } : {}),
      },
    })

    return {
      einheitenGesamt,
      einheitenVermietet,
      offenePostenAgg,
      abrechnungenNachStatus,
      unreviewed,
      aktiveVertraege,
    }
  }

  async getCashflowDaten(tenantId: string, monate: number, objektId?: string) {
    const heute = new Date()
    const von = new Date(heute.getFullYear(), heute.getMonth() - monate + 1, 1)

    // Buchungszeilen (Ist) – buchungsdatum ist der korrekte Feldname
    const buchungen = await this.prisma.buchungszeile.findMany({
      where: {
        tenantId,
        buchungsdatum: { gte: von },
        matchingStatus: { in: ['auto_matched', 'manually_matched'] },
        betrag: { gt: 0 },
      },
      select: {
        buchungsdatum: true,
        betrag: true,
      },
    })

    // Offene Posten (Soll) pro Monat
    const offenePosten = await this.prisma.offenerPosten.findMany({
      where: {
        tenantId,
        periodeMonat: { gte: von },
      },
      select: {
        periodeMonat: true,
        sollBetrag: true,
        istBetrag: true,
        postenTyp: true,
      },
    })

    return { buchungen, offenePosten }
  }

  async getMieterhoehungsAmpel(tenantId: string) {
    const in90Tagen = new Date()
    in90Tagen.setDate(in90Tagen.getDate() + 90)

    return this.prisma.mieterhoehung.findMany({
      where: {
        tenantId,
        naechstmoeglichesDatum: { lte: in90Tagen },
        status: { not: 'abgeschlossen' },
      },
      include: {
        mietvertrag: {
          include: {
            einheit: { select: { bezeichnung: true, objektId: true } },
            mietvertragMieter: {
              include: { mieter: { select: { vorname: true, nachname: true } } },
            },
          },
        },
      },
      orderBy: { naechstmoeglichesDatum: 'asc' },
    })
  }
}
