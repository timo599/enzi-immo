/**
 * Kontoauszug Service
 * Orchestriert: Upload → Parse → Matching → Persistierung
 */

import type { PrismaClient, Buchungstyp, MatchingStatus } from '@prisma/client'
import type { RequestContext } from '../../../types/common.js'
import { parseMt940 } from '../../../lib/kontoauszug/parser/mt940.parser.js'
import { parseCsv } from '../../../lib/kontoauszug/parser/csv.parser.js'
import { AbgleichService } from './abgleich.service.js'
import { SollIstService } from './soll-ist.service.js'
import { KontoauszugRepository } from '../repositories/kontoauszug.repository.js'
import { writeAudit } from '../../../utils/audit.js'
import { NotFoundError, ValidationError, ForbiddenError } from '../../../utils/errors.js'
import type {
  SollIstQuerySchema,
  OffenePostenQuerySchema,
  ListKontoauszuegeQuerySchema,
  ListBuchungenQuerySchema,
  ZuordnenBodySchema,
  IgnorierenBodySchema,
} from '../schemas/kontoauszug.schema.js'
import type { z } from 'zod'

const ALLOWED_EXTENSIONS = new Set(['.sta', '.mt940', '.csv', '.txt'])
const MAX_FILE_BYTES = 50 * 1024 * 1024  // 50 MB

export class KontoauszugService {
  private readonly repo: KontoauszugRepository
  private readonly abgleichService: AbgleichService
  private readonly sollIstService: SollIstService

  constructor(private readonly prisma: PrismaClient) {
    this.repo = new KontoauszugRepository(prisma)
    this.abgleichService = new AbgleichService(prisma)
    this.sollIstService = new SollIstService(prisma)
  }

  // ─── Import ───────────────────────────────────────────────────────────────

  async importKontoauszug(
    ctx: RequestContext,
    params: {
      bankkontoId?: string
      dateiname: string
      content: Buffer
      s3Key: string
      profil: string
    }
  ) {
    const { bankkontoId, dateiname, content, s3Key, profil } = params

    // 1. Bankkonto-Ownership prüfen (Tenant-Isolation) – optional
    if (bankkontoId) {
      const bankkonto = await this.repo.findBankkonto(bankkontoId, ctx.tenantId)
      if (!bankkonto) {
        throw new ForbiddenError('Bankkonto gehört nicht zu diesem Mandanten')
      }
    }

    // 2. Dateigröße
    if (content.length > MAX_FILE_BYTES) {
      throw new ValidationError('Datei überschreitet das Maximum von 50 MB')
    }

    // 3. Format erkennen
    const ext = dateiname.toLowerCase().match(/\.[^.]+$/)?.[0] ?? ''
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new ValidationError(
        `Nicht unterstütztes Format: ${ext}. Erlaubt: ${[...ALLOWED_EXTENSIONS].join(', ')}`
      )
    }

    const isMt940 = ext === '.sta' || ext === '.mt940'

    // 4. Parsen
    const parseResult = isMt940
      ? parseMt940(content.toString('utf-8'))
      : parseCsv(content.toString('utf-8'), profil)

    if (parseResult.transactions.length === 0) {
      throw new ValidationError('Keine Buchungszeilen in der Datei gefunden')
    }

    // 5. Zeitraum-Überschneidungscheck (nur wenn Bankkonto bekannt)
    const ueberschneidung = bankkontoId
      ? await this.repo.findUeberschneidung(bankkontoId, parseResult.zeitraumVon, parseResult.zeitraumBis)
      : null
    // Wir blockieren nicht, sondern warnen (Anforderung: nur Warnung)
    const warnung = ueberschneidung
      ? `Zeitraum-Überschneidung mit bestehendem Import: ${ueberschneidung.dateiname} (${formatDate(ueberschneidung.zeitraumVon)} – ${formatDate(ueberschneidung.zeitraumBis)})`
      : null

    // 6. Kontoauszug-Record anlegen
    const kontoauszug = await this.repo.createKontoauszug({
      tenantId: ctx.tenantId,
      bankkontoId: bankkontoId ?? null,
      dateiname,
      s3Key,
      zeitraumVon: parseResult.zeitraumVon,
      zeitraumBis: parseResult.zeitraumBis,
      importFormat: parseResult.format,
      importiertVon: ctx.userId,
    })

    // 7. Abgleich synchron (laut Spec: schnell genug ohne Queue)
    const abgleichStats = await this.abgleichService.abgleichDurchfuehren({
      tenantId: ctx.tenantId,
      kontoauszugId: kontoauszug.id,
      transaktionen: parseResult.transactions,
    })

    // 8. Audit
    await writeAudit({
      prisma: this.prisma,
      ctx,
      entityType: 'Kontoauszug',
      entityId: kontoauszug.id,
      action: 'CREATE',
      newData: { dateiname, bankkontoId, ...abgleichStats },
    })

