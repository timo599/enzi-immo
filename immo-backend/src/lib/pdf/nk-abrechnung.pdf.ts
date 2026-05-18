/**
 * PDF-Generator für NK-Abrechnungen
 *
 * Erzeugt ein mieterfreundliches PDF mit:
 * - Briefkopf (Verwaltungsadresse)
 * - Abrechnungszeitraum + Mieterdaten
 * - Kostenpositionen-Tabelle
 * - Vorauszahlungen
 * - Nachzahlung / Guthaben (fett hervorgehoben)
 * - Rechtshinweis (Widerspruchsfrist 12 Monate §556 Abs. 3 BGB)
 */

import PDFDocument from 'pdfkit'

export interface NkAbrechnungPdfDaten {
  // Metadaten
  abrechnungId:    string
  zeitraumVon:     string  // ISO-Date
  zeitraumBis:     string
  ausstellungsDatum: string

  // Verwaltung / Absender
  verwaltungName:  string
  verwaltungStrasse?: string
  verwaltungStadt?: string

  // Mieter / Empfänger
  mieterName:      string
  mieterStrasse?:  string
  mieterStadt?:    string
  einheitBezeichnung: string
  objektAdresse:   string

  // Berechnung
  anteilsfaktor:         number  // z.B. 0.125
  bewohnungstage:        number
  zeitraumTage:          number
  positionen: {
    kostenartBezeichnung: string
    gesamtbetragObjekt:  number
    anteilFaktor:        number
    betragEinheit:       number
    anteilFormel:        string
  }[]
  vorauszahlungenGesamt:   number
  nachzahlungOderGuthaben: number  // positiv = Nachzahlung, negativ = Guthaben
}

