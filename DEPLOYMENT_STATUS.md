# Deployment-Status: Enzis Immobilienverwaltung

> Letzte Aktualisierung: 07.06.2026

## Aktueller Stand

Die Immobilienverwaltung ist lokal auf dem Mac lauffähig und zusätzlich über einen Cloudflare-Remote-Link von externen Geräten erreichbar, solange der Mac eingeschaltet ist und der Starter läuft.

## Lokaler Zugriff

| Dienst | URL | Status |
|---|---|---|
| Frontend | `http://localhost:3001` | ✅ geprüft |
| Backend Health | `http://localhost:3000/health` | ✅ geprüft |
| Betrieb & Portfolio | `http://localhost:3001/betrieb` | ✅ geprüft |

## Externer Zugriff

Aktueller Quick-Link:

```text
https://helping-inclusion-warren-countries.trycloudflare.com
```

Der Link steht zusätzlich immer aktuell in:

```text
/Users/User/Desktop/Enzis Immobilienverwaltung/REMOTE-ZUGANG-AKTUELL.txt
/Users/User/Desktop/Immobilienverwaltung Zugangsdaten.txt
/Users/User/Desktop/Enzis Immobilienverwaltung/Immobilienverwaltung Zugangsdaten.txt
```

Geprüft über öffentliche Cloudflare-DNS-Auflösung:

| Pfad | Status |
|---|---|
| `/health` | ✅ 200 |
| `/login` | ✅ 200 |
| `/betrieb` | ✅ 200 |

Hinweis: Der Quick-Link kann sich nach einem Neustart ändern. Der Remote-Wächter `Starter/Remote-Waechter.command` startet den Tunnel neu und schreibt den neuen Link automatisch in die Zugangsdateien.

## Desktop-Starter

| Datei | Status |
|---|---|
| `/Users/User/Desktop/Enzis Immobilienverwaltung.app` | ✅ App mit Immobilien-Icon |
| `/Users/User/Desktop/Enzis Immobilienverwaltung/Starter/Starten.command` | ✅ startet Backend, Frontend und Remote-Wächter |
| `/Users/User/Desktop/Enzis Immobilienverwaltung/Starter/Stoppen.command` | ✅ stoppt lokale Dienste |
| `/Users/User/Desktop/Enzis Immobilienverwaltung/Starter/Backup.command` | ✅ manuelles Backup |

## Logins

| Benutzer | Passwort | Rechte |
|---|---|---|
| `NCVerwaltung` | `balou` | Vollzugriff Admin |
| `Axel` | `balou` | Vollzugriff Admin |
| `Bastian` | `balou` | Vollzugriff Admin |
| `Kirsten` | `balou` | Vollzugriff Admin |
| `Jürgen` | `Enzi` | Alles ansehen, aktiv nur Enzi-Chat |

## Build- und API-Prüfung

| Prüfung | Ergebnis |
|---|---|
| Backend TypeScript `npx tsc --noEmit` | ✅ erfolgreich |
| Frontend Build `npm run build` | ✅ erfolgreich |
| Backend Tests `npm test` | ✅ 79/79 Tests erfolgreich |
| Frontend Lint `npm run lint` | ✅ 0 Fehler, nur Warnungen |
| API-Smoke-Test | ✅ 49 zentrale API-Aufrufe erfolgreich |
| Frontend-Routen-Test | ✅ 22 Hauptseiten mit 200 |
| Betrieb API `/uebersicht` | ✅ 200 |
| Betrieb API `/eigentuemer` | ✅ 200 |
| Betrieb API `/dienstleister` | ✅ 200 |
| Betrieb API `/interessenten` | ✅ 200 |
| Betrieb API `/pinboard` | ✅ 200 |
| Betrieb API `/esg` | ✅ 200 |
| Betrieb API `/workflows` | ✅ 200 |
| KI-Wissenssuche Beispiel `R154` | ✅ Treffer gefunden |

## Neu ergänzt am 06.06.2026 und geprüft am 07.06.2026

- Betrieb & Portfolio als neuer Hauptbereich
- Eigentümerstammdaten und Objektzuordnung
- Dienstleistermanagement
- CRM/Interessentenverwaltung
- Digitales Pinboard / Schwarzes Brett
- ESG-Kennzahlen je Objekt
- Workflow-Vorlagen, Wiedervorlagen und Eskalationslogik
- KI-Wissenssuche über Mieter, Objekte, Einheiten, Dokumente, Reparaturen und Aufgaben
- KI-Schadensanalyse
- Vertrags- und Rechtsassistent
- KI-Nebenkostenprüfung

## Fester Link

Ein dauerhaft gleichbleibender Remote-Link ist vorbereitet, braucht aber einmalig ein Cloudflare-Konto und eine Domain/Subdomain.

Einrichtung:

```text
/Users/User/Desktop/Enzis Immobilienverwaltung/Starter/Festen Remote-Link einrichten.command
```

Ohne Cloudflare-Konto/Domain sind Quick-Links technisch wechselnd.
