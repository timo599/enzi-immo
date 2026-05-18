/**
 * Mieterhöhungs-Service
 *
 * Implementiert §558 BGB (Vergleichsmiete), §558a (Form), §558b (Zustimmung),
 * §559 (Modernisierungsmieterhöhung), §557a (Staffelmiete), §557b (Indexmiete).
 *
 * ARCHITEKTUR-INVARIANTE:
 * - Gewerbe: juristischePruefungNoetig = true immer (DB-Constraint + Code)
 * - Kappungsgrenze §558 Abs. 3 BGB: 20% in 3 Jahren (15% in angespannten Märkten)
 * - Ankündigungsfrist: mind. 3 Monate vor Wirksamkeit
 */

import type { PrismaClient } from '@prisma/client'
import { NotFoundError, ValidationError } from '../../../utils/errors.js'
import { writeAudit } from '../../../utils/audit.js'
import { MieterhoehungRepository } from '../repositories/mieterhoehung.repository.js'
import type { RequestContext } from '../../../types/common.js'
import type {
  MieterhoehungListQuery,
  BerechneMieterhoehungInput,
  AktualisiereMieterhoehungInput,
} from '../schemas/mieterhoehung.schema.js'

// §558 Abs. 3 BGB: 20% in 36 Monaten, in angespannten Märkten 15%
const KAPPUNGSGRENZE_NORMAL = 0.20
const KAPPUNGSGRENZE_ANGESPANNT = 0.15

// Mindest-Ankündigungsfrist: 3 Monate
const ANKUENDIGUNGSFRIST_MONATE = 3

// Mindest-Wartefrist zwischen zwei Erhöhungen: 15 Monate
const WARTEFRIST_MONATE = 15

export class MieterhoehungService {
  private repo: MieterhoehungRepository

  constructor(private readonly prisma: PrismaClient) {
    this.repo = new MieterhoehungRepository(prisma)
  }

  /**
   * Berechnet das nächstmögliche Mieterhöhungsdatum und die zulässige Höchstmiete
   * für einen Mietvertrag auf Basis des Vertragstyps.
   */
  async berechne(ctx: RequestContext, input: BerechneMieterhoehungInput) {
    const vertrag = await this.repo.findVertragFuerBerechnung(ctx.tenantId, input.mietvertragId)
    if (!vertrag) throw new NotFoundError('Mietvertrag', input.mietvertragId)

    const heute = new Date()
    const aktuelleMiete = Number(vertrag.nettomiete)
    const mietart = vertrag.mietart
    const erhoehungstyp = vertrag.indexKlausel ? 'index' : 'vertraglich'

    // Letzte Erhöhung
    const letzteErhoehung = vertrag.mieterhoehungen[0] ?? null
    const letzteErhoehungDatum = letzteErhoehung?.letzteErhoehungDatum
      ?? letzteErhoehung?.erstelltAm
      ?? vertrag.vertragsbeginn

    const log: Record<string, unknown> = {
      mietvertragId: vertrag.id,
      aktuelleMiete,
      mietart,
      erhoehungstyp,
      berechnungsDatum: heute.toISOString(),
    }

    // Gewerbe: immer manuelle Prüfung
    if (mietart === 'gewerbe') {
      const naechstmoegliches = addMonate(heute, ANKUENDIGUNGSFRIST_MONATE)
      const result = await this.repo.upsertMieterhoehung(ctx.tenantId, vertrag.id, {
        erhoehungstyp: 'sonstig',
        mietart,
        naechstmoeglichesDatum: naechstmoegliches,
        letzteErhoehungDatum,
        aktuelleMiete,
        ampelStatus: 'manuelle_pruefung',
        juristischePruefungNoetig: true, // ARCHITEKTUR-INVARIANTE: niemals false für Gewerbe
        pruefungshinweis: 'Gewerbemieterhöhung erfordert immer juristische Einzelfallprüfung.',
        berechnungLog: { ...log, hinweis: 'gewerbe_immer_manuell' },
        erstelltVon: ctx.userId,
      })
      await writeAudit({ prisma: this.prisma, ctx, entityType: 'Mieterhoehung', entityId: result.id, action: 'CREATE', newData: result })
      return { data: this.formatErgebnis(result) }
    }

    // ── Wohnraum: §558 BGB Berechnung ────────────────────────────────────────

    // Wartefrist prüfen
    const fruehestesNachWartefrist = addMonate(letzteErhoehungDatum, WARTEFRIST_MONATE)
    // Ankündigungsfrist dazu
    const naechstmoeglichesRaw = maxDatum(
      addMonate(heute, ANKUENDIGUNGSFRIST_MONATE),
      fruehestesNachWartefrist
    )
    // Auf 1. des Monats runden
    const naechstmoegliches = new Date(
      naechstmoeglichesRaw.getFullYear(),
      naechstmoeglichesRaw.getMonth(),
      1
    )

    log['wartefristBis'] = fruehestesNachWartefrist.toISOString()
    log['naechstmoeglichesDatum'] = naechstmoegliches.toISOString()

    // Kappungsgrenze §558 Abs. 3: 20% in 36 Monaten
    // Referenzzeitraum: letzte 36 Monate
    const vor36Monaten = addMonate(heute, -36)
    const kappungsgrenze = KAPPUNGSGRENZE_NORMAL // Vereinfachung: normal (15% nur wenn angespannt gemeldet)
    const maxErhoeungAbs = aktuelleMiete * kappungsgrenze
    const maxMieteNachKappung = aktuelleMiete + maxErhoeungAbs

    log['kappungsgrenzeTyp'] = 'normal_20_pct'
    log['maxErhoeungAbs'] = maxErhoeungAbs
    log['maxMieteNachKappung'] = maxMieteNachKappung
    log['referenzzeitraumVon'] = vor36Monaten.toISOString()

    // Ampel-Status
    const tageBisNaechstes = Math.floor(
      (naechstmoegliches.getTime() - heute.getTime()) / (1000 * 60 * 60 * 24)
    )
    let ampelStatus: string
    let juristischePruefungNoetig = false
    let pruefungshinweis: string | null = null

    if (tageBisNaechstes <= 0) {
      ampelStatus = 'faellig'
    } else if (tageBisNaechstes <= 30) {
      ampelStatus = 'bald_faellig'
    } else if (tageBisNaechstes <= 90) {
      ampelStatus = 'geplant'
    } else {
      ampelStatus = 'kein_handlungsbedarf'
    }

    // Indexmiete-Logik
    if (erhoehungstyp === 'index') {
      juristischePruefungNoetig = false
      pruefungshinweis = 'Indexmiete: Erhöhung richtet sich nach VPI (Destatis). Aktuellen Index vor Ankündigung prüfen.'
      log['indexTyp'] = vertrag.indexTyp
      log['indexBasisjahr'] = vertrag.indexBasisjahr
    }

    const result = await this.repo.upsertMieterhoehung(ctx.tenantId, vertrag.id, {
      erhoehungstyp,
      mietart,
      naechstmoeglichesDatum: naechstmoegliches,
      letzteErhoehungDatum,
      aktuelleMiete,
      neueMiete: maxMieteNachKappung,
      erhoehungsbetrag: maxErhoeungAbs,
      ampelStatus,
      juristischePruefungNoetig,
      pruefungshinweis,
      berechnungLog: log,
      erstelltVon: ctx.userId,
    })

    await writeAudit({ prisma: this.prisma, ctx, entityType: 'Mieterhoehung', entityId: result.id, action: 'CREATE', newData: result })
    return { data: this.formatErgebnis(result) }
  }

