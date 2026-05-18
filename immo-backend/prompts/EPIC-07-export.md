# EPIC-07: PDF-Export & Excel-Export

## Kontext

Lies zuerst `CLAUDE.md`. Das Modul baut auf dem freigegebenen `nk_abrechnungen`-Datenmodell auf. Freigegebene Abrechnungen (`status = 'freigegeben'`) sollen als PDF und Excel exportiert werden.

## Ziel

Implementiere PDF- und Excel-Export für NK-Abrechnungen. Der Export läuft asynchron (BullMQ, wie EPIC-03), da PDF-Generierung mehrere Sekunden dauern kann.

## Neue Dependencies

Füge in `package.json` hinzu:
- `pdfkit` (PDF-Generierung ohne Browser-Dependency)
- `exceljs` (XLSX-Generierung)
- `@types/pdfkit` (devDependencies)

## Dateistruktur

```
src/modules/export/
  schemas/export.schema.ts
  repositories/export.repository.ts
  services/
    export.service.ts       ← Orchestrierung + Job-Enqueue
    pdf.generator.ts        ← PDFKit-Logik
    excel.generator.ts      ← ExcelJS-Logik
  routes/export.routes.ts

src/workers/export.worker.ts   ← BullMQ Worker für Export-Jobs
src/lib/queue/queue.types.ts   ← Erweitern um EXPORT_QUEUE
```

## Anforderungen

### Endpunkte

```
POST /api/v1/exporte/pdf/:abrechnungId      ← Einzelne Abrechnung als PDF
POST /api/v1/exporte/pdf-batch/:zeitraumId  ← Alle Abrechnungen eines Zeitraums als ZIP
POST /api/v1/exporte/excel/:zeitraumId      ← Excel-Übersicht aller Abrechnungen
GET  /api/v1/exporte/:id/download           ← Pre-signed S3 URL (15 Min TTL)
GET  /api/v1/exporte                        ← Liste aller Exporte (gefiltert nach Zeitraum)
```

### PDF-Inhalt (je Mieter-Abrechnung)

Das PDF ist ein strukturiertes Rechenblatt (KEIN fertiges Mieterschreiben mit Briefkopf – das kommt v1.1 nach juristischer Abstimmung).

Enthält:
1. Kopfzeile: Objekt-Adresse, Abrechnungszeitraum, Erstellungsdatum
2. Mieter-Daten (Name, Einheit, Bewohnungszeitraum)
3. Tabelle Kostenpositionen (Kostenart, Gesamtbetrag Objekt, Anteil, Ihr Anteil)
4. Formel-Erklärung je Position (aus `nk_positionen.anteil_formel`)
5. Vorauszahlungen (Monatsbetrag × Monate)
6. Ergebnis: Nachzahlung / Guthaben (fett, groß)
7. Fußzeile: "Dieser Ausdruck ist maschinell erstellt. Erstellt mit ImmoManager Pro."

### Excel-Inhalt (je Zeitraum)

Drei Sheets:
- Sheet 1 "Übersicht": Alle Mieter mit Nachzahlung/Guthaben
- Sheet 2 "Kostenpositionen": Alle Belege mit Beträgen und Kostenart
- Sheet 3 "Formeln": Berechnungsdetails je Mieter

### Export-Job

Folge dem Muster aus EPIC-03 (`src/workers/extraction.worker.ts`):
- Status in `exporte`-Tabelle tracken (Status: `pending`, `generating`, `ready`, `failed`)
- Bei Fertigstellung: Datei in S3 hochladen (Bucket + Key aus `storage.service.ts`)
- Pre-signed URL für Download (15 Min TTL)
- Fehler in `exporte.fehler` schreiben
- Audit-Log: `action: 'EXPORT'`

### Validierungen

- Nur Abrechnungen mit `status = 'freigegeben'` können exportiert werden
- Tenant-Isolation: Export darf nur eigene Abrechnungen exportieren
- ZIP-Export: max. 50 Abrechnungen gleichzeitig

## Coding-Regeln

- Folge dem Modul-Muster aus `CLAUDE.md`
- `pdfkit` und `exceljs` nur in den Generator-Klassen, nirgendwo sonst
- Generatoren sind reine Funktionen: Input-Daten → Buffer (kein DB, kein S3)
- S3-Upload nur im Worker
- Alle neuen Routen in `src/server.ts` registrieren

## Beispiel-Aufruf

```bash
TOKEN="..."
# Einzelne Abrechnung als PDF
curl -X POST http://localhost:3000/api/v1/exporte/pdf/ABRECHNUNG_ID \
  -H "Authorization: Bearer $TOKEN"
# → { "data": { "jobId": "...", "exportId": "..." } }

# Status pollen
curl http://localhost:3000/api/v1/jobs/JOB_ID/status \
  -H "Authorization: Bearer $TOKEN"

# Download-URL holen
curl http://localhost:3000/api/v1/exporte/EXPORT_ID/download \
  -H "Authorization: Bearer $TOKEN"
# → { "data": { "downloadUrl": "https://...", "expiresAt": "..." } }
```
