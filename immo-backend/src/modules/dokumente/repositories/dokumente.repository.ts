import type { PrismaClient, Prisma, ExtractionStatus } from '@prisma/client'
import type { ListDokumenteQuery } from '../schemas/dokumente.schema.js'
import { parsePagination } from '../../../utils/pagination.js'

// ─── Dokument repository ───────────────────────────────────────

export class DokumenteRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findMany(tenantId: string, query: ListDokumenteQuery & { reviewed?: string }) {
    const { skip, take, page, pageSize } = parsePagination(query)

    const where: Prisma.DokumentWhereInput = {
      tenantId,
      ...(query.zeitraumId       ? { zeitraumId: query.zeitraumId }                                   : {}),
      ...(query.einheitId        ? { einheitId: query.einheitId }                                     : {}),
      ...(query.objektId         ? { objektId: query.objektId }                                       : {}),
      ...(query.mieterId         ? { mieterId: query.mieterId }                                       : {}),
      ...(query.mietvertragId    ? { mietvertragId: query.mietvertragId }                             : {}),
      ...(query.dokumentKategorie ? { dokumentKategorie: query.dokumentKategorie as any }             : {}),
      ...(query.extractionStatus ? { extractionStatus: query.extractionStatus as ExtractionStatus }  : {}),
      ...(query.reviewed === 'true'  ? { extraktion: { reviewed: true  } } : {}),
      ...(query.reviewed === 'false' ? { extraktion: { reviewed: false } } : {}),
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.dokument.findMany({
        where,
        skip,
        take,
        orderBy: { hochgeladenAm: 'desc' },
        include: {
          extraktion: {
            select: { reviewed: true, flags: true, confidenceMap: true, extrahiertAm: true },
          },
        },
      }),
      this.prisma.dokument.count({ where }),
    ])

    return { items, total, page, pageSize }
  }

  async findById(id: string, tenantId: string) {
    return this.prisma.dokument.findFirst({
      where: { id, tenantId },
      include: {
        zeitraum: {
          select: { id: true, bezeichnung: true, von: true, bis: true, objekt: { select: { id: true, bezeichnung: true } } },
        },
      },
    })
  }

  async findBySha256(sha256: string, tenantId: string) {
    return this.prisma.dokument.findFirst({
      where: { sha256, tenantId },
      select: { id: true, originalName: true, hochgeladenAm: true },
    })
  }

  async create(data: {
    tenantId:          string
    zeitraumId?:       string
    einheitId?:        string
    objektId?:         string
    mieterId?:         string
    mietvertragId?:    string
    dokumentKategorie?: string
    titel?:            string
    beschreibung?:     string
    originalName:      string
    s3Key:             string
    mimeType:          string
    fileSizeBytes:     bigint
    sha256:            string
    hochgeladenVon:    string
    extractedData?:    Record<string, unknown>
  }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.prisma.dokument.create({ data: data as any })
  }

  async updateStatus(id: string, status: ExtractionStatus, fehler?: string) {
    return this.prisma.dokument.update({
      where: { id },
      data: {
        extractionStatus: status,
        uploadFehler:     fehler ?? null,
      },
    })
  }

  /** Mark as archived (logical archive, not delete) */
  async archive(id: string) {
    return this.prisma.dokument.update({
      where: { id },
      data:  { extractionStatus: 'manual' }, // repurposed as 'archived' state
    })
  }
}

// ─── Extraktion repository ─────────────────────────────────────

export class ExtraktionenRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByDokumentId(dokumentId: string, tenantId: string) {
    // Join through dokument to enforce tenant isolation
    const dok = await this.prisma.dokument.findFirst({
      where: { id: dokumentId, tenantId },
      include: { extraktion: true },
    })
    return dok?.extraktion ?? null
  }

  async upsert(data: {
    dokumentId:      string
    rawResponse:     string
    extractedFields: object
    confidenceMap:   object
    flags:           string[]
    modelVersion:    string
    promptVersion:   string
    tokensInput?:    number
    tokensOutput?:   number
  }) {
    return this.prisma.dokExtraktion.upsert({
      where:  { dokumentId: data.dokumentId },
      create: {
        dokumentId:      data.dokumentId,
        rawResponse:     data.rawResponse,
        extractedFields: data.extractedFields,
        confidenceMap:   data.confidenceMap,
        flags:           data.flags,
        modelVersion:    data.modelVersion,
        promptVersion:   data.promptVersion,
        tokensInput:     data.tokensInput ?? null,
        tokensOutput:    data.tokensOutput ?? null,
        reviewed:        false,
      },
      update: {
        // rawResponse is intentionally NOT updated on retry –
        // each run should be stored. For MVP we overwrite; v1.1 add history.
        rawResponse:     data.rawResponse,
        extractedFields: data.extractedFields,
        confidenceMap:   data.confidenceMap,
        flags:           data.flags,
        modelVersion:    data.modelVersion,
        promptVersion:   data.promptVersion,
        tokensInput:     data.tokensInput ?? null,
        tokensOutput:    data.tokensOutput ?? null,
        reviewed:        false,
        reviewedVon:     null,
        reviewedAm:      null,
      },
    })
  }

  async patchFields(
    dokumentId: string,
    patch: Partial<{
      extractedFields: object
      confidenceMap:   object
      flags:           string[]
      reviewNotizen:   string
    }>,
  ) {
    return this.prisma.dokExtraktion.update({
      where: { dokumentId },
      data:  patch,
    })
  }

  async markReviewed(dokumentId: string, userId: string, notizen?: string) {
    return this.prisma.dokExtraktion.update({
      where: { dokumentId },
      data: {
        reviewed:     true,
        reviewedVon:  userId,
        reviewedAm:   new Date(),
        reviewNotizen: notizen ?? null,
      },
    })
  }

  async markNotReviewed(dokumentId: string) {
    return this.prisma.dokExtraktion.update({
      where: { dokumentId },
      data: {
        reviewed:     false,
        reviewedVon:  null,
        reviewedAm:   null,
        reviewNotizen: null,
      },
    })
  }
}
