import type { FastifyPluginAsync } from 'fastify'
import { DokumenteService } from '../services/dokumente.service.js'
import { ReviewService }    from '../services/review.service.js'
import {
  UploadQuerySchema,
  ListDokumenteQuerySchema,
  DokumentIdParamSchema,
  JobIdParamSchema,
  PatchReviewSchema,
  ConfirmReviewSchema,
  RejectReviewSchema,
  SetManualSchema,
  UpdateDokumentMetaSchema,
} from '../schemas/dokumente.schema.js'
import { ValidationError } from '../../../utils/errors.js'

// ─── Helper to build RequestContext from a Fastify request ─────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx = (req: any) => ({
  tenantId:  req.tenantId,
  userId:    req.currentUser.sub,
  ipAddress: req.ip,
  userAgent: req.headers['user-agent'],
})

export const dokumenteRoutes: FastifyPluginAsync = async (fastify) => {
  const dokumenteService = new DokumenteService(fastify.prisma)
  const reviewService    = new ReviewService(fastify.prisma)
  const auth = { preHandler: [fastify.authenticate] }

  // ── POST /dokumente/upload ─────────────────────────────────
  // Accepts multipart/form-data with a single file field "file"
  fastify.post('/upload', { ...auth }, async (req, reply) => {
    const query = UploadQuerySchema.parse(req.query)

    const data = await (req as any).file()
    if (!data) throw new ValidationError('Kein Dateifeld "file" in der Anfrage gefunden')

    const result = await dokumenteService.upload(ctx(req), query.zeitraumId, data, {
      einheitId:         query.einheitId,
      objektId:          query.objektId,
      mieterId:          query.mieterId,
      mietvertragId:     query.mietvertragId,
      dokumentKategorie: query.dokumentKategorie,
      titel:             query.titel,
      beschreibung:      query.beschreibung,
    })
    return reply.status(202).send(result)
  })

  // ── PATCH /dokumente/:id/meta ──────────────────────────────
  // Updates titel, beschreibung, kategorie, or relations
  fastify.patch('/:id/meta', auth, async (req, reply) => {
    const { id } = DokumentIdParamSchema.parse(req.params)
    const body   = UpdateDokumentMetaSchema.parse(req.body)
    return reply.send(await dokumenteService.updateMeta(ctx(req), id, body))
  })

  // ── DELETE /dokumente/:id ──────────────────────────────────
  fastify.delete('/:id', auth, async (req, reply) => {
    const { id } = DokumentIdParamSchema.parse(req.params)
    return reply.send(await dokumenteService.delete(ctx(req), id))
  })

  // ── GET /dokumente ─────────────────────────────────────────
  fastify.get('/', auth, async (req, reply) => {
    const query = ListDokumenteQuerySchema.parse(req.query)
    return reply.send(await dokumenteService.list(ctx(req), query))
  })

  // ── GET /dokumente/:id ─────────────────────────────────────
  fastify.get('/:id', auth, async (req, reply) => {
    const { id } = DokumentIdParamSchema.parse(req.params)
    return reply.send(await dokumenteService.getById(ctx(req), id))
  })

  // ── GET /dokumente/:id/extraktion ──────────────────────────
  fastify.get('/:id/extraktion', auth, async (req, reply) => {
    const { id } = DokumentIdParamSchema.parse(req.params)
    return reply.send(await reviewService.getExtraktion(ctx(req), id))
  })

  // ── POST /dokumente/:id/confirm ────────────────────────────
  // Shortcut: marks extraction as reviewed without requiring kostenartId
  fastify.post('/:id/confirm', auth, async (req, reply) => {
    const { id } = DokumentIdParamSchema.parse(req.params)
    return reply.send(await reviewService.confirmSimple(ctx(req), id))
  })

  // ── POST /dokumente/:id/retry-extraction ───────────────────
  fastify.post('/:id/retry-extraction', auth, async (req, reply) => {
    const { id } = DokumentIdParamSchema.parse(req.params)
    return reply.send(await dokumenteService.retryExtraction(ctx(req), id))
  })

  // ── PATCH /dokumente/:id/review ────────────────────────────
  // Manual field corrections before confirmation
  fastify.patch('/:id/review', auth, async (req, reply) => {
    const { id } = DokumentIdParamSchema.parse(req.params)
    const body   = PatchReviewSchema.parse(req.body)
    return reply.send(await reviewService.patchReview(ctx(req), id, body))
  })

  // ── POST /dokumente/:id/review/confirm ─────────────────────
  fastify.post('/:id/review/confirm', auth, async (req, reply) => {
    const { id } = DokumentIdParamSchema.parse(req.params)
    const body   = ConfirmReviewSchema.parse(req.body)
    return reply.send(await reviewService.confirmReview(ctx(req), id, body))
  })

  // ── POST /dokumente/:id/review/reject ──────────────────────
  fastify.post('/:id/review/reject', auth, async (req, reply) => {
    const { id } = DokumentIdParamSchema.parse(req.params)
    const body   = RejectReviewSchema.parse(req.body)
    return reply.send(await reviewService.rejectReview(ctx(req), id, body))
  })

  // ── POST /dokumente/:id/review/manual ──────────────────────
  fastify.post('/:id/review/manual', auth, async (req, reply) => {
    const { id } = DokumentIdParamSchema.parse(req.params)
    const body   = SetManualSchema.parse(req.body)
    return reply.send(await reviewService.setManual(ctx(req), id, body))
  })
}

// ─── Job status routes (separate plugin for /jobs prefix) ─────

export const jobsRoutes: FastifyPluginAsync = async (fastify) => {
  const dokumenteService = new DokumenteService(fastify.prisma)
  const auth = { preHandler: [fastify.authenticate] }

  // ── GET /jobs/:jobId/status ────────────────────────────────
  fastify.get('/:jobId/status', auth, async (req, reply) => {
    const { jobId } = JobIdParamSchema.parse(req.params)
    return reply.send(await dokumenteService.getJobStatus(jobId))
  })
}