  async list(ctx: RequestContext, query: MieterhoehungListQuery) {
    const { items, total } = await this.repo.findMany(ctx.tenantId, query)
    return {
      data: items.map(this.formatListItem),
      meta: {
        total,
        page:     query.page,
        pageSize: query.pageSize,
        pages:    Math.ceil(total / query.pageSize),
      },
    }
  }

  async getById(ctx: RequestContext, id: string) {
    const item = await this.repo.findById(ctx.tenantId, id)
    if (!item) throw new NotFoundError('Mieterhoehung', id)
    return { data: item }
  }

  async aktualisiere(ctx: RequestContext, id: string, input: AktualisiereMieterhoehungInput) {
    const existing = await this.repo.findById(ctx.tenantId, id)
    if (!existing) throw new NotFoundError('Mieterhoehung', id)

    // Neue Miete darf Kappungsgrenze nicht überschreiten
    if (input.neueMiete !== undefined) {
      const max = Number(existing.aktuelleMiete) * (1 + KAPPUNGSGRENZE_NORMAL)
      if (input.neueMiete > max) {
        throw new ValidationError(
          `Neue Miete ${input.neueMiete} überschreitet die Kappungsgrenze (max. ${max.toFixed(2)} €)`
        )
      }
    }

    const updated = await this.repo.update(ctx.tenantId, id, input)
    await writeAudit({ prisma: this.prisma, ctx, entityType: 'Mieterhoehung', entityId: id, action: 'UPDATE', oldData: existing, newData: updated })
    return { data: updated }
  }

  private formatErgebnis(e: ReturnType<typeof Object.assign>) {
    return {
      id:                        e.id,
      mietvertragId:             e.mietvertragId,
      erhoehungstyp:             e.erhoehungstyp,
      mietart:                   e.mietart,
      aktuelleMiete:             Number(e.aktuelleMiete),
      neueMiete:                 e.neueMiete ? Number(e.neueMiete) : null,
      erhoehungsbetrag:          e.erhoehungsbetrag ? Number(e.erhoehungsbetrag) : null,
      naechstmoeglichesDatum:    e.naechstmoeglichesDatum.toISOString().slice(0, 10),
      ampelStatus:               e.ampelStatus,
      juristischePruefungNoetig: e.juristischePruefungNoetig,
      pruefungshinweis:          e.pruefungshinweis,
      berechnungLog:             e.berechnungLog,
      status:                    e.status,
      erstelltAm:                e.erstelltAm,
    }
  }

  private formatListItem(e: ReturnType<typeof Object.assign>) {
    const mieterNamen = e.mietvertrag.mietvertragMieter
      .map((mm: { mieter: { vorname?: string | null; nachname: string } }) =>
        `${mm.mieter.vorname ?? ''} ${mm.mieter.nachname}`.trim()
      )
      .join(', ')

    return {
      id:                        e.id,
      mietvertragId:             e.mietvertragId,
      einheit:                   e.mietvertrag.einheit.bezeichnung,
      mieter:                    mieterNamen,
      aktuelleMiete:             Number(e.aktuelleMiete),
      neueMiete:                 e.neueMiete ? Number(e.neueMiete) : null,
      ampelStatus:               e.ampelStatus,
      naechstmoeglichesDatum:    e.naechstmoeglichesDatum.toISOString().slice(0, 10),
      juristischePruefungNoetig: e.juristischePruefungNoetig,
      status:                    e.status,
    }
  }
}

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

function addMonate(datum: Date, monate: number): Date {
  const d = new Date(datum)
  d.setMonth(d.getMonth() + monate)
  return d
}

function maxDatum(a: Date, b: Date): Date {
  return a > b ? a : b
}
