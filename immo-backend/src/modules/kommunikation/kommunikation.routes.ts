import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { z } from 'zod'

const UuidParam = z.object({ id: z.string().uuid() })

const CreateSchema = z.object({
  mieterId:  z.string().uuid().optional(),
  einheitId: z.string().uuid().optional(),
  datum:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kategorie: z.enum(['anruf', 'brief', 'email', 'vor_ort', 'sonstiges']).default('sonstiges'),
  betreff:   z.string().max(200).optional(),
  text:      z.string().min(1).max(5000),
})

export const kommunikationRoutes: FastifyPluginAsync = async (fastify) => {
  const auth = { preHandler: [fastify.authenticate] }

  /** GET /kommunikation?mieterId=&einheitId= */
  fastify.get('/', auth, async (req, reply) => {
    const q = z.object({
      mieterId:  z.string().uuid().optional(),
      einheitId: z.string().uuid().optional(),
    }).parse(req.query)

    const items = await fastify.prisma.kommunikation.findMany({
      where: {
        tenantId:  req.tenantId,
        ...(q.mieterId  ? { mieterId:  q.mieterId  } : {}),
        ...(q.einheitId ? { einheitId: q.einheitId } : {}),
      },
      orderBy: [{ datum: 'desc' }, { erstelltAm: 'desc' }],
      include: {
        mieter:  { select: { id: true, vorname: true, nachname: true } },
        einheit: { select: { id: true, bezeichnung: true } },
      },
    })
    return reply.send({ data: items })
  })

  /** POST /kommunikation */
  fastify.post('/', auth, async (req, reply) => {
    const body = CreateSchema.parse(req.body)
    const item = await fastify.prisma.kommunikation.create({
      data: { ...body, tenantId: req.tenantId },
      include: {
        mieter:  { select: { id: true, vorname: true, nachname: true } },
        einheit: { select: { id: true, bezeichnung: true } },
      },
    })
    return reply.status(201).send({ data: item })
  })

  /** PATCH /kommunikation/:id */
  fastify.patch('/:id', auth, async (req, reply) => {
    const { id } = UuidParam.parse(req.params)
    const body = CreateSchema.partial().parse(req.body)
    const item = await fastify.prisma.kommunikation.update({
      where: { id, tenantId: req.tenantId },
      data:  body,
    })
    return reply.send({ data: item })
  })

  /** DELETE /kommunikation/:id */
  fastify.delete('/:id', auth, async (req, reply) => {
    const { id } = UuidParam.parse(req.params)
    await fastify.prisma.kommunikation.delete({ where: { id, tenantId: req.tenantId } })
    return reply.send({ data: { ok: true } })
  })
}
