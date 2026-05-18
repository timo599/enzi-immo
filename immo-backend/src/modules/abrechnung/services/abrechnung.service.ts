import type { PrismaClient } from '@prisma/client'
import { AbrechnungRepository } from '../repositories/abrechnung.repository.js'
import { pruefVollstaendigkeit } from './vollstaendigkeitspruefung.service.js'
import { berechneNebenkostenabrechnung } from '../../../lib/calculation/umlage.engine.js'
import { writeAudit } from '../../../utils/audit.js'
import { buildMeta } from '../../../utils/pagination.js'
import { NotFoundError, ValidationError } from '../../../utils/errors.js'
import type { RequestContext } from '../../../types/common.js'
import type { ListAbrechnungenQuery, FreigabeInput } from '../schemas/abrechnung.schema.js'
import type {
  BerechnungsInput,
  ObjektDaten,
  EinheitDaten,
  VertragsDaten,
  KostenartConfig,
  UmlageKonfiguration,
} from '../../../lib/calculation/types.js'

export class AbrechnungService {
  private repo: AbrechnungRepository

  constructor(private readonly prisma: PrismaClient) {
    this.repo = new AbrechnungRepository(prisma)
  }

  // ── List ──────────────────────────────────────────────────────

  async list(ctx: RequestContext, query: ListAbrechnungenQuery) {
    const { items, total, page, pageSize } = await this.repo.findMany(ctx.tenantId, query)
    return { data: items.map(serializeAbrechnung), meta: buildMeta(total, page, pageSize) }
  }

  async getById(ctx: RequestContext, id: string) {
    const item = await this.repo.findById(id, ctx.tenantId)
    if (!item) throw new NotFoundError('NK-Abrechnung', id)
    return { data: serializeAbrechnung(item) }
  }

  // ── Vollständigkeitsprüfung ───────────────────────────────────

  async pruefVollstaendigkeit(ctx: RequestContext, zeitraumId: string) {
    const zeitraum = await this.prisma.abrechnungszeitraum.findFirst({
      where: { id: zeitraumId, tenantId: ctx.tenantId, deletedAt: null },
    })
    if (!zeitraum) throw new NotFoundError('Abrechnungszeitraum', zeitraumId)

    const result = await pruefVollstaendigkeit(this.prisma, zeitraumId, ctx.tenantId)
    return { data: result }
  }

  // ── Berechne (main calculation) ───────────────────────────────

  async berechne(ctx: RequestContext, zeitraumId: string) {
    // 1. Vollständigkeitsprüfung
    const vp = await pruefVollstaendigkeit(this.prisma, zeitraumId, ctx.tenantId)
    if (!vp.ready) {
      throw new ValidationError(
        `Vollständigkeitsprüfung fehlgeschlagen: ${vp.blockers.length} Blocker`,
        { blockers: vp.blockers, warnings: vp.warnings },
      )
    }

    // 2. Load all required data
    const input = await this.loadBerechnungsInput(zeitraumId, ctx.tenantId)

    // 3. Run the pure calculation engine
    const ergebnis = berechneNebenkostenabrechnung(input)

    // 4. Persist results in a transaction
    const abrechnungen = await this.prisma.$transaction(async (tx) => {
      const created = []
      for (const rechnung of ergebnis.abrechnungen) {
        const nkAbrechnung = await this.repo.persistBerechnungsErgebnis(
          tx, ctx.tenantId, ctx.userId, zeitraumId, rechnung,
        )
        created.push(nkAbrechnung)
      }
      return created
    })

    // 5. Audit
    await writeAudit({
      prisma: this.prisma,
      ctx,
      entityType: 'NkAbrechnung',
      entityId:   zeitraumId,
      action:     'CREATE',
      newData:    {
        zeitraumId,
        anzahlAbrechnungen: abrechnungen.length,
        warnings:           ergebnis.warnings,
      },
    })

    return {
      data: {
        zeitraumId,
        anzahlAbrechnungen: abrechnungen.length,
        abrechnungsIds:     abrechnungen.map((a) => a.id),
        warnings:           ergebnis.warnings,
      },
    }
  }

  // ── Freigabe ──────────────────────────────────────────────────

  async freigeben(ctx: RequestContext, id: string, input: FreigabeInput) {
    const existing = await this.repo.findById(id, ctx.tenantId)
    if (!existing) throw new NotFoundError('NK-Abrechnung', id)

    if (existing.status !== 'entwurf' && existing.status !== 'in_pruefung') {
      throw new ValidationError(`Abrechnung kann nicht freigegeben werden – Status: ${existing.status}`)
    }

    const updated = await this.repo.updateStatus(id, 'freigegeben', ctx.userId)
    await writeAudit({ prisma: this.prisma, ctx, entityType: 'NkAbrechnung', entityId: id, action: 'UPDATE', oldData: { status: existing.status }, newData: { status: 'freigegeben', notizen: input.notizen } })

    return { data: { id, status: updated.status } }
  }

  // ── Data loading ──────────────────────────────────────────────

