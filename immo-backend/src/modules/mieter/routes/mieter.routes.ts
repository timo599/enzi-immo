import type { FastifyPluginAsync } from 'fastify'
import { MieterService } from '../services/mieter.service.js'
import { CreateMieterSchema, UpdateMieterSchema, ListMieterQuerySchema, MieterIdParamSchema } from '../schemas/mieter.schema.js'

export const mieterRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new MieterService(fastify.prisma)
  const auth = { preHandler: [fastify.authenticate] }
  const ctx = (req: any) => ({ tenantId: req.tenantId, userId: req.currentUser.sub, ipAddress: req.ip, userAgent: req.headers['user-agent'] })

  fastify.get('/', auth, async (req, reply) => {
    const query = ListMieterQuerySchema.parse(req.query)
    return reply.send(await service.list(ctx(req), query))
  })

  fastify.post('/', auth, async (req, reply) => {
    const body = CreateMieterSchema.parse(req.body)
    return reply.status(201).send(await service.create(ctx(req), body))
  })

  fastify.get('/:id', auth, async (req, reply) => {
    const { id } = MieterIdParamSchema.parse(req.params)
    return reply.send(await service.getById(ctx(req), id, (req as any).currentUser.rolle))
  })

  fastify.patch('/:id', auth, async (req, reply) => {
    const { id } = MieterIdParamSchema.parse(req.params)
    const body = UpdateMieterSchema.parse(req.body)
    return reply.send(await service.update(ctx(req), id, body))
  })

  fastify.delete('/:id', auth, async (req, reply) => {
    const { id } = MieterIdParamSchema.parse(req.params)
    return reply.send(await service.delete(ctx(req), id))
  })
}