export async function generiereNkAbrechnungPdf(daten: NkAbrechnungPdfDaten): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: 'Nebenkostenabrechnung' } })
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const W = 495 // Nutzbreite

    // ── Farben & Schriften ────────────────────────────────────────────────────
    const GRAU = '#666666'
    const DUNKEL = '#1a1a1a'
    const ROT = '#cc0000'
    const GRUEN = '#007700'
    const HELLGRAU = '#f5f5f5'

    // ── Kopfzeile ─────────────────────────────────────────────────────────────
    doc.fontSize(18).fillColor(DUNKEL).text('Nebenkostenabrechnung', { align: 'left' })
    doc.fontSize(10).fillColor(GRAU)
      .text(`Abrechnungszeitraum: ${formatDatum(daten.zeitraumVon)} – ${formatDatum(daten.zeitraumBis)}`)
      .text(`Ausgestellt am: ${formatDatum(daten.ausstellungsDatum)}`)
    doc.moveDown(0.5)

    // Trennlinie
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#dddddd').stroke()
    doc.moveDown(0.5)

    // ── Absender / Empfänger ──────────────────────────────────────────────────
    const col2X = 300
    const adressY = doc.y

    doc.fontSize(9).fillColor(GRAU).text('Absender', 50, adressY)
    doc.fontSize(10).fillColor(DUNKEL)
      .text(daten.verwaltungName, 50, adressY + 14)
    if (daten.verwaltungStrasse) doc.text(daten.verwaltungStrasse, 50)
    if (daten.verwaltungStadt)  doc.text(daten.verwaltungStadt, 50)

    doc.fontSize(9).fillColor(GRAU).text('Empfänger', col2X, adressY)
    doc.fontSize(10).fillColor(DUNKEL)
      .text(daten.mieterName, col2X, adressY + 14)
    if (daten.mieterStrasse) doc.text(daten.mieterStrasse, col2X)
    if (daten.mieterStadt)   doc.text(daten.mieterStadt, col2X)

    doc.moveDown(1.5)

    // ── Objekt / Einheit ──────────────────────────────────────────────────────
    doc.fontSize(9).fillColor(GRAU).text('Mietobjekt')
    doc.fontSize(10).fillColor(DUNKEL)
      .text(`${daten.objektAdresse} – ${daten.einheitBezeichnung}`)
    doc.fontSize(9).fillColor(GRAU)
      .text(`Bewohnungstage: ${daten.bewohnungstage} von ${daten.zeitraumTage} Tagen (Anteil: ${(daten.anteilsfaktor * 100).toFixed(4)}%)`)
    doc.moveDown(1)

    // ── Kostenpositionen-Tabelle ───────────────────────────────────────────────
    doc.fontSize(11).fillColor(DUNKEL).text('Kostenpositionen', { underline: true })
    doc.moveDown(0.3)

    // Tabellen-Header
    const col = { art: 50, gesamt: 230, anteil: 310, betrag: 420 }
    doc.fontSize(9).fillColor(GRAU)
    doc.text('Kostenart',           col.art,    doc.y, { width: 175, continued: true })
    doc.text('Gesamtkosten Obj.',   col.gesamt, doc.y, { width: 75,  continued: true, align: 'right' })
    doc.text('Ihr Anteil',          col.anteil, doc.y, { width: 100, continued: true, align: 'right' })
    doc.text('Betrag',              col.betrag, doc.y, { width: 80,  align: 'right' })

    doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).strokeColor('#cccccc').stroke()
    doc.moveDown(0.4)

    // Tabellenzeilen
    let summe = 0
    for (const pos of daten.positionen) {
      const y = doc.y
      doc.fontSize(9).fillColor(DUNKEL)
        .text(pos.kostenartBezeichnung, col.art,    y, { width: 175, continued: true })
        .text(euro(pos.gesamtbetragObjekt), col.gesamt, y, { width: 75,  continued: true, align: 'right' })
        .text(pos.anteilFormel,         col.anteil, y, { width: 100, continued: true, align: 'right' })
        .text(euro(pos.betragEinheit),  col.betrag, y, { width: 80,  align: 'right' })
      summe += pos.betragEinheit
    }

    doc.moveTo(50, doc.y + 3).lineTo(545, doc.y + 3).strokeColor('#cccccc').stroke()
    doc.moveDown(0.5)

    // Summe
    doc.fontSize(10).fillColor(DUNKEL)
      .text('Gesamtkosten Ihr Anteil:', col.art, doc.y, { width: 365, continued: true })
      .text(euro(summe), col.betrag, doc.y, { width: 80, align: 'right' })

    doc.moveDown(1)

    // ── Vorauszahlungen ───────────────────────────────────────────────────────
    doc.fontSize(11).fillColor(DUNKEL).text('Abzüglich Vorauszahlungen', { underline: true })
    doc.moveDown(0.3)
    doc.fontSize(10)
      .text('Geleistete NK-Vorauszahlungen:', col.art, doc.y, { width: 365, continued: true })
      .text(`- ${euro(daten.vorauszahlungenGesamt)}`, col.betrag, doc.y, { width: 80, align: 'right' })

    doc.moveDown(1)

    // ── Ergebnis ──────────────────────────────────────────────────────────────
    const istNachzahlung = daten.nachzahlungOderGuthaben >= 0
    const farbe = istNachzahlung ? ROT : GRUEN
    const label = istNachzahlung ? 'Ihre Nachzahlung:' : 'Ihr Guthaben:'
    const betragAbs = Math.abs(daten.nachzahlungOderGuthaben)

    // Hintergrund-Box für Ergebnis
    const boxY = doc.y
    doc.rect(50, boxY, W, 30).fill(HELLGRAU)
    doc.fontSize(12).fillColor(farbe).font('Helvetica-Bold')
      .text(label, 60, boxY + 8, { width: 355, continued: true })
      .text(euro(betragAbs), col.betrag, boxY + 8, { width: 80, align: 'right' })
    doc.font('Helvetica')

    doc.moveDown(2.5)

    // Zahlungshinweis
    if (istNachzahlung && betragAbs > 0) {
      doc.fontSize(10).fillColor(DUNKEL)
        .text(`Bitte überweisen Sie den Betrag von ${euro(betragAbs)} innerhalb von 30 Tagen nach Erhalt dieser Abrechnung.`)
      doc.moveDown(0.5)
    } else if (!istNachzahlung && betragAbs > 0) {
      doc.fontSize(10).fillColor(DUNKEL)
        .text(`Das Guthaben von ${euro(betragAbs)} wird mit der nächsten Mietzahlung verrechnet oder auf Wunsch ausgezahlt.`)
      doc.moveDown(0.5)
    }

    // ── Rechtshinweis ─────────────────────────────────────────────────────────
    doc.moveDown(1)
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#dddddd').stroke()
    doc.moveDown(0.5)
    doc.fontSize(8).fillColor(GRAU)
      .text(
        'Gemäß §556 Abs. 3 BGB ist die Abrechnung spätestens 12 Monate nach Ende des Abrechnungszeitraums mitzuteilen. ' +
        'Einwendungen gegen die Abrechnung sind innerhalb von 12 Monaten nach Zugang geltend zu machen (§556 Abs. 3 S. 5 BGB). ' +
        'Diese Abrechnung wurde maschinell erstellt.',
        { align: 'justify' }
      )

    // ── Fußzeile ──────────────────────────────────────────────────────────────
    const pageBottom = 792 - 50 // A4 Höhe minus Margin
    doc.fontSize(8).fillColor(GRAU)
      .text(`Abrechnungs-ID: ${daten.abrechnungId}`, 50, pageBottom - 20, { align: 'left', width: W })

    doc.end()
  }) as unknown as Buffer
}

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

function euro(betrag: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(betrag)
}

function formatDatum(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
