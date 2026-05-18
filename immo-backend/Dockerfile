# ─────────────────────────────────────────────────────────────────────
#  Enzi's Immobilienverwaltung – Backend Production Image (Fly.io)
# ─────────────────────────────────────────────────────────────────────

# ── Build stage ──────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Production stage ─────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

# Nur Prod-Abhängigkeiten
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# Prisma Client + Schema (für `migrate deploy` zur Laufzeit)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma  ./node_modules/@prisma
COPY prisma ./prisma

# Kompiliertes JS
COPY --from=builder /app/dist ./dist

# Startup-Skript: erst Migrationen, dann Server
RUN printf '#!/bin/sh\nset -e\nnpx prisma migrate deploy\nexec node dist/server.js\n' > /app/start.sh && \
    chmod +x /app/start.sh

# Non-root User
RUN addgroup -S appgroup && adduser -S appuser -G appgroup && chown -R appuser:appgroup /app
USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["/app/start.sh"]
