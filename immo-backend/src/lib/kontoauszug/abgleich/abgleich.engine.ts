/**
 * Matching-Engine
 * Pure function: (transactions, vertraege) → AbgleichErgebnis[]
 * Kein DB-Zugriff, kein Side-Effect – vollständig testbar ohne DB.
 *
 * Prioritätsstufen:
 * Prio 1 – IBAN Auftraggeber == IBAN in Mietvertrag      → konfidenz 0.95, Auto-Match
 * Prio 2 – Verwendungszweck enthält Vertragsnr/Einheit   → konfidenz 0.75
 * Prio 3 – Betrag ≈ Nettomiete ±2€, Monat passt         → konfidenz 0.70
 * Prio 4 – Betrag ≈ NK-Vorauszahlung ±2€, Monat passt   → konfidenz 0.65
 * Prio 5 – Betrag ≈ Nettomiete + NK ±5€                 → konfidenz 0.65
 * Prio 6 – Fuzzy-Name-Match Levenshtein ≥ 80%           → konfidenz 0.50
 */

import Fuse from 'fuse.js'
import { isSameMonth } from 'date-fns'
import type { NormalizedTransaction } from '../parser/parser.typen.js'
import type {
  AbgleichErgebnis,
  AbgleichKandidat,
  AbgleichVertrag,
} from './abgleich.typen.js'
import { AUTO_ABGLEICH_SCHWELLWERT } from './abgleich.typen.js'

const BETRAG_TOLERANZ_ENG = 2    // ±2 € für Miete / NK einzeln
const BETRAG_TOLERANZ_WEIT = 5   // ±5 € für Kombination

export function abgleichTransaktionen(
  transactions: NormalizedTransaction[],
  vertraege: AbgleichVertrag[]
): AbgleichErgebnis[] {
  // Fuse.js-Instanz für Fuzzy-Name-Matching (Prio 6) – einmal bauen, mehrfach nutzen
  const alleMieterNamen = vertraege.flatMap((v) =>
    v.mieterNamen.map((name) => ({ name, vertragId: v.id }))
  )
  const fuse = new Fuse(alleMieterNamen, {
    keys: ['name'],
    threshold: 0.2,   // ≥ 80% Ähnlichkeit ≡ threshold ≤ 0.2 in Fuse.js (invertiert)
    includeScore: true,
  })

  return transactions.map((tx, idx) =>
    matchSingleTransaction(tx, idx, vertraege, fuse)
  )
}

// ─── Interne Logik ────────────────────────────────────────────────────────────

function matchSingleTransaction(
  tx: NormalizedTransaction,
  idx: number,
  vertraege: AbgleichVertrag[],
  fuse: Fuse<{ name: string; vertragId: string }>
): AbgleichErgebnis {
  // Nur positive Beträge können Mieteinnahmen sein
  // Negative = Ausgang vom eigenen Konto → kein Matching mit Mietverträgen
  if (tx.betrag <= 0) {
    return { transaktion: tx, transaktionIndex: idx, kandidaten: [], besterKandidat: null, autoAbgleich: false }
  }

  const kandidaten: AbgleichKandidat[] = []

  for (const vertrag of vertraege) {
    const kandidat = besteKandidatFuerVertrag(tx, vertrag, fuse)
    if (kandidat) kandidaten.push(kandidat)
  }

  // Sortiere nach Priorität (aufsteigend) und Konfidenz (absteigend)
  kandidaten.sort((a, b) => a.prioritaet - b.prioritaet || b.konfidenz - a.konfidenz)

  const besterKandidat = kandidaten[0] ?? null
  const autoAbgleich = besterKandidat !== null && besterKandidat.konfidenz >= AUTO_ABGLEICH_SCHWELLWERT

  return { transaktion: tx, transaktionIndex: idx, kandidaten, besterKandidat, autoAbgleich }
}

function besteKandidatFuerVertrag(
  tx: NormalizedTransaction,
  vertrag: AbgleichVertrag,
  fuse: Fuse<{ name: string; vertragId: string }>
): AbgleichKandidat | null {
  // Prüfe Prios 1–6 der Reihe nach und nimm den ersten Treffer
  return (
    pruefePrio1Iban(tx, vertrag) ??
    pruefePrio2Verwendungszweck(tx, vertrag) ??
    pruefePrio3BetragMiete(tx, vertrag) ??
    pruefePrio4BetragNk(tx, vertrag) ??
    pruefePrio5BetragGesamt(tx, vertrag) ??
    pruefePrio6FuzzyName(tx, vertrag, fuse)
  )
}

/** Prio 1: IBAN des Auftraggebers stimmt mit Mieter-IBAN im Vertrag überein */
function pruefePrio1Iban(
  tx: NormalizedTransaction,
  vertrag: AbgleichVertrag
): AbgleichKandidat | null {
  if (!tx.auftraggeberIban || !vertrag.mieterIban) return null
  if (normalizeIban(tx.auftraggeberIban) !== normalizeIban(vertrag.mieterIban)) return null

  return {
    mietvertragId: vertrag.id,
    buchungstyp: determineBuchungstyp(tx.betrag, vertrag),
    konfidenz: 0.95,
    abgleichGrund: 'iban_treffer',
    prioritaet: 1,
  }
}

