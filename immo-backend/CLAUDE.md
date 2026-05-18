# ImmoManager Pro – Backend

Professionelles Hausverwaltungstool. Dieses Dokument ist die verbindliche Entwicklungsgrundlage und wird von Claude Code bei jeder Session automatisch gelesen.

---

## Stack

| Layer | Tech |
|---|---|
| Runtime | Node.js ≥ 20, TypeScript 5 (strict) |
| HTTP | Fastify 4 + `@fastify/jwt`, `@fastify/multipart` |
| ORM | Prisma 5 + PostgreSQL 16 |
| Validation | Zod (shared Frontend/Backend via schemas) |
| Queue | BullMQ 5 + Redis 7 |
| Storage | S3-kompatibel (MinIO lokal, AWS S3 Produktion) |
| KI | Anthropic Claude API (`@anthropic-ai/sdk`) |
| Tests | Vitest |
| Logging | Pino (JSON structured) |

---

## Projekt starten

```bash
# 1. Infrastruktur (PostgreSQL + Redis + MinIO)
docker compose up -d

# 2. Abhängigkeiten
npm install

# 3. Umgebungsvariablen
cp .env.example .env
# DATABASE_URL, JWT_SECRET, ANTHROPIC_API_KEY ausfüllen

# 4. Datenbank initialisieren
npx prisma migrate dev --name initial
npx prisma generate
npm run db:seed

# 5. HTTP-Server
npm run dev           # Port 3000, Swagger unter /docs

# 6. Extraction Worker (separates Terminal)
npm run worker
```

---

## Architektur-Invarianten (niemals brechen)

Diese Regeln sind fachlich oder rechtlich kritisch. Sie dürfen NICHT als Konfiguration behandelt werden.

1. **Kostenart-Zuordnung niemals auto-commit.** Die KI schlägt eine Kostenart vor. Sie wird IMMER als `kostenart_bestaetigung_erforderlich` geflaggt. Bestätigung ohne explizite `kostenartId` vom Nutzer ist unmöglich. (`src/lib/extraction/claude.extraction.service.ts`)

2. **`reviewed = false` nach jeder KI-Extraktion.** Kein automatisches Review, egal wie hoch die Confidence. (`src/modules/dokumente/repositories/dokumente.repository.ts`)

3. **`betrag_konflikt`-Flag blockiert `confirm`.** Wenn Netto + MwSt ≠ Brutto (Toleranz 2 Cent), ist Bestätigung gesperrt. (`src/modules/dokumente/services/review.service.ts`)

4. **Vollständigkeitsprüfung vor NK-Berechnung.** `POST /abrechnungen/berechne` gibt 422 zurück, solange Blocker existieren. Blocker sind: unreviewte Belege, fehlende Flächen, fehlende Öl-Bestände, HeizKV-Verletzung, keine Kostenpositionen. (`src/modules/abrechnung/services/vollstaendigkeitspruefung.service.ts`)

5. **Gewerbe-Mieterhöhung: immer juristische Prüfung.** DB-Constraint: `mietart = 'gewerbe' => juristische_pruefung_noetig = true`. Kein Code darf das überschreiben. (`prisma/schema.prisma`)

6. **Audit Logs: INSERT-ONLY.** Keine `update` oder `delete` auf `AuditLog`. Row-Level-Security in PostgreSQL erzwingt das. (`src/utils/audit.ts`)

7. **`tenant_id` auf allen Hauptentitäten.** Jede DB-Query auf Hauptentitäten enthält `where: { tenantId }`. Kein Cross-Tenant-Datenleak. Alle Repositories setzen das durch.

8. **Soft Delete statt Hard Delete.** Tabellen mit `deletedAt` setzen dieses Feld statt zu löschen. `deletedAt: null` immer im WHERE. Mieter werden zusätzlich pseudonymisiert (DSGVO).

9. **Formula-Log: jede Zahl rückverfolgbar.** `nk_abrechnungen.formel_log` (JSONB) dokumentiert jeden Rechenschritt. `nk_positionen.anteil_formel` zeigt lesbaren Rechenweg. (`src/lib/calculation/umlage.engine.ts`)

---

## Modul-Muster (für neue Module strikt einhalten)

```
src/modules/{modul}/
  schemas/{modul}.schema.ts    ← Zod-Schemas (Requests, Responses, Params)
  repositories/{modul}.repository.ts  ← Nur Prisma-Queries, kein Business-Code
  services/{modul}.service.ts  ← Business-Logik, ruft Repository + Utils
  routes/{modul}.routes.ts     ← Route-Handler: nur parse + service call
```

**Strikte Schichttrennung:**
- Route Handler: `Schema.parse(req.body)` → `service.method(ctx, input)` → `reply.send(result)`
- Service: fachliche Regeln, Transaktionen, `writeAudit()`, gibt `{ data, meta? }` zurück
- Repository: SQL via Prisma, tenant_id immer im WHERE, kein Business-Code

