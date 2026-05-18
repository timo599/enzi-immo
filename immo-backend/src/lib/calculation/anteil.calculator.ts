// ─── Pure calculation functions – no side effects, fully testable ──────
// All monetary values as numbers (€). Rounding to 2 decimal places
// happens only at the final output stage.

import type {
  VertragsDaten,
  EinheitDaten,
  ObjektDaten,
  UmlageKonfiguration,
  Umlageschluessel,
  BerechnungsWarning,
} from './types.js'

// ─── Date helpers ──────────────────────────────────────────────

/** Days between two dates (inclusive start, exclusive end). */
export function daysBetween(start: Date, end: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24
  return Math.round((end.getTime() - start.getTime()) / msPerDay)
}

/** Clamp a date to the given range. */
function clampDate(date: Date, min: Date, max: Date): Date {
  if (date < min) return min
  if (date > max) return max
  return date
}

// ─── Anteiligkeitsberechnung ───────────────────────────────────

export interface AnteiligkeitResult {
  abrechnungsbeginn:  Date
  abrechnungsende:    Date
  bewohnungstage:     number
  zeitraumTage:       number
  anteilsfaktor:      number  // bewohnungstage / zeitraumTage
}

/**
 * Calculate the pro-rata factor for a contract within an accounting period.
 * Day-accurate: uses actual calendar days.
 *
 * @example
 *   Zeitraum 2024-01-01 to 2024-12-31 (366 days)
 *   Vertrag starts 2024-04-01 → 275 days → factor = 275/366 = 0.7514
 */
export function berechneAnteiligkeit(
  vertrag:     VertragsDaten,
  zeitraumVon: Date,
  zeitraumBis: Date,
): AnteiligkeitResult {
  // The accounting end date is inclusive, so add 1 day for calculation
  const periodEnd = new Date(zeitraumBis)
  periodEnd.setDate(periodEnd.getDate() + 1)

  const zeitraumTage = daysBetween(zeitraumVon, periodEnd)

  // Contract start/end clamped to the accounting period
  const abrechnungsbeginn = clampDate(vertrag.vertragsbeginn, zeitraumVon, periodEnd)
  const vertragsEndFuerBerechnung = vertrag.vertragsende
    ? clampDate(
        new Date(vertrag.vertragsende.getTime() + 86_400_000), // inclusive end → +1 day
        zeitraumVon,
        periodEnd,
      )
    : periodEnd

  const bewohnungstage = daysBetween(abrechnungsbeginn, vertragsEndFuerBerechnung)
  const anteilsfaktor  = round6(bewohnungstage / zeitraumTage)

  return {
    abrechnungsbeginn:  abrechnungsbeginn,
    abrechnungsende:    new Date(vertragsEndFuerBerechnung.getTime() - 86_400_000), // back to inclusive
    bewohnungstage:     Math.max(0, bewohnungstage),
    zeitraumTage,
    anteilsfaktor:      Math.max(0, Math.min(1, anteilsfaktor)),
  }
}

// ─── Umlageschlüssel-Berechnung ────────────────────────────────

export interface UmlageResult {
  schluessel:         Umlageschluessel
  anteilNumerator:    number
  anteilDenominator:  number
  anteilFaktor:       number
  formelText:         string
  warnings:           BerechnungsWarning[]
}

/**
 * Calculate the distribution fraction for one unit under a given key.
 * Returns { anteilFaktor: 0, warnings: [...] } when data is insufficient.
 */
