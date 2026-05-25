import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

const UuidParam = z.object({ id: z.string().uuid() })

const CreateSchema = z.object({
  objektId:         z.string().uuid().optional(),
  einheitId:        z.string().uuid().optional(),
  titel:            z.string().min(1).max(200),
  beschreibung:     z.string().max(2000).optional(),
  intervallMonate:  z.number().int().min(1).max(120),
  letzteAusfuehrung: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  aktiv:            z.boolean().default(true),
})

function naechstFaellig(letzte: string | undefined, intervall: number): Date | null {
  if (!letzte) return null
  const d = new Date(letzte)
  d.setMonth(d.getMonth() + intervall)
  return d
}

export const wartungRoutes: FastifyPluginAsync = async (fastify) => {
  const auth = { preHandler: [fastify.authenticate] }

  /** GET /wartung?objektId=&nurFaellig= */
  fastify.get('/', auth, async (req, reply) => {
    const q = z.object({
      objektId:   z.string().uuid().optional(),
      nurFaellig: z.coerce.boolean().optional(),
    }).parse(req.query)

    const items = await fastify.prisma.wartungsaufgabe.findMany({
      where: {
        tenantId: req.tenantId,
        aktiv:    true,
        ...(q.objektId ? { objektId: q.objektId } : {}),
        ...(q.nurFaellig ? { naechstFaellig: { lte: new Date() } } : {}),
      },
      orderBy: [{ naechstFaellig: 'asc' }, { titel: 'asc' }],
      include: {
        objekt:  { select: { id: true, bezeichnung: true } },
        einheit: { select: { id: true, bezeichnung: true } },
      },
    })
    return reply.send({ data: items })
  })

  /** POST /wartung */
  fastify.post('/', auth, async (req, reply) => {
    const body = CreateSchema.parse(req.body)
    const faellig = naechstFaellig(body.letzteAusfuehrung, body.intervallMonate)
    const item = await fastify.prisma.wartungsaufgabe.create({
      data: {
        ...body,
        tenantId:         req.tenantId,
        letzteAusfuehrung: body.letzteAusfuehrung ? new Date(body.letzteAusfuehrung) : null,
        naechstFaellig:    faellig,
      },
      include: {
        objekt:  { select: { id: true, bezeichnung: true } },
        einheit: { select: { id: true, bezeichnung: true } },
      },
    })
    return reply.status(201).send({ data: item })
  })

  /** POST /wartung/:id/erledigt — Wartung als ausgeführt markieren */
  fastify.post('/:id/erledigt', auth, async (req, reply) => {
    const { id } = UuidParam.parse(req.params)
    const { datum } = z.object({ datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() })
      .parse(req.body)

    const task = await fastify.prisma.wartungsaufgabe.findUniqueOrThrow({
      where: { id, tenantId: req.tenantId },
    })
    const ausfuehrung = datum ? new Date(datum) : new Date()
    const faellig = naechstFaellig(ausfuehrung.toISOString().slice(0, 10), task.intervallMonate)

    const updated = await fastify.prisma.wartungsaufgabe.update({
      where: { id },
      data:  { letzteAusfuehrung: ausfuehrung, naechstFaellig: faellig },
    })
    return reply.send({ data: updated })
  })

  /** PATCH /wartung/:id */
  fastify.patch('/:id', auth, async (req, reply) => {
    const { id } = UuidParam.parse(req.params)
    const body = CreateSchema.partial().parse(req.body)
    const item = await fastify.prisma.wartungsaufgabe.update({
      where: { id, tenantId: req.tenantId },
      data: {
        ...body,
        ...(body.letzteAusfuehrung ? { letzteAusfuehrung: new Date(body.letzteAusfuehrung) } : {}),
        ...(body.letzteAusfuehrung && body.intervallMonate
          ? { naechstFaellig: naechstFaellig(body.letzteAusfuehrung, body.intervallMonate) }
          : {}),
      },
    })
    return reply.send({ data: item })
  })

  /** DELETE /wartung/:id */
  fastify.delete('/:id', auth, async (req, reply) => {
    const { id } = UuidParam.parse(req.params)
    await fastify.prisma.wartungsaufgabe.update({
      where: { id, tenantId: req.tenantId },
      data:  { aktiv: false },
    })
    return reply.send({ data: { ok: true } })
  })
}