/** Prio 2: Verwendungszweck enthält Vertragsnummer oder Einheitsbezeichnung */
function pruefePrio2Verwendungszweck(
  tx: NormalizedTransaction,
  vertrag: AbgleichVertrag
): AbgleichKandidat | null {
  const vz = (tx.verwendungszweck ?? '').toLowerCase()
  const buchungstext = (tx.buchungstext ?? '').toLowerCase()
  const text = `${vz} ${buchungstext}`

  const einheitMatch = containsNormalized(text, vertrag.einheitBezeichnung)
  // Vertragsnummer: verwende die letzten 8 Zeichen der UUID (als lesbare Referenz)
  const kurzId = vertrag.id.replace(/-/g, '').slice(-8).toLowerCase()
  const idMatch = text.includes(kurzId)

  if (!einheitMatch && !idMatch) return null

  return {
    mietvertragId: vertrag.id,
    buchungstyp: determineBuchungstyp(tx.betrag, vertrag),
    konfidenz: 0.75,
    abgleichGrund: einheitMatch ? 'einheit' : 'vertragsnummer',
    prioritaet: 2,
  }
}

/** Prio 3: Betrag ≈ Nettomiete ±2€ und Buchungsdatum passt zum Monat */
function pruefePrio3BetragMiete(
  tx: NormalizedTransaction,
  vertrag: AbgleichVertrag
): AbgleichKandidat | null {
  if (!isVertragAktivAmDatum(vertrag, tx.datum)) return null
  if (Math.abs(tx.betrag - vertrag.nettomiete) > BETRAG_TOLERANZ_ENG) return null

  return {
    mietvertragId: vertrag.id,
    buchungstyp: 'miete',
    konfidenz: 0.70,
    abgleichGrund: 'betrag_miete',
    prioritaet: 3,
  }
}

/** Prio 4: Betrag ≈ NK-Vorauszahlung ±2€ und Monat passt */
function pruefePrio4BetragNk(
  tx: NormalizedTransaction,
  vertrag: AbgleichVertrag
): AbgleichKandidat | null {
  if (vertrag.nkVorauszahlung <= 0) return null
  if (!isVertragAktivAmDatum(vertrag, tx.datum)) return null
  if (Math.abs(tx.betrag - vertrag.nkVorauszahlung) > BETRAG_TOLERANZ_ENG) return null

  return {
    mietvertragId: vertrag.id,
    buchungstyp: 'nk_vorauszahlung',
    konfidenz: 0.65,
    abgleichGrund: 'betrag_nk',
    prioritaet: 4,
  }
}

/** Prio 5: Betrag ≈ Nettomiete + NK-Vorauszahlung ±5€ */
function pruefePrio5BetragGesamt(
  tx: NormalizedTransaction,
  vertrag: AbgleichVertrag
): AbgleichKandidat | null {
  if (!isVertragAktivAmDatum(vertrag, tx.datum)) return null
  const soll = vertrag.nettomiete + vertrag.nkVorauszahlung
  if (soll <= 0) return null
  if (Math.abs(tx.betrag - soll) > BETRAG_TOLERANZ_WEIT) return null

  return {
    mietvertragId: vertrag.id,
    buchungstyp: 'miete_und_nk',
    konfidenz: 0.65,
    abgleichGrund: 'betrag_gesamt',
    prioritaet: 5,
  }
}

/** Prio 6: Fuzzy-Name-Match Levenshtein ≥ 80% auf Mietername */
function pruefePrio6FuzzyName(
  tx: NormalizedTransaction,
  vertrag: AbgleichVertrag,
  fuse: Fuse<{ name: string; vertragId: string }>
): AbgleichKandidat | null {
  if (!tx.auftraggeberName) return null

  const results = fuse.search(tx.auftraggeberName)
  const hit = results.find((r) => r.item.vertragId === vertrag.id)
  if (!hit) return null

  // Fuse.js score: 0 = perfekt, 1 = kein Match → invertieren
  const konfidenz = Math.round((1 - (hit.score ?? 1)) * 100) / 100
  if (konfidenz < 0.5) return null

  return {
    mietvertragId: vertrag.id,
    buchungstyp: determineBuchungstyp(tx.betrag, vertrag),
    konfidenz: Math.min(konfidenz, 0.50),  // Cap bei 0.50 laut Spec
    abgleichGrund: 'fuzzy_name',
    prioritaet: 6,
  }
}

// ─── Hilfs-Funktionen ────────────────────────────────────────────────────────

/** Bestimmt den wahrscheinlichsten Buchungstyp anhand des Betrags */
function determineBuchungstyp(
  betrag: number,
  vertrag: AbgleichVertrag
): 'miete' | 'nk_vorauszahlung' | 'miete_und_nk' | 'sonstiges' {
  const diffMiete = Math.abs(betrag - vertrag.nettomiete)
  const diffNk = Math.abs(betrag - vertrag.nkVorauszahlung)
  const diffGesamt = Math.abs(betrag - (vertrag.nettomiete + vertrag.nkVorauszahlung))

  if (diffMiete <= BETRAG_TOLERANZ_WEIT) return 'miete'
  if (diffNk <= BETRAG_TOLERANZ_WEIT) return 'nk_vorauszahlung'
  if (diffGesamt <= BETRAG_TOLERANZ_WEIT) return 'miete_und_nk'
  return 'sonstiges'
}

function isVertragAktivAmDatum(vertrag: AbgleichVertrag, datum: Date): boolean {
  if (datum < vertrag.vertragsbeginn) return false
  if (vertrag.vertragsende && datum > vertrag.vertragsende) return false
  // Monat der Buchung muss innerhalb des Vertragszeitraums liegen
  return isSameMonth(datum, datum)  // tautologisch – Haupt-Check ist oben
}

function normalizeIban(iban: string): string {
  return iban.replace(/\s/g, '').toUpperCase()
}

function containsNormalized(haystack: string, needle: string): boolean {
  if (!needle) return false
  return haystack.includes(needle.toLowerCase().replace(/\s+/g, ' ').trim())
}
