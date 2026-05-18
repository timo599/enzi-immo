# EPIC-11: Tests

## Kontext

Lies zuerst `CLAUDE.md`. Test-Framework ist Vitest (bereits konfiguriert). Tests liegen neben den Quelldateien als `*.test.ts`.

## Was bereits getestet wird

`src/lib/calculation/anteil.calculator.test.ts` – Unit-Tests für:
- `daysBetween` (Schaltjahr, normales Jahr)
- `berechneAnteiligkeit` (Volljahrvertrag, Halbjahr, Vertragsende)
- `berechneUmlageAnteil` (alle 5 Schlüsseltypen, fehlende Fläche)
- `berechneVorauszahlung` (Vollahr, Quartal)

## Was noch zu testen ist

### 1. Berechnungsengine (Priorität: Hoch)

`src/lib/calculation/umlage.engine.test.ts`

```typescript
describe('berechneNebenkostenabrechnung', () => {
  // Vollständige Integration der Engine mit Testdaten
  it('berechnet Nachzahlung für Volljahrvertrag korrekt')
  it('berechnet Guthaben bei hohen Vorauszahlungen')
  it('unterjähriger Vertrag: korrekte Anteiligkeit')
  it('zwei Verträge auf gleicher Einheit (Mieterwechsel): Summe = 100%')
  it('nicht-umlagefähige Kostenarten werden ignoriert')
  it('Gesamtbetrag = Summe aller Einzel-Abrechnungen')
  it('formelLog ist vollständig und lesbar')
})
```

### 2. Matching-Engine (Priorität: Hoch) – nach EPIC-08

`src/lib/kontoauszug/matching/matching.engine.test.ts`

```typescript
describe('matchingEngine', () => {
  it('IBAN-Match: confidence 0.95, Prio 1')
  it('Betrag-Match (Miete ±2€): confidence 0.70, Prio 3')
  it('kein Match: confidence 0.00, unmatched')
  it('mehrere Kandidaten: sortiert nach Konfidenz')
  it('Auto-Match nur bei >= 0.90')
})
```

### 3. Vollständigkeitsprüfung (Priorität: Hoch)

`src/modules/abrechnung/services/vollstaendigkeitspruefung.service.test.ts`

Nutze Prisma-Mock (`vitest-mock-extended` oder manuelle Mocks):

```typescript
describe('pruefVollstaendigkeit', () => {
  it('ready: true wenn alle Bedingungen erfüllt')
  it('blockiert bei unreviewten Belegen')
  it('blockiert bei fehlendem Öl-Endbestand')
  it('blockiert bei HeizKV-Verletzung (< 50%)')
  it('blockiert bei fehlendem Bruttobetrag in Extraktion')
  it('warnt bei fehlendem Umlageschlüssel (kein Blocker)')
})
```

### 4. Mieterhöhungs-Calculator (Priorität: Mittel) – nach EPIC-09

`src/modules/mieterhoehung/services/mieterhoehung.calculator.test.ts`

### 5. MT940/CSV-Parser (Priorität: Mittel) – nach EPIC-08

`src/lib/kontoauszug/parser/*.test.ts`

Mit echten Sample-Dateien in `src/lib/kontoauszug/parser/__fixtures__/`:
- `sparkasse_sample.csv`
- `volksbank_sample.csv`
- `sample.sta` (MT940)

## Test-Hilfsdaten

Erstelle `src/lib/calculation/__fixtures__/berechnung.fixtures.ts`:

```typescript
export const STANDARD_ZEITRAUM = {
  von: new Date('2024-01-01'),
  bis: new Date('2024-12-31'),
}

export const TEST_OBJEKT = {
  id: 'o1',
  wohnflaecheGesamtM2: 580.0,
  nutzflaecheGesamtM2: null,
  meaGesamt: 1000,
}

export const TEST_EINHEITEN = [
  { id: 'e1', bezeichnung: 'Whg 1 EG', wohnflaecheM2: 72.5, ... },
  { id: 'e2', bezeichnung: 'Whg 2 OG', wohnflaecheM2: 507.5, ... },
]

export const TEST_VERTRAEGE = [
  { id: 'v1', einheitId: 'e1', mietart: 'wohnraum', vertragsbeginn: new Date('2024-01-01'), nkVorauszahlung: 180, ... },
]

export const TEST_KOSTENPOSITIONEN = [
  { id: 'kp1', kostenartId: 'ka-heiz', bruttobetrag: 3456.78 },
  { id: 'kp2', kostenartId: 'ka-wasser', bruttobetrag: 890.12 },
]
```

## Vitest-Konfiguration

Ergänze `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/lib/calculation/**', 'src/lib/kontoauszug/matching/**'],
      thresholds: {
        lines:   80,
        functions: 80,
        branches: 70,
      },
    },
  },
})
```

## CI-Integration

Erstelle `.github/workflows/ci.yml`:

```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
```
