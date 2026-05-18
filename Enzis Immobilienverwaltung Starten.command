#!/bin/bash
# ────────────────────────────────────────────────────────────────────────────
#  Enzi's Immobilienverwaltung — Ein-Klick-Starter (Lokal + Cloudflare-Tunnel)
# ────────────────────────────────────────────────────────────────────────────
BASE="/Users/User/Desktop/Enzis Immobilienverwaltung"
BACKEND="$BASE/immo-backend"
FRONTEND="$BASE/immo-frontend"
CLOUDFLARED="$BASE/bin/cloudflared"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC}  $*"; }
info() { echo -e "${BLUE}›${NC}  $*"; }
warn() { echo -e "${YELLOW}⚠${NC}  $*"; }
fail() { echo -e "${RED}✗  $*${NC}"; echo ""; read -rp "  Enter zum Beenden..." _; exit 1; }

clear
echo -e "${BOLD}"
echo "  ╔═════════════════════════════════════════════════╗"
echo "  ║   Enzi's Immobilienverwaltung · Starter         ║"
echo "  ╚═════════════════════════════════════════════════╝"
echo -e "${NC}"

# ── Voraussetzungen ──────────────────────────────────────────────────────────
command -v node   &>/dev/null || fail "Node.js fehlt → https://nodejs.org"
command -v docker &>/dev/null || fail "Docker fehlt → https://docker.com"
[ -d "$BACKEND" ]  || fail "Backend-Ordner nicht gefunden: $BACKEND"
[ -d "$FRONTEND" ] || fail "Frontend-Ordner nicht gefunden: $FRONTEND"
[ -x "$CLOUDFLARED" ] || warn "Cloudflared fehlt — Remote-Zugriff deaktiviert"
ok "Voraussetzungen OK · Node $(node -v)"

# ── Docker Desktop starten ───────────────────────────────────────────────────
if ! docker info &>/dev/null 2>&1; then
  warn "Docker startet..."
  open -a "Docker"
  echo -n "  "
  until docker info &>/dev/null 2>&1; do echo -n "."; sleep 2; done
  echo ""; sleep 2
fi
ok "Docker läuft"

# ── Andere Container stoppen die Ports blockieren ───────────────────────────
for c in nebenkosten_postgres nebenkosten_redis nebenkosten_minio; do
  docker stop $c &>/dev/null && warn "$c gestoppt (Port-Konflikt)"
done

# ── Vorhandene Backend/Frontend/Tunnel-Prozesse killen ──────────────────────
pkill -f "tsx watch.*immo-backend"     2>/dev/null
pkill -f "next dev.*3001"              2>/dev/null
pkill -f "node.*next/dist/bin/next"    2>/dev/null
pkill -f "cloudflared.*tunnel"         2>/dev/null
sleep 1

# ── Ports freimachen falls noch belegt ──────────────────────────────────────
for PORT in 3000 3001 5432 6379 9000 9001; do
  PID=$(lsof -ti:$PORT 2>/dev/null)
  if [ -n "$PID" ]; then
    PROC=$(ps -p $PID -o comm= 2>/dev/null)
    [[ "$PROC" != *"docker"* && "$PROC" != *"com.docker"* ]] && kill -9 $PID 2>/dev/null && warn "Port $PORT freigegeben"
  fi
done

# ── npm-Pakete (nur wenn nötig) ─────────────────────────────────────────────
for DIR in "$BACKEND" "$FRONTEND"; do
  if [ ! -d "$DIR/node_modules" ]; then
    info "Installiere Pakete in $(basename "$DIR")..."
    (cd "$DIR" && npm install --silent) || fail "npm install fehlgeschlagen in $DIR"
  fi
done
ok "Pakete bereit"

# ── Docker-Dienste starten ──────────────────────────────────────────────────
info "Starte Datenbank, Redis, MinIO..."
cd "$BACKEND"
docker compose up -d 2>&1 | grep -v "^time=" | grep -E "(Started|Created)" | sed 's/^/  /' || true

# ── Warte auf Postgres ──────────────────────────────────────────────────────
TRIES=0
echo -n "  Warte auf Postgres"
until docker exec immo-backend-postgres-1 pg_isready -U immo_user -q 2>/dev/null; do
  echo -n "."; TRIES=$((TRIES+1))
  [ $TRIES -gt 30 ] && fail "Postgres startet nicht"
  sleep 1
done
echo ""
ok "Postgres bereit"

# ── DB-Migrationen ──────────────────────────────────────────────────────────
info "DB-Migrationen prüfen..."
cd "$BACKEND" && npx prisma migrate deploy 2>&1 | grep -E "(Applied|already|successfully)" | head -3 | sed 's/^/  /'
npx prisma generate --silent 2>/dev/null
ok "DB aktuell"

# ── Seed (idempotent: legt Standard-Kostenarten an, wenn fehlen) ────────────
info "Standard-Kostenarten / Tenant prüfen..."
KOSTENARTEN_COUNT=$(docker exec immo-backend-postgres-1 psql -U immo_user -d immo_manager_dev -tAc "SELECT COUNT(*) FROM kostenarten WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'nc-verwaltung');" 2>/dev/null | tr -d ' \n')
if [ "${KOSTENARTEN_COUNT:-0}" -lt "10" ]; then
  cd "$BACKEND" && npm run db:seed 2>&1 | grep -E "Seeded|Standard|Tenant|Admin" | sed 's/^/  /' || true
fi
ok "DB-Inhalte bereit"

