/**
 * Tests für die Vollständigkeitsprüfung.
 * Nutzt manuelle Prisma-Mocks (kein vitest-mock-extended nötig).
 *
 * ARCHITEKTUR-INVARIANTE: pruefVollstaendigkeit gibt Blocker zurück.
 * Kein Blocker = ready: true. Blocker blockieren die NK-Berechnung hart.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { pruefVollstaendigkeit } from './vollstaendigkeitspruefung.service.js'

// ─── Mock-Aufbau ─────────────────────────────────────────────────────────────
// Wir erstellen einen typierten Prisma-Stub für diese Tests.

type PrismaMock = {
  abrechnungszeitraum: { findFirst: ReturnType<typeof vi.fn> }
  mietvertrag:         { findMany: ReturnType<typeof vi.fn> }
  dokument:            { count: ReturnType<typeof vi.fn> }
  dokExtraktion:       { findMany: ReturnType<typeof vi.fn> }
  kostenposition:      { count: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> }
  umlageschluessel:    { findFirst: ReturnType<typeof vi.fn> }
  kostenart:           { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> }
  verbrauchserfassung: { findFirst: ReturnType<typeof vi.fn> }
}

function erstellePrismaMock(): PrismaMock {
  return {
    abrechnungszeitraum: { findFirst: vi.fn() },
    mietvertrag:         { findMany: vi.fn() },
    dokument:            { count: vi.fn() },
    dokExtraktion:       { findMany: vi.fn() },
    kostenposition:      { count: vi.fn(), findMany: vi.fn() },
    umlageschluessel:    { findFirst: vi.fn() },
    kostenart:           { findUnique: vi.fn(), findMany: vi.fn() },
    verbrauchserfassung: { findFirst: vi.fn() },
  }
}

// Basis-Zeitraum (Gasheizung – kein Öl-Check)
const ZEITRAUM_GAS = {
  id: 'zt-1',
  tenantId: 'tenant-1',
  von: new Date('2024-01-01'),
  bis: new Date('2024-12-31'),
  objekt: {
    id: 'obj-1',
    heizungsart: 'gas',
    einheiten: [
      { id: 'e1', bezeichnung: 'Whg 1 EG', wohnflaecheM2: 72.5, aktiv: true, deletedAt: null },
      { id: 'e2', bezeichnung: 'Whg 2 OG', wohnflaecheM2: 507.5, aktiv: true, deletedAt: null },
    ],
  },
}

// Basis-Zeitraum (Ölheizung)
const ZEITRAUM_OEL = {
  ...ZEITRAUM_GAS,
  objekt: { ...ZEITRAUM_GAS.objekt, heizungsart: 'oel' },
}

const AKTIVER_VERTRAG = {
  id: 'v1',
  einheitId: 'e1',
  nettomiete: 800,
}

// ─── Happy Path ───────────────────────────────────────────────────────────────

describe('pruefVollstaendigkeit – Vollständig (ready: true)', () => {
  let prisma: PrismaMock

  beforeEach(() => {
    prisma = erstellePrismaMock()
    prisma.abrechnungszeitraum.findFirst.mockResolvedValue(ZEITRAUM_GAS)
    prisma.mietvertrag.findMany.mockResolvedValue([AKTIVER_VERTRAG])
    prisma.dokument.count.mockResolvedValue(0) // alle reviewed
    prisma.dokExtraktion.findMany.mockResolvedValue([]) // keine Konflikte
    prisma.kostenposition.count.mockResolvedValue(3)
    prisma.kostenposition.findMany.mockResolvedValue([{ kostenartId: 'ka-1' }])
    prisma.umlageschluessel.findFirst.mockResolvedValue({ id: 'u1' }) // vorhanden
    prisma.kostenart.findMany.mockResolvedValue([]) // keine HeizKV-Kostenarten
  })

  it('gibt ready: true wenn alle Bedingungen erfüllt', async () => {
    const result = await pruefVollstaendigkeit(
      prisma as never,
      'zt-1',
      'tenant-1'
    )
    expect(result.ready).toBe(true)
    expect(result.blockers).toHaveLength(0)
  })
})

// ─── Blocker-Tests ────────────────────────────────────────────────────────────

describe('pruefVollstaendigkeit – Blocker', () => {
  let prisma: PrismaMock

  beforeEach(() => {
    prisma = erstellePrismaMock()
    // Standard: alles OK
    prisma.abrechnungszeitraum.findFirst.mockResolvedValue(ZEITRAUM_GAS)
    prisma.mietvertrag.findMany.mockResolvedValue([AKTIVER_VERTRAG])
    prisma.dokument.count.mockResolvedValue(0)
    prisma.dokExtraktion.findMany.mockResolvedValue([])
    prisma.kostenposition.count.mockResolvedValue(3)
    prisma.kostenposition.findMany.mockResolvedValue([])
    prisma.umlageschluessel.findFirst.mockResolvedValue({ id: 'u1' })
    prisma.kostenart.findMany.mockResolvedValue([])
  })

  it('blockiert wenn Zeitraum nicht gefunden', async () => {
    prisma.abrechnungszeitraum.findFirst.mockResolvedValue(null)
    const result = await pruefVollstaendigkeit(prisma as never, 'zt-nie', 'tenant-1')
    expect(result.ready).toBe(false)
    expect(result.blockers[0]!.code).toBe('ZEITRAUM_NOT_FOUND')
  })

  it('blockiert wenn unreviewte Belege vorhanden', async () => {
    prisma.dokument.count.mockResolvedValue(3) // 3 unreviewte Belege
    const result = await pruefVollstaendigkeit(prisma as never, 'zt-1', 'tenant-1')
    expect(result.ready).toBe(false)
    const blocker = result.blockers.find((b) => b.code === 'BELEGE_NICHT_GEPRUEFT')
    expect(blocker).toBeDefined()
    expect(blocker!.message).toContain('3')
  })

  it('blockiert bei fehlenden Kostenpositionen', async () => {
    prisma.kostenposition.count.mockResolvedValue(0)
    const result = await pruefVollstaendigkeit(prisma as never, 'zt-1', 'tenant-1')
    expect(result.ready).toBe(false)
    const blocker = result.blockers.find((b) => b.code === 'KEINE_KOSTENPOSITIONEN')
    expect(blocker).toBeDefined()
  })

  it('blockiert bei Einheit ohne Wohnfläche (0 m²)', async () => {
    const zeitraumOhneFlaeche = {
      ...ZEITRAUM_GAS,
      objekt: {
        ...ZEITRAUM_GAS.objekt,
        einheiten: [
          { id: 'e1', bezeichnung: 'Whg 1', wohnflaecheM2: null, aktiv: true, deletedAt: null },
        ],
      },
    }
    prisma.abrechnungszeitraum.findFirst.mockResolvedValue(zeitraumOhneFlaeche)
    const result = await pruefVollstaendigkeit(prisma as never, 'zt-1', 'tenant-1')
    expect(result.ready).toBe(false)
    const blocker = result.blockers.find((b) => b.code === 'EINHEIT_FLAECHE_FEHLT')
    expect(blocker).toBeDefined()
    expect(blocker!.entityId).toBe('e1')
  })

  it('blockiert bei unregelöstem Betrag-Konflikt in Extraktion', async () => {
    prisma.dokExtraktion.findMany.mockResolvedValue([
      { dokumentId: 'dok-1' },
    ])
    const result = await pruefVollstaendigkeit(prisma as never, 'zt-1', 'tenant-1')
    expect(result.ready).toBe(false)
    const blocker = result.blockers.find((b) => b.code === 'BELEG_KONFLIKT_UNGELOEST')
    expect(blocker).toBeDefined()
    expect(blocker!.entityId).toBe('dok-1')
  })

  it('blockiert bei keinen aktiven Mietverträgen', async () => {
    prisma.mietvertrag.findMany.mockResolvedValue([])
    const result = await pruefVollstaendigkeit(prisma as never, 'zt-1', 'tenant-1')
    expect(result.ready).toBe(false)
    const blocker = result.blockers.find((b) => b.code === 'KEINE_AKTIVEN_VERTRAEGE')
    expect(blocker).toBeDefined()
  })
})

// ─── Öl-Heizung-Checks ───────────────────────────────────────────────────────

describe('pruefVollstaendigkeit – Ölheizung-Blocker', () => {
  let prisma: PrismaMock

  beforeEach(() => {
    prisma = erstellePrismaMock()
    prisma.abrechnungszeitraum.findFirst.mockResolvedValue(ZEITRAUM_OEL)
    prisma.mietvertrag.findMany.mockResolvedValue([AKTIVER_VERTRAG])
    prisma.dokument.count.mockResolvedValue(0)
    prisma.dokExtraktion.findMany.mockResolvedValue([])
    prisma.kostenposition.count.mockResolvedValue(2)
    prisma.kostenposition.findMany.mockResolvedValue([])
    prisma.umlageschluessel.findFirst.mockResolvedValue({ id: 'u1' })
    prisma.kostenart.findMany.mockResolvedValue([])
  })

  it('blockiert wenn Ölverbrauchserfassung fehlt', async () => {
    prisma.verbrauchserfassung.findFirst.mockResolvedValue(null)
    const result = await pruefVollstaendigkeit(prisma as never, 'zt-1', 'tenant-1')
    expect(result.ready).toBe(false)
    const blocker = result.blockers.find((b) => b.code === 'OEL_BESTAND_FEHLT')
    expect(blocker).toBeDefined()
  })

  it('blockiert wenn Öl-Endbestand fehlt', async () => {
    prisma.verbrauchserfassung.findFirst.mockResolvedValue({
      id: 'vb-1',
      anfangsbestand: 4500,
      endbestand: null,
      verbrauchBerechnet: null,
    })
    const result = await pruefVollstaendigkeit(prisma as never, 'zt-1', 'tenant-1')
    expect(result.ready).toBe(false)
    const blocker = result.blockers.find((b) => b.code === 'OEL_ENDBESTAND_FEHLT')
    expect(blocker).toBeDefined()
  })

  it('blockiert wenn Öl-Anfangsbestand fehlt', async () => {
    prisma.verbrauchserfassung.findFirst.mockResolvedValue({
      id: 'vb-1',
      anfangsbestand: null,
      endbestand: 3200,
      verbrauchBerechnet: null,
    })
    const result = await pruefVollstaendigkeit(prisma as never, 'zt-1', 'tenant-1')
    const blocker = result.blockers.find((b) => b.code === 'OEL_ANFANGSBESTAND_FEHLT')
    expect(blocker).toBeDefined()
  })
})

// ─── HeizKV-Prüfung ──────────────────────────────────────────────────────────

describe('pruefVollstaendigkeit – HeizKV-Verletzung', () => {
  let prisma: PrismaMock

  beforeEach(() => {
    prisma = erstellePrismaMock()
    prisma.abrechnungszeitraum.findFirst.mockResolvedValue(ZEITRAUM_GAS)
    prisma.mietvertrag.findMany.mockResolvedValue([AKTIVER_VERTRAG])
    prisma.dokument.count.mockResolvedValue(0)
    prisma.dokExtraktion.findMany.mockResolvedValue([])
    prisma.kostenposition.count.mockResolvedValue(2)
    prisma.kostenposition.findMany.mockResolvedValue([])
    prisma.umlageschluessel.findFirst.mockResolvedValue({ id: 'u1' })
  })

  it('blockiert bei HeizKV-Verbrauchsanteil unter 50%', async () => {
    prisma.kostenart.findMany.mockResolvedValue([
      { id: 'ka-heiz', bezeichnung: 'Heizkosten', heizkvRelevant: true },
    ])
    prisma.umlageschluessel.findFirst.mockResolvedValue({
      id: 'u1',
      verbrauchsanteilPct: 30, // §7 HeizKV: Minimum 50%
    })
    const result = await pruefVollstaendigkeit(prisma as never, 'zt-1', 'tenant-1')
    expect(result.ready).toBe(false)
    const blocker = result.blockers.find((b) => b.code === 'HEIZKV_VERLETZUNG')
    expect(blocker).toBeDefined()
    expect(blocker!.message).toContain('30%')
  })

  it('kein Blocker bei HeizKV-Verbrauchsanteil von 50% (Minimum erfüllt)', async () => {
    prisma.kostenart.findMany.mockResolvedValue([
      { id: 'ka-heiz', bezeichnung: 'Heizkosten', heizkvRelevant: true },
    ])
    prisma.umlageschluessel.findFirst.mockResolvedValue({
      id: 'u1',
      verbrauchsanteilPct: 50,
    })
    const result = await pruefVollstaendigkeit(prisma as never, 'zt-1', 'tenant-1')
    const heizkvBlocker = result.blockers.find((b) => b.code === 'HEIZKV_VERLETZUNG')
    expect(heizkvBlocker).toBeUndefined()
  })
})

// ─── Warnings (keine Blocker) ─────────────────────────────────────────────────

describe('pruefVollstaendigkeit – Warnungen (kein Blocker)', () => {
  it('warnt wenn Umlageschlüssel fehlt, blockiert aber nicht', async () => {
    const prisma = erstellePrismaMock()
    prisma.abrechnungszeitraum.findFirst.mockResolvedValue(ZEITRAUM_GAS)
    prisma.mietvertrag.findMany.mockResolvedValue([AKTIVER_VERTRAG])
    prisma.dokument.count.mockResolvedValue(0)
    prisma.dokExtraktion.findMany.mockResolvedValue([])
    prisma.kostenposition.count.mockResolvedValue(2)
    prisma.kostenposition.findMany.mockResolvedValue([{ kostenartId: 'ka-1' }])
    prisma.umlageschluessel.findFirst.mockResolvedValue(null) // kein Schlüssel
    prisma.kostenart.findUnique.mockResolvedValue({ bezeichnung: 'Hausmeister' })
    prisma.kostenart.findMany.mockResolvedValue([])

    const result = await pruefVollstaendigkeit(prisma as never, 'zt-1', 'tenant-1')

    // Muss ready: true sein (Warnung ist kein Blocker)
    expect(result.ready).toBe(true)
    const warnung = result.warnings.find((w) => w.code === 'UMLAGESCHLUESSEL_FEHLT')
    expect(warnung).toBeDefined()
    expect(warnung!.message).toContain('Hausmeister')
  })
})
