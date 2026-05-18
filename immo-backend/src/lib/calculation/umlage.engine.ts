// ─── NK Umlage Engine ─────────────────────────────────────────
// Pure function: BerechnungsInput → BerechnungsErgebnis
// No DB access. Every number is traceable via formula_log.

import {
  berechneAnteiligkeit,
  berechneUmlageAnteil,
  berechneVorauszahlung,
  daysBetween,
} from './anteil.calculator.js'
import type {
  BerechnungsInput,
  BerechnungsErgebnis,
  MieterAbrechnung,
  NkPosition,
  FormelLog,
  NkPositionLog,
  BerechnungsWarning,
} from './types.js'

export const BERECHNUNGS_VERSION = '1.0.0'

const TAGESGENAU_TAGESSATZ_DIVISOR = 30.4375  // average days per month

// ─── Main engine function ──────────────────────────────────────

export function berechneNebenkostenabrechnung(
  input: BerechnungsInput,
): BerechnungsErgebnis {
  const allWarnings: BerechnungsWarning[] = []
  const abrechnungen: MieterAbrechnung[] = []

  // End of Abrechnungszeitraum is inclusive → add 1 day for calculations
  const periodEnd = new Date(input.zeitraumBis)
  periodEnd.setDate(periodEnd.getDate() + 1)
  const zeitraumTage = daysBetween(input.zeitraumVon, periodEnd)

  // Collect only umlagefähige Kostenpositionen grouped by Kostenart
  const kostenNachArt = groupKosten(input)

  // Calculate one abrechnung per active Mietvertrag
  for (const vertrag of input.vertraege) {
    const einheit = input.einheiten.find((e) => e.id === vertrag.einheitId)
    if (!einheit) {
      allWarnings.push({
        code:    'EINHEIT_NICHT_GEFUNDEN',
        message: `Einheit ${vertrag.einheitId} für Vertrag ${vertrag.id} nicht gefunden`,
      })
      continue
    }

    // Pro-rata for this contract in the period
    const anteiligkeit = berechneAnteiligkeit(vertrag, input.zeitraumVon, input.zeitraumBis)

    if (anteiligkeit.bewohnungstage <= 0) continue

    const positionen: NkPosition[] = []
    const positionenLog: NkPositionLog[] = []

    // Calculate one NK-Position per Kostenart
    for (const [kostenartId, gesamtbetrag] of kostenNachArt.entries()) {
      const kostenart = input.kostenarten.get(kostenartId)
      if (!kostenart) continue

      const umlageKonfig = input.umlageKonfigurationen.get(kostenartId)
      const schluessel = umlageKonfig?.schluesselTyp ?? 'wohnflaeche'

      // Get distribution fraction for this unit
      const umlage = berechneUmlageAnteil(
        einheit,
        input.einheiten,
        input.objekt,
        schluessel,
      )
      allWarnings.push(...umlage.warnings)

      if (umlage.anteilFaktor === 0 && umlage.warnings.length > 0) continue

      // HeizKV: split between Verbrauch and Fläche
      let betragNachSchluessel: number
      if (kostenart.heizkvRelevant && umlageKonfig?.verbrauchsanteilPct) {
        const result = berechneHeizkvAnteil(
          gesamtbetrag,
          einheit,
          input.einheiten,
          input.objekt,
          umlageKonfig,
          input.verbrauchsdaten.get(einheit.id),
          allWarnings,
        )
        betragNachSchluessel = result
      } else {
        betragNachSchluessel = round2(gesamtbetrag * umlage.anteilFaktor)
      }

      // Apply pro-rata for occupancy period
      const betragEinheit = round2(betragNachSchluessel * anteiligkeit.anteilsfaktor)

      const vorauszahlungCalc = berechneVorauszahlung(
        vertrag.nkVorauszahlung,
        anteiligkeit.bewohnungstage,
      )

      // Apportion Vorauszahlung proportionally to this Kostenart
      // Approximate: split evenly across all Kostenarten with umlagefähig=ja
      // The exact attribution per Kostenart is tracked in positionen
      // Final net is calculated at Abrechnung level
      const saldo = round2(betragEinheit)  // Vorauszahlung deducted at summary level

      const formelText = buildFormelText(
        gesamtbetrag,
        umlage.anteilNumerator,
        umlage.anteilDenominator,
        umlage.schluessel,
        anteiligkeit.bewohnungstage,
        anteiligkeit.zeitraumTage,
        betragEinheit,
      )

      positionen.push({
        kostenartId,
        kostenartKuerzel:     kostenart.kuerzel,
        kostenartBezeichnung: kostenart.bezeichnung,
        gesamtbetragObjekt:   gesamtbetrag,
        umlageschluessel:     schluessel,
        anteilNumerator:      umlage.anteilNumerator,
        anteilDenominator:    umlage.anteilDenominator,
        anteilFaktor:         umlage.anteilFaktor,
        betragJahresanteil:   betragNachSchluessel,
        bewohnungstage:       anteiligkeit.bewohnungstage,
        zeitraumTage:         anteiligkeit.zeitraumTage,
        anteiligkeitsFaktor:  anteiligkeit.anteilsfaktor,
        betragEinheit,
        vorauszahlungAnteil:  0, // Distributed at summary level
        saldo:                betragEinheit,
        formelText,
      })

      positionenLog.push({
        kostenart:             `${kostenart.kuerzel} – ${kostenart.bezeichnung}`,
        gesamtbetragObjekt:    gesamtbetrag,
        schluessel,
        anteilFormel:          `${umlage.anteilNumerator} / ${umlage.anteilDenominator}`,
        anteilFaktor:          umlage.anteilFaktor,
        betragNachSchluessel,
        anteiligkeitFormel:    `${anteiligkeit.bewohnungstage} / ${anteiligkeit.zeitraumTage}`,
        anteiligkeitFaktor:    anteiligkeit.anteilsfaktor,
        betragEinheit,
      })
    }

    // Total costs and Vorauszahlungen
    const gesamtkostenAnteil   = round2(positionen.reduce((s, p) => s + p.betragEinheit, 0))
    const vpCalc               = berechneVorauszahlung(vertrag.nkVorauszahlung, anteiligkeit.bewohnungstage)
    const vorauszahlungenGesamt = vpCalc.gesamt
    const nachzahlungOderGuthaben = round2(gesamtkostenAnteil - vorauszahlungenGesamt)

    // Build formula log
    const formelLog: FormelLog = {
      berechnungsVersion: BERECHNUNGS_VERSION,
      zeitraumVon:        input.zeitraumVon.toISOString().split('T')[0]!,
      zeitraumBis:        input.zeitraumBis.toISOString().split('T')[0]!,
      zeitraumTage,
      objekt:             { id: input.objekt.id, wohnflaecheGesamt: input.objekt.wohnflaecheGesamtM2 },
      einheit:            { id: einheit.id, bezeichnung: einheit.bezeichnung, wohnflaeche: einheit.wohnflaecheM2 },
      bewohnungstage:     anteiligkeit.bewohnungstage,
      anteilsfaktor:      `${anteiligkeit.bewohnungstage}/${anteiligkeit.zeitraumTage} = ${anteiligkeit.anteilsfaktor.toFixed(6)}`,
      positionen:         positionenLog,
      vorauszahlungen: {
        monatlicheVorauszahlung: vertrag.nkVorauszahlung,
        bewohnungstage:          anteiligkeit.bewohnungstage,
        tagessatz:               vpCalc.tagessatz,
        gesamt:                  vpCalc.gesamt,
        formel:                  vpCalc.formel,
      },
      ergebnis: {
        gesamtkostenAnteil,
        vorauszahlungen: vorauszahlungenGesamt,
        saldo:           nachzahlungOderGuthaben,
      },
    }

    abrechnungen.push({
      mietvertragId:           vertrag.id,
      einheitId:               einheit.id,
      einheitBezeichnung:      einheit.bezeichnung,
      abrechnungsbeginn:       anteiligkeit.abrechnungsbeginn,
      abrechnungsende:         anteiligkeit.abrechnungsende,
      bewohnungstage:          anteiligkeit.bewohnungstage,
      zeitraumTage:            anteiligkeit.zeitraumTage,
      anteilsfaktor:           anteiligkeit.anteilsfaktor,
      positionen,
      gesamtkostenAnteil,
      vorauszahlungenGesamt,
      nachzahlungOderGuthaben,
      formelLog,
    })
  }

  return { zeitraumTage, abrechnungen, warnings: allWarnings }
}

