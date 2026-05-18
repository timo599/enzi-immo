# ImmoManager Pro – Backend

Professionelles Hausverwaltungstool. REST API für NK-Abrechnungen, Dokumentenverarbeitung, Zahlungsabgleich und Mieterhöhungsprüfung.

## Quick Start

```bash
# Infrastruktur
docker compose up -d

# Setup
npm install
cp .env.example .env    # .env ausfüllen
npx prisma migrate dev --name initial
npx prisma generate
npm run db:seed

# Entwicklung
npm run dev             # HTTP-Server :3000
npm run worker          # Extraction Worker (separates Terminal)

# Tests
npm test
npm run typecheck
```

API-Dokumentation: http://localhost:3000/docs (Swagger UI, nur Development)

## Projektstruktur

```
src/
  modules/          ← Feature-Module (Auth, Objekte, Dokumente, ...)
  lib/              ← Shared Services (Storage, Queue, Calculation Engine)
  plugins/          ← Fastify-Plugins (Prisma, JWT, Error-Handler)
  workers/          ← BullMQ Worker-Prozesse
  utils/            ← Hilfsfunktionen (Errors, Audit, Pagination)
  types/            ← Globale TypeScript-Typen

prisma/
  schema.prisma     ← Vollständiges Datenbankschema (28 Tabellen)
  seed.ts           ← Entwicklungs-Testdaten

prompts/            ← Claude Code Prompts für noch offene EPICs
```

## Implementierungsstand

| EPIC | Status | Module |
|---|---|---|
| 01 | ✅ | Fastify, TypeScript, Prisma, JWT, Error-Handler |
| 02 | ✅ | Objekte, Einheiten, Mieter, Mietverträge |
| 03 | ✅ | Dokument-Upload, S3, BullMQ, Claude-Extraktion, Review |
| 05 | ✅ | Verbrauch & Bestände (Öl, Strom) |
| 06 | ✅ | NK-Berechnungsengine, Vollständigkeitsprüfung |
| 07 | 🔲 | PDF + Excel Export → `prompts/EPIC-07-export.md` |
| 08 | 🔲 | Kontoauszugs-Import + Matching → `prompts/EPIC-08-kontoauszug.md` |
| 09 | 🔲 | Mieterhöhungsmodul → `prompts/EPIC-09-mieterhoehung.md` |
| 10 | 🔲 | Dashboard-API → `prompts/EPIC-10-dashboard.md` |
| 11 | 🔲 | Tests → `prompts/EPIC-11-tests.md` |
| 12 | 🔲 | Deployment → `prompts/EPIC-12-deployment.md` |

## Claude Code verwenden

Für jedes offene EPIC liegt ein Prompt in `prompts/`. Übergib den Inhalt direkt an Claude Code. Claude Code liest `CLAUDE.md` automatisch als Kontext.

Reihenfolge empfohlen: EPIC-08 → EPIC-07 → EPIC-09 → EPIC-10 → EPIC-11 → EPIC-12
