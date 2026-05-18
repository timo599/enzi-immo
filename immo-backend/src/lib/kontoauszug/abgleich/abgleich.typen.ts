import type { NormalizedTransaction } from '../parser/parser.typen.js'

// Lokaler Typ-Alias (entspricht dem Prisma-Enum Buchungstyp)
export type Buchungstyp =
  | 'miete'
  | 'nk_vorauszahlung'
  | 'miete_und_nk'
  | 'nk_nachzahlung'
  | 'kaution'
  | 'nk_guthaben'
  | 'sonstiges'

/** Mietvertrag-Daten, die die Abgleich-Engine braucht (DB-unabhängig) */
export interface AbgleichVertrag {
  id: string
  tenantId: string
  einheitBezeichnung: string
  nettomiete: number
  nkVorauszahlung: number
  vertragsbeginn: Date
  vertragsende: Date | null
  /** Mieter (Hauptmieter zuerst) */
  mieterNamen: string[]
  /** IBAN des Mieters (aus Mietvertrag oder Mieterdaten) */
  mieterIban: string | null
}

/** Ergebnis für eine einzelne Buchungszeile */
export interface AbgleichErgebnis {
  transaktion: NormalizedTransaction
  transaktionIndex: number
  kandidaten: AbgleichKandidat[]
  besterKandidat: AbgleichKandidat | null
  /** true wenn Konfidenz ≥ 0.90 → auto_matched */
  autoAbgleich: boolean
}

export interface AbgleichKandidat {
  mietvertragId: string
  buchungstyp: Buchungstyp
  konfidenz: number       // 0.000–1.000
  abgleichGrund: AbgleichGrund
  prioritaet: number      // 1–6
}

export type AbgleichGrund =
  | 'iban_treffer'        // Prio 1 – IBAN stimmt überein
  | 'vertragsnummer'      // Prio 2 – Vertragsnummer im Verwendungszweck
  | 'einheit'             // Prio 2 – Einheitsbezeichnung im Verwendungszweck
  | 'betrag_miete'        // Prio 3 – Betrag ≈ Nettomiete, Monat passt
  | 'betrag_nk'           // Prio 4 – Betrag ≈ NK-Vorauszahlung, Monat passt
  | 'betrag_gesamt'       // Prio 5 – Betrag ≈ Nettomiete + NK
  | 'fuzzy_name'          // Prio 6 – Levenshtein ≥ 80% auf Mietername

export const AUTO_ABGLEICH_SCHWELLWERT = 0.90

// Rückwärts-Kompatibilitäts-Aliase (werden vom Repository verwendet)
export type MatchingVertrag = AbgleichVertrag
export type MatchResult = AbgleichErgebnis
export type MatchCandidate = AbgleichKandidat
export const AUTO_MATCH_THRESHOLD = AUTO_ABGLEICH_SCHWELLWERT
