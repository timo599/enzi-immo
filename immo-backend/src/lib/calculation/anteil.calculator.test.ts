import { describe, it, expect } from 'vitest'
import {
  daysBetween,
  berechneAnteiligkeit,
  berechneUmlageAnteil,
  berechneVorauszahlung,
} from './anteil.calculator.js'
import type { EinheitDaten, ObjektDaten } from './types.js'

// ─── daysBetween ──────────────────────────────────────────────

describe('daysBetween', () => {
  it('calculates full year 2024 (leap year)', () => {
    const start = new Date('2024-01-01')
    const end   = new Date('2025-01-01')
    expect(daysBetween(start, end)).toBe(366)
  })

  it('calculates full year 2023 (non-leap)', () => {
    const start = new Date('2023-01-01')
    const end   = new Date('2024-01-01')
    expect(daysBetween(start, end)).toBe(365)
  })

  it('returns 0 for same day', () => {
    const d = new Date('2024-06-01')
    expect(daysBetween(d, d)).toBe(0)
  })
})

// ─── berechneAnteiligkeit ──────────────────────────────────────

describe('berechneAnteiligkeit', () => {
  const zeitraumVon = new Date('2024-01-01')
  const zeitraumBis = new Date('2024-12-31')

  it('full year contract = factor 1.0', () => {
    const result = berechneAnteiligkeit(
      { id: 'v1', einheitId: 'e1', mietart: 'wohnraum', vertragsbeginn: new Date('2024-01-01'), vertragsende: null, nettomiete: 800, nkVorauszahlung: 150 },
      zeitraumVon, zeitraumBis,
    )
    expect(result.anteilsfaktor).toBe(1.0)
    expect(result.bewohnungstage).toBe(366)
  })

  it('half-year contract starting July 1', () => {
    const result = berechneAnteiligkeit(
      { id: 'v2', einheitId: 'e1', mietart: 'wohnraum', vertragsbeginn: new Date('2024-07-01'), vertragsende: null, nettomiete: 800, nkVorauszahlung: 150 },
      zeitraumVon, zeitraumBis,
    )
    // 184 days (Jul–Dec in 2024)
    expect(result.bewohnungstage).toBe(184)
    expect(result.anteilsfaktor).toBeCloseTo(184 / 366, 4)
  })

  it('contract ending March 31', () => {
    const result = berechneAnteiligkeit(
      { id: 'v3', einheitId: 'e1', mietart: 'wohnraum', vertragsbeginn: new Date('2024-01-01'), vertragsende: new Date('2024-03-31'), nettomiete: 800, nkVorauszahlung: 150 },
      zeitraumVon, zeitraumBis,
    )
    // Jan(31) + Feb(29) + Mar(31) = 91 days
    expect(result.bewohnungstage).toBe(91)
  })
})

// ─── berechneUmlageAnteil ──────────────────────────────────────

describe('berechneUmlageAnteil', () => {
  const objekt: ObjektDaten = { id: 'o1', wohnflaecheGesamtM2: 580, nutzflaecheGesamtM2: null, meaGesamt: 1000 }
  const einheit: EinheitDaten = { id: 'e1', bezeichnung: 'Whg 1', wohnflaecheM2: 72.5, nutzflaecheM2: null, meaAnteil: 125, personenAnzahl: 2 }
  const einheit2: EinheitDaten = { id: 'e2', bezeichnung: 'Whg 2', wohnflaecheM2: 507.5, nutzflaecheM2: null, meaAnteil: 875, personenAnzahl: 3 }
  const alleEinheiten = [einheit, einheit2]

  it('wohnflaeche: 72.5/580 = 0.125', () => {
    const result = berechneUmlageAnteil(einheit, alleEinheiten, objekt, 'wohnflaeche')
    expect(result.anteilFaktor).toBeCloseTo(72.5 / 580, 4)
    expect(result.warnings).toHaveLength(0)
  })

  it('gleiche_teile: 1/2 = 0.5', () => {
    const result = berechneUmlageAnteil(einheit, alleEinheiten, objekt, 'gleiche_teile')
    expect(result.anteilFaktor).toBe(0.5)
  })

  it('miteigentumsanteile: 125/1000 = 0.125', () => {
    const result = berechneUmlageAnteil(einheit, alleEinheiten, objekt, 'miteigentumsanteile')
    expect(result.anteilFaktor).toBeCloseTo(0.125, 4)
  })

  it('personenanzahl: 2/5 = 0.4', () => {
    const result = berechneUmlageAnteil(einheit, alleEinheiten, objekt, 'personenanzahl')
    expect(result.anteilFaktor).toBeCloseTo(2 / 5, 4)
  })

  it('returns warning + factor 0 when flaeche missing', () => {
    const noflaecheEinheit: EinheitDaten = { ...einheit, wohnflaecheM2: 0 }
    const result = berechneUmlageAnteil(noflaecheEinheit, alleEinheiten, { ...objekt, wohnflaecheGesamtM2: 0 }, 'wohnflaeche')
    expect(result.anteilFaktor).toBe(0)
    expect(result.warnings.length).toBeGreaterThan(0)
  })
})

// ─── berechneVorauszahlung ──────────────────────────────────────

describe('berechneVorauszahlung', () => {
  it('full year (366 days) ≈ 12 × monthly', () => {
    const { gesamt } = berechneVorauszahlung(180, 366)
    // 180 / 30.4375 × 366 ≈ 2164.38 ≈ 12 × 180 = 2160
    expect(gesamt).toBeCloseTo(2164.38, 1)
  })

  it('partial year (91 days = Q1)', () => {
    const { gesamt } = berechneVorauszahlung(180, 91)
    // 180 / 30.4375 × 91 = 537.92
    expect(gesamt).toBeCloseTo(537.92, 1)
  })

  it('zero vorauszahlung', () => {
    expect(berechneVorauszahlung(0, 365).gesamt).toBe(0)
  })
})
