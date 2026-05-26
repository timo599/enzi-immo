# Status Quo – Enzi Immobilienverwaltung
*Zuletzt aktualisiert: 26.05.2026 (Abend)*

---

## Deployment

| Dienst | URL | Status |
|--------|-----|--------|
| **Frontend** (Vercel) | https://enzi-immo.vercel.app | ✅ Live |
| **Backend** (Render) | https://enzi-immo-backend.onrender.com | ✅ Live |
| **Datenbank** (Neon PostgreSQL) | neon.tech → Projekt `immo` | ✅ Aktiv |
| **Redis** (Upstash) | upstash.com | ✅ Aktiv |
| **Backblaze B2** (S3) | s3.eu-central-003.backblazeb2.com | ✅ Konfiguriert |
| **GitHub** | https://github.com/timo599/enzi-immo | ✅ main → c2c3e16 |
| **Backblaze B2** (Backup) | bucket: `EnzisImmoverw` | ✅ Konfiguriert |
| **macOS LaunchAgent** | Täglich 03:00 Uhr automatisch | ✅ Aktiv |

---

## Letzte Commits
```
a6d959c  feat: Mieterliste Import + Excel-Design (Mieter, Verträge, MwSt-Spalte)
c2c3e16  feat: Mieter-Portal, VPI-Rechner, Scan-to-Beleg (Frontend)
db5aefd  feat: Mieter-Portal, VPI-Rechner, Scan-to-Beleg (Backend)
2b0a694  feat: Wartungsplan, Übergabeprotokoll, Kautionen, Leerstand-Widget (Frontend)
2452437  feat: Wartungsplan, Übergabeprotokoll, Kautionsverwaltung, Leerstandsanalyse (Backend)
afb2f23  feat: Vertragswächter, Kommunikationslog, Reparaturverwaltung, Fristenübersicht (Frontend)
d0963bf  feat: Kommunikations-Log, Reparatur-Tracker, Vertragslaufzeit-Wächter (Backend)
47fc4a9  feat: Mieterliste-Seite + Mobile-Navigation + UI-Optimierungen
ae125f4  feat: Mieterliste – neuer View-Endpoint und Notiz-PATCH (Backend)
6b2f48b  Fix: Lernmodus + Mietvertrag-Apply Bug-Fixes
6abd703  Feature: Smart Upload, Mietvertrag-OCR & Lernmodus
79b1034  Fix: Production-Bugs (Login, API-Routen, Review-Service)
```

---

## Backblaze B2 Zugangsdaten (Render)

| Var | Wert |
|-----|------|
| `S3_ENDPOINT` | `https://s3.eu-central-003.backblazeb2.com` |
| `S3_BUCKET` | `enzi-immo-docs` |
| `S3_ACCESS_KEY` | `7731feab9ea1` |
| `S3_SECRET_KEY` | `00301cc8dbbc291817fdfabf39f6d7c67806e1144b` |
| `S3_REGION` | `eu-central-003` |
| `S3_FORCE_PATH_STYLE` | `true` |

---

## Implementierte Features (Stand: 22.05.2026)

### Grundfunktionen
- ✅ Login / Auth (JWT)
- ✅ Firmen, Objekte, Einheiten, Mieter
- ✅ Mietverträge (manuell)
- ✅ Dokumente-Verwaltung
- ✅ NK-Abrechnungen (Zeiträume + Berechnung)
- ✅ Kontoauszüge (CSV-Import + Buchungszuordnung)
- ✅ Mieterhöhungen (Kappungsgrenze / Index)
- ✅ Dashboard (KPIs, Cashflow, Ampel)
- ✅ Enzi KI-Assistent (Claude Sonnet)
- ✅ Sidebar-Navigation

### Neue Features (20–22.05.2026)
- ✅ **Backblaze B2** — Dateien werden dauerhaft gespeichert (kein Verlust bei Redeploy)
- ✅ **Drag & Drop Upload** — DropZone + UploadQueue mit Fortschrittsbalken
- ✅ **Mietvertrag-OCR** — Claude extrahiert Mieter/Vertrag/Staffeln, legt alles automatisch an
  - Validierung: 422 wenn Nachname nicht erkannt, Warnung wenn Vertragsbeginn fehlt
