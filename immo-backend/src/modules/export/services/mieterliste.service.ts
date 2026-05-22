/**
 * Mieterliste-Export als Excel (.xlsx)
 *
 * Spalten pro Zeile:
 *   Firma | Objekt | Einheit | Mieter | MV seit | Letzte Erhöhung | m² |
 *   Laufzeit bis | Miete/m² | Kaltmiete | NK-Vorauszahlung | Warmmiete | Warmmiete inkl. 19% MwSt
 *
 * Sheets: "Gesamt" + je ein Sheet pro Firma
 */
import ExcelJS from 'exceljs'
import type { PrismaClient } from '@prisma/client'

function fmt(d: Date | null | undefined): string {
  if (!d) return ''
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function num(v: unknown): number {
  return Number(v ?? 0)
}

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1E40AF' },  // dark-blue
}
const SUBHEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFdbeafe' },  // light-blue
}

const COLUMNS = [
  { header: 'Firma',              key: 'firma',        width: 22 },
  { header: 'Objekt',             key: 'objekt',       width: 28 },
  { header: 'Einheit',            key: 'einheit',      width: 16 },
  { header: 'Mieter',             key: 'mieter',       width: 24 },
  { header: 'MV seit',            key: 'mvSeit',       width: 13 },
  { header: 'Letzte Erhöhung',    key: 'letzteErhöhung', width: 16 },
  { header: 'm²',                 key: 'm2',           width: 8 },
  { header: 'Laufzeit bis',       key: 'laufzeitBis',  width: 13 },
  { header: 'Miete / m²',         key: 'mieteProM2',   width: 12 },
  { header: 'Kaltmiete',          key: 'kaltmiete',    width: 12 },
  { header: 'NK-Vorauszahlung',   key: 'nkVorausz',    width: 16 },
  { header: 'Warmmiete',          key: 'warmmiete',    width: 12 },
  { header: 'Warmmiete + MwSt',   key: 'warmmieteMwSt', width: 16 },
]

interface MieterRow {
  firma:          string
  objekt:         string
  einheit:        string
  mieter:         string
  mvSeit:         string
  letzteErhöhung: string
  m2:             number | string
  laufzeitBis:    string
  mieteProM2:     number | string
  kaltmiete:      number
  nkVorausz:      number
  warmmiete:      number
  warmmieteMwSt:  number
}

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill   = HEADER_FILL
    cell.font   = { color: { argb: 'FFFFFFFF' }, bold: true, size: 10 }
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF93C5FD' } } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  })
  row.height = 22
}

function styleGroupHeader(row: ExcelJS.Row, label: string, colCount: number) {
  row.getCell(1).value = label
  row.getCell(1).fill  = SUBHEADER_FILL
  row.getCell(1).font  = { bold: true, size: 10, color: { argb: 'FF1E3A8A' } }
  row.getCell(1).alignment = { vertical: 'middle' }
  // Merge cells across all columns for group header
  for (let c = 2; c <= colCount; c++) {
    row.getCell(c).fill = SUBHEADER_FILL
  }
  row.height = 18
}

function addDataRows(ws: ExcelJS.Worksheet, rows: MieterRow[]) {
  rows.forEach((r, idx) => {
    const dataRow = ws.addRow([
      r.firma, r.objekt, r.einheit, r.mieter,
      r.mvSeit, r.letzteErhöhung,
      r.m2 !== '' ? r.m2 : '',
      r.laufzeitBis,
      r.mieteProM2 !== '' ? r.mieteProM2 : '',
      r.kaltmiete, r.nkVorausz, r.warmmiete, r.warmmieteMwSt,
    ])

    const isEven = idx % 2 === 0
    dataRow.eachCell((cell, colNum) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isEven ? 'FFFFFFFF' : 'FFF8FAFF' },
      }
      cell.border = {
        bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } },
      }
      cell.font = { size: 10 }
      // Zahlen-Spalten (Kaltmiete, NK, Warmmiete etc.)
      if (colNum >= 9) {
        cell.numFmt = '#,##0.00 "€"'
        cell.alignment = { horizontal: 'right' }
      } else if (colNum === 7) {
        // m²
        cell.numFmt = '#,##0.00'
        cell.alignment = { horizontal: 'right' }
      } else {
        cell.alignment = { horizontal: 'left', wrapText: false }
      }
    })
    dataRow.height = 16
  })
}

function addSumRow(ws: ExcelJS.Worksheet, rows: MieterRow[]) {
  if (rows.length === 0) return
  const sumRow = ws.addRow([
    '', '', '', `Summe (${rows.length} Einheiten)`, '', '', '', '',
    '',
    rows.reduce((s, r) => s + r.kaltmiete, 0),
    rows.reduce((s, r) => s + r.nkVorausz, 0),
    rows.reduce((s, r) => s + r.warmmiete, 0),
    rows.reduce((s, r) => s + r.warmmieteMwSt, 0),
  ])
  sumRow.eachCell((cell, colNum) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } }
    cell.font = { bold: true, size: 10 }
    if (colNum >= 10) {
      cell.numFmt = '#,##0.00 "€"'
      cell.alignment = { horizontal: 'right' }
    }
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF93C5FD' } },
      bottom: { style: 'medium', color: { argb: 'FF1E40AF' } },
    }
  })
  sumRow.height = 18
}

