# Deployment-Status: Enzi's Immobilienverwaltung

> Letzte Aktualisierung: 18.05.2026  
> Ziel: App dauerhaft online auf Vercel (Frontend) + Fly.io (Backend)

---

## Aktueller Stand

### Erledigt ✅
- [x] Komplette App entwickelt und lokal getestet
- [x] GitHub Repo: **https://github.com/timo599/enzi-immo** (privat)
- [x] Neon PostgreSQL: verbunden, alle Migrationen eingespielt
- [x] Upstash Redis: konfiguriert
- [x] Datenbank geseedet: Admin-User `NCVerwaltung / balou` + 15 Kostenarten
- [x] **Frontend LIVE**: https://enzi-immo.vercel.app ✅
- [x] Backend-Config auf Render: render.yaml vorhanden

### Noch offen
- [ ] Backend auf Render deployen — render.yaml ist gepusht, muss im Render-Dashboard noch verbunden werden
- [ ] Backend-URL bestätigen (sollte https://enzi-immo-backend.onrender.com sein)
- [ ] Render: Env-Variablen eintragen (DATABASE_URL, REDIS_URL etc.)
- [ ] Datei-Upload (S3) konfigurieren — optional für MVP

---

## Wie weitermachen (nächste Session)

### Schritt 1 — GitHub Token erstellen (manuell)
1. Browser öffnen → https://github.com/settings/tokens/new?scopes=repo,workflow,read:org&description=enzi-immo-cli
2. Ablaufzeit: **No expiration**
3. Scopes: `repo` ✅, `workflow` ✅, `read:org` ✅
4. Auf **Generate token** klicken
5. Token (beginnt mit `ghp_...`) kopieren

### Schritt 2 — Token in Terminal eingeben
```bash
export PATH="/Users/User/.fly/bin:$PATH"
echo "DEIN_TOKEN_HIER" | gh auth login --with-token
gh repo create enzi-immo --private --source="/Users/User/Desktop/Enzis Immobilienverwaltung" --push
```

### Schritt 3 — Fly.io einrichten
```bash
export PATH="/Users/User/.fly/bin:$PATH"
flyctl auth login
cd "/Users/User/Desktop/Enzis Immobilienverwaltung/immo-backend"
flyctl launch --no-deploy --name enzi-immo-backend --region fra
```

### Schritt 4 — Neon Datenbank
- https://neon.tech → New Project → Name: enzi-immo, Region: Frankfurt
- Connection-String notieren: `postgresql://...`

### Schritt 5 — Upstash Redis
- https://upstash.com → Create Database → Name: enzi-immo, Region: eu-west-1
- Redis-URL notieren: `rediss://...`

### Schritt 6 — Secrets auf Fly.io setzen
```bash
export PATH="/Users/User/.fly/bin:$PATH"
cd "/Users/User/Desktop/Enzis Immobilienverwaltung/immo-backend"
flyctl secrets set \
  DATABASE_URL="<Neon Connection String>" \
  REDIS_URL="<Upstash Redis URL>" \
  S3_ENDPOINT="https://fly-storage-fra.fly.io" \
  S3_BUCKET="enzi-immo-files" \
  S3_ACCESS_KEY="<key>" \
  S3_SECRET_KEY="<secret>" \
  S3_REGION="auto" \
  S3_FORCE_PATH_STYLE="true" \
  ANTHROPIC_API_KEY="<sk-ant-...>" \
  JWT_SECRET="$(openssl rand -hex 32)" \
  CORS_ORIGIN="https://enzi-immo.vercel.app"
flyctl deploy
```

### Schritt 7 — Frontend auf Vercel
1. https://vercel.com → mit GitHub anmelden
2. New Project → Repo `enzi-immo` → Root Directory: `immo-frontend`
3. Env Variable: `BACKEND_INTERNAL_URL` = `https://enzi-immo-backend.fly.dev`
4. Deploy

### Schritt 8 — Seed (Admin-User anlegen)
```bash
export PATH="/Users/User/.fly/bin:$PATH"
cd "/Users/User/Desktop/Enzis Immobilienverwaltung/immo-backend"
flyctl ssh console -C "npm run db:seed"
```

---

## Live-Zugangsdaten (nach Deployment)

| | |
|---|---|
| **URL** | https://enzi-immo.vercel.app |
| **Benutzer** | `NCVerwaltung` |
| **Passwort** | `balou` |

⚠️ Passwort nach erstem Login sofort ändern!

---

## Wichtige Pfade

| Was | Pfad |
|---|---|
| Projektordner | `/Users/User/Desktop/Enzis Immobilienverwaltung/` |
| Starter-Icon | `/Users/User/Desktop/Enzis Immobilienverwaltung Starten.command` |
| Backend | `/Users/User/Desktop/Enzis Immobilienverwaltung/immo-backend/` |
| Frontend | `/Users/User/Desktop/Enzis Immobilienverwaltung/immo-frontend/` |
| Fly CLI | `/Users/User/.fly/bin/flyctl` |
| GitHub CLI | `/Users/User/.fly/bin/gh` |

---

## Anthropic API Key
- Lokal gesetzt in: `/Users/User/Desktop/Enzis Immobilienverwaltung/immo-backend/.env`
- Für Produktion: als `ANTHROPIC_API_KEY` Fly.io Secret setzen

---

## Schnell-Start (lokal)
Doppelklick auf: `/Users/User/Desktop/Enzis Immobilienverwaltung Starten.command`
