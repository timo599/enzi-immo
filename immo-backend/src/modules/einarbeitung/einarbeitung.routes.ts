import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { randomBytes } from 'node:crypto'

// ── helpers ──────────────────────────────────────────────────
const tid  = (req: any) => req.tenantId as string
const uid  = (req: any) => req.currentUser?.sub as string
const role = (req: any) => req.currentUser?.rolle as string
const isAdmin = (req: any) => ['admin', 'verwalter'].includes(role(req))

function generateCode(): string {
  return randomBytes(4).toString('hex').toUpperCase() // e.g. "A3F2B891"
}

// ── schemas ───────────────────────────────────────────────────
const SchritteSchema = z.array(z.object({
  id:          z.string(),
  typ:         z.enum(['info', 'schritt', 'entscheidung', 'aufgabe']),
  titel:       z.string(),
  inhalt:      z.string().optional(),
  pflicht:     z.boolean().optional(),
  bedingungen: z.array(z.object({ wenn: z.string(), dann: z.string() })).optional(),
}))

const ModulSchema = z.object({
  titel:        z.string().min(1).max(300),
  beschreibung: z.string().optional().nullable(),
  inhalt:       z.string().optional().nullable(),
  schritte:     SchritteSchema.optional(),
  leitfadenIds: z.array(z.string().uuid()).optional(),
  reihenfolge:  z.number().int().optional(),
  pflicht:      z.boolean().optional(),
})

const EinarbeitungCreateSchema = z.object({
  titel:        z.string().min(1).max(300),
  beschreibung: z.string().optional().nullable(),
  typ:          z.enum(['intern', 'extern']).default('intern'),
  zielRolle:    z.string().max(50).optional().nullable(),
  gueltigBis:   z.string().datetime().optional().nullable(),
  aktiv:        z.boolean().optional(),
  module:       z.array(ModulSchema).optional(),
})

const EinarbeitungUpdateSchema = EinarbeitungCreateSchema.partial()

const FortschrittSchema = z.object({
  status:      z.enum(['offen', 'in_bearbeitung', 'erledigt']),
  notizen:     z.string().optional().nullable(),
  // für externe Nutzer:
  externEmail: z.string().email().optional(),
  externName:  z.string().optional(),
})

