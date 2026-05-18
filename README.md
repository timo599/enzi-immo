# Enzi's Immobilienverwaltung

KI-gestützte Hausverwaltung — Mietverträge, Nebenkosten-Abrechnungen, Dokumenten-OCR, Mieterhöhungen nach §558 BGB.

**Stack:** Next.js 16 (Frontend) · Fastify (Backend) · PostgreSQL · Redis · S3 · Claude API

---

## 🚀 Deployment-Anleitung (MVP, ~60 Min)

Diese Anleitung deployt die App auf:
- **Vercel** → Frontend (kostenlos)
- **Fly.io** → Backend (~$0–5/Mo, kostenloses Kontingent reicht für MVP)
- **Neon** → PostgreSQL (kostenlos)
- **Upstash** → Redis (kostenlos)
- **Cloudflare R2** → Datei-Storage (kostenlos bis 10 GB)
- **Anthropic** → KI für OCR + Chatbot (~$1–5/Mo bei normaler Nutzung)

---

### Schritt 1: Code zu GitHub pushen

```bash
cd "/Users/User/Desktop/Enzis Immobilienverwaltung"
# Falls noch nicht geschehen:
git init
git add .
git commit -m "Initial commit"

# Auf github.com ein neues PRIVATES Repo anlegen, z.B. "enzi-immo"
# Dann (URL aus dem Repo kopieren):
git remote add origin git@github.com:<dein-username>/enzi-immo.git
git branch -M main
git push -u origin main
```

---

### Schritt 2: Externe Dienste anlegen (alles kostenlos)

#### 2.1 PostgreSQL via Neon
1. Auf [neon.tech](https://neon.tech) anmelden (mit GitHub)
2. **New Project** → Name: `enzi-immo`, Region: `Frankfurt (eu-central-1)`
3. Connection-String unter "Dashboard → Connection details" kopieren
   → Sieht aus wie: `postgresql://user:pwd@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require`
4. Diesen String → **DATABASE_URL** notieren

#### 2.2 Redis via Upstash
1. Auf [upstash.com](https://upstash.com) anmelden (mit GitHub)
2. **Create Database** → Name: `enzi-immo`, Region: `eu-central-1`, Type: `Regional`
3. Unter "Details" den **Redis URL** kopieren (beginnt mit `rediss://`)
4. → **REDIS_URL** notieren

#### 2.3 Object Storage via Cloudflare R2
1. Auf [dash.cloudflare.com](https://dash.cloudflare.com) anmelden
2. Links → **R2 Object Storage** → **Create bucket** → Name: `enzi-immo-files`
3. Rechts oben → **Manage R2 API Tokens** → **Create API token**
   - Permissions: **Object Read & Write**, Bucket: `enzi-immo-files`
4. Notieren:
   - `S3_ENDPOINT` = `https://<account-id>.r2.cloudflarestorage.com`
   - `S3_ACCESS_KEY` = Access Key ID
   - `S3_SECRET_KEY` = Secret Access Key
   - `S3_BUCKET` = `enzi-immo-files`
   - `S3_REGION` = `auto`

#### 2.4 Anthropic API Key
1. Auf [console.anthropic.com](https://console.anthropic.com) anmelden
2. **API Keys** → **Create Key** → kopieren
3. → **ANTHROPIC_API_KEY** notieren (`sk-ant-...`)
4. Unter "Billing" $5–10 Guthaben aufladen (reicht für viele Tausend Extraktionen)

---

### Schritt 3: Backend auf Fly.io deployen

#### 3.1 Fly CLI installieren
```bash
curl -L https://fly.io/install.sh | sh
```
Danach: `flyctl auth signup` (oder `flyctl auth login`)

#### 3.2 App anlegen
```bash
cd "/Users/User/Desktop/Enzis Immobilienverwaltung/immo-backend"
flyctl launch --no-deploy --name enzi-immo-backend --region fra
# Bei "Would you like to set up …": überall NEIN
# (DB, Redis, Sentry alles separat geregelt)
```

#### 3.3 Secrets setzen
```bash
flyctl secrets set \
  DATABASE_URL="<aus Neon>" \
  REDIS_URL="<aus Upstash>" \
  S3_ENDPOINT="https://<account-id>.r2.cloudflarestorage.com" \
  S3_BUCKET="enzi-immo-files" \
  S3_ACCESS_KEY="<R2 Access Key>" \
  S3_SECRET_KEY="<R2 Secret Key>" \
  S3_REGION="auto" \
  S3_FORCE_PATH_STYLE="true" \
  ANTHROPIC_API_KEY="<sk-ant-...>" \
  JWT_SECRET="$(openssl rand -hex 32)" \
  CORS_ORIGIN="https://<wird-in-schritt-4-gesetzt>.vercel.app"
```

#### 3.4 Deployen
```bash
flyctl deploy
```
Nach ~2–3 Min ist das Backend live unter: `https://enzi-immo-backend.fly.dev`

Test: `curl https://enzi-immo-backend.fly.dev/health` → sollte `{"status":"ok"}` zurückgeben.

#### 3.5 Erst-Seed (einmalig: Admin-User + Standard-Kostenarten anlegen)
```bash
flyctl ssh console -C "npm run db:seed"
```

---

### Schritt 4: Frontend auf Vercel deployen

1. Auf [vercel.com](https://vercel.com) mit GitHub anmelden
2. **Add New… → Project**
3. Repo `enzi-immo` auswählen
4. **Root Directory** auf `immo-frontend` setzen
5. **Environment Variables** (unter "Environment Variables"):
   - `BACKEND_INTERNAL_URL` = `https://enzi-immo-backend.fly.dev`
6. **Deploy** klicken
7. Nach ~2 Min: Frontend läuft unter z.B. `https://enzi-immo.vercel.app`

#### 4.1 CORS auf Backend aktualisieren
```bash
cd "/Users/User/Desktop/Enzis Immobilienverwaltung/immo-backend"
flyctl secrets set CORS_ORIGIN="https://<deine-vercel-url>.vercel.app"
```

---

### Schritt 5: Einloggen + Passwort ändern

1. `https://<deine-vercel-url>.vercel.app/login` öffnen
2. Login: `NCVerwaltung` / `balou`
3. **WICHTIG:** Passwort sofort ändern (DSGVO!)

---

## 🔄 Automatisches Deployment

Jeder `git push` auf den `main`-Branch deployt automatisch beide Teile neu:
- **Vercel** baut & deployt das Frontend
- **Fly.io** baut & deployt das Backend (via GitHub Actions, siehe `.github/workflows/`)

Falls Fly.io noch kein Auto-Deploy hat, einmalig:
```bash
flyctl tokens create deploy
# Token in GitHub → Repo Settings → Secrets → "FLY_API_TOKEN" speichern
```

---

## 🛠 Lokal entwickeln

Siehe `Enzis Immobilienverwaltung Starten.command` auf dem Desktop.
Doppelklick startet:
- PostgreSQL, Redis, MinIO (Docker)
- Backend (Port 3000)
- Frontend (Port 3001)
- Cloudflare-Tunnel (öffentliche URL für Kollegen-Demos)

---

## 📝 Login (Default)

| Feld | Wert |
|------|------|
| Benutzer | `NCVerwaltung` |
| Passwort | `balou` |

⚠️ **Vor Produktiv-Einsatz unbedingt ändern!**
