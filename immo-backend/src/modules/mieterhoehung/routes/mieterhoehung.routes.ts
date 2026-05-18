import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { MieterhoehungService } from '../services/mieterhoehung.service.js'
import {
  BerechneMieterhoehungSchema,
  MieterhoehungListQuerySchema,
  MieterhoehungIdParamSchema,
  AktualisiereMieterhoehungSchema,
} from '../schemas/mieterhoehung.schema.js'

export const mieterhoehungRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new MieterhoehungService(fastify.prisma)
  const auth = { preHandler: [fastify.authenticate] }

  const ctx = (req: FastifyRequest): import('../../../types/common.js').RequestContext => ({
    tenantId:  req.tenantId,
    userId:    req.currentUser.sub,
    ipAddress: req.ip,
    ...(req.headers['user-agent'] !== undefined ? { userAgent: req.headers['user-agent'] } : {}),
  })

  /** POST /mieterhoehungen/berechne
   * Berechnet nächstmögliche Mieterhöhung nach §558 BGB für einen Mietvertrag */
  fastify.post('/berechne', auth, async (req, reply) => {
    const body = BerechneMieterhoehungSchema.parse(req.body)
    const result = await service.berechne(ctx(req), body)
    return reply.status(201).send(result)
  })

  /** GET /mieterhoehungen */
  fastify.get('/', auth, async (req, reply) => {
    const query = MieterhoehungListQuerySchema.parse(req.query)
    const result = await service.list(ctx(req), query)
    return reply.send(result)
  })

  /** GET /mieterhoehungen/:id */
  fastify.get('/:id', auth, async (req, reply) => {
    const { id } = MieterhoehungIdParamSchema.parse(req.params)
    const result = await service.getById(ctx(req), id)
    return reply.send(result)
  })

  /** PATCH /mieterhoehungen/:id
   * Juristische Prüfung abgeschlossen, neue Miete manuell anpassen */
  fastify.patch('/:id', auth, async (req, reply) => {
    const { id } = MieterhoehungIdParamSchema.parse(req.params)
    const body = AktualisiereMieterhoehungSchema.parse(req.body)
    const result = await service.aktualisiere(ctx(req), id, body)
    return reply.send(result)
  })
}