// ── routes ────────────────────────────────────────────────────
export async function einarbeitungRoutes(fastify: FastifyInstance) {
  const p = (fastify as any).prisma

  // ─── GET / – alle Programme des Tenants (intern: auth, zeige passende) ───
  fastify.get('/', {
    preHandler: [fastify.authenticate],
  }, async (req: any, reply) => {
    const tenantId = tid(req)
    const userId   = uid(req)
    const rolle    = role(req)

    const where: any = { tenantId, aktiv: true, typ: 'intern' }

    // Nicht-Admins sehen nur ihre Rolle oder ohne Einschränkung
    if (!isAdmin(req)) {
      where.OR = [
        { zielRolle: rolle },
        { zielRolle: null },
      ]
    }

    const items = await p.einarbeitung.findMany({
      where,
      include: {
        module: {
          orderBy: { reihenfolge: 'asc' },
          include: {
            fortschritte: {
              where: { userId },
            },
          },
        },
      },
      orderBy: { erstelltAm: 'asc' },
    })

    return reply.send({ data: items, total: items.length })
  })

  // ─── GET /admin – alle (intern + extern) ───
  fastify.get('/admin', {
    preHandler: [fastify.authenticate],
  }, async (req: any, reply) => {
    if (!isAdmin(req)) return reply.status(403).send({ error: 'Keine Berechtigung' })

    const items = await p.einarbeitung.findMany({
      where: { tenantId: tid(req) },
      include: {
        module: {
          orderBy: { reihenfolge: 'asc' },
          include: {
            _count: { select: { fortschritte: true } },
          },
        },
      },
      orderBy: [{ typ: 'asc' }, { erstelltAm: 'asc' }],
    })

    return reply.send({ data: items, total: items.length })
  })

  // ─── GET /:id ───
  fastify.get('/:id', {
    preHandler: [fastify.authenticate],
  }, async (req: any, reply) => {
    const { id } = req.params as { id: string }
    const userId = uid(req)

    const item = await p.einarbeitung.findFirst({
      where: { id, tenantId: tid(req) },
      include: {
        module: {
          orderBy: { reihenfolge: 'asc' },
          include: {
            fortschritte: isAdmin(req)
              ? { include: { user: { select: { id: true, vorname: true, nachname: true, email: true } } } }
              : { where: { userId } },
          },
        },
      },
    })

    if (!item) return reply.status(404).send({ error: 'Nicht gefunden' })
    return reply.send(item)
  })

  // ─── POST / ───
  fastify.post('/', {
    preHandler: [fastify.authenticate],
  }, async (req: any, reply) => {
    if (!isAdmin(req)) return reply.status(403).send({ error: 'Keine Berechtigung' })

    const body = EinarbeitungCreateSchema.parse(req.body)

    const item = await p.einarbeitung.create({
      data: {
        tenantId:     tid(req),
        titel:        body.titel,
        beschreibung: body.beschreibung ?? null,
        typ:          body.typ,
        zielRolle:    body.zielRolle ?? null,
        zugangscode:  body.typ === 'extern' ? generateCode() : null,
        gueltigBis:   body.gueltigBis ? new Date(body.gueltigBis) : null,
        aktiv:        body.aktiv ?? true,
        module: body.module?.length ? {
          create: body.module.map(m => ({
            titel:        m.titel,
            beschreibung: m.beschreibung ?? null,
            inhalt:       m.inhalt ?? null,
            schritte:     (m.schritte ?? []) as object[],
            leitfadenIds: (m.leitfadenIds ?? []) as string[],
            reihenfolge:  m.reihenfolge ?? 0,
            pflicht:      m.pflicht ?? true,
          })),
        } : undefined,
      },
      include: {
        module: { orderBy: { reihenfolge: 'asc' } },
      },
    })

    return reply.status(201).send(item)
  })

  // ─── PATCH /:id ───
  fastify.patch('/:id', {
    preHandler: [fastify.authenticate],
  }, async (req: any, reply) => {
    if (!isAdmin(req)) return reply.status(403).send({ error: 'Keine Berechtigung' })

    const { id } = req.params as { id: string }
    const existing = await p.einarbeitung.findFirst({ where: { id, tenantId: tid(req) } })
    if (!existing) return reply.status(404).send({ error: 'Nicht gefunden' })

    const body = EinarbeitungUpdateSchema.parse(req.body)

    // Wenn typ wechselt zu 'extern' und noch kein Code da
    const needsCode = body.typ === 'extern' && !existing.zugangscode

    const item = await p.einarbeitung.update({
      where: { id },
      data: {
        ...(body.titel        !== undefined && { titel:        body.titel }),
        ...(body.beschreibung !== undefined && { beschreibung: body.beschreibung }),
        ...(body.typ          !== undefined && { typ:          body.typ }),
        ...(body.zielRolle    !== undefined && { zielRolle:    body.zielRolle }),
        ...(body.gueltigBis   !== undefined && { gueltigBis:   body.gueltigBis ? new Date(body.gueltigBis) : null }),
        ...(body.aktiv        !== undefined && { aktiv:        body.aktiv }),
        ...(needsCode && { zugangscode: generateCode() }),
      },
      include: {
        module: { orderBy: { reihenfolge: 'asc' } },
      },
    })

    return reply.send(item)
  })

  // ─── DELETE /:id ───
  fastify.delete('/:id', {
    preHandler: [fastify.authenticate],
  }, async (req: any, reply) => {
    if (!isAdmin(req)) return reply.status(403).send({ error: 'Keine Berechtigung' })

    const { id } = req.params as { id: string }
    const existing = await p.einarbeitung.findFirst({ where: { id, tenantId: tid(req) } })
    if (!existing) return reply.status(404).send({ error: 'Nicht gefunden' })

    await p.einarbeitung.delete({ where: { id } })
    return reply.status(204).send()
  })

  // ─── POST /:id/code – neuen Zugangscode generieren ───
  fastify.post('/:id/code', {
    preHandler: [fastify.authenticate],
  }, async (req: any, reply) => {
    if (!isAdmin(req)) return reply.status(403).send({ error: 'Keine Berechtigung' })

    const { id } = req.params as { id: string }
    const existing = await p.einarbeitung.findFirst({ where: { id, tenantId: tid(req) } })
    if (!existing) return reply.status(404).send({ error: 'Nicht gefunden' })

    const updated = await p.einarbeitung.update({
      where: { id },
      data: { zugangscode: generateCode() },
    })

    return reply.send({ zugangscode: updated.zugangscode })
  })

  // ─── Modul CRUD ───

  fastify.post('/:id/module', {
    preHandler: [fastify.authenticate],
  }, async (req: any, reply) => {
    if (!isAdmin(req)) return reply.status(403).send({ error: 'Keine Berechtigung' })

    const { id } = req.params as { id: string }
    const existing = await p.einarbeitung.findFirst({ where: { id, tenantId: tid(req) } })
    if (!existing) return reply.status(404).send({ error: 'Nicht gefunden' })

    const body = ModulSchema.parse(req.body)
    const modul = await p.einarbeitungsModul.create({
      data: {
        einarbeitungId: id,
        titel:          body.titel,
        beschreibung:   body.beschreibung ?? null,
        inhalt:         body.inhalt ?? null,
        schritte:       (body.schritte ?? []) as object[],
        leitfadenIds:   (body.leitfadenIds ?? []) as string[],
        reihenfolge:    body.reihenfolge ?? 0,
        pflicht:        body.pflicht ?? true,
      },
    })

    return reply.status(201).send(modul)
  })

  fastify.patch('/module/:modulId', {
    preHandler: [fastify.authenticate],
  }, async (req: any, reply) => {
    if (!isAdmin(req)) return reply.status(403).send({ error: 'Keine Berechtigung' })

    const { modulId } = req.params as { modulId: string }
    const body = ModulSchema.partial().parse(req.body)

    const modul = await p.einarbeitungsModul.update({
      where: { id: modulId },
      data: {
        ...(body.titel        !== undefined && { titel:        body.titel }),
        ...(body.beschreibung !== undefined && { beschreibung: body.beschreibung }),
        ...(body.inhalt       !== undefined && { inhalt:       body.inhalt }),
        ...(body.schritte     !== undefined && { schritte:     body.schritte as object[] }),
        ...(body.leitfadenIds !== undefined && { leitfadenIds: body.leitfadenIds as string[] }),
        ...(body.reihenfolge  !== undefined && { reihenfolge:  body.reihenfolge }),
        ...(body.pflicht      !== undefined && { pflicht:      body.pflicht }),
      },
    })

    return reply.send(modul)
  })

  fastify.delete('/module/:modulId', {
    preHandler: [fastify.authenticate],
  }, async (req: any, reply) => {
    if (!isAdmin(req)) return reply.status(403).send({ error: 'Keine Berechtigung' })

    const { modulId } = req.params as { modulId: string }
    await p.einarbeitungsModul.delete({ where: { id: modulId } })
    return reply.status(204).send()
  })

  // ─── Fortschritt intern setzen ───
  fastify.patch('/module/:modulId/fortschritt', {
    preHandler: [fastify.authenticate],
  }, async (req: any, reply) => {
    const { modulId } = req.params as { modulId: string }
    const body = FortschrittSchema.parse(req.body)
    const userId = uid(req)

    const fortschritt = await p.modulFortschritt.upsert({
      where: { modulId_userId: { modulId, userId } },
      update: {
        status:     body.status,
        notizen:    body.notizen ?? null,
        erledigtAm: body.status === 'erledigt' ? new Date() : null,
      },
      create: {
        modulId,
        userId,
        status:     body.status,
        notizen:    body.notizen ?? null,
        erledigtAm: body.status === 'erledigt' ? new Date() : null,
      },
    })

    return reply.send(fortschritt)
  })

  // ─── PUBLIC: extern – Programm per Zugangscode laden ───
  fastify.get('/extern/:code', async (req: any, reply) => {
    const { code } = req.params as { code: string }

    const item = await p.einarbeitung.findFirst({
      where: {
        zugangscode: code,
        typ:   'extern',
        aktiv: true,
        OR: [
          { gueltigBis: null },
          { gueltigBis: { gte: new Date() } },
        ],
      },
      include: {
        module: { orderBy: { reihenfolge: 'asc' } },
      },
    })

    if (!item) return reply.status(404).send({ error: 'Ungültiger Zugangscode' })
    return reply.send(item)
  })

  // ─── PUBLIC: extern – Fortschritt per E-Mail setzen ───
  fastify.patch('/extern/:code/module/:modulId', async (req: any, reply) => {
    const { code, modulId } = req.params as { code: string; modulId: string }
    const body = FortschrittSchema.parse(req.body)

    if (!body.externEmail) {
      return reply.status(400).send({ error: 'E-Mail erforderlich' })
    }

    // Verify the module belongs to this code
    const modul = await p.einarbeitungsModul.findFirst({
      where: {
        id: modulId,
        einarbeitung: { zugangscode: code, typ: 'extern', aktiv: true },
      },
    })

    if (!modul) return reply.status(404).send({ error: 'Modul nicht gefunden' })

    const fortschritt = await p.modulFortschritt.upsert({
      where: { modulId_externEmail: { modulId, externEmail: body.externEmail } },
      update: {
        status:      body.status,
        notizen:     body.notizen ?? null,
        externName:  body.externName ?? null,
        erledigtAm:  body.status === 'erledigt' ? new Date() : null,
      },
      create: {
        modulId,
        externEmail: body.externEmail,
        externName:  body.externName ?? null,
        status:      body.status,
        notizen:     body.notizen ?? null,
        erledigtAm:  body.status === 'erledigt' ? new Date() : null,
      },
    })

    return reply.send(fortschritt)
  })
}
