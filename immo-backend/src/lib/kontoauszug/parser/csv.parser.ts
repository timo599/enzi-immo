/**
 * CSV-Parser mit Profil-System für unterschiedliche Bankformate.
 * Pure function: (content: string, profilName: string) → ParseResult
 */

import { parse as csvParse } from 'csv-parse/sync'
import { parse as parseDate } from 'date-fns'
import type { NormalizedTransaction, ParseResult, CsvProfile } from './parser.typen.js'
import { CSV_PROFILES } from './parser.typen.js'

/**
 * Parst eine CSV-Datei anhand eines Bank-Profils.
 * @param content   Dateiinhalt als UTF-8-String (Encoding-Konvertierung obliegt dem Aufrufer)
 * @param profilName z.B. 'sparkasse', 'volksbank', 'dkb', 'ing', 'comdirect', 'generic'
 */
export function parseCsv(
  content: string,
  profilName: string
): ParseResult {
  const profil = CSV_PROFILES[profilName]
  if (!profil) {
    throw new Error(
      `Unbekanntes CSV-Profil: "${profilName}". Gültig: ${Object.keys(CSV_PROFILES).join(', ')}`
    )
  }

  // BOM entfernen
  const cleanContent = content.replace(/^\uFEFF/, '')

  const rows: string[][] | Record<string, string>[] = csvParse(cleanContent, {
    delimiter: profil.delimiter,
    skip_empty_lines: true,
    from_line: profil.skipRows + 1,
    trim: true,
    relaxColumnCount: true,
  })

  const transactions: NormalizedTransaction[] = []

  for (const row of rows) {
    const tx = rowToTransaction(row as string[] | Record<string, string>, profil)
    if (tx) transactions.push(tx)
  }

  const daten = transactions
    .map((t) => t.datum)
    .sort((a, b) => a.getTime() - b.getTime())

  return {
    transactions,
    zeitraumVon: daten[0] ?? new Date(),
    zeitraumBis: daten[daten.length - 1] ?? new Date(),
    kontonummer: null,
    anfangssaldo: null,
    schlusssaldo: null,
    format: 'csv',
  }
}

// ─── Intern ──────────────────────────────────────────────────────────────────

function rowToTransaction(
  row: string[] | Record<string, string>,
  profil: CsvProfile
): NormalizedTransaction | null {
  const get = (col: number | string | undefined): string | null => {
    if (col === undefined || col === null) return null
    if (typeof col === 'number') {
      return (row as string[])[col]?.trim() || null
    }
    return (row as Record<string, string>)[col]?.trim() || null
  }

  const datumRaw = get(profil.columns.datum)
  const betragRaw = get(profil.columns.betrag)

  if (!datumRaw || !betragRaw) return null

  const datum = parseDatum(datumRaw, profil.datumFormat)
  if (!datum) return null

  const betrag = parseBetrag(betragRaw, profil.betragFormat)
  if (betrag === null) return null

  const wertstellungRaw = get(profil.columns.wertstellung)

  return {
    datum,
    wertstellungsdatum: wertstellungRaw
      ? (parseDatum(wertstellungRaw, profil.datumFormat) ?? null)
      : null,
    betrag,
    waehrung: 'EUR',
    auftraggeberName: get(profil.columns.auftraggeberName),
    auftraggeberIban: normalizeIban(get(profil.columns.auftraggeberIban)),
    verwendungszweck: get(profil.columns.verwendungszweck),
    buchungstext: get(profil.columns.buchungstext),
    referenz: get(profil.columns.referenz),
  }
}

function parseDatum(s: string, format: string): Date | null {
  try {
    const d = parseDate(s, format, new Date())
    if (isNaN(d.getTime())) return null
    return d
  } catch {
    return null
  }
}

function parseBetrag(s: string, format: 'de' | 'en'): number | null {
  if (!s) return null
  let normalized: string

  if (format === 'de') {
    // '1.234,56' oder '-1.234,56' oder '1234,56'
    normalized = s.replace(/\./g, '').replace(',', '.').replace(/[^0-9.\-+]/g, '')
  } else {
    // '1234.56' oder '-1234.56'
    normalized = s.replace(/[^0-9.\-+]/g, '')
  }

  const n = parseFloat(normalized)
  return isNaN(n) ? null : n
}

function normalizeIban(s: string | null): string | null {
  if (!s) return null
  const clean = s.replace(/\s/g, '').toUpperCase()
  // IBAN-Pattern: 2 Buchstaben + 2 Ziffern + bis zu 30 alphanumerische Zeichen
  return /^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/.test(clean) ? clean : null
}
