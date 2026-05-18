# EPIC-12: Deployment (Railway + Docker + CI/CD)

## Kontext

Lies zuerst `CLAUDE.md`. Deployment-Ziel: Railway (MVP). Alle Services laufen als Docker-Container. Kein K8s-Overhead für MVP.

## Zu erstellende Dateien

### 1. `Dockerfile` (Multi-Stage Build)

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run db:generate
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma
COPY package*.json ./
RUN npm ci --omit=dev
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

### 2. `Dockerfile.worker`

Gleich wie `Dockerfile`, aber CMD ist `node dist/workers/extraction.worker.js`.

### 3. `.dockerignore`

```
node_modules/
dist/
.env
.env.*
*.log
coverage/
```

### 4. `railway.json`

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": { "builder": "DOCKERFILE", "dockerfilePath": "Dockerfile" },
  "deploy": {
    "startCommand": "node dist/server.js",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 30,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

### 5. `railway.worker.json`

Gleich wie `railway.json` aber `startCommand: "node dist/workers/extraction.worker.js"`.

### 6. `.github/workflows/deploy.yml`

```yaml
name: Deploy to Railway
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - name: Deploy to Railway
        uses: berviantoleo/railway-deploy@main
        with:
          railway_token: ${{ secrets.RAILWAY_TOKEN }}
          service: immo-backend
```

## Environment Variables auf Railway

Setze diese in Railway Dashboard > Variables:

**Pflicht (Production):**
```
DATABASE_URL             (Railway PostgreSQL auto-fill)
REDIS_URL                (Railway Redis auto-fill)
JWT_SECRET               (min. 64 random chars)
ANTHROPIC_API_KEY        (Claude API Key)
S3_ENDPOINT              (AWS S3 oder Cloudflare R2)
S3_BUCKET                immo-documents-prod
S3_ACCESS_KEY            (AWS credentials)
S3_SECRET_KEY
S3_REGION                eu-central-1
S3_FORCE_PATH_STYLE      false (für AWS S3)
NODE_ENV                 production
LOG_LEVEL                info
CORS_ORIGIN              https://app.immo-manager.de
EXTRACTION_CONCURRENCY   3
```

## Migrations-Strategie bei Deploy

`prisma migrate deploy` muss **vor** dem Server-Start laufen. In Railway: als "deploy command" konfigurieren:

```bash
npx prisma migrate deploy && node dist/server.js
```

## Monitoring

### Health-Check
`GET /health` → prüft PostgreSQL-Verbindung. Railway nutzt diesen Endpunkt.

### Logging
Pino schreibt JSON-Logs. Railway's Log-Explorer kann JSON parsen. In Produktion: keine `pino-pretty`-Transform.

### Error Tracking (empfohlen v1.1)

Füge Sentry hinzu:
```typescript
import * as Sentry from '@sentry/node'
Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV })
```

## Backup-Strategie

Railway managed PostgreSQL: tägliche Backups, 7-Tage-Retention. Für Produktion:
```bash
# Wöchentlich in GitHub Actions
pg_dump $DATABASE_URL | gzip > backup-$(date +%Y%m%d).sql.gz
aws s3 cp backup-*.sql.gz s3://immo-backups/
```

## DSGVO-Voraussetzungen (vor Go-Live)

Pflicht **vor** dem ersten produktiven Einsatz:
1. AVV mit Railway abschließen (Data Processing Agreement)
2. Railway EU-Region auswählen (Frankfurt)
3. Löschkonzept dokumentieren (`mieter` Pseudonymisierung ist implementiert)
4. Datenschutzerklärung auf der App-Website veröffentlichen
