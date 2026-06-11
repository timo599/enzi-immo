# ☁️ Enzi's Immobilienverwaltung — Cloud-Deployment

> Ziel: Die App läuft 24/7 in der Cloud, unabhängig davon ob der Mac eingeschaltet ist.

---

## Empfohlene Architektur

```
Browser / Handy / Tablet
        │
        ▼
┌───────────────────┐     ┌────────────────────────────┐
│  Vercel (Frontend) │────▶│  Railway (Backend + DB)     │
│  next.js · kostenlos│   │  Fastify · PostgreSQL · Redis│
│  verwaltu…vercel.app│   │  ~€10–15 / Monat            │
└───────────────────┘     └────────────────────────────┘
                                      │
                           ┌──────────▼──────────┐
                           │  Cloudflare R2       │
                           │  Dateispeicher (PDFs)│
                           │  kostenlos bis 10 GB │
                           └─────────────────────┘
```

**Gesamtkosten: ca. €10–15/Monat** (Railway) + **kostenlos** (Vercel + R2)

---

## Warum diese Kombination?

| | Railway | Vercel | Cloudflare R2 |
|---|---|---|---|
| Was | Backend + DB + Redis | Frontend | Dateispeicher |
| Kosten | ~€10–15/Mo | Kostenlos | Kostenlos (10 GB) |
| Vorteil | Kein Einschlafen, Frankfurt-Region | Optimal für Next.js | S3-kompatibel, fertig konfiguriert |
| Nachteil | Kostenpflichtig | — | — |
| Alternative | Fly.io (ähnlich) | — | AWS S3 / Backblaze B2 |

---

## Schritt 1 — Cloudflare R2 (Dateispeicher)

**R2 ist kostenlos und ersetzt MinIO auf dem Mac.**

1. Konto erstellen: https://dash.cloudflare.com → „R2 Object Storage"
2. Bucket erstellen: Name z.B. `enzi-immo-docs`
3. API-Token erstellen:
   - R2 → Manage R2 API Tokens → Create API Token
   - Berechtigungen: Object Read & Write für deinen Bucket
   - Notiere: **Access Key ID** und **Secret Access Key**
4. Endpoint notieren: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`

```
S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
S3_BUCKET=enzi-immo-docs
S3_ACCESS_KEY=<Access Key ID>
S3_SECRET_KEY=<Secret Access Key>
S3_REGION=auto
S3_FORCE_PATH_STYLE=false
```

---

## Schritt 2 — Railway (Backend + Datenbank + Redis)

**Railway deployed automatisch aus GitHub bei jedem Push.**

### 2a. Konto und Projekt anlegen
1. https://railway.app → mit GitHub anmelden
2. „New Project" → „Deploy from GitHub repo"
3. `timo599/enzi-immo` auswählen → Ordner: `immo-backend`

### 2b. PostgreSQL + Redis hinzufügen
In deinem Railway-Projekt:
- „+ New" → „Database" → **PostgreSQL** hinzufügen
- „+ New" → „Database" → **Redis** hinzufügen

Railway setzt `DATABASE_URL` und `REDIS_URL` automatisch als Environment Variables.

### 2c. Environment Variables setzen
Im Backend-Service → „Variables" → folgendes eintragen:

```
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Werden von Railway automatisch gesetzt:
# DATABASE_URL=...
# REDIS_URL=...

# Selbst setzen:
JWT_SECRET=<64-Zeichen-Zufalls-String>
ANTHROPIC_API_KEY=sk-ant-api03-LbQWuINnykBw-...   ← dein bestehender Key
ANTHROPIC_MODEL=claude-sonnet-4-6
CORS_ORIGIN=https://<deine-vercel-domain>.vercel.app

# Cloudflare R2:
S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
S3_BUCKET=enzi-immo-docs
S3_ACCESS_KEY=<R2 Access Key>
S3_SECRET_KEY=<R2 Secret Key>
S3_REGION=auto
S3_FORCE_PATH_STYLE=false
```

JWT_SECRET generieren:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 2d. Domain notieren
Nach dem Deploy hat dein Backend eine Railway-URL:
`https://enzi-immo-backend-production.up.railway.app`

---

## Schritt 3 — Vercel (Frontend)

**Vercel deployed automatisch aus GitHub, kostenlos.**

1. https://vercel.com → mit GitHub anmelden
2. „Add New Project" → `timo599/enzi-immo` importieren
3. Root Directory: `immo-frontend`
4. Framework: Next.js (automatisch erkannt)

### Environment Variables in Vercel:
```
NEXT_PUBLIC_API_URL=/api/v1
BACKEND_INTERNAL_URL=https://enzi-immo-backend-production.up.railway.app
```

**Wichtig:** `BACKEND_INTERNAL_URL` zeigt auf deine Railway-Backend-URL (aus Schritt 2d).

### Domain festlegen (optional, kostenlos):
- Vercel gibt dir eine URL: `enzi-immo.vercel.app`
- Oder eigene Domain: z.B. `verwaltung.nc-verwaltung.de` → in Vercel eintragen

---

## Schritt 4 — Datenbankmigrationen ausführen

Nach dem ersten Deploy führt das Backend die Migrationen automatisch aus
(via `npx prisma migrate deploy` im Startup-Skript).

**Initialdaten (optional) einspielen:**
```bash
# Lokal den Seed gegen die Production-DB ausführen:
DATABASE_URL="postgresql://..." npx prisma db seed
```

---

## Schritt 5 — CORS_ORIGIN nachträglich setzen

Sobald du deine Vercel-URL kennst (z.B. `enzi-immo.vercel.app`):

1. Railway → Backend-Service → Variables
2. `CORS_ORIGIN=https://enzi-immo.vercel.app` eintragen
3. Service neu deployen (automatisch nach Variable-Änderung)

---

## Schritt 6 — Bestehende Daten migrieren

Um die lokalen Daten (Mieter, Objekte, Einheiten etc.) in die Cloud zu übertragen:

```bash
# 1. Lokalen Dump erstellen
docker exec immo-backend-postgres-1 pg_dump -U immo_user immo_manager_dev \
  --no-owner --no-acl > /tmp/local_dump.sql

# 2. In Railway-DB einspielen (Railway DATABASE_URL aus Dashboard kopieren)
psql "postgresql://..." < /tmp/local_dump.sql
```

---

## Ergebnis

| | Vorher (lokal) | Nachher (Cloud) |
|---|---|---|
| Verfügbarkeit | Nur wenn Mac an | 24/7 |
| Externer Zugriff | Wechselnder Cloudflare-Link | Feste URL immer |
| Datensicherheit | Nur lokale Backups | Railway-Backups + R2-Redundanz |
| Kosten | €0 | ~€10–15/Monat |
| Updates | Manuell | Automatisch bei Git-Push |

---

## Wichtige URLs nach dem Deployment

```
Frontend:   https://enzi-immo.vercel.app      (oder eigene Domain)
Backend:    https://enzi-immo-backend-production.up.railway.app
Health:     https://enzi-immo-backend-production.up.railway.app/health
GitHub:     https://github.com/timo599/enzi-immo
```

---

## Passworte & Zugänge

Die bestehenden Benutzer (NCVerwaltung, Axel, Bastian, Kirsten, Jürgen)
werden mit dem Datenbankdump automatisch übertragen.

Zugangsdaten bleiben gleich:
- NCVerwaltung / balou
- Axel / balou
- Bastian / balou
- Kirsten / balou
- Jürgen / Enzi
