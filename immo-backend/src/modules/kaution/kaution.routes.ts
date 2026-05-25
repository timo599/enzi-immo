import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

const UuidParam = z.object({ id: z.string().uuid() })

const UpsertSchema = z.object({
  mietvertragId:  z.string().uuid(),
  betrag:         z.number().positive(),
  erhaltenAm:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  konto:          z.string().max(200).optional(),
  zinsen:         z.number().min(0).optional(),
  rueckgabeAm:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  rueckgabeBetrag: z.number().min(0).optional(),
  abzuege:        z.number().min(0).optional(),
  abzuegeGrund:   z.string().max(500).optional(),
  notizen:        z.string().optional(),
})

export const kautionRoutes: FastifyPluginAsync = async (fastify) => {
  const auth = { preHandler: [fastify.authenticate] }

  /** GET /kaution?mietvertragId= */
  fastify.get('/', auth, async (req, reply) => {
    const q = z.object({ mietvertragId: z.string().uuid().optional() }).parse(req.query)
    const items = await fastify.prisma.kaution.findMany({
      where: {
        tenantId: req.tenantId,
        ...(q.mietvertragId ? { mietvertragId: q.mietvertragId } : {}),
      },
      include: {
        mietvertrag: {
          select: {
            id: true,
            einheit: {
              select: {
                bezeichnung: true,
                objekt: { select: { bezeichnung: true } },
              },
            },
            mietvertragMieter: {
              where: { bis: null },
              include: { mieter: { select: { vorname: true, nachname: true } } },
              take: 1,
            },
          },
        },
      },
      orderBy: { erstelltAm: 'desc' },
    })
    return reply.send({ data: items })
  })

  /** POST /kaution — anlegen oder aktualisieren (upsert) */
  fastify.post('/', auth, async (req, reply) => {
    const body = UpsertSchema.parse(req.body)

    // Verify mietvertrag belongs to tenant
    await fastify.prisma.mietvertrag.findFirstOrThrow({
      where: { id: body.mietvertragId, tenantId: req.tenantId },
    })

    const item = await fastify.prisma.kaution.upsert({
      where:  { mietvertragId: body.mietvertragId },
      create: {
        ...body,
        tenantId:   req.tenantId,
        erhaltenAm:     body.erhaltenAm     ? new Date(body.erhaltenAm)     : null,
        rueckgabeAm:    body.rueckgabeAm    ? new Date(body.rueckgabeAm)    : null,
      },
      update: {
        ...body,
        erhaltenAm:     body.erhaltenAm     ? new Date(body.erhaltenAm)     : null,
        rueckgabeAm:    body.rueckgabeAm    ? new Date(body.rueckgabeAm)    : null,
      },
    })
    return reply.status(201).send({ data: item })
  })

  /** PATCH /kaution/:id */
  fastify.patch('/:id', auth, async (req, reply) => {
    const { id } = UuidParam.parse(req.params)
    const body = UpsertSchema.omit({ mietvertragId: true }).partial().parse(req.body)
    const item = await fastify.prisma.kaution.update({
      where: { id, tenantId: req.tenantId },
      data: {
        ...body,
        ...(body.erhaltenAm  ? { erhaltenAm:  new Date(body.erhaltenAm)  } : {}),
        ...(body.rueckgabeAm ? { rueckgabeAm: new Date(body.rueckgabeAm) } : {}),
      },
    })
    return reply.send({ data: item })
  })
}
