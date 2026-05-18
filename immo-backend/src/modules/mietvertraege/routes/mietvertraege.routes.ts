import type { FastifyPluginAsync } from 'fastify'
import { MietvertraegeService } from '../services/mietvertraege.service.js'
import {
  CreateMietvertragSchema, UpdateMietvertragSchema,
  ListMietvertraegeQuerySchema, MietvertragIdParamSchema,
} from '../schemas/mietvertraege.schema.js'

export const mietvertraegeRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new MietvertraegeService(fastify.prisma)
  const auth = { preHandler: [fastify.authenticate] }
  const ctx = (req: any) => ({ tenantId: req.tenantId, userId: req.currentUser.sub, ipAddress: req.ip, userAgent: req.headers['user-agent'] })

  fastify.get('/', auth, async (req, reply) => {
    const query = ListMietvertraegeQuerySchema.parse(req.query)
    return reply.send(await service.list(ctx(req), query))
  })

  fastify.post('/', auth, async (req, reply) => {
    const body = CreateMietvertragSchema.parse(req.body)
    return reply.status(201).send(await service.create(ctx(req), body))
  })

  fastify.get('/:id', auth, async (req, reply) => {
    const { id } = MietvertragIdParamSchema.parse(req.params)
    return reply.send(await service.getById(ctx(req), id))
  })

  fastify.patch('/:id', auth, async (req, reply) => {
    const { id } = MietvertragIdParamSchema.parse(req.params)
    const body = UpdateMietvertragSchema.parse(req.body)
    return reply.send(await service.update(ctx(req), id, body))
  })

  fastify.delete('/:id', auth, async (req, reply) => {
    const { id } = MietvertragIdParamSchema.parse(req.params)
    return reply.send(await service.delete(ctx(req), id))
  })
}