function buildSheet(ws: ExcelJS.Worksheet, rows: MieterRow[], groupByFirma = true) {
  ws.columns = COLUMNS

  // Header-Zeile
  const headerRow = ws.addRow(COLUMNS.map(c => c.header))
  styleHeader(headerRow)
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }]
  ws.autoFilter = { from: 'A1', to: `M1` }

  if (!groupByFirma || rows.length === 0) {
    addDataRows(ws, rows)
    addSumRow(ws, rows)
    return
  }

  // Nach Firma + Objekt gruppiert
  const firmen = [...new Set(rows.map(r => r.firma))]
  for (const firma of firmen) {
    const firmaRows = rows.filter(r => r.firma === firma)
    const objekte = [...new Set(firmaRows.map(r => r.objekt))]

    for (const objekt of objekte) {
      const objektRows = firmaRows.filter(r => r.objekt === objekt)
      const groupLabel = groupByFirma ? `${firma}  —  ${objekt}` : objekt
      const groupHeaderRow = ws.addRow([])
      styleGroupHeader(groupHeaderRow, groupLabel, COLUMNS.length)
      addDataRows(ws, objektRows)
    }

    // Firmen-Summe
    addSumRow(ws, firmaRows)
    ws.addRow([]) // Leerzeile zwischen Firmen
  }
}

export async function erstelleMieterlisteExcel(prisma: PrismaClient, tenantId: string): Promise<Buffer> {
  // Alle aktiven Mietverträge mit allen Relations laden
  const vertraege = await prisma.mietvertrag.findMany({
    where: {
      tenantId,
      deletedAt: null,
    },
    include: {
      einheit: {
        include: {
          objekt: {
            include: { firma: true },
          },
        },
      },
      mietvertragMieter: {
        where: { bis: null },
        include: { mieter: true },
        orderBy: { seit: 'desc' },
        take: 1,
      },
      mieterhoehungen: {
        orderBy: { letzteErhoehungDatum: 'desc' },
        take: 1,
      },
    },
    orderBy: [
      { einheit: { objekt: { firma: { name: 'asc' } } } },
      { einheit: { objekt: { bezeichnung: 'asc' } } },
      { einheit: { bezeichnung: 'asc' } },
    ],
  })

  // Zeilen aufbereiten
  const rows: MieterRow[] = vertraege.map((mv) => {
    const einheit = mv.einheit
    const objekt  = einheit.objekt
    const firma   = objekt.firma?.name ?? '(keine Firma)'
    const hauptmieter = mv.mietvertragMieter[0]?.mieter
    const mieterName  = hauptmieter
      ? `${hauptmieter.vorname ?? ''} ${hauptmieter.nachname}`.trim()
      : '(leer)'

    const kaltmiete   = num(mv.nettomiete)
    const nkVorausz   = num(mv.nkVorauszahlung)
    const warmmiete   = kaltmiete + nkVorausz
    const mwstFaktor  = 1.19
    const warmmieteMwSt = Math.round(warmmiete * mwstFaktor * 100) / 100

    const m2          = einheit.wohnflaecheM2 ? num(einheit.wohnflaecheM2) : ''
    const mieteProM2  = m2 !== '' && m2 > 0
      ? Math.round((kaltmiete / (m2 as number)) * 100) / 100
      : ''

    const letzteErh = mv.mieterhoehungen[0]?.letzteErhoehungDatum

    return {
      firma,
      objekt:         objekt.bezeichnung,
      einheit:        einheit.bezeichnung,
      mieter:         mieterName,
      mvSeit:         fmt(mv.vertragsbeginn),
      letzteErhöhung: fmt(letzteErh),
      m2,
      laufzeitBis:    fmt(mv.vertragsende),
      mieteProM2,
      kaltmiete,
      nkVorausz,
      warmmiete,
      warmmieteMwSt,
    }
  })

  // Workbook aufbauen
  const wb = new ExcelJS.Workbook()
  wb.creator  = 'Enzi Immobilienverwaltung'
  wb.created  = new Date()
  wb.modified = new Date()

  // Sheet 1: Gesamt
  const wsGesamt = wb.addWorksheet('Gesamt', { properties: { tabColor: { argb: 'FF1E40AF' } } })
  buildSheet(wsGesamt, rows, true)

  // Sheet je Firma
  const firmen = [...new Set(rows.map(r => r.firma))]
  for (const firma of firmen) {
    const firmaRows = rows.filter(r => r.firma === firma)
    // Sheet-Name max 31 Zeichen, Sonderzeichen entfernen
    const sheetName = firma.replace(/[\\/*?[\]:]/g, '').slice(0, 31)
    const wsFirma = wb.addWorksheet(sheetName, { properties: { tabColor: { argb: 'FF0EA5E9' } } })
    buildSheet(wsFirma, firmaRows, false)
  }

  const buffer = await wb.xlsx.writeBuffer()
  return Buffer.from(buffer)
}