- ✅ **Rechnungs-Intelligenz** — erkennt Gesamt-Objekt vs. Einzel-Einheit + Verteilerschlüssel
- ✅ **Lernmodus** (`/lernmodus`)
  - Upload alte NK-Abrechnung → KI extrahiert + stellt Rückfragen
  - Bestätigte Antworten → EinheitLernwissen + KostenartLernwissen
  - Enum-korrekte Schlüssel (personenanzahl, gesamtflaeche, etc.)
  - Wenn keine Fragen generierbar → Session direkt abgeschlossen
  - DB-Lookup für Kostenart-Kürzel statt Regex

### Neue Features (26.05.2026 Abend)
- ✅ **Datenmigration Mieterliste** — 80 Mieter + 86 Mietverträge aus Excel importiert
  - EN Verwaltung: Wollgrasweg, H107, R152, R154, H182, H184, H184a
  - NE Investieren: H180, F1, F3
  - NC Verwaltung: Z33, Z33/1, Z35, Z35/1
- ✅ **Mieterliste: Excel-Layout** — Spalten wie Original: Etage | Mieter | Fläche qm | Beginn | LZ | Miete/qm | Miete | NK | MwSt | Gesamt incl. MwSt
  - MwSt automatisch: 20% für Gewerbe, 0% für Wohnraum
  - Gesamt-Tab mit Firma-Übersicht inkl. Jahressummen
  - Inline-Notizen weiterhin editierbar

### Neue Features (25.05.2026)
- ✅ **Datenmigration** — alle lokalen Daten in Neon Production übertragen
  - 4 Firmen, 16 Objekte, 98 Einheiten, 4 Mieter, 1 Mietvertrag, 1 Mieterhöhung
- ✅ **Automatische Backups** — täglich 03:00 Uhr via macOS LaunchAgent
  - Script: `/Users/User/Desktop/Enzis Immobilienverwaltung/bin/backup.py`
  - Upload nach Backblaze B2 (native API), Bucket `EnzisImmoverw`, Prefix `db-backups/`
  - Letzte 30 Backups lokal in `backups/` gespeichert
- ✅ **Multi-Device / Mobiler Zugang** — externe Geräte können sich einloggen
  - Vercel SSO-Protection deaktiviert
- ✅ **Mobile UI** — vollständig für Smartphone optimiert
  - Bottom-Navigation (`MobileNav`) mit 4 Hauptpunkten + „Mehr"-Drawer
  - Dialoge als Bottom-Sheet auf Mobile, zentriertes Popup auf Desktop
  - Kein iOS-Zoom-Bug (font-size: 16px auf Inputs)
  - EnziChat-Button oberhalb der Bottom-Nav
  - Login: verbesserte Server-Wake-Retry-Logik (bis 65 Sek.)
- ✅ **Mieterliste** (`/mieterliste`) — neue Seite
- ✅ **Vertragslaufzeit-Wächter** — Dashboard-Karte für Verträge die in 90 Tagen auslaufen
  - Countdown-Chips (rot ≤30d, orange ≤60d, gelb ≤90d) mit Mieter und Kaltmiete
