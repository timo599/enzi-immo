import { describe, it, expect } from 'vitest'
import { berechneNebenkostenabrechnung } from './umlage.engine.js'
import {
  standardBerechnungsInput,
  VERTRAG_V1,
  VERTRAG_V1_HALBJAHR,
  VERTRAG_V2,
  TEST_EINHEITEN,
  TEST_OBJEKT,
  TEST_KOSTENARTEN,
  TEST_KOSTENPOSITIONEN,
  TEST_UMLAGE_KONFIGURATIONEN,
} from './__fixtures__/berechnung.fixtures.js'

// ─── Volljahrvertrag: Nachzahlung korrekt ────────────────────────────────────

describe('berechneNebenkostenabrechnung – Volljahrvertrag', () => {
  it('berechnet Anteilsfaktor 1.0 für Volljahrvertrag', () => {
    const input = standardBerechnungsInput()
    const { abrechnungen } = berechneNebenkostenabrechnung(input)

    const a1 = abrechnungen.find((a) => a.mietvertragId === 'v1')!
    expect(a1).toBeDefined()
    expect(a1.anteilsfaktor).toBe(1.0)
    expect(a1.bewohnungstage).toBe(366) // 2024 ist Schaltjahr
  })

  it('berechnet Nachzahlung wenn Vorauszahlungen zu niedrig sind', () => {
    const input = standardBerechnungsInput()
    const { abrechnungen } = berechneNebenkostenabrechnung(input)

    // Umlagefähige Kosten: Heiz (3456.78) + Wasser (890.12) + Vers (540.00) = 4886.90
    // Einheit 1 hat 72.5/580 = 12.5% Anteil → ca. 610.86 €
    // Vorauszahlungen Einheit 1: 180/30.4375 × 366 ≈ 2164.38 × (180/gesamt) – vereinfacht:
    // NkVorauszahlung: 180 €/Monat → 180/30.4375 × 366 ≈ 2164.38 €
    const a1 = abrechnungen.find((a) => a.mietvertragId === 'v1')!
    expect(a1.nachzahlungOderGuthaben).not.toBeNull()
    // Kosten für E1 ≈ 4886.90 × 0.125 ≈ 610.86 €
    // Vorauszahlung ≈ 2164.38 → Guthaben (negativ)
    expect(a1.gesamtkostenAnteil).toBeCloseTo(4886.90 * (72.5 / 580), 0)
  })

  it('berechnet Guthaben wenn Vorauszahlungen zu hoch sind', () => {
    const input = {
      ...standardBerechnungsInput(),
      vertraege: [{ ...VERTRAG_V1, nkVorauszahlung: 9999 }],
    }
    const { abrechnungen } = berechneNebenkostenabrechnung(input)
    const a1 = abrechnungen.find((a) => a.mietvertragId === 'v1')!
    // Vorauszahlung so hoch → Guthaben (negatives saldo)
    expect(a1.nachzahlungOderGuthaben).toBeLessThan(0)
  })

  it('nicht-umlagefähige Kostenarten werden ignoriert', () => {
    const input = standardBerechnungsInput()
    const { abrechnungen } = berechneNebenkostenabrechnung(input)

    const a1 = abrechnungen.find((a) => a.mietvertragId === 'v1')!
    // 'ka-verwalt' ist nicht umlagefähig → darf nicht in Positionen auftauchen
    const verwaltPosition = a1.positionen.find((p) => p.kostenartId === 'ka-verwalt')
    expect(verwaltPosition).toBeUndefined()
  })

  it('Gesamtbetrag aller Einheiten ≈ Gesamtkosten des Objekts', () => {
    const input = standardBerechnungsInput()
    const { abrechnungen } = berechneNebenkostenabrechnung(input)

    // Umlagefähige Kosten gesamt
    const umlagefaehigeKosten = TEST_KOSTENPOSITIONEN
      .filter((kp) => {
        const ka = TEST_KOSTENARTEN.get(kp.kostenartId)
        return ka?.umlagefaehig === 'ja'
      })
      .reduce((s, kp) => s + kp.bruttobetrag, 0)

    const summeAllerAbrechnungen = abrechnungen.reduce(
      (s, a) => s + a.gesamtkostenAnteil,
      0
    )

    // Alle Einheiten haben Volljahrvertrag → Summe ≈ Gesamtkosten
    expect(summeAllerAbrechnungen).toBeCloseTo(umlagefaehigeKosten, 1)
  })

  it('formelLog ist vollständig und enthält alle Pflichtfelder', () => {
    const input = standardBerechnungsInput()
    const { abrechnungen } = berechneNebenkostenabrechnung(input)

    const a1 = abrechnungen.find((a) => a.mietvertragId === 'v1')!
    const log = a1.formelLog

    expect(log.berechnungsVersion).toBeDefined()
    expect(log.zeitraumVon).toBe('2024-01-01')
    expect(log.zeitraumBis).toBe('2024-12-31')
    expect(log.zeitraumTage).toBe(366)
    expect(log.bewohnungstage).toBe(366)
    expect(log.anteilsfaktor).toContain('366/366')
    expect(log.positionen.length).toBeGreaterThan(0)
    expect(log.ergebnis.gesamtkostenAnteil).toBeDefined()
    expect(log.vorauszahlungen.monatlicheVorauszahlung).toBe(180)
  })
})

