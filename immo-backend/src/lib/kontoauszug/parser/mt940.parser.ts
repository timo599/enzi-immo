/**
 * MT940-Parser
 * Swift MT940 ist ein Bankauszugsformat: Textdatei mit Feldmarkierungen (:60F:, :61:, :86:, :62F:)
 * Diese Funktion ist eine pure function: string → ParseResult
 */

import type { NormalizedTransaction, ParseResult } from './parser.typen.js'

interface Mt940Statement {
  iban: string | null
  anfangssaldo: number | null
  schlusssaldo: number | null
  buchungen: RawMt940Buchung[]
}

interface RawMt940Buchung {
  datum: string        // YYMMDD
  valuta: string       // YYMMDD (optional, fallback = datum)
  betrag: number       // positiv = Gutschrift (C), negativ = Belastung (D)
  referenz: string | null
  verwendungszweck: string | null
  auftraggeberName: string | null
  auftraggeberIban: string | null
  buchungstext: string | null
  _datumParsed?: Date
  _valutaParsed?: Date | null
}

/**
 * Parst einen MT940-String und liefert normalisierte Transaktionen.
 */
export function parseMt940(content: string): ParseResult {
  const stmt = parseStatement(content)
  const transactions = stmt.buchungen.map(buchungToNormalized)

  const daten = transactions.map((t) => t.datum).sort((a, b) => a.getTime() - b.getTime())
  const zeitraumVon = daten[0] ?? new Date()
  const zeitraumBis = daten[daten.length - 1] ?? new Date()

  return {
    transactions,
    zeitraumVon,
    zeitraumBis,
    kontonummer: stmt.iban,
    anfangssaldo: stmt.anfangssaldo,
    schlusssaldo: stmt.schlusssaldo,
    format: 'mt940',
  }
}

// ─── Interne Parsing-Logik ────────────────────────────────────────────────────

function parseStatement(content: string): Mt940Statement {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  const stmt: Mt940Statement = {
    iban: null,
    anfangssaldo: null,
    schlusssaldo: null,
    buchungen: [],
  }

  // Kontonummer aus :25: oder :25P:
  const kontoMatch = normalized.match(/:25P?:\s*([A-Z0-9/\-]+(?:\n[A-Z0-9/\-]+)?)/i)
  if (kontoMatch?.[1]) {
    const raw = kontoMatch[1].replace(/\n/g, '').trim()
    const ibanMatch = raw.match(/([A-Z]{2}\d{2}[A-Z0-9]+)/)
    stmt.iban = ibanMatch?.[1] ?? raw
  }

  // Anfangssaldo :60F: / :60M:
  const anfangMatch = normalized.match(/:60[FM]:[CD](\d{6})[A-Z]{3}([\d,]+)/)
  if (anfangMatch?.[1] && anfangMatch[2]) {
    stmt.anfangssaldo = parseMt940Betrag(anfangMatch[1], anfangMatch[2])
  }

  // Schlusssaldo :62F:
  const schlussMatch = normalized.match(/:62[FM]:[CD](\d{6})[A-Z]{3}([\d,]+)/)
  if (schlussMatch?.[1] && schlussMatch[2]) {
    stmt.schlusssaldo = parseMt940Betrag(schlussMatch[1], schlussMatch[2])
  }

  // Felder extrahieren
  const feldPattern = /(:[\dA-Z]{2,3}:)([\s\S]*?)(?=:[\dA-Z]{2,3}:|$)/g
  const felder: Array<{ tag: string; wert: string }> = []
  let match: RegExpExecArray | null

  while ((match = feldPattern.exec(normalized)) !== null) {
    if (match[1] && match[2] !== undefined) {
      felder.push({ tag: match[1], wert: match[2].trim() })
    }
  }

  for (let i = 0; i < felder.length; i++) {
    const feld = felder[i]
    if (!feld || feld.tag !== ':61:') continue

    const buchung = parseBuchungszeile(feld.wert)
    if (!buchung) continue

    const naechstesFeld = felder[i + 1]
    if (naechstesFeld && naechstesFeld.tag === ':86:') {
      enrichFromFeld86(buchung, naechstesFeld.wert)
    }

    stmt.buchungen.push(buchung)
  }

  return stmt
}

/**
 * Parst :61:-Feld
 * Format: YYMMDD[MMDD]C/D[R]Betrag[N]Code[//Bankreferenz]
 */
