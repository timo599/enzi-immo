import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

const CreateFirmaSchema = z.object({
  name:       z.string().min(1).max(200),
  rechtsform: z.string().max(100).optional(),
  strasse:    z.string().max(200).optional(),
  plz:        z.string().max(10).optional(),
  stadt:      z.string().max(100).optional(),
  notizen:    z.string().max(2000).optional(),
})

const UpdateFirmaSchema = CreateFirmaSchema.partial().extend({
  aktiv: z.boolean().optional(),
})

const IdParam = z.object({ id: z.string().uuid() })

export const firmenRoutes: FastifyPluginAsync = async (fastify) => {
  const auth = { preHandler: [fastify.authenticate] }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = (req: any) => ({ tenantId: req.tenantId as string })

  /** GET /firmen */
  fastify.get('/', auth, async (req, reply) => {
    const { tenantId } = ctx(req)
    const firmen = await fastify.prisma.firma.findMany({
      where: { tenantId, aktiv: true },
      include: { _count: { select: { objekte: true } } },
      orderBy: { name: 'asc' },
    })
    return reply.send({ data: firmen })
  })

  /** POST /firmen */
  fastify.post('/', auth, async (req, reply) => {
    const { tenantId } = ctx(req)
    const body = CreateFirmaSchema.parse(req.body)
    const firma = await fastify.prisma.firma.create({ data: { tenantId, ...body } })
    return reply.status(201).send({ data: firma })
  })

  /** GET /firmen/:id */
  fastify.get('/:id', auth, async (req, reply) => {
    const { id } = IdParam.parse(req.params)
    const { tenantId } = ctx(req)
    const firma = await fastify.prisma.firma.findFirst({
      where: { id, tenantId },
      include: { objekte: { where: { aktiv: true }, select: { id: true, bezeichnung: true, stadt: true } } },
    })
    if (!firma) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Firma nicht gefunden' } })
    return reply.send({ data: firma })
  })

  /** PATCH /firmen/:id */
  fastify.patch('/:id', auth, async (req, reply) => {
    const { id } = IdParam.parse(req.params)
    const { tenantId } = ctx(req)
    const body = UpdateFirmaSchema.parse(req.body)
    const firma = await fastify.prisma.firma.updateMany({
      where: { id, tenantId },
      data: body,
    })
    if (firma.count === 0) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Firma nicht gefunden' } })
    const updated = await fastify.prisma.firma.findFirst({ where: { id, tenantId } })
    return reply.send({ data: updated })
  })

  /** DELETE /firmen/:id (soft-delete) */
  fastify.delete('/:id', auth, async (req, reply) => {
    const { id } = IdParam.parse(req.params)
    const { tenantId } = ctx(req)
    await fastify.prisma.firma.updateMany({ where: { id, tenantId }, data: { aktiv: false } })
    return reply.send({ data: { id } })
  })
}
