# EPIC-09: Mieterhöhungsmodul

## Kontext

Lies zuerst `CLAUDE.md`. Das Mieterhöhungsmodul prüft rechnerische und zeitliche Voraussetzungen auf Basis der hinterlegten Vertragsdaten. Es gibt **keine Rechtsauskunft**. Jede Ausgabe ist als "Hinweis zur Prüfung" gekennzeichnet.

Das Datenmodell ist fertig in `prisma/schema.prisma`:
- `mieterhoehungen` – berechnete Mieterhöhungs-Checks mit `ampel_status`

## Dateistruktur

```
src/modules/mieterhoehung/
  schemas/mieterhoehung.schema.ts
  repositories/mieterhoehung.repository.ts
  services/
    mieterhoehung.service.ts         ← Orchestrierung, DB
    mieterhoehung.calculator.ts      ← Pure functions (testbar)
  routes/mieterhoehung.routes.ts
```

## Endpunkte

```
GET  /api/v1/mieterhoehungen                    ← Dashboard: alle Verträge mit Ampel
GET  /api/v1/mieterhoehungen/:id                ← Detail mit Berechnungslog
POST /api/v1/mieterhoehungen/berechne           ← (Re-)Berechnung für alle Verträge eines Tenants
POST /api/v1/mieterhoehungen/:id/index-eintragen ← VPI-Wert manuell eintragen
```

## Berechnung pro Mietart

### Wohnraum: Staffelmiete (§ 557a BGB)

Prüfe alle `vertragsklauseln` mit `klausel_typ = 'staffelmiete'`:

```typescript
// Nächste fällige Staffel
const nextStaffel = klauseln
  .filter(k => k.betrag && k.gueltigAb && k.gueltigAb > today)
  .sort((a, b) => a.gueltigAb - b.gueltigAb)[0]

// Ampel-Status
if (!nextStaffel) → 'kein_handlungsbedarf'
else if (nextStaffel.gueltigAb <= today) → 'faellig'
else if (nextStaffel.gueltigAb <= addDays(today, 60)) → 'bald_faellig'
else → 'geplant'

// Validierung Staffel-Abstand
if (abstandZurVorherigenStufe < 12 Monate) → WARNING: '§ 557a: Mindestabstand 12 Monate'
// Hinweis: Tritt automatisch in Kraft, keine Ankündigung nötig
```

### Wohnraum: Indexmiete (§ 557b BGB)

Prüfe `mietvertrag.index_klausel = true`:

```typescript
// Voraussetzungen
const mindestlaufzeit = 12 // Monate seit letzter Anpassung

// Berechnung (MANUELL – Nutzer gibt VPI ein)
const neueMiete = aktuellerVPI / basisVPI * basisMiete
const erhoehungsbetrag = neueMiete - aktuellerMiete

// Hinweis: VPI nie automatisch abrufen, immer manuell
// Pflichtfeld bei Bestätigung: index_aktueller_wert + index_quelle
```

### Wohnraum: Vergleichsmiete § 558 BGB

**Wichtig:** Diese Prüfung liefert **nur einen Hinweis** auf das Vorliegen der zeitlichen Voraussetzungen. Die Zulässigkeit (Mietspiegel, Kappungsgrenze) kann das System nicht prüfen.

```typescript
// Zeitliche Voraussetzungen
const letzteErhoehungVorMinMonate = 15 // Monate (§ 558 Abs. 1)
const kuendigungsfristFuerErhoehung = 3  // Monate Ankündigungsfrist (§ 558b)
```

### Gewerbe: Immer manuelle Prüfung

```typescript
if (vertrag.mietart === 'gewerbe') {
  return {
    ampel_status: 'manuelle_pruefung',
    juristische_pruefung_noetig: true,  // INVARIANTE – darf NIE false sein
    pruefungshinweis: 'Gewerbemietvertrag: Mieterhöhungen richten sich ausschließlich nach den individuellen Vertragsvereinbarungen. Keine automatische Prüfung möglich. Bitte konsultieren Sie einen Fachanwalt für Mietrecht.',
  }
}
```

## Ampel-Status-Logik

```
'faellig'              → Erhöhung möglich und Datum ≤ heute
'bald_faellig'         → Erhöhung möglich in ≤ 60 Tagen
'geplant'              → Erhöhung möglich in > 60 Tagen
'kein_handlungsbedarf' → Keine Erhöhung möglich / Vertrag zu neu
'manuelle_pruefung'    → Gewerbe oder Sonderklausel
```

## Dashboard-Ausgabe

```typescript
// Sortierung: faellig → bald_faellig → geplant → kein_handlungsbedarf → manuelle_pruefung
// Gefiltert nach: Objekt, Ampel-Status, Mietart

interface DashboardEintrag {
  mietvertragId:          string
  einheitBezeichnung:     string
  objektBezeichnung:      string
  mieterName:             string
  mietart:                'wohnraum' | 'gewerbe'
  erhoehungstyp:          string
  aktuellerMiete:         number
  neueMiete:              number | null
  erhoehungsbetrag:       number | null
  ampelStatus:            AmpelStatus
  naechstmoeglichesDatum: Date
  juristischePruefungNoetig: boolean
  pruefungshinweis:       string | null
}
```

## Index-Eintragen (VPI)

```
POST /api/v1/mieterhoehungen/:id/index-eintragen
Body: {
  "aktuellerVpi": 123.4,
  "quelle": "Statistisches Bundesamt, Basis 2020=100, Oktober 2024",
  "datum": "2024-11-01"
}
```

Berechnet dann `neue_miete = aktuellerVpi / indexBasiswert × aktuellerMiete` und persistiert `berechnung_log`.

## Coding-Regeln

- `mieterhoehung.calculator.ts` enthält **reine Funktionen** (pure functions, testbar ohne DB)
- Alle Berechnungen schreiben einen `berechnung_log` (JSONB) mit Formeldarstellung
- Hinweis-Texte sind Deutsch, sachlich, ohne Wertung
- Kein Code generiert Mieterhöhungsschreiben (das kommt v1.1)
- Bei `mietart = 'gewerbe'`: `juristische_pruefung_noetig` ist **immer** `true` – als DB-Constraint und als Code-Invariante

## Tests schreiben

Erstelle `src/modules/mieterhoehung/services/mieterhoehung.calculator.test.ts`:

```typescript
describe('Staffelmiete', () => {
  it('erkennt fällige Staffel', ...)
  it('erkennt bald fällige Staffel (< 60 Tage)', ...)
  it('warnt bei < 12 Monaten Abstand', ...)
})

describe('Indexmiete', () => {
  it('berechnet neue Miete korrekt', ...)
  it('prüft 12-Monats-Mindestlaufzeit', ...)
})

describe('Gewerbe', () => {
  it('gibt immer manuelle_pruefung zurück', ...)
  it('setzt juristische_pruefung_noetig immer true', ...)
})
```