function parseBuchungszeile(wert: string): RawMt940Buchung | null {
  const pattern = /^(\d{6})(\d{4})?([CD]R?)(\d{1,12},\d{0,2})/
  const m = wert.match(pattern)
  if (!m) return null

  const datumStr = m[1] ?? ''
  const valutaStr = m[2] ?? null
  const seite = m[3] ?? 'C'
  const betragStr = m[4] ?? '0'

  const betragAbs = parseFloat(betragStr.replace(',', '.'))
  const betrag = seite.startsWith('C') ? betragAbs : -betragAbs
  const datum = parseYYMMDD(datumStr)

  let valutaDatum: Date | null = null
  if (valutaStr) {
    if (valutaStr.length === 4) {
      const mm = valutaStr.substring(0, 2)
      const dd = valutaStr.substring(2, 4)
      const yy = datumStr.substring(0, 2)
      valutaDatum = parseYYMMDD(`${yy}${mm}${dd}`)
    } else {
      valutaDatum = parseYYMMDD(valutaStr)
    }
  }

  let referenz: string | null = null
  const refMatch = wert.match(/\/\/(.+?)(\n|$)/)
  if (refMatch?.[1]) referenz = refMatch[1].trim()

  return {
    datum: datumStr,
    valuta: valutaStr ?? datumStr,
    betrag,
    referenz,
    verwendungszweck: null,
    auftraggeberName: null,
    auftraggeberIban: null,
    buchungstext: null,
    _datumParsed: datum,
    _valutaParsed: valutaDatum,
  }
}

/**
 * :86:-Feld: strukturierte (?NN) oder unstrukturierte Verwendungszweck-Info.
 */
function enrichFromFeld86(buchung: RawMt940Buchung, wert: string): void {
  if (wert.includes('?')) {
    const subfelder: Record<string, string> = {}
    const subfeldPattern = /\?(\d{2})([^?]*)/g
    let m: RegExpExecArray | null
    while ((m = subfeldPattern.exec(wert)) !== null) {
      const code = m[1]
      const val = (m[2] ?? '').replace(/\n/g, '').trim()
      if (!code) continue
      const existing = subfelder[code]
      subfelder[code] = existing ? `${existing} ${val}` : val
    }

    const vzParts: string[] = []
    for (let i = 20; i <= 29; i++) {
      const val = subfelder[String(i).padStart(2, '0')]
      if (val) vzParts.push(val)
    }
    buchung.verwendungszweck = vzParts.join(' ').trim() || null
    buchung.auftraggeberIban = subfelder['31'] ?? null
    const nameParts = [subfelder['32'], subfelder['33']].filter((s): s is string => Boolean(s))
    buchung.auftraggeberName = nameParts.join(' ').trim() || null
    buchung.buchungstext = subfelder['00'] ?? null
  } else {
    const zeilen = wert.split('\n').map((z) => z.trim()).filter(Boolean)
    buchung.buchungstext = zeilen[0] ?? null
    buchung.verwendungszweck = (zeilen.slice(1).join(' ').trim() || zeilen[0]) ?? null
  }
}

function buchungToNormalized(raw: RawMt940Buchung): NormalizedTransaction {
  return {
    datum: raw._datumParsed ?? parseYYMMDD(raw.datum),
    wertstellungsdatum: raw._valutaParsed ?? null,
    betrag: raw.betrag,
    waehrung: 'EUR',
    auftraggeberName: raw.auftraggeberName,
    auftraggeberIban: raw.auftraggeberIban ? normalizeIban(raw.auftraggeberIban) : null,
    verwendungszweck: raw.verwendungszweck,
    buchungstext: raw.buchungstext,
    referenz: raw.referenz,
  }
}

// ─── Hilfs-Funktionen ────────────────────────────────────────────────────────

function parseYYMMDD(s: string): Date {
  const yy = parseInt(s.substring(0, 2), 10)
  const mm = parseInt(s.substring(2, 4), 10) - 1
  const dd = parseInt(s.substring(4, 6), 10)
  const year = yy >= 0 && yy <= 30 ? 2000 + yy : 1900 + yy
  return new Date(year, mm, dd)
}

function parseMt940Betrag(_datumStr: string, betragStr: string): number {
  return parseFloat(betragStr.replace(',', '.'))
}

function normalizeIban(iban: string): string {
  return iban.replace(/\s/g, '').toUpperCase()
}
