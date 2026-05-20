import type { PrismaClient, ExtractionStatus } from '@prisma/client'
import { DokumenteRepository, ExtraktionenRepository } from '../repositories/dokumente.repository.js'
import { writeAudit } from '../../../utils/audit.js'
import { NotFoundError, ValidationError, AppError } from '../../../utils/errors.js'
import type {
  PatchReviewInput,
  ConfirmReviewInput,
  RejectReviewInput,
  SetManualInput,
} from '../schemas/dokumente.schema.js'
import type { RequestContext } from '../../../types/common.js'

// ─── Flags that are hard blockers for confirmation ─────────────
const CONFIRMATION_BLOCKER_FLAGS = new Set([
  'betrag_konflikt',
  // Note: kostenart_bestaetigung_erforderlich is handled via kostenartId check
])

export class ReviewService {
  private dokRepo:   DokumenteRepository
  private extrRepo:  ExtraktionenRepository

  constructor(private readonly prisma: PrismaClient) {
    this.dokRepo  = new DokumenteRepository(prisma)
    this.extrRepo = new ExtraktionenRepository(prisma)
  }

  // ── GET extraktion ────────────────────────────────────────────

  async getExtraktion(ctx: RequestContext, dokumentId: string) {
    const dok = await this.dokRepo.findById(dokumentId, ctx.tenantId)
    if (!dok) throw new NotFoundError('Dokument', dokumentId)

    const extraktion = await this.extrRepo.findByDokumentId(dokumentId, ctx.tenantId)

    return {
      data: {
        dokument: {
          id:              dok.id,
          originalName:    dok.originalName,
          extractionStatus: dok.extractionStatus,
          mimeType:        dok.mimeType,
          hochgeladenAm:   dok.hochgeladenAm,
        },
        extraktion,
      },
    }
  }

  // ── PATCH: manual field corrections ───────────────────────────

  async patchReview(ctx: RequestContext, dokumentId: string, input: PatchReviewInput) {
    const dok = await this.dokRepo.findById(dokumentId, ctx.tenantId)
    if (!dok) throw new NotFoundError('Dokument', dokumentId)

    if (dok.extractionStatus === 'reviewed') {
      throw new ValidationError('Bereits bestätigte Dokumente können nicht mehr bearbeitet werden')
    }

    const extraktion = await this.extrRepo.findByDokumentId(dokumentId, ctx.tenantId)
    if (!extraktion) {
      throw new AppError('NO_EXTRACTION', 'Keine Extraktionsdaten vorhanden – bitte zuerst Extraktion starten', 422)
    }

    // Build updated extractedFields by merging patch into existing fields
    const currentFields = extraktion.extractedFields as Record<string, unknown>

    const updatedFields: Record<string, unknown> = {
      ...currentFields,
    }

    // Apply field-level patches
    if (input.rechnungsdatum  !== undefined) updatedFields['rechnungsdatum']  = input.rechnungsdatum
    if (input.rechnungsnummer !== undefined) updatedFields['rechnungsnummer'] = input.rechnungsnummer
    if (input.nettobetrag     !== undefined) updatedFields['nettobetrag']     = input.nettobetrag
    if (input.bruttobetrag    !== undefined) updatedFields['bruttobetrag']    = input.bruttobetrag
    if (input.mwstSatz        !== undefined) updatedFields['mwst_satz']       = input.mwstSatz
    if (input.periodeVon      !== undefined) updatedFields['periode_von']     = input.periodeVon
    if (input.periodeBis      !== undefined) updatedFields['periode_bis']     = input.periodeBis
    if (input.objektHinweis   !== undefined) updatedFields['objekt_hinweis']  = input.objektHinweis
    if (input.beschreibungFreitext !== undefined) updatedFields['beschreibung_freitext'] = input.beschreibungFreitext

    // Patch nested lieferant
    if (input.lieferantName || input.lieferantAdresse) {
      const lieferant = (currentFields['lieferant'] as Record<string, unknown> | null) ?? {}
      updatedFields['lieferant'] = {
        ...lieferant,
        ...(input.lieferantName    !== undefined ? { name: input.lieferantName }       : {}),
        ...(input.lieferantAdresse !== undefined ? { adresse: input.lieferantAdresse } : {}),
      }
    }

    // Remove resolved flags
    let currentFlags: string[] = extraktion.flags ?? []
    if (input.resolvedFlags?.length) {
      currentFlags = currentFlags.filter((f) => !input.resolvedFlags?.includes(f))
    }

    // Re-run betrag_konflikt check on patched values
    const newNetto  = (updatedFields['nettobetrag']  as number | null) ?? null
    const newBrutto = (updatedFields['bruttobetrag'] as number | null) ?? null
    const newMwst   = (updatedFields['mwst_satz']    as number | null) ?? null

    if (newNetto !== null && newBrutto !== null && newMwst !== null) {
      const calculated = newNetto * (1 + newMwst / 100)
      if (Math.abs(calculated - newBrutto) > 0.02) {
        if (!currentFlags.includes('betrag_konflikt')) currentFlags.push('betrag_konflikt')
      } else {
        currentFlags = currentFlags.filter((f) => f !== 'betrag_konflikt')
      }
    }

    await this.extrRepo.patchFields(dokumentId, {
      extractedFields: updatedFields,
      flags:           currentFlags,
      ...(input.reviewNotizen !== undefined && { reviewNotizen: input.reviewNotizen }),
    })

    // Status: if there were no review flags before, mark as needs_review now
    if (dok.extractionStatus === 'extracted') {
      await this.dokRepo.updateStatus(dokumentId, 'needs_review')
    }

    await writeAudit({
      prisma: this.prisma,
      ctx,
      entityType: 'DokExtraktion',
      entityId:   extraktion.id,
      action:     'UPDATE',
      newData:    { patch: input, resolvedFlags: input.resolvedFlags },
    })

    const updated = await this.extrRepo.findByDokumentId(dokumentId, ctx.tenantId)
    return { data: updated }
  }

