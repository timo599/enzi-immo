/**
 * Einheitliches Format nach Parser-Durchlauf.
 * Alle Parser (MT940, CSV) liefern diesen Typ zurück.
 * Parser sind pure functions: string → NormalizedTransaction[]
 */
export interface NormalizedTransaction {
  datum: Date
  wertstellungsdatum: Date | null
  betrag: number            // positiv = Eingang, negativ = Ausgang
  waehrung: string          // 'EUR'
  auftraggeberName: string | null
  auftraggeberIban: string | null
  verwendungszweck: string | null
  buchungstext: string | null
  referenz: string | null   // Bankinterne Referenz / Transaktions-ID
}

export interface ParseResult {
  transactions: NormalizedTransaction[]
  zeitraumVon: Date
  zeitraumBis: Date
  kontonummer: string | null   // IBAN des eigenen Kontos aus dem Auszug
  anfangssaldo: number | null
  schlusssaldo: number | null
  format: 'mt940' | 'csv'
}

/** CSV-Bankprofil – bildet Bankformate auf NormalizedTransaction ab */
export interface CsvProfile {
  name: 'sparkasse' | 'volksbank' | 'ing' | 'dkb' | 'comdirect' | 'generic'
  delimiter: string
  encoding: 'utf-8' | 'iso-8859-1'
  columns: {
    datum: number | string
    betrag: number | string
    auftraggeberName?: number | string
    auftraggeberIban?: number | string
    verwendungszweck?: number | string
    wertstellung?: number | string
    buchungstext?: number | string
    referenz?: number | string
  }
  betragFormat: 'de' | 'en'  // 'de' = '1.234,56', 'en' = '1234.56'
  datumFormat: string         // 'dd.MM.yyyy' | 'yyyy-MM-dd' | 'dd/MM/yyyy'
  skipRows: number
}

export const CSV_PROFILES: Record<string, CsvProfile> = {
  sparkasse: {
    name: 'sparkasse',
    delimiter: ';',
    encoding: 'iso-8859-1',
    columns: {
      datum: 'Buchungstag',
      wertstellung: 'Valutadatum',
      auftraggeberName: 'Beguenstigter/Zahlungspflichtiger',
      auftraggeberIban: 'Kontonummer/IBAN',
      verwendungszweck: 'Verwendungszweck',
      betrag: 'Betrag',
      buchungstext: 'Buchungstext',
    },
    betragFormat: 'de',
    datumFormat: 'dd.MM.yy',
    skipRows: 1,
  },
  volksbank: {
    name: 'volksbank',
    delimiter: ';',
    encoding: 'iso-8859-1',
    columns: {
      datum: 'Buchungsdatum',
      wertstellung: 'Valuta',
      auftraggeberName: 'Auftraggeber/Empfänger',
      auftraggeberIban: 'IBAN/Konto',
      verwendungszweck: 'Vorgang/Verwendungszweck',
      betrag: 'Umsatz in EUR',
    },
    betragFormat: 'de',
    datumFormat: 'dd.MM.yyyy',
    skipRows: 1,
  },
  ing: {
    name: 'ing',
    delimiter: ';',
    encoding: 'utf-8',
    columns: {
      datum: 'Buchung',
      wertstellung: 'Valuta',
      auftraggeberName: 'Auftraggeber/Empfänger',
      verwendungszweck: 'Verwendungszweck',
      betrag: 'Betrag',
      buchungstext: 'Buchungstext',
    },
    betragFormat: 'de',
    datumFormat: 'dd.MM.yyyy',
    skipRows: 1,
  },
  dkb: {
    name: 'dkb',
    delimiter: ';',
    encoding: 'utf-8',
    columns: {
      datum: 'Buchungsdatum',
      wertstellung: 'Wertstellung',
      auftraggeberName: 'Glaeubiger ID',
      verwendungszweck: 'Verwendungszweck',
      betrag: 'Betrag (EUR)',
      buchungstext: 'Buchungstext',
      referenz: 'Glaeubiger ID',
    },
    betragFormat: 'de',
    datumFormat: 'dd.MM.yyyy',
    skipRows: 1,
  },
  comdirect: {
    name: 'comdirect',
    delimiter: ';',
    encoding: 'iso-8859-1',
    columns: {
      datum: 'Buchungstag',
      wertstellung: 'Wertstellung',
      auftraggeberName: 'Buchungstext',
      verwendungszweck: 'Vorgang',
      betrag: 'Umsatz in EUR',
      buchungstext: 'Buchungstext',
    },
    betragFormat: 'de',
    datumFormat: 'dd.MM.yyyy',
    skipRows: 4,
  },
  generic: {
    name: 'generic',
    delimiter: ',',
    encoding: 'utf-8',
    columns: {
      datum: 0,
      betrag: 1,
      auftraggeberName: 2,
      verwendungszweck: 3,
    },
    betragFormat: 'en',
    datumFormat: 'yyyy-MM-dd',
    skipRows: 1,
  },
}
