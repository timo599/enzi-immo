#!/bin/bash
# ────────────────────────────────────────────────────────────────────────────
#  Enzi's Immobilienverwaltung — Stop-Skript
# ────────────────────────────────────────────────────────────────────────────
BASE="/Users/User/Desktop/Enzis Immobilienverwaltung"
BACKEND="$BASE/immo-backend"

GREEN='\033[0;32m'; RED='\033[0;31m'; BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC}  $*"; }
info() { echo -e "›  $*"; }

clear
echo -e "${BOLD}"
echo "  ╔═════════════════════════════════════════════════╗"
echo "  ║   Enzi's Immobilienverwaltung · Stop            ║"
echo "  ╚═════════════════════════════════════════════════╝"
echo -e "${NC}"

info "Beende Cloudflare-Tunnel..."
pkill -f "cloudflared.*tunnel" 2>/dev/null && ok "Tunnel beendet" || true

info "Beende Backend (tsx watch)..."
pkill -f "tsx watch.*immo-backend" 2>/dev/null && ok "Backend beendet" || true

info "Beende Frontend (Next.js)..."
pkill -f "next dev.*3001" 2>/dev/null
pkill -f "node.*next/dist/bin/next" 2>/dev/null && ok "Frontend beendet" || true

info "Stoppe Docker-Container..."
cd "$BACKEND" && docker compose down 2>&1 | grep -E "(Stopped|Removed)" | sed 's/^/  /' || true
ok "Docker-Container gestoppt"

echo ""
echo -e "${GREEN}${BOLD}  ✓  Alles gestoppt.${NC}"
echo ""
sleep 2
