import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

const UuidParam = z.object({ id: z.string().uuid() })

const CreateSchema = z.object({
  einheitId:    z.string().uuid().optional(),
  objektId:     z.string().uuid().optional(),
  titel:        z.string().min(1).max(200),
  beschreibung: z.string().max(2000).optional(),
  status:       z.enum(['offen', 'in_bearbeitung', 'erledigt']).default('offen'),
  kosten:       z.number().positive().optional(),
  datum:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  erledigtAm:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  handwerker:   z.string().max(200).optional(),
})

export const reparaturRoutes: FastifyPluginAsync = async (fastify) => {
  const auth = { preHandler: [fastify.authenticate] }

  /** GET /reparaturen?einheitId=&objektId=&status= */
  fastify.get('/', auth, async (req, reply) => {
    const q = z.object({
      einheitId: z.string().uuid().optional(),
      objektId:  z.string().uuid().optional(),
      status:    z.enum(['offen', 'in_bearbeitung', 'erledigt']).optional(),
    }).parse(req.query)

    const items = await fastify.prisma.reparatur.findMany({
      where: {
        tenantId:   req.tenantId,
        ...(q.einheitId ? { einheitId: q.einheitId } : {}),
        ...(q.objektId  ? { objektId:  q.objektId  } : {}),
        ...(q.status    ? { status:    q.status     } : {}),
      },
      orderBy: [{ status: 'asc' }, { datum: 'desc' }],
      include: {
        einheit: { select: { id: true, bezeichnung: true, objekt: { select: { bezeichnung: true } } } },
        objekt:  { select: { id: true, bezeichnung: true } },
      },
    })
    return reply.send({ data: items })
  })

  /** POST /reparaturen */
  fastify.post('/', auth, async (req, reply) => {
    const body = CreateSchema.parse(req.body)
    const item = await fastify.prisma.reparatur.create({
      data: {
        ...body,
        tenantId:   req.tenantId,
        kosten:     body.kosten ?? null,
        datum:      new Date(body.datum),
        erledigtAm: body.erledigtAm ? new Date(body.erledigtAm) : null,
      },
      include: {
        einheit: { select: { id: true, bezeichnung: true, objekt: { select: { bezeichnung: true } } } },
        objekt:  { select: { id: true, bezeichnung: true } },
      },
    })
    return reply.status(201).send({ data: item })
  })

  /** PATCH /reparaturen/:id */
  fastify.patch('/:id', auth, async (req, reply) => {
    const { id } = UuidParam.parse(req.params)
    const body = CreateSchema.partial().parse(req.body)
    const item = await fastify.prisma.reparatur.update({
      where: { id, tenantId: req.tenantId },
      data: {
        ...body,
        ...(body.datum      ? { datum:      new Date(body.datum)      } : {}),
        ...(body.erledigtAm ? { erledigtAm: new Date(body.erledigtAm) } : {}),
      },
    })
    return reply.send({ data: item })
  })

  /** DELETE /reparaturen/:id */
  fastify.delete('/:id', auth, async (req, reply) => {
    const { id } = UuidParam.parse(req.params)
    await fastify.prisma.reparatur.delete({ where: { id, tenantId: req.tenantId } })
    return reply.send({ data: { ok: true } })
  })
}
