import type { FastifyPluginAsync } from 'fastify'
import { VerbrauchService } from '../services/verbrauch.service.js'
import { CreateVerbrauchSchema, UpdateVerbrauchSchema, ListVerbrauchQuerySchema, VerbrauchIdParamSchema, CreateOelZukaufSchema } from '../schemas/verbrauch.schema.js'

export const verbrauchRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new VerbrauchService(fastify.prisma)
  const auth = { preHandler: [fastify.authenticate] }
  const ctx = (req: any) => ({ tenantId: req.tenantId, userId: req.currentUser.sub, ipAddress: req.ip, userAgent: req.headers['user-agent'] })

  /** GET /verbrauch */
  fastify.get('/', auth, async (req, reply) => {
    return reply.send(await service.list(ctx(req), ListVerbrauchQuerySchema.parse(req.query)))
  })

  /** POST /verbrauch  (upsert – one per objekt+zeitraum+typ) */
  fastify.post('/', auth, async (req, reply) => {
    const body = CreateVerbrauchSchema.parse(req.body)
    return reply.status(200).send(await service.upsert(ctx(req), body))
  })

  /** GET /verbrauch/:id */
  fastify.get('/:id', auth, async (req, reply) => {
    const { id } = VerbrauchIdParamSchema.parse(req.params)
    return reply.send(await service.getById(ctx(req), id))
  })

  /** PATCH /verbrauch/:id */
  fastify.patch('/:id', auth, async (req, reply) => {
    const { id } = VerbrauchIdParamSchema.parse(req.params)
    const body = UpdateVerbrauchSchema.parse(req.body)
    return reply.send(await service.update(ctx(req), id, body))
  })

  /** POST /verbrauch/:id/zukauf  – add Öl delivery */
  fastify.post('/:id/zukauf', auth, async (req, reply) => {
    const { id } = VerbrauchIdParamSchema.parse(req.params)
    const body = CreateOelZukaufSchema.parse(req.body)
    return reply.status(201).send(await service.addOelZukauf(ctx(req), id, body))
  })
}
