import { describe, it, expect } from 'vitest'
import { abgleichTransaktionen } from './abgleich.engine.js'
import type { AbgleichVertrag } from './abgleich.typen.js'
import type { NormalizedTransaction } from '../parser/parser.typen.js'

// ─── Testdaten ────────────────────────────────────────────────────────────────

const VERTRAG_MUSTER: AbgleichVertrag = {
  id: 'vert-0001-0002-0003-00000004',
  tenantId: 'tenant-1',
  einheitBezeichnung: 'Whg 3 OG links',
  nettomiete: 800.00,
  nkVorauszahlung: 150.00,
  vertragsbeginn: new Date('2023-01-01'),
  vertragsende: null,
  mieterNamen: ['Max Mustermann'],
  mieterIban: 'DE89370400440532013000',
}

const VERTRAG_ZWEITER: AbgleichVertrag = {
  id: 'vert-9999-8888-7777-666655554444',
  tenantId: 'tenant-1',
  einheitBezeichnung: 'Whg 1 EG rechts',
  nettomiete: 650.00,
  nkVorauszahlung: 120.00,
  vertragsbeginn: new Date('2022-06-01'),
  vertragsende: null,
  mieterNamen: ['Anna Schmidt'],
  mieterIban: 'DE75512108001245126199',
}

function buchung(overrides: Partial<NormalizedTransaction> = {}): NormalizedTransaction {
  return {
    datum: new Date('2024-03-04'),
    wertstellungsdatum: null,
    betrag: 800.00,
    waehrung: 'EUR',
    auftraggeberName: null,
    auftraggeberIban: null,
    verwendungszweck: null,
    buchungstext: null,
    referenz: null,
    ...overrides,
  }
}

// ─── Prio 1: IBAN-Treffer ────────────────────────────────────────────────────

describe('Abgleich-Engine – Prio 1: IBAN-Treffer', () => {
  it('erkennt exakten IBAN-Treffer mit Konfidenz 0.95', () => {
    const tx = buchung({ auftraggeberIban: 'DE89370400440532013000' })
    const ergebnisse = abgleichTransaktionen([tx], [VERTRAG_MUSTER])

    const e = ergebnisse[0]!
    expect(e.besterKandidat).not.toBeNull()
    expect(e.besterKandidat!.konfidenz).toBe(0.95)
    expect(e.besterKandidat!.abgleichGrund).toBe('iban_treffer')
    expect(e.besterKandidat!.prioritaet).toBe(1)
    expect(e.besterKandidat!.mietvertragId).toBe(VERTRAG_MUSTER.id)
  })

  it('IBAN-Treffer mit Leerzeichen wird normalisiert (DE89 3704 0044 0532 013000)', () => {
    const tx = buchung({ auftraggeberIban: 'DE89 3704 0044 0532 0130 00' })
    const ergebnisse = abgleichTransaktionen([tx], [VERTRAG_MUSTER])
    expect(ergebnisse[0]!.besterKandidat!.abgleichGrund).toBe('iban_treffer')
  })

  it('Auto-Abgleich wird gesetzt bei IBAN-Treffer (Konfidenz ≥ 0.90)', () => {
    const tx = buchung({ auftraggeberIban: 'DE89370400440532013000' })
    const ergebnisse = abgleichTransaktionen([tx], [VERTRAG_MUSTER])
    expect(ergebnisse[0]!.autoAbgleich).toBe(true)
  })
})

// ─── Prio 2: Verwendungszweck ────────────────────────────────────────────────

describe('Abgleich-Engine – Prio 2: Verwendungszweck', () => {
  it('erkennt Einheitsbezeichnung im Verwendungszweck', () => {
    const tx = buchung({ verwendungszweck: 'Miete Whg 3 OG links März 2024' })
    const ergebnisse = abgleichTransaktionen([tx], [VERTRAG_MUSTER])
    expect(ergebnisse[0]!.besterKandidat!.abgleichGrund).toBe('einheit')
    expect(ergebnisse[0]!.besterKandidat!.konfidenz).toBe(0.75)
  })

  it('Kein Auto-Abgleich bei Verwendungszweck-Treffer (Konfidenz 0.75 < 0.90)', () => {
    const tx = buchung({ verwendungszweck: 'Miete Whg 3 OG links' })
    const ergebnisse = abgleichTransaktionen([tx], [VERTRAG_MUSTER])
    expect(ergebnisse[0]!.autoAbgleich).toBe(false)
  })
})

// ─── Prio 3: Betrag ≈ Nettomiete ─────────────────────────────────────────────

describe('Abgleich-Engine – Prio 3: Betrag ≈ Nettomiete ±2€', () => {
  it('Exakter Betrag ergibt Konfidenz 0.70', () => {
    const tx = buchung({ betrag: 800.00 })
    const ergebnisse = abgleichTransaktionen([tx], [VERTRAG_MUSTER])
    const kandidat = ergebnisse[0]!.kandidaten.find((k) => k.abgleichGrund === 'betrag_miete')
    expect(kandidat).toBeDefined()
    expect(kandidat!.konfidenz).toBe(0.70)
  })

  it('Betrag innerhalb Toleranz (±2€) wird erkannt', () => {
    const tx = buchung({ betrag: 801.99 })
    const ergebnisse = abgleichTransaktionen([tx], [VERTRAG_MUSTER])
    const kandidat = ergebnisse[0]!.kandidaten.find((k) => k.abgleichGrund === 'betrag_miete')
    expect(kandidat).toBeDefined()
  })

  it('Betrag außerhalb Toleranz (>±2€) wird nicht erkannt', () => {
    const tx = buchung({ betrag: 803.00 })
    const ergebnisse = abgleichTransaktionen([tx], [VERTRAG_MUSTER])
    const kandidat = ergebnisse[0]!.kandidaten.find((k) => k.abgleichGrund === 'betrag_miete')
    expect(kandidat).toBeUndefined()
  })
})

