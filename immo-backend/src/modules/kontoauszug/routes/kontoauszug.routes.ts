import type { FastifyPluginAsync } from 'fastify'
import { randomUUID } from 'crypto'
import { uploadFile } from '../../../lib/storage/storage.service.js'
import { KontoauszugService } from '../services/kontoauszug.service.js'
import {
  ImportQuerySchema,
  ListKontoauszuegeQuerySchema,
  ListBuchungenQuerySchema,
  ZuordnenBodySchema,
  IgnorierenBodySchema,
  SollIstQuerySchema,
  OffenePostenQuerySchema,
  UuidParamSchema,
} from '../schemas/kontoauszug.schema.js'

export const kontoauszugRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new KontoauszugService(fastify.prisma)
  const auth = { preHandler: [fastify.authenticate] }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = (req: any) => ({
    tenantId: req.tenantId,
    userId: req.currentUser.sub,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  })

  // ─── POST /kontoauszuege/import ─────────────────────────────────────────
  fastify.post('/import', { ...auth }, async (req, reply) => {
    const query = ImportQuerySchema.parse(req.query)

    // Multipart-File einlesen
    const data = await req.file()
    if (!data) {
      return reply.status(400).send({ error: { code: 'NO_FILE', message: 'Keine Datei hochgeladen' } })
    }

    // Buffer lesen
    const chunks: Buffer[] = []
    for await (const chunk of data.file) {
      chunks.push(chunk as Buffer)
    }
    const content = Buffer.concat(chunks)

    // S3 Upload
    const uuid = randomUUID()
    const s3Key = `${req.tenantId}/kontoauszuege/${uuid}_${data.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    await uploadFile({
      key: s3Key,
      body: content,
      mimeType: data.mimetype || 'application/octet-stream',
    })

    const result = await service.importKontoauszug(ctx(req), {
      ...(query.bankkontoId ? { bankkontoId: query.bankkontoId } : {}),
      dateiname: data.filename,
      content,
      s3Key,
      profil: query.format ?? query.profil,
    })

    return reply.status(201).send({ data: result })
  })

  // ─── GET /kontoauszuege ──────────────────────────────────────────────────
  fastify.get('/', auth, async (req, reply) => {
    const query = ListKontoauszuegeQuerySchema.parse(req.query)
    const result = await service.list(ctx(req), query)
    return reply.send(result)
  })

  // ─── GET /kontoauszuege/:id ──────────────────────────────────────────────
  fastify.get('/:id', auth, async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params)
    const result = await service.getById(ctx(req), id)
    return reply.send(result)
  })

  // ─── GET /kontoauszuege/:id/buchungen ───────────────────────────────────
  fastify.get('/:id/buchungen', auth, async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params)
    const query = ListBuchungenQuerySchema.parse(req.query)
    const result = await service.getBuchungen(ctx(req), id, query)
    return reply.send(result)
  })
}

// ─── Buchungszeilen-Routes (eigenes Prefix) ──────────────────────────────────

export const buchungszeileRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new KontoauszugService(fastify.prisma)
  const auth = { preHandler: [fastify.authenticate] }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = (req: any) => ({
    tenantId: req.tenantId,
    userId: req.currentUser.sub,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  })

  // ─── PATCH /buchungszeilen/:id/zuordnen ─────────────────────────────────
  fastify.patch('/:id/zuordnen', auth, async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params)
    const body = ZuordnenBodySchema.parse(req.body)
    const result = await service.zuordnen(ctx(req), id, body)
    return reply.send(result)
  })

  // ─── PATCH /buchungszeilen/:id/ignorieren ────────────────────────────────
  fastify.patch('/:id/ignorieren', auth, async (req, reply) => {
    const { id } = UuidParamSchema.parse(req.params)
    const body = IgnorierenBodySchema.parse(req.body)
    const result = await service.ignorieren(ctx(req), id, body)
    return reply.send(result)
  })
}

// ─── Soll/Ist + Offene Posten ────────────────────────────────────────────────

export const sollIstRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new KontoauszugService(fastify.prisma)
  const auth = { preHandler: [fastify.authenticate] }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = (req: any) => ({
    tenantId: req.tenantId,
    userId: req.currentUser.sub,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  })

  // ─── GET /soll-ist ───────────────────────────────────────────────────────
  fastify.get('/', auth, async (req, reply) => {
    const query = SollIstQuerySchema.parse(req.query)
    const result = await service.getSollIst(ctx(req), query)
    return reply.send(result)
  })
}

export const offenePostenRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new KontoauszugService(fastify.prisma)
  const auth = { preHandler: [fastify.authenticate] }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = (req: any) => ({
    tenantId: req.tenantId,
    userId: req.currentUser.sub,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  })

  // ─── GET /offene-posten ──────────────────────────────────────────────────
  fastify.get('/', auth, async (req, reply) => {
    const query = OffenePostenQuerySchema.parse(req.query)
    const result = await service.getOffenePosten(ctx(req), query)
    return reply.send(result)
  })
}
