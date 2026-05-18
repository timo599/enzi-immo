import type { PrismaClient } from '@prisma/client'
import { DashboardRepository } from '../repositories/dashboard.repository.js'
import type { RequestContext } from '../../../types/common.js'

export class DashboardService {
  private repo: DashboardRepository

  constructor(prisma: PrismaClient) {
    this.repo = new DashboardRepository(prisma)
  }

  async getKpis(ctx: RequestContext, objektId?: string) {
    const daten = await this.repo.getKpiDaten(ctx.tenantId, objektId)

    const leerstandsquote =
      daten.einheitenGesamt > 0
        ? ((daten.einheitenGesamt - daten.einheitenVermietet) / daten.einheitenGesamt) * 100
        : 0

    const offeneSumme =
      Number(daten.offenePostenAgg._sum.sollBetrag ?? 0) -
      Number(daten.offenePostenAgg._sum.istBetrag ?? 0)

    const abrechnungsStatus = Object.fromEntries(
      daten.abrechnungenNachStatus.map((g: { status: string; _count: number }) => [g.status, g._count])
    )

    return {
      data: {
        einheiten: {
          gesamt: daten.einheitenGesamt,
          vermietet: daten.einheitenVermietet,
          leer: daten.einheitenGesamt - daten.einheitenVermietet,
          leerstandsquotePct: Math.round(leerstandsquote * 10) / 10,
        },
        offenePosten: {
          anzahl: daten.offenePostenAgg._count,
          offen: Math.round(offeneSumme * 100) / 100,
        },
        mietvertraege: {
          aktiv: daten.aktiveVertraege,
        },
        belege: {
          unreviewed: daten.unreviewed,
        },
        nkAbrechnungen: abrechnungsStatus,
      },
    }
  }

  async getCashflow(ctx: RequestContext, monate = 6, objektId?: string) {
    const { buchungen, offenePosten } = await this.repo.getCashflowDaten(
      ctx.tenantId,
      monate,
      objektId
    )

    // Gruppiere nach Jahr-Monat
    const monatsMap = new Map<string, { monat: string; soll: number; ist: number }>()

    for (const op of offenePosten) {
      const key = op.periodeMonat.toISOString().slice(0, 7)
      const entry = monatsMap.get(key) ?? { monat: key, soll: 0, ist: 0 }
      entry.soll += Number(op.sollBetrag)
      entry.ist += Number(op.istBetrag)
      monatsMap.set(key, entry)
    }

    // Ist aus tatsächlichen Buchungen (falls offene Posten lückenhaft)
    for (const b of buchungen) {
      if (Number(b.betrag) <= 0) continue
      const key = b.buchungsdatum.toISOString().slice(0, 7)
      const entry = monatsMap.get(key) ?? { monat: key, soll: 0, ist: 0 }
      // Buchungen ergänzen Ist nur wenn noch kein Wert
      if (entry.ist === 0) entry.ist += Number(b.betrag)
      monatsMap.set(key, entry)
    }

    const monate_liste = Array.from(monatsMap.values())
      .map((m) => ({
        ...m,
        soll: Math.round(m.soll * 100) / 100,
        ist: Math.round(m.ist * 100) / 100,
        differenz: Math.round((m.ist - m.soll) * 100) / 100,
      }))
      .sort((a, b) => a.monat.localeCompare(b.monat))

    return { data: monate_liste }
  }

  async getAmpel(ctx: RequestContext) {
    const eintraege = await this.repo.getMieterhoehungsAmpel(ctx.tenantId)

    const heute = new Date()
    const in30 = new Date(heute); in30.setDate(heute.getDate() + 30)
    const in90 = new Date(heute); in90.setDate(heute.getDate() + 90)

    const result = eintraege.map((e: typeof eintraege[number]) => {
      const faellig = e.naechstmoeglichesDatum
      let farbe: 'rot' | 'gelb' | 'gruen'
      if (faellig <= in30) farbe = 'rot'
      else if (faellig <= in90) farbe = 'gelb'
      else farbe = 'gruen'

      const mieterNamen = e.mietvertrag.mietvertragMieter
        .map((mm: { mieter: { vorname?: string | null; nachname: string } }) => `${mm.mieter.vorname ?? ''} ${mm.mieter.nachname}`.trim())
        .join(', ')

      return {
        id: e.id,
        mietvertragId: e.mietvertragId,
        einheit: e.mietvertrag.einheit.bezeichnung,
        mieter: mieterNamen,
        aktuelleMiete: Number(e.aktuelleMiete),
        neueMiete: e.neueMiete ? Number(e.neueMiete) : null,
        ampelStatus: e.ampelStatus,
        ampelFarbe: farbe,
        naechstmoeglichesDatum: faellig.toISOString().slice(0, 10),
        juristischePruefungNoetig: e.juristischePruefungNoetig,
        pruefungshinweis: e.pruefungshinweis,
      }
    })

    return { data: result }
  }
}
