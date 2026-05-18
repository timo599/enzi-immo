// ─── Shared types for the NK-Berechnungsengine ────────────────
// All pure – no Prisma, no side effects.
// These types flow from input → engine → formula_log → DB.

export interface ObjektDaten {
  id:                  string
  wohnflaecheGesamtM2: number
  nutzflaecheGesamtM2: number | null
  meaGesamt:           number
}

export interface EinheitDaten {
  id:            string
  bezeichnung:   string
  wohnflaecheM2: number
  nutzflaecheM2: number | null
  meaAnteil:     number | null
  personenAnzahl: number | null
}

export interface VertragsDaten {
  id:                  string
  einheitId:           string
  mietart:             'wohnraum' | 'gewerbe'
  vertragsbeginn:      Date
  vertragsende:        Date | null
  nettomiete:          number
  nkVorauszahlung:     number
}

export interface Kostenposition {
  id:           string
  kostenartId:  string
  nettobetrag:  number
  bruttobetrag: number
}

export interface KostenartConfig {
  id:                string
  kuerzel:           string
  bezeichnung:       string
  umlagefaehig:      'ja' | 'nein' | 'teilweise'
  heizkvRelevant:    boolean
}

export type Umlageschluessel =
  | 'wohnflaeche'
  | 'gesamtflaeche'
  | 'personenanzahl'
  | 'verbrauchsmessung'
  | 'miteigentumsanteile'
  | 'gleiche_teile'

export interface UmlageKonfiguration {
  kostenartId:          string
  schluesselTyp:        Umlageschluessel
  verbrauchsanteilPct:  number | null  // HeizKV: 50–70%
  flaechenanteilPct:    number | null
}

// ─── Calculation input bundle ──────────────────────────────────

export interface BerechnungsInput {
  zeitraumVon:         Date
  zeitraumBis:         Date
  objekt:              ObjektDaten
  einheiten:           EinheitDaten[]
  vertraege:           VertragsDaten[]
  kostenpositionen:    Kostenposition[]
  kostenarten:         Map<string, KostenartConfig>     // kostenartId → config
  umlageKonfigurationen: Map<string, UmlageKonfiguration> // kostenartId → config
  verbrauchsdaten:     Map<string, VerbrauchsInput>     // einheitId → data
}

export interface VerbrauchsInput {
  einheitId:     string
  kwh?:          number   // Stromverbrauch kWh (optional)
  liter?:        number   // Ölverbrauch Liter (optional)
}

// ─── Calculation result ────────────────────────────────────────

export interface BerechnungsErgebnis {
  zeitraumTage:   number
  abrechnungen:   MieterAbrechnung[]
  warnings:       BerechnungsWarning[]
}

export interface MieterAbrechnung {
  mietvertragId:           string
  einheitId:               string
  einheitBezeichnung:      string
  abrechnungsbeginn:       Date
  abrechnungsende:         Date
  bewohnungstage:          number
  zeitraumTage:            number
  anteilsfaktor:           number
  positionen:              NkPosition[]
  gesamtkostenAnteil:      number   // Summe aller betragEinheit
  vorauszahlungenGesamt:   number
  nachzahlungOderGuthaben: number   // positiv = Nachzahlung, negativ = Guthaben
  formelLog:               FormelLog
}

export interface NkPosition {
  kostenartId:          string
  kostenartKuerzel:     string
  kostenartBezeichnung: string
  gesamtbetragObjekt:   number
  umlageschluessel:     string
  anteilNumerator:      number
  anteilDenominator:    number
  anteilFaktor:         number
  betragJahresanteil:   number
  bewohnungstage:       number
  zeitraumTage:         number
  anteiligkeitsFaktor:  number
  betragEinheit:        number
  vorauszahlungAnteil:  number
  saldo:                number
  formelText:           string  // Human-readable
}

export interface FormelLog {
  berechnungsVersion:  string
  zeitraumVon:         string
  zeitraumBis:         string
  zeitraumTage:        number
  objekt:              { id: string; wohnflaecheGesamt: number }
  einheit:             { id: string; bezeichnung: string; wohnflaeche: number }
  bewohnungstage:      number
  anteilsfaktor:       string   // "280/365 = 0.767123"
  positionen:          NkPositionLog[]
  vorauszahlungen:     VorauszahlungLog
  ergebnis:            { gesamtkostenAnteil: number; vorauszahlungen: number; saldo: number }
}

export interface NkPositionLog {
  kostenart:           string
  gesamtbetragObjekt:  number
  schluessel:          string
  anteilFormel:        string   // "72.50 / 580.00"
  anteilFaktor:        number
  betragNachSchluessel: number
  anteiligkeitFormel:  string   // "280 / 365"
  anteiligkeitFaktor:  number
  betragEinheit:       number
}

export interface VorauszahlungLog {
  monatlicheVorauszahlung: number
  bewohnungstage:          number
  tagessatz:               number
  gesamt:                  number
  formel:                  string  // "180.00 / 30.4375 × 280 = ..."
}

export interface BerechnungsWarning {
  code:    string
  message: string
  context?: Record<string, unknown>
}
