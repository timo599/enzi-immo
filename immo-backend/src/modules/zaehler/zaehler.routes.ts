import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

const VerbrauchstypEnum = z.enum([
  'oel', 'strom_gemein', 'strom_einheit', 'gas', 'wasser_kalt', 'wasser_warm', 'fernwaerme',
])

const CreateZaehlerSchema = z.object({
  objektId:      z.string().uuid().optional(),
  einheitId:     z.string().uuid().optional(),
  bezeichnung:   z.string().min(1).max(200),
  zaehlernummer: z.string().max(100).optional(),
  verbrauchstyp: VerbrauchstypEnum,
  einheit:       z.string().default('kWh'),
  notizen:       z.string().max(1000).optional(),
  aktiv:         z.boolean().default(true),
})

const UpdateZaehlerSchema = CreateZaehlerSchema.partial().omit({ objektId: true, einheitId: true })

const CreateStandSchema = z.object({
  ablesedatum: z.string().date(),
  stand:       z.number().nonnegative(),
  notizen:     z.string().max(500).optional(),
})

const IdParam = z.object({ id: z.string().uuid() })

const ListQuery = z.object({
  objektId:      z.string().uuid().optional(),
  einheitId:     z.string().uuid().optional(),
  verbrauchstyp: VerbrauchstypEnum.optional(),
  nurAktive:     z.coerce.boolean().default(true),
})

export const zaehlerRoutes: FastifyPluginAsync = async (fastify) => {
  const auth = { preHandler: [fastify.authenticate] }
  const tid = (req: any) => req.tenantId as string

  // ── GET /zaehler ─────────────────────────────────────────────
  fastify.get('/', auth, async (req) => {
    const q = ListQuery.parse(req.query)
    const rows = await fastify.prisma.zaehler.findMany({
      where: {
        tenantId:      tid(req),
        ...(q.objektId      ? { objektId:      q.objektId }      : {}),
        ...(q.einheitId     ? { einheitId:     q.einheitId }     : {}),
        ...(q.verbrauchstyp ? { verbrauchstyp: q.verbrauchstyp } : {}),
        ...(q.nurAktive     ? { aktiv: true }                    : {}),
      },
      include: {
        staende: {
          orderBy: { ablesedatum: 'desc' },
          take: 2,
        },
      },
      orderBy: { erstelltAm: 'asc' },
    })
    return { data: rows }
  })

  // ── POST /zaehler ────────────────────────────────────────────
  fastify.post('/', auth, async (req, reply) => {
    const body = CreateZaehlerSchema.parse(req.body)
    const zaehler = await fastify.prisma.zaehler.create({
      data: { ...body, tenantId: tid(req) },
      include: { staende: true },
    })
    return reply.status(201).send({ data: zaehler })
  })

  // ── GET /zaehler/:id ─────────────────────────────────────────
  fastify.get('/:id', auth, async (req, reply) => {
    const { id } = IdParam.parse(req.params)
    const zaehler = await fastify.prisma.zaehler.findFirst({
      where: { id, tenantId: tid(req) },
      include: {
        staende: { orderBy: { ablesedatum: 'desc' } },
      },
    })
    if (!zaehler) return reply.status(404).send({ message: 'Zähler nicht gefunden' })
    return { data: zaehler }
  })

  // ── PATCH /zaehler/:id ───────────────────────────────────────
  fastify.patch('/:id', auth, async (req, reply) => {
    const { id } = IdParam.parse(req.params)
    const body = UpdateZaehlerSchema.parse(req.body)
    const existing = await fastify.prisma.zaehler.findFirst({ where: { id, tenantId: tid(req) } })
    if (!existing) return reply.status(404).send({ message: 'Zähler nicht gefunden' })
    const updated = await fastify.prisma.zaehler.update({
      where: { id },
      data: body,
      include: { staende: { orderBy: { ablesedatum: 'desc' }, take: 5 } },
    })
    return { data: updated }
  })

  // ── DELETE /zaehler/:id ──────────────────────────────────────
  fastify.delete('/:id', auth, async (req, reply) => {
    const { id } = IdParam.parse(req.params)
    const existing = await fastify.prisma.zaehler.findFirst({ where: { id, tenantId: tid(req) } })
    if (!existing) return reply.status(404).send({ message: 'Zähler nicht gefunden' })
    await fastify.prisma.zaehler.delete({ where: { id } })
    return reply.status(204).send()
  })

  // ── POST /zaehler/:id/staende  (Ablesung eintragen) ─────────
  fastify.post('/:id/staende', auth, async (req, reply) => {
    const { id } = IdParam.parse(req.params)
    const body = CreateStandSchema.parse(req.body)
    const zaehler = await fastify.prisma.zaehler.findFirst({ where: { id, tenantId: tid(req) } })
    if (!zaehler) return reply.status(404).send({ message: 'Zähler nicht gefunden' })

    // Verbrauch berechnen (Differenz zum letzten Stand)
    const letzter = await fastify.prisma.zaehlerstand.findFirst({
      where:   { zaehler_id: id },
      orderBy: { ablesedatum: 'desc' },
    })
    const verbrauch = letzter
      ? Math.max(0, body.stand - Number(letzter.stand))
      : null

    const stand = await fastify.prisma.zaehlerstand.create({
      data: {
        zaehler_id:  id,
        ablesedatum: new Date(body.ablesedatum),
        stand:       body.stand,
        verbrauch:   verbrauch ?? undefined,
        notizen:     body.notizen,
      },
    })
    return reply.status(201).send({ data: stand })
  })

  // ── DELETE /zaehler/staende/:standId ─────────────────────────
  fastify.delete('/staende/:standId', auth, async (req, reply) => {
    const { standId } = z.object({ standId: z.string().uuid() }).parse(req.params)
    // Verify ownership via join
    const stand = await fastify.prisma.zaehlerstand.findFirst({
      where: { id: standId },
      include: { zaehler: { select: { tenantId: true } } },
    })
    if (!stand || stand.zaehler.tenantId !== tid(req)) {
      return reply.status(404).send({ message: 'Ablesung nicht gefunden' })
    }
    await fastify.prisma.zaehlerstand.delete({ where: { id: standId } })
    return reply.status(204).send()
  })
}
