import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

const SchritteSchema = z.array(z.object({
  id:         z.string(),
  typ:        z.enum(['info', 'schritt', 'entscheidung']),
  titel:      z.string(),
  inhalt:     z.string().optional(),
  bedingungen: z.array(z.object({
    wenn: z.string(),
    dann: z.string(),
  })).optional(),
}))

const CreateSchema = z.object({
  titel:        z.string().min(1).max(300),
  kategorie:    z.string().max(100).optional().nullable(),
  beschreibung: z.string().optional().nullable(),
  inhalt:       z.string().optional().nullable(),
  userId:       z.string().uuid().optional().nullable(),
  fuerRolle:    z.string().max(50).optional().nullable(),
  objektId:     z.string().uuid().optional().nullable(),
  schritte:     SchritteSchema.optional(),
  budgetGrenze: z.number().positive().optional().nullable(),
  sortierung:   z.number().int().optional(),
  aktiv:        z.boolean().optional(),
})

const UpdateSchema = CreateSchema.partial()

const auth = { preHandler: [] as never[] }

export async function leitfadenRoutes(fastify: FastifyInstance) {
  const p = (fastify as any).prisma
  const tid  = (req: any) => req.tenantId as string
  const uid  = (req: any) => req.currentUser?.sub as string
  const role = (req: any) => req.currentUser?.rolle as string

  // ── GET /  – personalisierte Liste für eingeloggten User ──
  fastify.get('/', {
    preHandler: [fastify.authenticate],
  }, async (req: any, reply) => {
    const tenantId = tid(req)
    const userId   = uid(req)
    const rolle    = role(req)

    const items = await p.leitfaden.findMany({
      where: {
        tenantId,
        aktiv: true,
        OR: [
          { userId },
          { userId: null, fuerRolle: rolle },
          { userId: null, fuerRolle: null },
        ],
      },
      include: {
        objekt: { select: { id: true, bezeichnung: true, stadt: true } },
        user:   { select: { id: true, vorname: true, nachname: true } },
      },
      orderBy: [{ sortierung: 'asc' }, { erstelltAm: 'asc' }],
    })

    return reply.send({ data: items, total: items.length })
  })

  // ── GET /admin – alle Einträge (nur admin/verwalter) ──
  fastify.get('/admin', {
    preHandler: [fastify.authenticate],
  }, async (req: any, reply) => {
    if (role(req) !== 'admin' && role(req) !== 'verwalter') {
      return reply.status(403).send({ error: 'Keine Berechtigung' })
    }

    const items = await p.leitfaden.findMany({
      where: { tenantId: tid(req) },
      include: {
        objekt: { select: { id: true, bezeichnung: true, stadt: true } },
        user:   { select: { id: true, vorname: true, nachname: true } },
      },
      orderBy: [{ sortierung: 'asc' }, { erstelltAm: 'asc' }],
    })

    return reply.send({ data: items, total: items.length })
  })

  // ── GET /:id ──
  fastify.get('/:id', {
    preHandler: [fastify.authenticate],
  }, async (req: any, reply) => {
    const { id } = req.params as { id: string }

    const item = await p.leitfaden.findFirst({
      where: {
        id,
        tenantId: tid(req),
        aktiv: true,
        OR: [
          { userId: uid(req) },
          { userId: null, fuerRolle: role(req) },
          { userId: null, fuerRolle: null },
        ],
      },
      include: {
        objekt: { select: { id: true, bezeichnung: true, stadt: true } },
        user:   { select: { id: true, vorname: true, nachname: true } },
      },
    })

    if (!item) return reply.status(404).send({ error: 'Nicht gefunden' })
    return reply.send(item)
  })

  // ── POST / (nur admin/verwalter) ──
  fastify.post('/', {
    preHandler: [fastify.authenticate],
  }, async (req: any, reply) => {
    if (role(req) !== 'admin' && role(req) !== 'verwalter') {
      return reply.status(403).send({ error: 'Keine Berechtigung' })
    }

    const body = CreateSchema.parse(req.body)

    const item = await p.leitfaden.create({
      data: {
        tenantId:     tid(req),
        titel:        body.titel,
        kategorie:    body.kategorie ?? null,
        beschreibung: body.beschreibung ?? null,
        inhalt:       body.inhalt ?? null,
        userId:       body.userId ?? null,
        fuerRolle:    body.fuerRolle ?? null,
        objektId:     body.objektId ?? null,
        schritte:     (body.schritte ?? []) as object[],
        budgetGrenze: body.budgetGrenze ?? null,
        sortierung:   body.sortierung ?? 0,
        aktiv:        body.aktiv ?? true,
      },
      include: {
        objekt: { select: { id: true, bezeichnung: true, stadt: true } },
        user:   { select: { id: true, vorname: true, nachname: true } },
      },
    })

    return reply.status(201).send(item)
  })

  // ── PATCH /:id (nur admin/verwalter) ──
  fastify.patch('/:id', {
    preHandler: [fastify.authenticate],
  }, async (req: any, reply) => {
    const { id } = req.params as { id: string }

    if (role(req) !== 'admin' && role(req) !== 'verwalter') {
      return reply.status(403).send({ error: 'Keine Berechtigung' })
    }

    const existing = await p.leitfaden.findFirst({ where: { id, tenantId: tid(req) } })
    if (!existing) return reply.status(404).send({ error: 'Nicht gefunden' })

    const body = UpdateSchema.parse(req.body)

    const item = await p.leitfaden.update({
      where: { id },
      data: {
        ...(body.titel        !== undefined && { titel:        body.titel }),
        ...(body.kategorie    !== undefined && { kategorie:    body.kategorie }),
        ...(body.beschreibung !== undefined && { beschreibung: body.beschreibung }),
        ...(body.inhalt       !== undefined && { inhalt:       body.inhalt }),
        ...(body.userId       !== undefined && { userId:       body.userId }),
        ...(body.fuerRolle    !== undefined && { fuerRolle:    body.fuerRolle }),
        ...(body.objektId     !== undefined && { objektId:     body.objektId }),
        ...(body.schritte     !== undefined && { schritte:     body.schritte as object[] }),
        ...(body.budgetGrenze !== undefined && { budgetGrenze: body.budgetGrenze }),
        ...(body.sortierung   !== undefined && { sortierung:   body.sortierung }),
        ...(body.aktiv        !== undefined && { aktiv:        body.aktiv }),
      },
      include: {
        objekt: { select: { id: true, bezeichnung: true, stadt: true } },
        user:   { select: { id: true, vorname: true, nachname: true } },
      },
    })

    return reply.send(item)
  })

  // ── DELETE /:id (nur admin/verwalter) ──
  fastify.delete('/:id', {
    preHandler: [fastify.authenticate],
  }, async (req: any, reply) => {
    const { id } = req.params as { id: string }

    if (role(req) !== 'admin' && role(req) !== 'verwalter') {
      return reply.status(403).send({ error: 'Keine Berechtigung' })
    }

    const existing = await p.leitfaden.findFirst({ where: { id, tenantId: tid(req) } })
    if (!existing) return reply.status(404).send({ error: 'Nicht gefunden' })

    await p.leitfaden.delete({ where: { id } })
    return reply.status(204).send()
  })
}