// ─── Prio 4: Betrag ≈ NK-Vorauszahlung ───────────────────────────────────────

describe('Abgleich-Engine – Prio 4: Betrag ≈ NK-Vorauszahlung ±2€', () => {
  it('erkennt NK-Vorauszahlung korrekt', () => {
    const tx = buchung({ betrag: 150.00 })
    const ergebnisse = abgleichTransaktionen([tx], [VERTRAG_MUSTER])
    const kandidat = ergebnisse[0]!.kandidaten.find((k) => k.abgleichGrund === 'betrag_nk')
    expect(kandidat).toBeDefined()
    expect(kandidat!.buchungstyp).toBe('nk_vorauszahlung')
    expect(kandidat!.konfidenz).toBe(0.65)
  })
})

// ─── Prio 5: Betrag ≈ Miete + NK ─────────────────────────────────────────────

describe('Abgleich-Engine – Prio 5: Betrag ≈ Nettomiete + NK ±5€', () => {
  it('erkennt Gesamt-Überweisung (Miete + NK)', () => {
    const tx = buchung({ betrag: 950.00 }) // 800 + 150 = 950
    const ergebnisse = abgleichTransaktionen([tx], [VERTRAG_MUSTER])
    const kandidat = ergebnisse[0]!.kandidaten.find((k) => k.abgleichGrund === 'betrag_gesamt')
    expect(kandidat).toBeDefined()
    expect(kandidat!.buchungstyp).toBe('miete_und_nk')
  })
})

// ─── Kein Treffer ────────────────────────────────────────────────────────────

describe('Abgleich-Engine – Kein Treffer', () => {
  it('gibt leere Kandidatenliste zurück wenn kein Vertrag passt', () => {
    const tx = buchung({ betrag: 42.00 }) // passt zu keinem Betrag
    const ergebnisse = abgleichTransaktionen([tx], [VERTRAG_MUSTER])
    expect(ergebnisse[0]!.kandidaten).toHaveLength(0)
    expect(ergebnisse[0]!.besterKandidat).toBeNull()
    expect(ergebnisse[0]!.autoAbgleich).toBe(false)
  })

  it('negative Beträge erzeugen keinen Kandidaten (Ausgang kein Mieteingang)', () => {
    const tx = buchung({ betrag: -800.00 })
    const ergebnisse = abgleichTransaktionen([tx], [VERTRAG_MUSTER])
    expect(ergebnisse[0]!.kandidaten).toHaveLength(0)
  })
})

// ─── Mehrere Kandidaten ───────────────────────────────────────────────────────

describe('Abgleich-Engine – Mehrere Kandidaten', () => {
  it('sortiert Kandidaten nach Priorität aufsteigend', () => {
    // IBAN passt zu Vertrag 1, Betrag passt zu Vertrag 2
    const tx = buchung({
      auftraggeberIban: 'DE89370400440532013000', // → VERTRAG_MUSTER Prio 1
      betrag: 650.00,                              // → VERTRAG_ZWEITER Prio 3
    })
    const ergebnisse = abgleichTransaktionen([tx], [VERTRAG_MUSTER, VERTRAG_ZWEITER])

    const kandidaten = ergebnisse[0]!.kandidaten
    expect(kandidaten.length).toBeGreaterThan(1)

    // Bester Kandidat muss Prio 1 sein (IBAN)
    expect(ergebnisse[0]!.besterKandidat!.prioritaet).toBe(1)
    expect(ergebnisse[0]!.besterKandidat!.mietvertragId).toBe(VERTRAG_MUSTER.id)
  })

  it('Auto-Abgleich nur wenn bester Kandidat ≥ 0.90 Konfidenz', () => {
    // Nur Betrag-Treffer (Prio 3, Konfidenz 0.70) → kein Auto-Abgleich
    const tx = buchung({ betrag: 800.00 })
    const ergebnisse = abgleichTransaktionen([tx], [VERTRAG_MUSTER])
    expect(ergebnisse[0]!.autoAbgleich).toBe(false)
  })
})

// ─── Mehrere Transaktionen ────────────────────────────────────────────────────

describe('Abgleich-Engine – Batch-Verarbeitung', () => {
  it('verarbeitet mehrere Transaktionen unabhängig', () => {
    const tx1 = buchung({ auftraggeberIban: 'DE89370400440532013000', betrag: 800 })
    const tx2 = buchung({ betrag: 42 }) // kein Treffer
    const tx3 = buchung({ auftraggeberIban: 'DE75512108001245126199', betrag: 650 })

    const ergebnisse = abgleichTransaktionen([tx1, tx2, tx3], [VERTRAG_MUSTER, VERTRAG_ZWEITER])

    expect(ergebnisse).toHaveLength(3)
    expect(ergebnisse[0]!.autoAbgleich).toBe(true)  // IBAN-Treffer
    expect(ergebnisse[1]!.besterKandidat).toBeNull() // kein Treffer
    expect(ergebnisse[2]!.autoAbgleich).toBe(true)  // IBAN-Treffer Vertrag 2
  })

  it('Index entspricht dem Index in der Eingabeliste', () => {
    const transaktionen = [buchung({ betrag: 1 }), buchung({ betrag: 2 }), buchung({ betrag: 3 })]
    const ergebnisse = abgleichTransaktionen(transaktionen, [VERTRAG_MUSTER])
    ergebnisse.forEach((e, i) => {
      expect(e.transaktionIndex).toBe(i)
    })
  })
})