  // ── POST: confirm ─────────────────────────────────────────────

  async confirmReview(ctx: RequestContext, dokumentId: string, input: ConfirmReviewInput) {
    const dok = await this.dokRepo.findById(dokumentId, ctx.tenantId)
    if (!dok) throw new NotFoundError('Dokument', dokumentId)

    if (dok.extractionStatus === 'reviewed') {
      throw new ValidationError('Dokument ist bereits bestätigt')
    }

    const extraktion = await this.extrRepo.findByDokumentId(dokumentId, ctx.tenantId)
    if (!extraktion) {
      throw new AppError('NO_EXTRACTION', 'Keine Extraktionsdaten vorhanden', 422)
    }

    const fields = extraktion.extractedFields as Record<string, unknown>
    const flags  = extraktion.flags ?? []

    // ── Hard blockers ───────────────────────────────────────────
    const activeBlockers = flags.filter((f) => CONFIRMATION_BLOCKER_FLAGS.has(f))
    if (activeBlockers.length > 0) {
      throw new ValidationError(
        `Bestätigung nicht möglich – ungelöste Konflikte: ${activeBlockers.join(', ')}`,
        { blockers: activeBlockers },
      )
    }

    // ── Pflichtfeld: bruttobetrag ───────────────────────────────
    if (fields['bruttobetrag'] === null || fields['bruttobetrag'] === undefined) {
      throw new ValidationError('Bruttobetrag ist ein Pflichtfeld für die Bestätigung')
    }

    // ── Pflichtfeld: rechnungsdatum oder Begründung ─────────────
    if (fields['rechnungsdatum'] === null || fields['rechnungsdatum'] === undefined) {
      if (!input.rechnungsdatumFehltBegruendung) {
        throw new ValidationError(
          'Rechnungsdatum fehlt. Bitte Begründung in "rechnungsdatumFehltBegruendung" angeben.',
        )
      }
    }

    // ── Kostenart-ID muss existieren und zum Tenant gehören ─────
    const kostenart = await this.prisma.kostenart.findFirst({
      where: { id: input.kostenartId, tenantId: ctx.tenantId, aktiv: true },
    })
    if (!kostenart) throw new NotFoundError('Kostenart', input.kostenartId)

    // ── Commit ──────────────────────────────────────────────────
    await this.prisma.$transaction(async (tx) => {
      // 1. Mark extraktion as reviewed
      await tx.dokExtraktion.update({
        where: { dokumentId },
        data: {
          reviewed:     true,
          reviewedVon:  ctx.userId,
          reviewedAm:   new Date(),
          reviewNotizen: input.reviewNotizen ?? null,
        },
      })

      // 2. Create Kostenposition from confirmed data
      const zeitraumId = dok.zeitraumId ?? undefined
      const zeitraum = zeitraumId
        ? await tx.abrechnungszeitraum.findFirst({ where: { id: zeitraumId } })
        : null
      if (!zeitraum || !zeitraumId) throw new NotFoundError('Abrechnungszeitraum', dok.zeitraumId ?? 'none')

      await tx.kostenposition.create({
        data: {
          tenantId:        ctx.tenantId,
          zeitraumId:      zeitraumId,
          dokumentId:      dokumentId,
          kostenartId:     input.kostenartId,
          rechnungsdatum:  fields['rechnungsdatum']
            ? new Date(fields['rechnungsdatum'] as string)
            : new Date(),
          rechnungsnummer: (fields['rechnungsnummer'] as string | null) ?? null,
          periodeVon:      fields['periode_von'] ? new Date(fields['periode_von'] as string) : null,
          periodeBis:      fields['periode_bis'] ? new Date(fields['periode_bis'] as string) : null,
          nettobetrag:     fields['nettobetrag'] as number ?? (fields['bruttobetrag'] as number),
          bruttobetrag:    fields['bruttobetrag'] as number,
          mwstSatz:        (fields['mwst_satz'] as number | null) ?? null,
          beschreibung:    (fields['beschreibung_freitext'] as string | null) ?? null,
          erfassungsquelle: 'ki_extraktion',
          erstelltVon:     ctx.userId,
        },
      })

      // 3. Update document status to reviewed
      await tx.dokument.update({
        where: { id: dokumentId },
        data:  { extractionStatus: 'reviewed' },
      })
    })

    await writeAudit({
      prisma: this.prisma,
      ctx,
      entityType: 'DokExtraktion',
      entityId:   extraktion.id,
      action:     'MATCHING_CONFIRM',
      newData:    { kostenartId: input.kostenartId, reviewNotizen: input.reviewNotizen },
    })

    return { data: { id: dokumentId, status: 'reviewed', kostenartId: input.kostenartId } }
  }