**RequestContext** (immer als erster Parameter):
```typescript
const ctx = (req: FastifyRequest) => ({
  tenantId:  req.tenantId,
  userId:    req.currentUser.sub,
  ipAddress: req.ip,
  userAgent: req.headers['user-agent'],
})
```

**Audit-Log** (bei jeder schreibenden Operation):
```typescript
await writeAudit({ prisma, ctx, entityType: 'Objekt', entityId: id, action: 'CREATE', newData: data })
```

---

## Implementierungsstand

### ✅ Fertig

| EPIC | Module | Endpunkte |
|---|---|---|
| EPIC-01 | Projekt-Setup, Fastify, Prisma, JWT, Error-Handler | – |
| EPIC-02 | Stammdaten: Objekte, Einheiten, Mieter, Mietverträge | CRUD je Modul |
| EPIC-03 | Dokument-Upload, S3, BullMQ, Claude-Extraktion, Review-Workflow | `/dokumente/*`, `/jobs/*` |
| EPIC-05 | Verbrauch & Bestände (Öl + Zukäufe, Strom) | `/verbrauch/*` |
| EPIC-06 | NK-Berechnungsengine (pure functions), Vollständigkeitsprüfung, Umlage | `/abrechnungen/*` |

### 🔲 Noch offen

| EPIC | Beschreibung | Priorität |
|---|---|---|
| EPIC-07 | PDF-Export (Abrechnungsschreiben) + Excel-Export | P1 |
| EPIC-08 | Kontoauszugs-Import (MT940/CSV) + Matching-Engine | P1 |
| EPIC-09 | Mieterhöhungsmodul (Staffel, Index, Fristen-Dashboard) | P2 |
| EPIC-10 | Dashboard-API (Aggregationen, offene Posten, Ampeln) | P2 |
| EPIC-11 | Tests: Unit (Calc-Engine), Integration, E2E | P1 |
| EPIC-12 | Deployment: Railway, Docker, CI/CD, Monitoring | P2 |

---

## Datenbankschema – Kerntabellen

```
tenants → users
       → objekte → einheiten → mietvertraege ↔ mieter (n:m via mietvertrag_mieter)
                             → mietvertraege → vertragsklauseln
                → umlageschluessel (pro objekt+kostenart)
                → abrechnungszeitraeume → dokumente → dok_extraktionen
                                       → kostenpositionen
                                       → nk_abrechnungen → nk_positionen
                                       → verbrauchserfassungen → oel_zukaeufe
       → kontoauszuege → buchungszeilen → matching_ergebnisse
       → offene_posten
       → mieterhoehungen
       → audit_logs (INSERT-ONLY)
```

Vollständiges Schema: `prisma/schema.prisma`

---

## Fehlerbehandlung

Alle Service-Methoden werfen typisierte Fehler aus `src/utils/errors.ts`:

```typescript
throw new NotFoundError('Objekt', id)         // 404
throw new ValidationError('...', details)      // 422
throw new ConflictError('Duplikat...')         // 409
throw new UnauthorizedError()                  // 401
throw new ForbiddenError()                     // 403
throw new TenantMismatchError()                // 403
throw new AppError('CODE', 'msg', statusCode)  // custom
```

Der globale Error-Handler in `src/plugins/error-handler.ts` konvertiert diese in konsistente JSON-Responses:
```json
{ "error": { "code": "NOT_FOUND", "message": "Objekt mit ID ... nicht gefunden" } }
```

---

## Umgebungsvariablen

Alle in `.env.example` dokumentiert. Kritische:

```
DATABASE_URL          PostgreSQL connection string
JWT_SECRET            Mindestens 256-bit random secret
ANTHROPIC_API_KEY     Claude API Key
S3_ENDPOINT           http://localhost:9000 (MinIO lokal)
S3_BUCKET             immo-documents
REDIS_URL             redis://localhost:6379
EXTRACTION_CONCURRENCY  3 (max parallel Claude API calls)
```

---

## Tests ausführen

```bash
npm test                  # Vitest (Unit-Tests)
npm run test:coverage     # Mit Coverage-Report
npm run typecheck         # TypeScript ohne Emit
```

Bestehende Tests: `src/lib/calculation/anteil.calculator.test.ts`
Deckt ab: `daysBetween`, `berechneAnteiligkeit`, `berechneUmlageAnteil`, `berechneVorauszahlung`

---

## Offene technische Entscheidungen (vor Implementierung klären)

- **OP-IBAN**: IBAN App-Layer-Verschlüsselung (pgcrypto oder AES-256 in Node)?
- **OP-05**: DSGVO-AVV mit Railway abschließen (vor Go-Live Pflicht)
- **OP-01**: Nur deutsches Mietrecht oder auch AT/CH?
- **OCR v1.1**: Tesseract lokal oder Cloud-OCR-API (AWS Textract)?