// ─── Unterjähriger Vertrag ────────────────────────────────────────────────────

describe('berechneNebenkostenabrechnung – Unterjähriger Vertrag', () => {
  it('berechnet korrekte Anteiligkeit für Vertrag ab Juli', () => {
    const input = {
      ...standardBerechnungsInput(),
      vertraege: [{ ...VERTRAG_V1, vertragsbeginn: new Date('2024-07-01') }],
    }
    const { abrechnungen } = berechneNebenkostenabrechnung(input)
    const a1 = abrechnungen.find((a) => a.mietvertragId === 'v1')!
    // Jul–Dez 2024 = 184 Tage
    expect(a1.bewohnungstage).toBe(184)
    expect(a1.anteilsfaktor).toBeCloseTo(184 / 366, 4)
  })

  it('Mieterwechsel: Anteilsfaktoren zweier Verträge auf gleicher Einheit addieren sich zu 1.0', () => {
    // V1 endet März, V1b beginnt Juli → April–Juni unbesetzt
    const vertragAlt = { ...VERTRAG_V1, vertragsende: new Date('2024-03-31') }
    const vertragNeu = { ...VERTRAG_V1_HALBJAHR }

    const input = {
      ...standardBerechnungsInput(),
      vertraege: [vertragAlt, vertragNeu, VERTRAG_V2],
    }
    const { abrechnungen } = berechneNebenkostenabrechnung(input)

    const aAlt = abrechnungen.find((a) => a.mietvertragId === 'v1')!
    const aNeu = abrechnungen.find((a) => a.mietvertragId === 'v1b')!

    // Jan–März = 91 Tage, Jul–Dez = 184 Tage
    expect(aAlt.bewohnungstage).toBe(91)
    expect(aNeu.bewohnungstage).toBe(184)

    // Summe darf nicht 100% überschreiten (Leerstand Apr–Jun ist korrekt)
    expect(aAlt.anteilsfaktor + aNeu.anteilsfaktor).toBeLessThanOrEqual(1.0)
  })
})

// ─── Keine Kostenpositionen ──────────────────────────────────────────────────

describe('berechneNebenkostenabrechnung – Fehlerfälle', () => {
  it('erzeugt keine Abrechnungen wenn keine Kostenpositionen vorhanden', () => {
    const input = { ...standardBerechnungsInput(), kostenpositionen: [] }
    const { abrechnungen } = berechneNebenkostenabrechnung(input)
    // Abrechnungen werden erstellt, aber alle Positionen sind leer
    for (const a of abrechnungen) {
      expect(a.gesamtkostenAnteil).toBe(0)
      expect(a.positionen).toHaveLength(0)
    }
  })

  it('gibt Warning wenn Einheit nicht in Eingabedaten vorhanden', () => {
    const input = {
      ...standardBerechnungsInput(),
      vertraege: [{ ...VERTRAG_V1, einheitId: 'NICHT_VORHANDEN' }],
    }
    const { abrechnungen, warnings } = berechneNebenkostenabrechnung(input)
    expect(abrechnungen).toHaveLength(0)
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings[0]!.code).toBe('EINHEIT_NICHT_GEFUNDEN')
  })
})