// ─── HeizKV split ─────────────────────────────────────────────

function berechneHeizkvAnteil(
  gesamtbetrag:  number,
  einheit:       import('./types.js').EinheitDaten,
  alleEinheiten: import('./types.js').EinheitDaten[],
  objekt:        import('./types.js').ObjektDaten,
  config:        import('./types.js').UmlageKonfiguration,
  verbrauch:     import('./types.js').VerbrauchsInput | undefined,
  warnings:      BerechnungsWarning[],
): number {
  const verbrauchsanteil = (config.verbrauchsanteilPct ?? 70) / 100
  const flaechenanteil   = 1 - verbrauchsanteil

  // Verbrauchsanteil: requires Zählerstände per Einheit
  let verbrauchsAnteilBetrag: number

  if (!verbrauch?.kwh && !verbrauch?.liter) {
    // No consumption data → fall back to Fläche with warning
    warnings.push({
      code:    'HEIZKV_VERBRAUCH_FALLBACK',
      message: `Einheit ${einheit.bezeichnung}: Keine Verbrauchsdaten – HeizKV-Verbrauchsanteil wird nach Fläche berechnet`,
      context: { einheitId: einheit.id },
    })
    // All distributed by Fläche
    const flaecheAnteil = berechneUmlageAnteil(einheit, alleEinheiten, objekt, 'wohnflaeche')
    return round2(gesamtbetrag * flaecheAnteil.anteilFaktor)
  } else {
    // Has consumption data – use it for the Verbrauchsanteil portion
    const totalVerbrauch = alleEinheiten.reduce((s, e) => {
      // Sum up from passed verbrauchsdaten – not available here directly
      // This would require the full map; simplified for MVP
      return s
    }, 0)
    // Fallback until per-unit Zählerstände are fully implemented (v1.1)
    const flaecheAnteil = berechneUmlageAnteil(einheit, alleEinheiten, objekt, 'wohnflaeche')
    verbrauchsAnteilBetrag = round2(gesamtbetrag * verbrauchsanteil * flaecheAnteil.anteilFaktor)
  }

  const flaecheAnteilCalc    = berechneUmlageAnteil(einheit, alleEinheiten, objekt, 'wohnflaeche')
  const flaechenAnteilBetrag = round2(gesamtbetrag * flaechenanteil * flaecheAnteilCalc.anteilFaktor)

  return round2(verbrauchsAnteilBetrag + flaechenAnteilBetrag)
}

