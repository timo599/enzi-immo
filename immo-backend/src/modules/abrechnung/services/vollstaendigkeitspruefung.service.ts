import type { PrismaClient } from '@prisma/client'

export interface Blocker {
  code:       string
  message:    string
  entityId?:  string
  entityType?: string
  link?:      string
}

export interface VollstaendigkeitResult {
  ready:    boolean
  blockers: Blocker[]
  warnings: Blocker[]
}

/**
 * Check all preconditions before the NK calculation may run.
 * Returns blockers (hard stop) and warnings (informational).
 * No blocker = ready to calculate.
 */
export async function pruefVollstaendigkeit(
  prisma:     PrismaClient,
  zeitraumId: string,
  tenantId:   string,
): Promise<VollstaendigkeitResult> {
  const blockers: Blocker[] = []
  const warnings: Blocker[] = []

  const zeitraum = await prisma.abrechnungszeitraum.findFirst({
    where: { id: zeitraumId, tenantId, deletedAt: null },
    include: {
      objekt: {
        include: {
          einheiten: { where: { deletedAt: null, aktiv: true } },
        },
      },
    },
  })

  if (!zeitraum) {
    return { ready: false, blockers: [{ code: 'ZEITRAUM_NOT_FOUND', message: 'Abrechnungszeitraum nicht gefunden' }], warnings }
  }

  const objekt    = zeitraum.objekt
  const einheiten = objekt.einheiten

  // ── 1. Einheiten müssen Fläche haben ────────────────────────
  for (const e of einheiten) {
    if (!e.wohnflaecheM2 || Number(e.wohnflaecheM2) <= 0) {
      blockers.push({
        code:       'EINHEIT_FLAECHE_FEHLT',
        message:    `Einheit "${e.bezeichnung}": Wohnfläche nicht hinterlegt`,
        entityId:   e.id,
        entityType: 'Einheit',
        link:       `/einheiten/${e.id}`,
      })
    }
  }

  // ── 2. Aktive Mietverträge im Zeitraum ──────────────────────
  const vertraege = await prisma.mietvertrag.findMany({
    where: {
      tenantId,
      einheit: { objektId: objekt.id },
      deletedAt: null,
      vertragsbeginn: { lte: zeitraum.bis },
      OR: [{ vertragsende: null }, { vertragsende: { gte: zeitraum.von } }],
    },
  })

  if (vertraege.length === 0) {
    blockers.push({
      code:    'KEINE_AKTIVEN_VERTRAEGE',
      message: 'Keine aktiven Mietverträge im Abrechnungszeitraum gefunden',
    })
  }

  // ── 3. Alle Belege müssen reviewed sein ─────────────────────
  const unreviewedCount = await prisma.dokument.count({
    where: {
      zeitraumId,
      tenantId,
      extractionStatus: { in: ['pending', 'processing', 'extracted', 'needs_review', 'failed'] },
    },
  })

  if (unreviewedCount > 0) {
    blockers.push({
      code:    'BELEGE_NICHT_GEPRUEFT',
      message: `${unreviewedCount} Beleg(e) noch nicht geprüft und freigegeben`,
      link:    `/dokumente?zeitraumId=${zeitraumId}`,
    })
  }

  // ── 4. Keine offenen Conflict-Flags in Belegen ──────────────
  const conflictDocs = await prisma.dokExtraktion.findMany({
    where: {
      dokument: { zeitraumId, tenantId },
      flags:    { has: 'betrag_konflikt' },
      reviewed: false,
    },
    select: { dokumentId: true },
  })

  for (const cd of conflictDocs) {
    blockers.push({
      code:       'BELEG_KONFLIKT_UNGELOEST',
      message:    `Beleg mit ungelöstem Betrag-Konflikt: ${cd.dokumentId}`,
      entityId:   cd.dokumentId,
      entityType: 'Dokument',
      link:       `/dokumente/${cd.dokumentId}/extraktion`,
    })
  }

  // ── 5. Kostenpositionen vorhanden ───────────────────────────
  const kostenCount = await prisma.kostenposition.count({
    where: { zeitraumId, tenantId },
  })

  if (kostenCount === 0) {
    blockers.push({
      code:    'KEINE_KOSTENPOSITIONEN',
      message: 'Keine bestätigten Kostenpositionen für diesen Zeitraum vorhanden',
    })
  }

  // ── 6. Umlageschlüssel konfiguriert ─────────────────────────
  const kostenpositionen = await prisma.kostenposition.findMany({
    where: { zeitraumId, tenantId },
    select: { kostenartId: true },
    distinct: ['kostenartId'],
  })

  for (const kp of kostenpositionen) {
    const umlage = await prisma.umlageschluesselEintrag.findFirst({
      where: { objektId: objekt.id, kostenartId: kp.kostenartId },
    })
    if (!umlage) {
      const ka = await prisma.kostenart.findUnique({ where: { id: kp.kostenartId } })
      warnings.push({
        code:    'UMLAGESCHLUESSEL_FEHLT',
        message: `Kein Umlageschlüssel für Kostenart "${ka?.bezeichnung ?? kp.kostenartId}" – Standard (Wohnfläche) wird verwendet`,
      })
    }
  }

  // ── 7. Ölheizung: Bestände prüfen ───────────────────────────
  if (objekt.heizungsart === 'oel') {
    const oelErfassung = await prisma.verbrauchserfassung.findFirst({
      where: { objektId: objekt.id, zeitraumId, verbrauchstyp: 'oel' },
    })

    if (!oelErfassung) {
      blockers.push({
        code:    'OEL_BESTAND_FEHLT',
        message: 'Ölheizung: Verbrauchserfassung für diesen Zeitraum nicht angelegt',
        link:    `/verbrauch?objektId=${objekt.id}&zeitraumId=${zeitraumId}`,
      })
    } else {
      if (oelErfassung.anfangsbestand === null) {
        blockers.push({ code: 'OEL_ANFANGSBESTAND_FEHLT', message: 'Ölheizung: Anfangsbestand fehlt', entityId: oelErfassung.id, entityType: 'Verbrauchserfassung' })
      }
      if (oelErfassung.endbestand === null) {
        blockers.push({ code: 'OEL_ENDBESTAND_FEHLT', message: 'Ölheizung: Endbestand fehlt', entityId: oelErfassung.id, entityType: 'Verbrauchserfassung' })
      }
      if (oelErfassung.verbrauchBerechnet !== null && Number(oelErfassung.verbrauchBerechnet) < 0) {
        blockers.push({
          code:    'OEL_VERBRAUCH_NEGATIV',
          message: `Ölheizung: Berechneter Verbrauch ist negativ (${oelErfassung.verbrauchBerechnet} L) – Bestände prüfen`,
          entityId: oelErfassung.id,
          entityType: 'Verbrauchserfassung',
        })
      }
    }
  }

  // ── 8. HeizKV-Konformität ────────────────────────────────────
  const heizkvKostenarten = await prisma.kostenart.findMany({
    where: { tenantId, heizkvRelevant: true, aktiv: true },
  })

  for (const ka of heizkvKostenarten) {
    const umlage = await prisma.umlageschluesselEintrag.findFirst({
      where: { objektId: objekt.id, kostenartId: ka.id },
    })
    if (umlage?.verbrauchsanteilPct !== null && umlage?.verbrauchsanteilPct !== undefined) {
      const pct = Number(umlage.verbrauchsanteilPct)
      if (pct < 50) {
        blockers.push({
          code:    'HEIZKV_VERLETZUNG',
          message: `HeizKV §7: Verbrauchsanteil für "${ka.bezeichnung}" beträgt nur ${pct}% (Minimum: 50%)`,
          entityId: umlage.id,
          entityType: 'Umlageschluessel',
        })
      }
    }
  }

  return {
    ready:    blockers.length === 0,
    blockers,
    warnings,
  }
}