    return {
      kontoauszug,
      parseResult: {
        zeitraumVon: parseResult.zeitraumVon,
        zeitraumBis: parseResult.zeitraumBis,
        kontonummer: parseResult.kontonummer,
        format: parseResult.format,
      },
      matching: abgleichStats,
      warnung,
    }
  }

  // ─── Liste ────────────────────────────────────────────────────────────────

  async list(ctx: RequestContext, query: z.infer<typeof ListKontoauszuegeQuerySchema>) {
    const { items, total } = await this.repo.findMany({
      tenantId: ctx.tenantId,
      bankkontoId: query.bankkontoId,
      page: query.page,
      pageSize: query.pageSize,
    })

    return {
      data: items,
      meta: {
        total,
        page: query.page,
        pageSize: query.pageSize,
        totalPages: Math.ceil(total / query.pageSize),
      },
    }
  }

  // ─── Detail ───────────────────────────────────────────────────────────────

  async getById(ctx: RequestContext, id: string) {
    const ka = await this.repo.findById(id, ctx.tenantId)
    if (!ka) throw new NotFoundError('Kontoauszug', id)
    return { data: ka }
  }

  // ─── Buchungen ────────────────────────────────────────────────────────────

  async getBuchungen(
    ctx: RequestContext,
    kontoauszugId: string,
    query: z.infer<typeof ListBuchungenQuerySchema>
  ) {
    // Verify ownership
    const ka = await this.repo.findById(kontoauszugId, ctx.tenantId)
    if (!ka) throw new NotFoundError('Kontoauszug', kontoauszugId)

    const { items, total } = await this.repo.findBuchungen({
      kontoauszugId,
      tenantId: ctx.tenantId,
      matchingStatus: query.matchingStatus as MatchingStatus | undefined,
      page: query.page,
      pageSize: query.pageSize,
    })

    return {
      data: items,
      meta: {
        total,
        page: query.page,
        pageSize: query.pageSize,
        totalPages: Math.ceil(total / query.pageSize),
      },
    }
  }

  // ─── Manuelle Zuordnung ───────────────────────────────────────────────────

  async zuordnen(
    ctx: RequestContext,
    buchungszeileId: string,
    body: z.infer<typeof ZuordnenBodySchema>
  ) {
    const zeile = await this.repo.findBuchungszeileById(buchungszeileId, ctx.tenantId)
    if (!zeile) throw new NotFoundError('Buchungszeile', buchungszeileId)

    if (zeile.ignoriert) {
      throw new ValidationError('Ignorierte Buchungszeile kann nicht zugeordnet werden')
    }

    const result = await this.repo.manuelleZuordnung({
      buchungszeileId,
      tenantId: ctx.tenantId,
      mietvertragId: body.mietvertragId,
      buchungstyp: body.buchungstyp as Buchungstyp,
      begruendung: body.begruendung,
      userId: ctx.userId,
    })

    await writeAudit({
      prisma: this.prisma,
      ctx,
      entityType: 'Buchungszeile',
      entityId: buchungszeileId,
      action: 'MATCHING_CONFIRM',
      oldData: { matchingStatus: zeile.matchingStatus },
      newData: { matchingStatus: 'manually_matched', mietvertragId: body.mietvertragId, buchungstyp: body.buchungstyp },
    })

    return { data: result }
  }

  // ─── Ignorieren ───────────────────────────────────────────────────────────

  async ignorieren(
    ctx: RequestContext,
    buchungszeileId: string,
    body: z.infer<typeof IgnorierenBodySchema>
  ) {
    const zeile = await this.repo.findBuchungszeileById(buchungszeileId, ctx.tenantId)
    if (!zeile) throw new NotFoundError('Buchungszeile', buchungszeileId)

    if (zeile.matchingStatus === 'manually_matched') {
      throw new ValidationError('Bereits manuell zugeordnete Buchungszeile kann nicht ignoriert werden')
    }

    const result = await this.repo.ignoriereZeile(buchungszeileId, ctx.tenantId, body.begruendung)

    await writeAudit({
      prisma: this.prisma,
      ctx,
      entityType: 'Buchungszeile',
      entityId: buchungszeileId,
      action: 'UPDATE',
      oldData: { matchingStatus: zeile.matchingStatus },
      newData: { matchingStatus: 'ignored', begruendung: body.begruendung },
    })

    return { data: result }
  }

  // ─── Soll/Ist ─────────────────────────────────────────────────────────────

  async getSollIst(ctx: RequestContext, query: z.infer<typeof SollIstQuerySchema>) {
    const von = new Date(query.von)
    const bis = new Date(query.bis)

    if (von > bis) {
      throw new ValidationError('"von" muss vor "bis" liegen')
    }

    const result = await this.sollIstService.berechne({
      tenantId: ctx.tenantId,
      von,
      bis,
      objektId: query.objektId,
      mietvertragId: query.mietvertragId,
    })

    return { data: result }
  }

  // ─── Offene Posten ────────────────────────────────────────────────────────

  async getOffenePosten(
    ctx: RequestContext,
    query: z.infer<typeof OffenePostenQuerySchema>
  ) {
    const { items, total } = await this.repo.getOffenePosten({
      tenantId: ctx.tenantId,
      nurMitRueckstand: query.nurMitRueckstand,
      objektId: query.objektId,
      page: query.page,
      pageSize: query.pageSize,
    })

    return {
      data: items,
      meta: {
        total,
        page: query.page,
        pageSize: query.pageSize,
        totalPages: Math.ceil(total / query.pageSize),
      },
    }
  }
}

function formatDate(d: Date): string {
  return d.toISOString().substring(0, 10)
}
