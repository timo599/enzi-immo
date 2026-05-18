import type { FastifyPluginAsync } from 'fastify'
import { AbrechnungService } from '../services/abrechnung.service.js'
import {
  ListAbrechnungenQuerySchema,
  AbrechnungIdParamSchema,
  ZeitraumIdParamSchema,
  BerechneAbrechnungSchema,
  FreigabeSchema,
  CreateZeitraumSchema,
  ListZeitraeumenQuerySchema,
} from '../schemas/abrechnung.schema.js'

export const abrechnungRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new AbrechnungService(fastify.prisma)
  const auth = { preHandler: [fastify.authenticate] }
  const ctx = (req: any) => ({
    tenantId:  req.tenantId,
    userId:    req.currentUser.sub,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  })

  /** GET /abrechnungen */
  fastify.get('/', auth, async (req, reply) => {
    return reply.send(await service.list(ctx(req), ListAbrechnungenQuerySchema.parse(req.query)))
  })

  /** GET /abrechnungen/:id */
  fastify.get('/:id', auth, async (req, reply) => {
    const { id } = AbrechnungIdParamSchema.parse(req.params)
    return reply.send(await service.getById(ctx(req), id))
  })

  /** POST /abrechnungen/berechne */
  fastify.post('/berechne', auth, async (req, reply) => {
    const body = BerechneAbrechnungSchema.parse(req.body)
    return reply.status(201).send(await service.berechne(ctx(req), body.zeitraumId))
  })

  /** POST /abrechnungen/:id/freigeben */
  fastify.post('/:id/freigeben', auth, async (req, reply) => {
    const { id } = AbrechnungIdParamSchema.parse(req.params)
    const body   = FreigabeSchema.parse(req.body)
    return reply.send(await service.freigeben(ctx(req), id, body))
  })
}

// ─── Zeitraum CRUD + scoped routes ─────────────────────────────

export const zeitraumAbrechnungRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new AbrechnungService(fastify.prisma)
  const auth = { preHandler: [fastify.authenticate] }
  const ctx = (req: any) => ({
    tenantId:  req.tenantId,
    userId:    req.currentUser.sub,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  })

  /** GET /abrechnungszeitraeume */
  fastify.get('/', auth, async (req, reply) => {
    const query = ListZeitraeumenQuerySchema.parse(req.query)
    const { skip, take } = { skip: (query.page - 1) * query.pageSize, take: query.pageSize }
    const where: any = { tenantId: ctx(req).tenantId, deletedAt: null }
    if (query.objektId) where.objektId = query.objektId
    const [items, total] = await Promise.all([
      (fastify as any).prisma.abrechnungszeitraum.findMany({ where, skip, take, orderBy: { von: 'desc' } }),
      (fastify as any).prisma.abrechnungszeitraum.count({ where }),
    ])
    return reply.send({
      data: items,
      meta: { total, page: query.page, pageSize: query.pageSize, totalPages: Math.ceil(total / query.pageSize) },
    })
  })

  /** POST /abrechnungszeitraeume */
  fastify.post('/', auth, async (req, reply) => {
    const body = CreateZeitraumSchema.parse(req.body)
    const reqCtx = ctx(req)

    // Verify objekt belongs to tenant
    const objekt = await (fastify as any).prisma.objekt.findFirst({
      where: { id: body.objektId, tenantId: reqCtx.tenantId, aktiv: true },
    })
    if (!objekt) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Objekt nicht gefunden' } })

    const zeitraum = await (fastify as any).prisma.abrechnungszeitraum.create({
      data: {
        tenantId:    reqCtx.tenantId,
        objektId:    body.objektId,
        bezeichnung: body.bezeichnung,
        von:         new Date(body.von),
        bis:         new Date(body.bis),
        status:      'offen',
        erstelltVon: reqCtx.userId,
      },
    })
    return reply.status(201).send({ data: zeitraum })
  })

  /** GET /abrechnungszeitraeume/:zeitraumId/vollstaendigkeit */
  fastify.get('/:zeitraumId/vollstaendigkeit', auth, async (req, reply) => {
    const { zeitraumId } = ZeitraumIdParamSchema.parse(req.params)
    return reply.send(await service.pruefVollstaendigkeit(ctx(req), zeitraumId))
  })
}