export function berechneUmlageAnteil(
  einheit:         EinheitDaten,
  alleEinheiten:   EinheitDaten[],
  objekt:          ObjektDaten,
  schluessel:      Umlageschluessel,
): UmlageResult {
  const warnings: BerechnungsWarning[] = []

  switch (schluessel) {
    case 'wohnflaeche': {
      const numerator   = einheit.wohnflaecheM2
      const denominator = objekt.wohnflaecheGesamtM2
      if (!numerator || !denominator) {
        warnings.push({ code: 'FLAECHE_FEHLT', message: `Einheit ${einheit.bezeichnung}: Wohnfläche nicht hinterlegt` })
        return { schluessel, anteilNumerator: 0, anteilDenominator: 0, anteilFaktor: 0, formelText: '? / ?', warnings }
      }
      const anteilFaktor = round6(numerator / denominator)
      return { schluessel, anteilNumerator: numerator, anteilDenominator: denominator, anteilFaktor, formelText: `${fmt(numerator)} m² / ${fmt(denominator)} m²`, warnings }
    }

    case 'gesamtflaeche': {
      const wohn = einheit.wohnflaecheM2 ?? 0
      const nutz = einheit.nutzflaecheM2 ?? 0
      const numerator = wohn + nutz

      const gesamtWohn = objekt.wohnflaecheGesamtM2
      const gesamtNutz = objekt.nutzflaecheGesamtM2 ?? 0
      const denominator = gesamtWohn + gesamtNutz

      if (!numerator || !denominator) {
        warnings.push({ code: 'GESAMTFLAECHE_FEHLT', message: `Fläche fehlt für Einheit ${einheit.bezeichnung}` })
        return { schluessel, anteilNumerator: 0, anteilDenominator: 0, anteilFaktor: 0, formelText: '? / ?', warnings }
      }
      const anteilFaktor = round6(numerator / denominator)
      return { schluessel, anteilNumerator: numerator, anteilDenominator: denominator, anteilFaktor, formelText: `${fmt(numerator)} m² / ${fmt(denominator)} m²`, warnings }
    }

    case 'personenanzahl': {
      const numerator   = einheit.personenAnzahl
      const denominator = alleEinheiten.reduce((s, e) => s + (e.personenAnzahl ?? 0), 0)
      if (!numerator || !denominator) {
        warnings.push({ code: 'PERSONEN_FEHLT', message: `Personenzahl fehlt für Einheit ${einheit.bezeichnung}` })
        return { schluessel, anteilNumerator: 0, anteilDenominator: 0, anteilFaktor: 0, formelText: '? / ?', warnings }
      }
      const anteilFaktor = round6(numerator / denominator)
      return { schluessel, anteilNumerator: numerator, anteilDenominator: denominator, anteilFaktor, formelText: `${numerator} Personen / ${denominator} Personen`, warnings }
    }

    case 'miteigentumsanteile': {
      const numerator   = einheit.meaAnteil
      const denominator = objekt.meaGesamt
      if (!numerator || !denominator) {
        warnings.push({ code: 'MEA_FEHLT', message: `Miteigentumsanteil fehlt für Einheit ${einheit.bezeichnung}` })
        return { schluessel, anteilNumerator: 0, anteilDenominator: 0, anteilFaktor: 0, formelText: '? / ?', warnings }
      }
      const anteilFaktor = round6(numerator / denominator)
      return { schluessel, anteilNumerator: numerator, anteilDenominator: denominator, anteilFaktor, formelText: `${numerator}/${denominator} MEA`, warnings }
    }

    case 'gleiche_teile': {
      const aktiveEinheiten = alleEinheiten.length
      if (!aktiveEinheiten) {
        warnings.push({ code: 'KEINE_EINHEITEN', message: 'Keine aktiven Einheiten für gleiche-Teile-Umlage' })
        return { schluessel, anteilNumerator: 0, anteilDenominator: 0, anteilFaktor: 0, formelText: '? / ?', warnings }
      }
      const anteilFaktor = round6(1 / aktiveEinheiten)
      return { schluessel, anteilNumerator: 1, anteilDenominator: aktiveEinheiten, anteilFaktor, formelText: `1 / ${aktiveEinheiten} Einheiten`, warnings }
    }

    case 'verbrauchsmessung': {
      // Without actual Zählerstände in this calculation pass, fall back to Wohnfläche with warning
      warnings.push({
        code:    'VERBRAUCH_FALLBACK',
        message: `Einheit ${einheit.bezeichnung}: Keine Zählerstände vorhanden – Fallback auf Wohnfläche`,
        context: { einheitId: einheit.id },
      })
      return berechneUmlageAnteil(einheit, alleEinheiten, objekt, 'wohnflaeche')
    }

    default: {
      const _exhaustive: never = schluessel
      throw new Error(`Unbekannter Umlageschlüssel: ${_exhaustive}`)
    }
  }
}

// ─── Vorauszahlungen ───────────────────────────────────────────

/**
 * Pro-rate monthly NK advance payment for the actual occupancy days.
 * Uses average month length (30.4375 days) for daily rate.
 */
export function berechneVorauszahlung(
  nkVorauszahlungMonatlich: number,
  bewohnungstage:           number,
): { gesamt: number; tagessatz: number; formel: string } {
  const tagessatz = nkVorauszahlungMonatlich / 30.4375
  const gesamt    = round2(tagessatz * bewohnungstage)
  return {
    gesamt,
    tagessatz: round6(tagessatz),
    formel:    `${fmt(nkVorauszahlungMonatlich)} € / 30,4375 × ${bewohnungstage} Tage = ${fmt(gesamt)} €`,
  }
}

// ─── Formatting helpers ────────────────────────────────────────

function round2(n: number): number  { return Math.round(n * 100) / 100 }
function round6(n: number): number  { return Math.round(n * 1_000_000) / 1_000_000 }
function fmt(n: number): string     { return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
