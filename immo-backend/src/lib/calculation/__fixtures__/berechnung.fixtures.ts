/**
 * Testdaten für Berechnungsengine-Tests.
 * Reales Szenario: 2-Einheiten-Haus, Jahresabrechnung 2024.
 */

import type { BerechnungsInput } from '../types.js'

export const STANDARD_ZEITRAUM = {
  von: new Date('2024-01-01'),
  bis: new Date('2024-12-31'),
}

export const TEST_OBJEKT = {
  id: 'o1',
  wohnflaecheGesamtM2: 580.0,
  nutzflaecheGesamtM2: null,
  meaGesamt: 1000,
}

export const TEST_EINHEITEN = [
  {
    id: 'e1',
    bezeichnung: 'Whg 1 EG links',
    wohnflaecheM2: 72.5,
    nutzflaecheM2: null,
    meaAnteil: 125,
    personenAnzahl: 2,
  },
  {
    id: 'e2',
    bezeichnung: 'Whg 2 OG rechts',
    wohnflaecheM2: 507.5,
    nutzflaecheM2: null,
    meaAnteil: 875,
    personenAnzahl: 3,
  },
]

// Vertrag für Einheit 1 – Volljahrvertrag
export const VERTRAG_V1 = {
  id: 'v1',
  einheitId: 'e1',
  mietart: 'wohnraum' as const,
  vertragsbeginn: new Date('2024-01-01'),
  vertragsende: null,
  nettomiete: 650,
  nkVorauszahlung: 180,
}

// Vertrag für Einheit 2 – Volljahrvertrag
export const VERTRAG_V2 = {
  id: 'v2',
  einheitId: 'e2',
  mietart: 'wohnraum' as const,
  vertragsbeginn: new Date('2024-01-01'),
  vertragsende: null,
  nettomiete: 1100,
  nkVorauszahlung: 280,
}

// Vertrag für Einheit 1 – nur 2. Halbjahr (Mieterwechsel-Szenario)
export const VERTRAG_V1_HALBJAHR = {
  id: 'v1b',
  einheitId: 'e1',
  mietart: 'wohnraum' as const,
  vertragsbeginn: new Date('2024-07-01'),
  vertragsende: null,
  nettomiete: 680,
  nkVorauszahlung: 185,
}

export const TEST_KOSTENARTEN = new Map([
  ['ka-heiz', {
    id: 'ka-heiz',
    kuerzel: 'HEIZ',
    bezeichnung: 'Heizkosten',
    umlagefaehig: 'ja' as const,
    heizkvRelevant: true,
  }],
  ['ka-wasser', {
    id: 'ka-wasser',
    kuerzel: 'WASS',
    bezeichnung: 'Wasser/Abwasser',
    umlagefaehig: 'ja' as const,
    heizkvRelevant: false,
  }],
  ['ka-vers', {
    id: 'ka-vers',
    kuerzel: 'VERS',
    bezeichnung: 'Versicherung',
    umlagefaehig: 'ja' as const,
    heizkvRelevant: false,
  }],
  ['ka-verwalt', {
    id: 'ka-verwalt',
    kuerzel: 'VERW',
    bezeichnung: 'Verwaltung',
    umlagefaehig: 'nein' as const,  // NICHT umlagefähig
    heizkvRelevant: false,
  }],
])

export const TEST_KOSTENPOSITIONEN = [
  { id: 'kp1', kostenartId: 'ka-heiz',   bruttobetrag: 3456.78 },
  { id: 'kp2', kostenartId: 'ka-wasser', bruttobetrag:  890.12 },
  { id: 'kp3', kostenartId: 'ka-vers',   bruttobetrag:  540.00 },
  { id: 'kp4', kostenartId: 'ka-verwalt', bruttobetrag: 1200.00 }, // nicht umlagefähig
]

export const TEST_UMLAGE_KONFIGURATIONEN = new Map([
  ['ka-heiz',   { schluesselTyp: 'wohnflaeche' as const, verbrauchsanteilPct: null, flaechenanteilPct: null, heizkvGeprueft: false }],
  ['ka-wasser', { schluesselTyp: 'wohnflaeche' as const, verbrauchsanteilPct: null, flaechenanteilPct: null, heizkvGeprueft: false }],
  ['ka-vers',   { schluesselTyp: 'wohnflaeche' as const, verbrauchsanteilPct: null, flaechenanteilPct: null, heizkvGeprueft: false }],
])

/** Fertige BerechnungsInput für Standard-Volljahrtest */
export function standardBerechnungsInput(): BerechnungsInput {
  return {
    zeitraumVon: STANDARD_ZEITRAUM.von,
    zeitraumBis: STANDARD_ZEITRAUM.bis,
    objekt: TEST_OBJEKT,
    einheiten: TEST_EINHEITEN,
    vertraege: [VERTRAG_V1, VERTRAG_V2],
    kostenarten: TEST_KOSTENARTEN,
    kostenpositionen: TEST_KOSTENPOSITIONEN,
    umlageKonfigurationen: TEST_UMLAGE_KONFIGURATIONEN,
    verbrauchsdaten: new Map(),
  }
}
