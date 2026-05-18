import { createHash, randomUUID } from 'crypto'
import type { MultipartFile } from '@fastify/multipart'
import type { PrismaClient } from '@prisma/client'
import { DokumenteRepository } from '../repositories/dokumente.repository.js'
import { buildS3Key, uploadFile, getPresignedDownloadUrl } from '../../../lib/storage/storage.service.js'
import { enqueueExtraction, getJobStatus } from '../../../lib/queue/queue.service.js'
import { buildMeta } from '../../../utils/pagination.js'
import { writeAudit } from '../../../utils/audit.js'
import {
  NotFoundError,
  ValidationError,
  ConflictError,
  AppError,
} from '../../../utils/errors.js'
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  type ListDokumenteQuery,
} from '../schemas/dokumente.schema.js'
import type { RequestContext } from '../../../types/common.js'

export class DokumenteService {
  private repo: DokumenteRepository

  constructor(private readonly prisma: PrismaClient) {
    this.repo = new DokumenteRepository(prisma)
  }

  // ── Upload ────────────────────────────────────────────────────

  async upload(
    ctx: RequestContext,
    zeitraumId: string | undefined,
    file: MultipartFile,
    opts: {
      einheitId?:        string
      objektId?:         string
      mieterId?:         string
      mietvertragId?:    string
      dokumentKategorie?: string
      titel?:            string
      beschreibung?:     string
    } = {},
  ) {
    // 1. Validate MIME type
    const mimeType = file.mimetype
    if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType)) {
      throw new ValidationError(
        `Dateityp nicht erlaubt: ${mimeType}. Erlaubt: PDF, JPG, PNG, TIFF`,
      )
    }

    // 2. Read file buffer
    const fileBuffer = await file.toBuffer()

    // 3. Validate file size
    if (fileBuffer.byteLength > MAX_FILE_SIZE_BYTES) {
      throw new ValidationError(
        `Datei zu groß: ${(fileBuffer.byteLength / 1024 / 1024).toFixed(1)} MB. Maximum: 25 MB`,
      )
    }

    // 4. Verify zeitraum if provided
    if (zeitraumId) {
      const zeitraum = await this.prisma.abrechnungszeitraum.findFirst({
        where: { id: zeitraumId, tenantId: ctx.tenantId, deletedAt: null },
        select: { id: true },
      })
      if (!zeitraum) throw new NotFoundError('Abrechnungszeitraum', zeitraumId)
    }

    // 5. SHA-256 duplicate check
    const sha256 = createHash('sha256').update(fileBuffer).digest('hex')
    const existing = await this.repo.findBySha256(sha256, ctx.tenantId)
    if (existing) {
      throw new ConflictError(
        `Datei bereits hochgeladen am ${existing.hochgeladenAm.toISOString().split('T')[0]} (${existing.originalName}). Dokument-ID: ${existing.id}`,
      )
    }

    // 6. Build S3 key and upload
    const uuid  = randomUUID()
    const s3Key = buildS3Key(ctx.tenantId, zeitraumId, uuid, file.filename)

    try {
      await uploadFile({
        key:      s3Key,
        body:     fileBuffer,
        mimeType,
        metadata: {
          tenantId:    ctx.tenantId,
          ...(zeitraumId ? { zeitraumId } : {}),
          uploadedBy:  ctx.userId,
          originalName: file.filename,
        },
      })
    } catch (err) {
      throw new AppError(
        'STORAGE_ERROR',
        `Datei konnte nicht gespeichert werden: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`,
        503,
      )
    }

    // 7. Create DB record
    const dokument = await this.repo.create({
      tenantId:          ctx.tenantId,
      ...(zeitraumId             ? { zeitraumId }                        : {}),
      ...(opts.einheitId         ? { einheitId: opts.einheitId }         : {}),
      ...(opts.objektId          ? { objektId: opts.objektId }           : {}),
      ...(opts.mieterId          ? { mieterId: opts.mieterId }           : {}),
      ...(opts.mietvertragId     ? { mietvertragId: opts.mietvertragId } : {}),
      ...(opts.dokumentKategorie ? { dokumentKategorie: opts.dokumentKategorie } : {}),
      ...(opts.titel             ? { titel: opts.titel }                 : {}),
      ...(opts.beschreibung      ? { beschreibung: opts.beschreibung }   : {}),
      originalName:      file.filename,
      s3Key,
      mimeType,
      fileSizeBytes:     BigInt(fileBuffer.byteLength),
      sha256,
      hochgeladenVon:    ctx.userId,
    })

    // 8. Enqueue extraction job
    const jobId = await enqueueExtraction({
      dokumentId: dokument.id,
      tenantId:   ctx.tenantId,
      s3Key,
      mimeType,
      zeitraumId,
      attempt:    0,
    })

    // 9. Update status to processing
    await this.repo.updateStatus(dokument.id, 'pending')

    // 10. Audit
    await writeAudit({
      prisma: this.prisma,
      ctx,
      entityType: 'Dokument',
      entityId:   dokument.id,
      action:     'CREATE',
      newData:    { s3Key, mimeType, fileSizeBytes: fileBuffer.byteLength, zeitraumId },
    })

    return {
      data: {
        id:              dokument.id,
        originalName:    dokument.originalName,
        mimeType:        dokument.mimeType,
        fileSizeBytes:   Number(dokument.fileSizeBytes),
        extractionStatus: dokument.extractionStatus,
        jobId,
        zeitraumId,
        hochgeladenAm:   dokument.hochgeladenAm,
      },
    }
  }

  // ── List ──────────────────────────────────────────────────────

  async list(ctx: RequestContext, query: ListDokumenteQuery) {
    const { items, total, page, pageSize } = await this.repo.findMany(ctx.tenantId, query)
    return {
      data: items.map((d) => {
        const extraktion = (d as any).extraktion
        let extraktionDaten: Record<string, unknown> | undefined
        if (extraktion?.extractedFields) {
          const ef = extraktion.extractedFields as Record<string, unknown>
          extraktionDaten = {
            nettobetrag:    ef['nettobetrag']    ?? ef['netto_betrag'],
            bruttobetrag:   ef['bruttobetrag']   ?? ef['brutto_betrag'],
            lieferant:      ef['lieferantName']  ?? ef['lieferant_name'] ?? ef['lieferant'],
            rechnungsdatum: ef['rechnungsdatum'] ?? ef['rechnung_datum'],
          }
        }
        return {
          id:               d.id,
          dateiname:        d.originalName,
          titel:            (d as any).titel ?? null,
          beschreibung:     (d as any).beschreibung ?? null,
          dokumentKategorie: d.dokumentKategorie,
          mimeType:         d.mimeType,
          fileSizeBytes:    Number(d.fileSizeBytes),
          extractionStatus: d.extractionStatus,
          einheitId:        d.einheitId,
          objektId:         d.objektId,
          mieterId:         (d as any).mieterId,
          mietvertragId:    (d as any).mietvertragId,
          reviewed:         extraktion?.reviewed ?? false,
          erstelltAm:       d.hochgeladenAm,
          ...(extraktionDaten ? { extraktion: extraktionDaten } : {}),
        }
      }),
      meta: buildMeta(total, page, pageSize),
    }
  }

  // ── Get by ID ─────────────────────────────────────────────────

  async getById(ctx: RequestContext, id: string) {
    const dok = await this.repo.findById(id, ctx.tenantId)
    if (!dok) throw new NotFoundError('Dokument', id)

    // Generate a pre-signed download URL (15 min TTL)
    const downloadUrl = await getPresignedDownloadUrl(dok.s3Key, 900)

    return {
      data: {
        ...dok,
        fileSizeBytes: Number(dok.fileSizeBytes),
        downloadUrl,
      },
    }
  }

  // ── Retry extraction ──────────────────────────────────────────

  async retryExtraction(ctx: RequestContext, id: string) {
    const dok = await this.repo.findById(id, ctx.tenantId)
    if (!dok) throw new NotFoundError('Dokument', id)

    if (dok.extractionStatus === 'reviewed') {
      throw new ValidationError('Bestätigte Dokumente können nicht erneut extrahiert werden')
    }

    await this.repo.updateStatus(id, 'pending')

    const jobId = await enqueueExtraction({
      dokumentId: id,
      tenantId:   ctx.tenantId,
      s3Key:      dok.s3Key,
      mimeType:   dok.mimeType,
      zeitraumId: dok.zeitraumId ?? undefined,
      attempt:    0,
    })

    await writeAudit({
      prisma: this.prisma,
      ctx,
      entityType: 'Dokument',
      entityId:   id,
      action:     'AI_EXTRACT',
      newData:    { action: 'retry', jobId },
    })

    return { data: { id, jobId, status: 'pending' } }
  }

  // ── Update metadata (titel, beschreibung, kategorie, relations) ──

  async updateMeta(
    ctx: RequestContext,
    id: string,
    data: {
      titel?:             string | null
      beschreibung?:      string | null
      dokumentKategorie?: string
      einheitId?:         string | null
      objektId?:          string | null
      mieterId?:          string | null
      mietvertragId?:     string | null
    },
  ) {
    const dok = await this.repo.findById(id, ctx.tenantId)
    if (!dok) throw new NotFoundError('Dokument', id)

    // Validate referenced entities belong to tenant
    if (data.einheitId) {
      const exists = await this.prisma.einheit.findFirst({
        where: { id: data.einheitId, objekt: { tenantId: ctx.tenantId } },
        select: { id: true },
      })
      if (!exists) throw new NotFoundError('Einheit', data.einheitId)
    }
    if (data.objektId) {
      const exists = await this.prisma.objekt.findFirst({
        where: { id: data.objektId, tenantId: ctx.tenantId },
        select: { id: true },
      })
      if (!exists) throw new NotFoundError('Objekt', data.objektId)
    }
    if (data.mieterId) {
      const exists = await this.prisma.mieter.findFirst({
        where: { id: data.mieterId, tenantId: ctx.tenantId, deletedAt: null },
        select: { id: true },
      })
      if (!exists) throw new NotFoundError('Mieter', data.mieterId)
    }
    if (data.mietvertragId) {
      const exists = await this.prisma.mietvertrag.findFirst({
        where: { id: data.mietvertragId, tenantId: ctx.tenantId, deletedAt: null },
        select: { id: true },
      })
      if (!exists) throw new NotFoundError('Mietvertrag', data.mietvertragId)
    }

    const updated = await this.prisma.dokument.update({
      where: { id },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: data as any,
    })

    await writeAudit({
      prisma: this.prisma,
      ctx,
      entityType: 'Dokument',
      entityId:   id,
      action:     'UPDATE',
      newData:    data as Record<string, unknown>,
    })

    return { data: { ...updated, fileSizeBytes: Number(updated.fileSizeBytes) } }
  }

  // ── Delete document ────────────────────────────────────────────

  async delete(ctx: RequestContext, id: string) {
    const dok = await this.repo.findById(id, ctx.tenantId)
    if (!dok) throw new NotFoundError('Dokument', id)

    // Hard delete with S3 cleanup happens via repository if implemented;
    // for now we just remove DB record (S3 file remains for safety)
    await this.prisma.dokument.delete({ where: { id } })

    await writeAudit({
      prisma: this.prisma,
      ctx,
      entityType: 'Dokument',
      entityId:   id,
      action:     'DELETE',
      oldData:    { s3Key: dok.s3Key, originalName: dok.originalName },
    })

    return { data: { id, deleted: true } }
  }

  // ── Job status ─────────────────────────────────────────────────

  async getJobStatus(jobId: string) {
    const status = await getJobStatus(jobId)
    if (!status) throw new NotFoundError('Job', jobId)
    return { data: status }
  }
}
