import type { FastifyPluginAsync } from 'fastify'
import { ObjekteService } from '../services/objekte.service.js'
import {
  CreateObjektSchema,
  UpdateObjektSchema,
  ListObjekteQuerySchema,
  ObjektIdParamSchema,
} from '../schemas/objekte.schema.js'

export const objekteRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new ObjekteService(fastify.prisma)
  const auth = { preHandler: [fastify.authenticate] }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = (req: any) => ({
    tenantId: req.tenantId,
    userId: req.currentUser.sub,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  })

  /** GET /objekte */
  fastify.get('/', auth, async (req, reply) => {
    const query = ListObjekteQuerySchema.parse(req.query)
    const result = await service.list(ctx(req), query)
    return reply.send(result)
  })

  /** POST /objekte */
  fastify.post('/', auth, async (req, reply) => {
    const body = CreateObjektSchema.parse(req.body)
    const result = await service.create(ctx(req), body)
    return reply.status(201).send(result)
  })

  /** GET /objekte/:id */
  fastify.get('/:id', auth, async (req, reply) => {
    const { id } = ObjektIdParamSchema.parse(req.params)
    const result = await service.getById(ctx(req), id)
    return reply.send(result)
  })

  /** PATCH /objekte/:id */
  fastify.patch('/:id', auth, async (req, reply) => {
    const { id } = ObjektIdParamSchema.parse(req.params)
    const body = UpdateObjektSchema.parse(req.body)
    const result = await service.update(ctx(req), id, body)
    return reply.send(result)
  })

  /** DELETE /objekte/:id */
  fastify.delete('/:id', auth, async (req, reply) => {
    const { id } = ObjektIdParamSchema.parse(req.params)
    const result = await service.delete(ctx(req), id)
    return reply.send(result)
  })
}