// ─── Aggregation helpers ───────────────────────────────────────

/** Sum Bruttobetrag per Kostenart, filtering out non-umlagefähige. */
function groupKosten(input: BerechnungsInput): Map<string, number> {
  const result = new Map<string, number>()

  for (const pos of input.kostenpositionen) {
    const kostenart = input.kostenarten.get(pos.kostenartId)
    if (!kostenart) continue
    if (kostenart.umlagefaehig === 'nein') continue

    result.set(pos.kostenartId, round2((result.get(pos.kostenartId) ?? 0) + pos.bruttobetrag))
  }

  return result
}

// ─── Helpers ──────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function buildFormelText(
  gesamtbetrag:  number,
  numerator:     number,
  denominator:   number,
  schluessel:    string,
  bewohnungstage: number,
  zeitraumTage:   number,
  ergebnis:       number,
): string {
  const anteilStr = denominator > 0 ? `(${numerator} / ${denominator})` : '(?/?)'
  const tagStr    = bewohnungstage === zeitraumTage ? '' : ` × (${bewohnungstage} / ${zeitraumTage})`
  return `${fmtEur(gesamtbetrag)} × ${anteilStr} [${schluessel}]${tagStr} = ${fmtEur(ergebnis)}`
}

function fmtEur(n: number): string {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}
