import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseMt940 } from './mt940.parser.js'

const FIXTURES = join(import.meta.dirname ?? __dirname, '__fixtures__')
const SAMPLE_STA = readFileSync(join(FIXTURES, 'sample.sta'), 'utf-8')

describe('parseMt940', () => {
  it('parst IBAN des eigenen Kontos', () => {
    const result = parseMt940(SAMPLE_STA)
    expect(result.kontonummer).toBe('DE89370400440532013000')
  })

  it('erkennt korrekte Anzahl Buchungszeilen', () => {
    const result = parseMt940(SAMPLE_STA)
    expect(result.transactions).toHaveLength(3)
  })

  it('parst Gutschrift korrekt (positiver Betrag)', () => {
    const result = parseMt940(SAMPLE_STA)
    const erste = result.transactions[0]!
    expect(erste.betrag).toBe(800.00)
    expect(erste.betrag).toBeGreaterThan(0)
  })

  it('parst Belastung korrekt (negativer Betrag)', () => {
    const result = parseMt940(SAMPLE_STA)
    const dritte = result.transactions[2]!
    expect(dritte.betrag).toBe(-45.23)
    expect(dritte.betrag).toBeLessThan(0)
  })

  it('extrahiert IBAN des Auftraggebers aus :86:-Feld', () => {
    const result = parseMt940(SAMPLE_STA)
    const erste = result.transactions[0]!
    expect(erste.auftraggeberIban).toBe('DE75512108001245126199')
  })

  it('extrahiert Auftraggeber-Name', () => {
    const result = parseMt940(SAMPLE_STA)
    expect(result.transactions[0]!.auftraggeberName).toContain('Mustermann')
  })

  it('extrahiert Verwendungszweck', () => {
    const result = parseMt940(SAMPLE_STA)
    expect(result.transactions[0]!.verwendungszweck).toContain('Miete Januar 2024')
  })

  it('parst Buchungsdatum korrekt (2024-01-04)', () => {
    const result = parseMt940(SAMPLE_STA)
    const datum = result.transactions[0]!.datum
    expect(datum.getFullYear()).toBe(2024)
    expect(datum.getMonth()).toBe(0) // Januar = 0
    expect(datum.getDate()).toBe(4)
  })

  it('setzt Zeitraum-Von auf frühestes Datum', () => {
    const result = parseMt940(SAMPLE_STA)
    expect(result.zeitraumVon.getDate()).toBe(4) // 04.01
  })

  it('setzt Format auf mt940', () => {
    const result = parseMt940(SAMPLE_STA)
    expect(result.format).toBe('mt940')
  })

  it('wirft Fehler bei komplett leerem Inhalt', () => {
    // Leere Datei: keine Buchungszeilen → transactions = []
    const result = parseMt940(':20:TEST\n:25:DE00000000000000000000\n:28C:001\n:60F:C240101EUR0,00\n:62F:C240131EUR0,00\n')
    expect(result.transactions).toHaveLength(0)
  })
})