# ── Anthropic API-Key (für Enzi) prüfen ────────────────────────────────────
KEY_LINE=$(grep '^ANTHROPIC_API_KEY=' "$BACKEND/.env" 2>/dev/null | head -1)
KEY_VAL=$(echo "$KEY_LINE" | cut -d= -f2- | tr -d '"' | tr -d "'" | xargs)
if [ -z "$KEY_VAL" ] || [[ "$KEY_VAL" == *"..."* ]]; then
  warn "Anthropic API-Key fehlt — Enzi läuft im Offline-Modus."
  KEY=$(osascript \
    -e 'set d to display dialog "Anthropic API-Key für Enzi (KI-Assistent)?\n\nLeer lassen für Offline-Modus." default answer "" with hidden answer buttons {"Abbrechen","Speichern"} default button "Speichern" with icon note' \
    -e 'text returned of result' 2>/dev/null) || KEY=""
  if [ -n "$KEY" ]; then
    if grep -q '^ANTHROPIC_API_KEY=' "$BACKEND/.env"; then
      sed -i '' "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=\"${KEY}\"|" "$BACKEND/.env"
    else
      echo "ANTHROPIC_API_KEY=\"${KEY}\"" >> "$BACKEND/.env"
    fi
    ok "API-Key gespeichert"
  fi
fi

# ── Backend starten ─────────────────────────────────────────────────────────
info "Starte Backend (Port 3000)..."
cd "$BACKEND"
nohup npm run dev > /tmp/immo-backend.log 2>&1 &
BACKEND_PID=$!

TRIES=0
echo -n "  "
until curl -s http://localhost:3000/health &>/dev/null; do
  echo -n "."; TRIES=$((TRIES+1))
  [ $TRIES -gt 60 ] && fail "Backend startet nicht – siehe /tmp/immo-backend.log"
  sleep 1
done
echo ""
ok "Backend läuft (PID $BACKEND_PID)"

# ── Frontend starten ────────────────────────────────────────────────────────
info "Starte Frontend (Port 3001)..."
cd "$FRONTEND"
nohup npm run dev > /tmp/immo-frontend.log 2>&1 &
FRONTEND_PID=$!

TRIES=0
echo -n "  "
until curl -s -I http://localhost:3001 2>/dev/null | grep -q "200\|307\|404"; do
  echo -n "."; TRIES=$((TRIES+1))
  [ $TRIES -gt 60 ] && fail "Frontend startet nicht – siehe /tmp/immo-frontend.log"
  sleep 1
done
echo ""
ok "Frontend läuft (PID $FRONTEND_PID)"

# ── Cloudflare-Tunnel starten (für Kollegen-Zugriff) ────────────────────────
TUNNEL_URL=""
if [ -x "$CLOUDFLARED" ]; then
  info "Starte Cloudflare-Tunnel (öffentlicher Zugriff)..."
  : > /tmp/immo-tunnel.log
  nohup "$CLOUDFLARED" tunnel --no-autoupdate --url http://localhost:3001 \
    > /tmp/immo-tunnel.log 2>&1 &
  TUNNEL_PID=$!

  # Warte auf öffentliche URL
  TRIES=0
  while [ -z "$TUNNEL_URL" ] && [ $TRIES -lt 30 ]; do
    sleep 1
    TUNNEL_URL=$(grep -Eo "https://[a-z0-9-]+\.trycloudflare\.com" /tmp/immo-tunnel.log 2>/dev/null | head -1)
    TRIES=$((TRIES+1))
  done

  if [ -n "$TUNNEL_URL" ]; then
    ok "Tunnel aktiv: $TUNNEL_URL"
  else
    warn "Tunnel-URL nicht gefunden – siehe /tmp/immo-tunnel.log"
  fi
fi

# ── Lokale LAN-IP ermitteln ─────────────────────────────────────────────────
LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)

# ── Browser öffnen ──────────────────────────────────────────────────────────
sleep 2
open "http://localhost:3001/login"

echo ""
echo -e "${GREEN}${BOLD}  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  ✓  Enzi's Immobilienverwaltung läuft!"
echo -e "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${NC}"
echo -e "  ${BOLD}Login:${NC}"
echo -e "      Benutzer:  ${YELLOW}NCVerwaltung${NC}"
echo -e "      Passwort:  ${YELLOW}balou${NC}"
echo ""
echo -e "  ${BOLD}URLs:${NC}"
echo -e "      Lokal:     http://localhost:3001"
[ -n "$LAN_IP" ] && echo -e "      WLAN:      http://${LAN_IP}:3001    (für Geräte im selben WLAN)"
if [ -n "$TUNNEL_URL" ]; then
  echo -e "      ${GREEN}${BOLD}Kollegen:  $TUNNEL_URL${NC}"
  echo -e "                 ${YELLOW}↑ Diese URL für Kollegen weltweit (Login-Daten s.o.)${NC}"
  # In die Zwischenablage kopieren für einfaches Teilen
  echo -n "$TUNNEL_URL" | pbcopy 2>/dev/null && echo -e "      ${BLUE}(URL wurde in die Zwischenablage kopiert)${NC}"
fi
echo ""
echo -e "  ${BOLD}Logs:${NC}"
echo -e "      Backend:   tail -f /tmp/immo-backend.log"
echo -e "      Frontend:  tail -f /tmp/immo-frontend.log"
[ -n "$TUNNEL_URL" ] && echo -e "      Tunnel:    tail -f /tmp/immo-tunnel.log"
echo ""
echo -e "  ${YELLOW}Zum Beenden: Doppelklick auf 'Enzis Immobilienverwaltung Stoppen.command'${NC}"
echo -e "  ${YELLOW}Dieses Fenster kannst du schließen — Server laufen weiter.${NC}"
echo ""
sleep 5