  // ── POST: confirm simple (no kostenartId required) ───────────

  async confirmSimple(ctx: RequestContext, dokumentId: string) {
    const dok = await this.dokRepo.findById(dokumentId, ctx.tenantId)
    if (!dok) throw new NotFoundError('Dokument', dokumentId)

    if (dok.extractionStatus === 'reviewed') {
      return { data: { id: dokumentId, status: 'reviewed' } }
    }

    // If extraktion exists, mark it as reviewed
    const extraktion = await this.extrRepo.findByDokumentId(dokumentId, ctx.tenantId)
    if (extraktion) {
      await this.extrRepo.markReviewed(dokumentId, ctx.userId)
    }

    await this.dokRepo.updateStatus(dokumentId, 'reviewed' as ExtractionStatus)

    await writeAudit({
      prisma: this.prisma,
      ctx,
      entityType: 'Dokument',
      entityId:   dokumentId,
      action:     'MATCHING_CONFIRM',
      newData:    { action: 'simple_confirm' },
    })

    return { data: { id: dokumentId, status: 'reviewed' } }
  }

  // ── POST: reject ──────────────────────────────────────────────

  async rejectReview(ctx: RequestContext, dokumentId: string, input: RejectReviewInput) {
    const dok = await this.dokRepo.findById(dokumentId, ctx.tenantId)
    if (!dok) throw new NotFoundError('Dokument', dokumentId)

    // Reset to pending so it can be re-extracted or set to manual
    await this.dokRepo.updateStatus(dokumentId, 'pending')

    if (dok.extractionStatus !== 'pending') {
      const extraktion = await this.extrRepo.findByDokumentId(dokumentId, ctx.tenantId)
      if (extraktion) await this.extrRepo.markNotReviewed(dokumentId)
    }

    await writeAudit({
      prisma: this.prisma,
      ctx,
      entityType: 'Dokument',
      entityId:   dokumentId,
      action:     'UPDATE',
      newData:    { action: 'rejected', begruendung: input.begruendung },
    })

    return { data: { id: dokumentId, status: 'pending' } }
  }

  // ── POST: set to manual ───────────────────────────────────────

  async setManual(ctx: RequestContext, dokumentId: string, input: SetManualInput) {
    const dok = await this.dokRepo.findById(dokumentId, ctx.tenantId)
    if (!dok) throw new NotFoundError('Dokument', dokumentId)

    await this.dokRepo.updateStatus(dokumentId, 'manual')

    await writeAudit({
      prisma: this.prisma,
      ctx,
      entityType: 'Dokument',
      entityId:   dokumentId,
      action:     'UPDATE',
      newData:    { action: 'set_manual', begruendung: input.begruendung },
    })

    return { data: { id: dokumentId, status: 'manual' } }
  }
}
