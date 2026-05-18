# EPIC-08: Kontoauszugs-Import + Matching-Engine

## Kontext

Lies zuerst `CLAUDE.md`. Dieses Modul ist Teil des Zahlungsabgleichs. Bankauszüge werden hochgeladen, geparst, und jede Buchungszeile wird automatisch einem Mietvertrag zugeordnet.

Das Datenmodell ist bereits vollständig in `prisma/schema.prisma` definiert:
- `kontoauszuege` – hochgeladene Dateien
- `buchungszeilen` – einzelne Buchungen
- `matching_ergebnisse` – Zuordnungsvorschläge mit Konfidenz
- `offene_posten` – Soll/Ist-Differenzen

## Neue Dependencies

Füge in `package.json` hinzu:
- `mt940-js` oder eigener MT940-Parser (MT940 ist ein alter Standard)
- `csv-parse` für CSV-Imports
- `date-fns` für Datums-Arithmetik in der Matching-Logik
- `fuse.js` für Fuzzy-String-Matching (Mieter-Namen)

## Dateistruktur

```
src/modules/kontoauszug/
  schemas/kontoauszug.schema.ts
  repositories/kontoauszug.repository.ts
  services/
    kontoauszug.service.ts       ← Import, Upload, Orchestrierung
    matching.service.ts          ← Matching-Engine (Business-Logik)
    soll-ist.service.ts          ← Offene-Posten-Berechnung
  routes/kontoauszug.routes.ts

src/lib/kontoauszug/
  parser/
    mt940.parser.ts      ← MT940 → NormalizedTransaction[]
    csv.parser.ts        ← CSV + Profil-System → NormalizedTransaction[]
    parser.types.ts      ← NormalizedTransaction Interface
  matching/
    matching.engine.ts   ← Pure functions: NormalizedTransaction[] + Verträge → MatchResult[]
    matching.types.ts
```

## Endpunkte

```
POST /api/v1/kontoauszuege/import          ← Upload MT940/CSV (multipart)
GET  /api/v1/kontoauszuege                 ← Liste aller Kontoauszüge
GET  /api/v1/kontoauszuege/:id             ← Detail + Statistiken
GET  /api/v1/kontoauszuege/:id/buchungen   ← Alle Buchungszeilen mit Matching-Status
PATCH /api/v1/buchungszeilen/:id/zuordnen  ← Manuelle Zuordnung
PATCH /api/v1/buchungszeilen/:id/ignorieren

GET  /api/v1/soll-ist                      ← Soll/Ist-Übersicht nach Zeitraum+Objekt
GET  /api/v1/offene-posten                 ← Offene Posten nach Tenant
```

## Matching-Engine (Prioritäts-Algorithmus)

Die Engine läuft **synchron** nach dem Import (kein BullMQ nötig, schnell genug).

```typescript
// src/lib/kontoauszug/matching/matching.engine.ts

interface NormalizedTransaction {
  datum:           Date
  betrag:          number   // positiv = Eingang
  auftraggeberName: string | null
  auftraggeberIban: string | null
  verwendungszweck: string | null
}

interface MatchCandidate {
  mietvertragId:  string
  buchungstyp:    BuchungstypEnum
  confidence:     number   // 0.000–1.000
  matchingGrund:  string   // 'iban_match' | 'betrag_monat' | 'fuzzy_name' | ...
  prioritaet:     number   // 1–4
}
```

Implementiere die Prioritätsstufen exakt so:

| Prio | Kriterium | Confidence | Auto-Match |
|---|---|---|---|
| 1 | IBAN Auftraggeber == IBAN in Mietvertrag | 0.95 | Ja (≥0.90) |
| 2 | Verwendungszweck enthält Vertragsnummer oder Einheitsbezeichnung | 0.75 | Nein |
| 3 | Betrag == Nettomiete ±2€ UND Monat passt | 0.70 | Nein |
| 4 | Betrag == NK-Vorauszahlung ±2€ UND Monat passt | 0.65 | Nein |
| 5 | Betrag == Nettomiete + NK ±5€ | 0.65 | Nein |
| 6 | Fuzzy-Name-Match (Levenshtein ≥80%) | 0.50 | Nein |
| – | Kein Match | 0.00 | Nein → unmatched |

**Wichtig:** Auto-Match (`matching_status = 'auto_matched'`) NUR bei Confidence ≥ 0.90. Alles darunter → `matching_status = 'unmatched'` und in die manuelle Review-Queue.

## Soll/Ist-Berechnung

Für jeden Mietvertrag + jeden Monat im angefragten Zeitraum:

```
Soll-Miete           = nettomiete (laut aktivem Vertrag für diesen Monat)
Ist-Miete            = SUM(bestätigte Buchungen, Typ=miete, dieser Monat)
Differenz-Miete      = Ist - Soll  (negativ = Rückstand)

Soll-NK              = nk_vorauszahlung (laut Vertrag)
Ist-NK               = SUM(bestätigte Buchungen, Typ=nk_vorauszahlung, dieser Monat)
Differenz-NK         = Ist - Soll

Mahnung-Hinweis      = true wenn Differenz-Miete < 0 AND heute > Fälligkeit + 14 Tage
```

**Wichtig:** `mahnung_hinweis` ist NUR ein Hinweis. Das System versendet KEINE Mahnungen.

## CSV-Profile

Unterschiedliche Banken exportieren CSV unterschiedlich. Implementiere ein Profil-System:

```typescript
interface CsvProfile {
  name:           string   // 'sparkasse', 'volksbank', 'ing', 'dkb', 'comdirect'
  delimiter:      string
  encoding:       'utf-8' | 'iso-8859-1'
  columns: {
    datum:        number | string   // Spaltenindex oder Spaltenname
    betrag:       number | string
    auftraggeberName?: number | string
    auftraggeberIban?: number | string
    verwendungszweck?: number | string
  }
  betragFormat:   'de' | 'en'   // '1.234,56' vs '1234.56'
  skipRows:       number        // Header-Zeilen überspringen
}
```

## MT940-Format

MT940 ist ein Swift-Standard. Wichtige Felder:
- `:60F:` – Anfangssaldo
- `:61:` – Buchungszeile (Datum, Betrag, Referenz)
- `:86:` – Verwendungszweck + Auftraggeber (strukturiert oder unstrukturiert)
- `:62F:` – Abschlusssaldo

## Validierungen

- Erlaubte Formate: `.sta`, `.mt940`, `.csv`, `.txt`
- Max 50 MB pro Datei
- Zeitraum-Überschneidungs-Check: Warnung wenn Buchungen bereits importiert wurden
- Konto muss zum Tenant gehören (`bankkonto.tenantId == ctx.tenantId`)

## Coding-Regeln

- Parser sind reine Funktionen: `string → NormalizedTransaction[]` (kein DB, kein Side-Effect)
- Matching-Engine ist reine Funktion: `(transactions, contracts) → MatchResult[]` (testbar ohne DB)
- Service-Layer orchestriert: liest DB, ruft Engine, schreibt Ergebnisse
- Alle Matching-Ergebnisse in `matching_ergebnisse`-Tabelle persistieren
- Audit-Log für: Import, manuelle Zuordnung, Ignorieren
