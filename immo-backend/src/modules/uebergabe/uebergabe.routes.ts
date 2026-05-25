import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

const UuidParam = z.object({ id: z.string().uuid() })

const RaumSchema = z.object({
  name:      z.string(),
  zustand:   z.enum(['gut', 'maengel', 'nicht_geprueft']).default('nicht_geprueft'),
  maengel:   z.string().optional(),
  notizen:   z.string().optional(),
})

const CreateSchema = z.object({
  einheitId:            z.string().uuid(),
  mietvertragId:        z.string().uuid().optional(),
  typ:                  z.enum(['einzug', 'auszug']),
  datum:                z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  zaehlerstandStrom:    z.number().optional(),
  zaehlerstandGas:      z.number().optional(),
  zaehlerstandWasser:   z.number().optional(),
  schluessel:           z.number().int().min(0).optional(),
  raeume:               z.array(RaumSchema).default([]),
  notizen:              z.string().optional(),
})

export const uebergabeRoutes: FastifyPluginAsync = async (fastify) => {
  const auth = { preHandler: [fastify.authenticate] }

  /** GET /uebergabe?einheitId= */
  fastify.get('/', auth, async (req, reply) => {
    const q = z.object({ einheitId: z.string().uuid().optional() }).parse(req.query)
    const items = await fastify.prisma.uebergabeprotokoll.findMany({
      where: {
        tenantId:  req.tenantId,
        ...(q.einheitId ? { einheitId: q.einheitId } : {}),
      },
      orderBy: { datum: 'desc' },
      include: {
        einheit:     { select: { id: true, bezeichnung: true, objekt: { select: { bezeichnung: true } } } },
        mietvertrag: {
          select: {
            id: true,
            mietvertragMieter: {
              where: { bis: null },
              include: { mieter: { select: { vorname: true, nachname: true } } },
              take: 1,
            },
          },
        },
      },
    })
    return reply.send({ data: items })
  })

  /** POST /uebergabe */
  fastify.post('/', auth, async (req, reply) => {
    const body = CreateSchema.parse(req.body)
    const item = await fastify.prisma.uebergabeprotokoll.create({
      data: {
        ...body,
        tenantId: req.tenantId,
        datum:    new Date(body.datum),
        raeume:   body.raeume as any,
      },
    })
    return reply.status(201).send({ data: item })
  })

  /** PATCH /uebergabe/:id */
  fastify.patch('/:id', auth, async (req, reply) => {
    const { id } = UuidParam.parse(req.params)
    const body = CreateSchema.partial().omit({ einheitId: true, typ: true }).parse(req.body)
    const item = await fastify.prisma.uebergabeprotokoll.update({
      where: { id, tenantId: req.tenantId },
      data: {
        ...body,
        ...(body.datum  ? { datum: new Date(body.datum) } : {}),
        ...(body.raeume ? { raeume: body.raeume as any } : {}),
      },
    })
    return reply.send({ data: item })
  })

  /** DELETE /uebergabe/:id */
  fastify.delete('/:id', auth, async (req, reply) => {
    const { id } = UuidParam.parse(req.params)
    await fastify.prisma.uebergabeprotokoll.delete({ where: { id, tenantId: req.tenantId } })
    return reply.send({ data: { ok: true } })
  })
}
