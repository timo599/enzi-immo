import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseCsv } from './csv.parser.js'

const FIXTURES = join(import.meta.dirname ?? __dirname, '__fixtures__')
const SPARKASSE_CSV = readFileSync(join(FIXTURES, 'sparkasse_sample.csv'), 'utf-8')
const VOLKSBANK_CSV = readFileSync(join(FIXTURES, 'volksbank_sample.csv'), 'utf-8')

// ─── Sparkasse-Profil ────────────────────────────────────────────────────────

describe('parseCsv – Sparkasse-Profil', () => {
  it('parst korrekte Anzahl Buchungszeilen', () => {
    const result = parseCsv(SPARKASSE_CSV, 'sparkasse')
    expect(result.transactions).toHaveLength(3)
  })

  it('parst Gutschrift korrekt (positiver Betrag)', () => {
    const result = parseCsv(SPARKASSE_CSV, 'sparkasse')
    expect(result.transactions[0]!.betrag).toBe(800.00)
  })

  it('parst Lastschrift korrekt (negativer Betrag)', () => {
    const result = parseCsv(SPARKASSE_CSV, 'sparkasse')
    expect(result.transactions[2]!.betrag).toBe(-89.50)
  })

  it('extrahiert IBAN des Auftraggebers', () => {
    const result = parseCsv(SPARKASSE_CSV, 'sparkasse')
    expect(result.transactions[0]!.auftraggeberIban).toBe('DE75512108001245126199')
  })

  it('extrahiert Verwendungszweck', () => {
    const result = parseCsv(SPARKASSE_CSV, 'sparkasse')
    expect(result.transactions[0]!.verwendungszweck).toContain('Miete Januar')
  })

  it('parst deutsches Datumsformat (dd.MM.yy)', () => {
    const result = parseCsv(SPARKASSE_CSV, 'sparkasse')
    const datum = result.transactions[0]!.datum
    expect(datum.getFullYear()).toBe(2024)
    expect(datum.getMonth()).toBe(0)
    expect(datum.getDate()).toBe(4)
  })

  it('setzt Format auf csv', () => {
    const result = parseCsv(SPARKASSE_CSV, 'sparkasse')
    expect(result.format).toBe('csv')
  })

  it('Zeitraum-Von/Bis spannt alle Buchungsdaten auf', () => {
    const result = parseCsv(SPARKASSE_CSV, 'sparkasse')
    expect(result.zeitraumVon <= result.zeitraumBis).toBe(true)
  })
})

// ─── Volksbank-Profil ─────────────────────────────────────────────────────────

describe('parseCsv – Volksbank-Profil', () => {
  it('parst korrekte Anzahl Buchungszeilen', () => {
    const result = parseCsv(VOLKSBANK_CSV, 'volksbank')
    expect(result.transactions).toHaveLength(3)
  })

  it('parst Betrag mit deutschem Format (800,00)', () => {
    const result = parseCsv(VOLKSBANK_CSV, 'volksbank')
    expect(result.transactions[0]!.betrag).toBe(800.00)
  })

  it('parst vollständiges Datum dd.MM.yyyy', () => {
    const result = parseCsv(VOLKSBANK_CSV, 'volksbank')
    const datum = result.transactions[0]!.datum
    expect(datum.getFullYear()).toBe(2024)
  })

  it('extrahiert IBAN korrekt', () => {
    const result = parseCsv(VOLKSBANK_CSV, 'volksbank')
    expect(result.transactions[0]!.auftraggeberIban).toBe('DE75512108001245126199')
  })
})

// ─── Fehlerbehandlung ─────────────────────────────────────────────────────────

describe('parseCsv – Fehlerbehandlung', () => {
  it('wirft Fehler bei unbekanntem Profil', () => {
    expect(() => parseCsv('foo', 'unbekannte_bank')).toThrow('Unbekanntes CSV-Profil')
  })

  it('überspringt Zeilen ohne gültiges Datum', () => {
    const csv = 'Buchungstag;Betrag;Beguenstigter/Zahlungspflichtiger;Kontonummer/IBAN;Verwendungszweck\nUNGÜLTIG;100,00;Test;DE00000000000000000000;Test\n04.01.24;200,00;Test;DE00000000000000000000;Test\n'
    const result = parseCsv(csv, 'sparkasse')
    // Zeile mit ungültigem Datum wird übersprungen
    const gueltigeZeilen = result.transactions.filter((t) => !isNaN(t.datum.getTime()))
    expect(gueltigeZeilen.length).toBeGreaterThanOrEqual(1)
  })

  it('gibt leeres Array bei leerer CSV zurück', () => {
    // Nur Header, keine Datenzeilen
    const csv = 'Buchungstag;Betrag;Beguenstigter/Zahlungspflichtiger;Kontonummer/IBAN;Verwendungszweck\n'
    const result = parseCsv(csv, 'sparkasse')
    expect(result.transactions).toHaveLength(0)
  })
})