  private async loadBerechnungsInput(zeitraumId: string, tenantId: string): Promise<BerechnungsInput> {
    const zeitraum = await this.prisma.abrechnungszeitraum.findFirst({
      where:   { id: zeitraumId, tenantId },
      include: {
        objekt: {
          include: {
            einheiten:       { where: { deletedAt: null, aktiv: true } },
            umlageschluessel: true,
          },
        },
      },
    })

    if (!zeitraum) throw new NotFoundError('Abrechnungszeitraum', zeitraumId)
    const { objekt } = zeitraum

    const objektDaten: ObjektDaten = {
      id:                  objekt.id,
      wohnflaecheGesamtM2: Number(objekt.wohnflaecheGesamtM2),
      nutzflaecheGesamtM2: objekt.nutzflaecheGesamtM2 ? Number(objekt.nutzflaecheGesamtM2) : null,
      meaGesamt:           objekt.meaGesamt,
    }

    const einheitenDaten: EinheitDaten[] = objekt.einheiten.map((e) => ({
      id:             e.id,
      bezeichnung:    e.bezeichnung,
      wohnflaecheM2:  Number(e.wohnflaecheM2 ?? 0),
      nutzflaecheM2:  e.nutzflaecheM2 ? Number(e.nutzflaecheM2) : null,
      meaAnteil:      e.meaAnteil,
      personenAnzahl: e.personenAnzahl,
    }))

    // Load active Mietverträge in this period
    const vertraegeRaw = await this.prisma.mietvertrag.findMany({
      where: {
        tenantId,
        einheit:       { objektId: objekt.id },
        deletedAt:     null,
        vertragsbeginn: { lte: zeitraum.bis },
        OR: [{ vertragsende: null }, { vertragsende: { gte: zeitraum.von } }],
      },
    })

    const vertraegeDaten: VertragsDaten[] = vertraegeRaw.map((v) => ({
      id:              v.id,
      einheitId:       v.einheitId,
      mietart:         v.mietart as 'wohnraum' | 'gewerbe',
      vertragsbeginn:  v.vertragsbeginn,
      vertragsende:    v.vertragsende,
      nettomiete:      Number(v.nettomiete),
      nkVorauszahlung: Number(v.nkVorauszahlung),
    }))

    // Load Kostenpositionen for this Zeitraum
    const kostenpositionen = await this.prisma.kostenposition.findMany({
      where: { zeitraumId, tenantId },
      include: { kostenart: true },
    })

    // Build Kostenart map
    const kostenarten = new Map<string, KostenartConfig>()
    for (const kp of kostenpositionen) {
      if (!kostenarten.has(kp.kostenartId)) {
        kostenarten.set(kp.kostenartId, {
          id:             kp.kostenart.id,
          kuerzel:        kp.kostenart.kuerzel,
          bezeichnung:    kp.kostenart.bezeichnung,
          umlagefaehig:   kp.kostenart.umlagefaehig as 'ja' | 'nein' | 'teilweise',
          heizkvRelevant: kp.kostenart.heizkvRelevant,
        })
      }
    }

    // Build Umlage config map
    const umlageKonfigurationen = new Map<string, UmlageKonfiguration>()
    for (const u of objekt.umlageschluessel) {
      umlageKonfigurationen.set(u.kostenartId, {
        kostenartId:         u.kostenartId,
        schluesselTyp:       u.schluesselTyp as import('../../../lib/calculation/types.js').Umlageschluessel,
        verbrauchsanteilPct: u.verbrauchsanteilPct ? Number(u.verbrauchsanteilPct) : null,
        flaechenanteilPct:   u.flaechenanteilPct   ? Number(u.flaechenanteilPct)   : null,
      })
    }

    return {
      zeitraumVon:   zeitraum.von,
      zeitraumBis:   zeitraum.bis,
      objekt:        objektDaten,
      einheiten:     einheitenDaten,
      vertraege:     vertraegeDaten,
      kostenpositionen: kostenpositionen.map((kp) => ({
        id:           kp.id,
        kostenartId:  kp.kostenartId,
        nettobetrag:  Number(kp.nettobetrag),
        bruttobetrag: Number(kp.bruttobetrag),
      })),
      kostenarten,
      umlageKonfigurationen,
      verbrauchsdaten: new Map(),
    }
  }
}

function serializeAbrechnung(item: any): unknown {
  return {
    ...item,
    anteilsfaktor:           Number(item.anteilsfaktor),
    gesamtkostenAnteil:      Number(item.gesamtkostenAnteil),
    vorauszahlungenGesamt:   Number(item.vorauszahlungenGesamt),
    nachzahlungOderGuthaben: Number(item.nachzahlungOderGuthaben),
    positionen: (item.positionen ?? []).map((p: any) => ({
      ...p,
      gesamtbetragObjekt:  Number(p.gesamtbetragObjekt),
      anteilFaktor:        Number(p.anteilFaktor),
      betragEinheit:       Number(p.betragEinheit),
      vorauszahlungAnteil: Number(p.vorauszahlungAnteil),
      saldo:               Number(p.saldo),
    })),
  }
}