- ✅ **Kommunikations-Log** (`/mieter` → Tab „Log")
  - Timeline pro Mieter: Anruf, Brief, E-Mail, Vor Ort, Sonstiges
  - Datum, Betreff, Notiztext, Löschen per Hover-Button
- ✅ **Reparatur-Tracker** (`/reparaturen`) — neue Seite
  - Status-Workflow: Offen → In Bearbeitung → Erledigt
  - Einheit-Zuordnung, Handwerker, Kosten, Beschreibung
  - Status per Klick direkt auf der Karte wechselbar
- ✅ **Fristenübersicht** (`/fristen`) — neue Seite
- ✅ **Wartungsplan** (`/wartung`) — neue Seite
  - Wiederkehrende Aufgaben mit Intervall (monatlich bis alle 5 Jahre)
  - Ampel: überfällig / bald fällig / ok
  - „Erledigt"-Button setzt neues Fälligkeitsdatum automatisch
- ✅ **Übergabeprotokoll** (`/uebergabe`) — neue Seite
  - Einzug / Auszug mit Raumcheckliste (Zustand + Mängelbeschreibung)
  - Zählerstände: Strom, Gas, Wasser
  - Schlüsselanzahl, Notizen, Detailansicht mit Zusammenfassung
- ✅ **Kautionsverwaltung** (`/kaution`) — neue Seite
  - Betrag, Eingang, Konto/Sparbuch, Zinsen
  - Rückgabe mit Abzügen und Begründung
  - Status-Anzeige: Gehalten / Zurückgezahlt / Noch nicht erhalten
- ✅ **VPI-Rechner** (`/vpi`) — neue Seite
  - Österreichischer Verbraucherpreisindex (Basis 2020=100, Werte 2020–2025)
  - Berechnung: Basis-Monat + aktueller Monat + Nettomiete → neue Miete + Erhöhungsbetrag
  - Schwellenwert-Prüfung (Standard 5 %) + Berechtigt-Indikator
- ✅ **Mieter-Portal** (`/portal` + `/mieterportal`) — zwei neue Seiten
  - Admin anlegt Zugänge per E-Mail + Passwort (scrypt-Hash) für jeden Mieter
  - Mieter-Login unter `/mieterportal`: Übersicht, Dokumente, Reparaturen
  - Token-Auth via `@fastify/jwt` (30 Tage gültig)
- ✅ **Scan-to-Beleg** (Dokumente-Seite)
  - Sparkles-Button ✨ bei Dokumenten → KI (Claude Vision) analysiert Bild
  - Extrahiert: Lieferant, Datum, Netto/Brutto, MwSt., IBAN, Kategorie, Verwendungszweck
  - Ergebnis in `extractedData` gespeichert + Dialog-Anzeige
- ✅ **Leerstandskosten-Widget** (Dashboard)
  - Zeigt leere Einheiten mit Leerstandsdauer und entgangenen Einnahmen
  - Aggregiert: auslaufende Verträge (180 Tage), fällige Erhöhungen, offene Reparaturen
  - Kritisch-Zähler (rot wenn Handlungsbedarf)
  - In Sidebar (Desktop) und Mehr-Menü (Mobile)
  - Strukturierte Ansicht: Firma → Objekt → Einheit
  - Spalten: Einheit, Mieter, m², €/m², MV seit, bis, Letzte Erhöhung, Art, Kaltmiete, NK, Warmmiete, Notizen
  - Tab „Gesamt": KPI-Karten + Übersichtstabelle pro Firma mit Jahressumme
  - Ein Tab pro Firma mit detaillierter Objekttabelle
  - Inline-Notizen: direkt in der Tabelle bearbeiten und speichern (PATCH)
  - Auto-Update via React Query bei Datenänderungen
  - Excel-Download + Drucken-Button
  - In Sidebar (Desktop) und Mehr-Menü (Mobile) eingetragen

---

## Datenbank-Migrationen

| Migration | Datum | Inhalt |
|-----------|-------|--------|
| `20260520124537_lernmodus_smart_upload` | 20.05.2026 | LernmodusSession, LernmodusFrage, EinheitLernwissen, KostenartLernwissen |
| `20260525143627_kommunikation_reparatur` | 25.05.2026 | Kommunikation (enum KommunikationKategorie), Reparatur (enum ReparaturStatus) |
| `20260525171346_wartung_uebergabe_kaution` | 25.05.2026 | Wartungsaufgabe, Uebergabeprotokoll (enum UebergabeTyp), Kaution |
| `20260526070728_mieter_portal` | 26.05.2026 | MieterPortalUser (email, passwordHash, aktiv, letzterLogin) |

---

## Offene Punkte

### Dringend (User-Action erforderlich)
- ⚠️ **Anthropic-Guthaben aufladen** — Enzi KI zeigt „offline" weil API-Credits aufgebraucht sind
  → https://console.anthropic.com/settings/billing

### Datenmigration
- ✅ 84 Mieter, 87 Mietverträge (inkl. 4 Original-Mieter, 1 Original-Vertrag)
- **Fehlende Einheiten**: WERBORO und Scheider haben noch keine Mietverträge (Einheiten Z35/4.OG und Z35/2.OG rechts müssen noch zugeordnet werden)

### Sicherheit
- ⚠️ Konto-Passwort noch schwach — bitte ändern

### Optional / Nice-to-have
- Dokumente-Seite: Mietvertrag-Apply-Dialog in der UI verknüpfen
- Einheiten-Seite: Lernwissen (Personenanzahl, Fläche) direkt anzeigen
- NK-Abrechnung: Lernwissen automatisch in Berechnungsschlüssel einfließen lassen
- Mieterliste: „Form der Erhöhung" als separates editierbares Feld (aktuell aus Mieterhöhungs-Tabelle)

---

## Render Env-Vars (komplette Liste — 21 Vars)

Beim Aktualisieren immer ALLE auf einmal via PUT senden:
```
DATABASE_URL, REDIS_URL, ANTHROPIC_API_KEY, JWT_SECRET,
JWT_ACCESS_EXPIRES_IN, JWT_REFRESH_EXPIRES_IN,
S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY, S3_REGION, S3_FORCE_PATH_STYLE,
NODE_ENV, PORT, HOST, LOG_LEVEL, CORS_ORIGIN,
ANTHROPIC_MODEL, EXTRACTION_CONCURRENCY, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX
```

---

## Wichtige Befehle

```bash
# TypeScript-Check
cd "/Users/User/Desktop/Enzis Immobilienverwaltung/immo-backend" && npx tsc --noEmit
cd "/Users/User/Desktop/Enzis Immobilienverwaltung/immo-frontend" && npx tsc --noEmit

# Frontend deployen (Vercel)
cd "/Users/User/Desktop/Enzis Immobilienverwaltung/immo-frontend" && npx vercel deploy --prod --yes

# Backend-Redeploy triggern (Render API)
curl -X POST "https://api.render.com/v1/services/srv-d86kg7mq1p3s73c44vc0/deploys" \
  -H "Authorization: Bearer rnd_AShvC8CJVRQT9W8ntz68cQtibDaC" \
  --data-raw "{}"

# Render Env-Vars setzen
# → Immer alle 21 Vars in einem PUT-Request (ersetzt alle!)

# Git commit + push
cd "/Users/User/Desktop/Enzis Immobilienverwaltung" && git add -A && git commit -m "..." && git push
```

---

## Architektur

```
Browser → Vercel (Next.js 16) → /api/v1/* Proxy → Render (Fastify)
                                                      ↓
                                              Neon PostgreSQL (Prisma)
                                              Upstash Redis (BullMQ)
                                              Backblaze B2 (S3) ✅ konfiguriert
                                              Anthropic Claude API
```

---

## Render Dienst-IDs

| Feld | Wert |
|------|------|
| Service ID | `srv-d86kg7mq1p3s73c44vc0` |
| Render API Key | `rnd_AShvC8CJVRQT9W8ntz68cQtibDaC` |

---

## Behobene Bugs (Übersicht)

| # | Problem | Fix | Datum |
|---|---------|-----|-------|
| C1 | Enum `personenzahl` statt `personenanzahl` → DB-Crash | Korrigiert in Prompt + VALID_SCHLUESSEL | 22.05 |
| W1 | KostenartKuerzel speichert Bezeichnung statt Kürzel | DB-Lookup auf Kostenart-Tabelle | 22.05 |
| W2 | Session stuck wenn 0 Fragen generiert | Direkt auf `abgeschlossen` setzen | 22.05 |
| W3 | `gesamtflaeche` fehlte in VALID_SCHLUESSEL | Ergänzt | 22.05 |
| W4 | Leerer Nachname → korrupter Mieter-Datensatz | 422-Guard | 22.05 |
| W5 | Vertragsbeginn lautlos auf heute gesetzt | Warnung in Response | 22.05 |
| I1 | Progress-Callback nie aufgerufen → Balken bleibt bei 0% | onProgress(10/100) eingefügt | 22.05 |
| — | Login fehlgeschlagen nach Env-Var | Vercel-Redeploy nötig | 20.05 |
| — | Render PUT ersetzt alle Vars | Immer vollständige Liste | 20.05 |
| — | Prisma P1012 (EinheitLernwissen) | `@unique` ergänzt | 20.05 |
| M1 | FK-Violation beim Migrieren (`einheiten_objekt_id_fkey`) | Löschen in korrekter Reihenfolge | 25.05 |
| M2 | `erstellt_von` FK-Violation bei Objekte-Insert | Spalte beim Insert ausgeschlossen | 25.05 |
| M3 | B2 S3-kompatible API lehnte Key ab | Auf B2 Native API umgestellt | 25.05 |
| M4 | Vercel SSO blockierte externe Geräte | SSO-Protection via CLI deaktiviert | 25.05 |
| M5 | `min-height: 44px` auf allen Buttons bricht Layout | Opt-in `.btn-touch` Klasse statt global | 25.05 |
