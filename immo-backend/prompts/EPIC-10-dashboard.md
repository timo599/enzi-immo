# EPIC-10: Dashboard-API

## Kontext

Lies zuerst `CLAUDE.md`. Dieses Modul aggregiert Daten aus allen anderen Modulen zu einem einzigen Dashboard-Endpunkt. Es liest nur, schreibt nichts.

## Dateistruktur

```
src/modules/dashboard/
  services/dashboard.service.ts    ← Aggregation-Queries
  routes/dashboard.routes.ts
```

## Endpunkte

```
GET /api/v1/dashboard                    ← Haupt-Dashboard (alle Kennzahlen)
GET /api/v1/dashboard/aufgaben           ← Offene Aufgaben-Queue (priorisiert)
GET /api/v1/dashboard/objekte/:id        ← Objekt-spezifisches Dashboard
```

## Dashboard-Response-Struktur

```typescript
interface DashboardResponse {
  kpis: {
    objekteGesamt:        number
    einheitenGesamt:      number
    aktiveVertraege:      number
    zahlungsrueckstaende: number   // EUR, Summe aller offenen Differenzen
    belegeZuPruefen:      number   // Dokumente mit needs_review
    mieterhoehungenFaellig: number
  }

  aufgaben: DashboardAufgabe[]   // Priorisiert nach Dringlichkeit
  objektUebersicht: ObjektKarte[]
}

interface DashboardAufgabe {
  typ:      'belegruepruefung' | 'mieterhoehung_faellig' | 'zahlung_unklar' | 'bestand_fehlt' | 'abrechnung_offen'
  prioritaet: 'hoch' | 'mittel' | 'niedrig'
  titel:    string
  details:  string
  link:     string   // Deep-Link zur betroffenen Entity
  entityId: string
  faelligAm?: Date
}

interface ObjektKarte {
  id:           string
  bezeichnung:  string
  einheitenCount: number
  flaecheM2:    number
  status:       'aktuell' | 'nk_offen' | 'rueckstand' | 'belege_offen'
  offenePosten: number   // EUR
}
```

## Aufgaben-Priorisierung

Sammle aus allen Modulen offene Aufgaben:

1. **Hoch:** Belege mit `betrag_konflikt`-Flag (unresolve)
2. **Hoch:** Offene Posten > 0 UND `mahnung_hinweis = true`
3. **Mittel:** Dokumente mit `extraction_status = 'needs_review'`
4. **Mittel:** Mieterhöhungen mit `ampel_status = 'faellig'`
5. **Mittel:** Verbrauchserfassungen mit `vollstaendigkeitsstatus = 'fehlt'` in offenem Zeitraum
6. **Niedrig:** Mieterhöhungen mit `ampel_status = 'bald_faellig'`
7. **Niedrig:** Buchungszeilen mit `matching_status = 'unmatched'`

## Performance

Diese Queries laufen bei jedem Dashboard-Load. Nutze `Promise.all()` für parallele Ausführung:

```typescript
const [kpis, aufgaben, objekte] = await Promise.all([
  this.loadKpis(ctx.tenantId),
  this.loadAufgaben(ctx.tenantId),
  this.loadObjektUebersicht(ctx.tenantId),
])
```

Für `zahlungsrueckstaende`: Summe `differenz` aus `offene_posten` wo `status = 'offen'` AND `differenz < 0`.
