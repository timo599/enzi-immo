/**
 * Export-Service
 *
 * Erzeugt NK-Abrechnungs-PDFs, speichert sie in S3 und gibt einen
 * zeitlich begrenzten Download-Link zurück.
 */

import type { PrismaClient } from '@prisma/client'
import { NotFoundError } from '../../../utils/errors.js'
import { writeAudit } from '../../../utils/audit.js'
import { uploadFile, getPresignedDownloadUrl } from '../../../lib/storage/storage.service.js'
import { generiereNkAbrechnungPdf } from '../../../lib/pdf/nk-abrechnung.pdf.js'
import type { RequestContext } from '../../../types/common.js'

const PDF_GUELTIGKEIT_SEKUNDEN = 60 * 60 // 1 Stunde

export class ExportService {
  constructor(private readonly prisma: PrismaClient) {}

  async erstelleNkAbrechnungPdf(ctx: RequestContext, abrechnungId: string) {
    // Abrechnung laden
    const abrechnung = await this.prisma.nkAbrechnung.findFirst({
      where: { id: abrechnungId, tenantId: ctx.tenantId },
      include: {
        positionen: {
          include: { kostenart: { select: { bezeichnung: true } } },
        },
        mietvertrag: {
          include: {
            einheit: { include: { objekt: true } },
            mietvertragMieter: {
              include: { mieter: true },
              where: { bis: null },
            },
          },
        },
        zeitraum: { include: { objekt: true } },
      },
    })

    if (!abrechnung) throw new NotFoundError('NkAbrechnung', abrechnungId)

    // Mieter-Daten
    const hauptmieter = abrechnung.mietvertrag.mietvertragMieter[0]?.mieter
    const mieterName = hauptmieter
      ? `${hauptmieter.vorname ?? ''} ${hauptmieter.nachname}`.trim()
      : 'Unbekannt'

    const objekt = abrechnung.mietvertrag.einheit.objekt
    const objektAdresse = `${objekt.strasse} ${objekt.hausnummer}, ${objekt.plz} ${objekt.stadt}`

    // Existierendes PDF prüfen (nicht älter als 24h)
    const vorhandenerExport = await this.prisma.export.findFirst({
      where: {
        tenantId:    ctx.tenantId,
        referenzTyp: 'nk_abrechnung',
        referenzId:  abrechnungId,
        exportTyp:   'pdf',
        gueltigBis:  { gte: new Date() },
      },
      orderBy: { erstelltAm: 'desc' },
    })

    if (vorhandenerExport) {
      const url = await getPresignedDownloadUrl(vorhandenerExport.s3Key, PDF_GUELTIGKEIT_SEKUNDEN)
      return { data: { url, dateiname: vorhandenerExport.dateiname, neu: false } }
    }

    // PDF generieren
    const mieterStrasse = hauptmieter?.strasse && hauptmieter?.hausnummer
      ? `${hauptmieter.strasse} ${hauptmieter.hausnummer}`
      : undefined
    const mieterStadt = hauptmieter?.plz && hauptmieter?.stadt
      ? `${hauptmieter.plz} ${hauptmieter.stadt}`
      : undefined

    const pdfDaten: import('../../../lib/pdf/nk-abrechnung.pdf.js').NkAbrechnungPdfDaten = {
      abrechnungId,
      zeitraumVon:   abrechnung.abrechnungsbeginn.toISOString().slice(0, 10),
      zeitraumBis:   abrechnung.abrechnungsende.toISOString().slice(0, 10),
      ausstellungsDatum: new Date().toISOString().slice(0, 10),
      verwaltungName: 'ImmoManager Pro Hausverwaltung',
      mieterName,
      ...(mieterStrasse !== undefined ? { mieterStrasse } : {}),
      ...(mieterStadt   !== undefined ? { mieterStadt   } : {}),
      einheitBezeichnung: abrechnung.mietvertrag.einheit.bezeichnung,
      objektAdresse,
      anteilsfaktor:  Number(abrechnung.anteilsfaktor),
      bewohnungstage: abrechnung.bewohnungstage,
      zeitraumTage:   abrechnung.zeitraumTage,
      positionen: abrechnung.positionen.map((p: { kostenart: { bezeichnung: string }; gesamtbetragObjekt: unknown; anteilFaktor: unknown; betragEinheit: unknown; anteilFormel: string }) => ({
        kostenartBezeichnung: p.kostenart.bezeichnung,
        gesamtbetragObjekt:  Number(p.gesamtbetragObjekt),
        anteilFaktor:        Number(p.anteilFaktor),
        betragEinheit:       Number(p.betragEinheit),
        anteilFormel:        p.anteilFormel,
      })),
      vorauszahlungenGesamt:   Number(abrechnung.vorauszahlungenGesamt),
      nachzahlungOderGuthaben: Number(abrechnung.nachzahlungOderGuthaben),
    }

    const pdfBuffer = await generiereNkAbrechnungPdf(pdfDaten)

    // S3 Upload
    const dateiname = `NK-Abrechnung_${mieterName.replace(/\s+/g, '_')}_${pdfDaten.zeitraumVon.slice(0, 4)}.pdf`
    const s3Key = `exports/${ctx.tenantId}/nk-abrechnungen/${abrechnungId}/${Date.now()}.pdf`

    await uploadFile({
      key:         s3Key,
      body:        pdfBuffer,
      mimeType: 'application/pdf',
      metadata:    { tenantId: ctx.tenantId, abrechnungId },
    })

    // Export-Record speichern
    const gueltigBis = new Date()
    gueltigBis.setDate(gueltigBis.getDate() + 30) // 30 Tage gültig

    const exportRecord = await this.prisma.export.create({
      data: {
        tenantId:      ctx.tenantId,
        exportTyp:     'pdf',
        referenzTyp:   'nk_abrechnung',
        referenzId:    abrechnungId,
        nkAbrechnungId: abrechnungId,
        s3Key,
        dateiname,
        fileSizeBytes:  BigInt(pdfBuffer.length),
        erstelltVon:   ctx.userId,
        gueltigBis,
      },
    })

    await writeAudit({
      prisma: this.prisma,
      ctx,
      entityType: 'Export',
      entityId:   exportRecord.id,
      action:     'CREATE',
      newData:    { exportTyp: 'pdf', referenzId: abrechnungId },
    })

    const url = await getPresignedDownloadUrl(s3Key, PDF_GUELTIGKEIT_SEKUNDEN)
    return { data: { url, dateiname, neu: true } }
  }

  async listExporte(ctx: RequestContext, referenzId?: string) {
    const exporte = await this.prisma.export.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(referenzId ? { referenzId } : {}),
      },
      orderBy: { erstelltAm: 'desc' },
      take: 50,
    })
    return { data: exporte }
  }
}
