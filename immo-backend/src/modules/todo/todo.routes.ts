import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

const auth = (f: any) => ({ preHandler: [f.authenticate] })
const tid  = (req: any) => req.tenantId as string

// ── Schemas ──────────────────────────────────────────────────────────────────

const TeamMitgliedSchema = z.object({
  name:     z.string().min(1).max(200),
  email:    z.string().email().optional().or(z.literal('')).transform(v => v || undefined),
  telefon:  z.string().max(50).optional(),
  rolle:    z.string().max(50).default('mitarbeiter'),
  aktiv:    z.boolean().default(true),
})

const TodoCreateSchema = z.object({
  titel:        z.string().min(1).max(300),
  beschreibung: z.string().optional(),
  status:       z.enum(['offen','in_bearbeitung','erledigt','abgebrochen']).default('offen'),
  prioritaet:   z.enum(['niedrig','mittel','hoch','dringend']).default('mittel'),
  kategorie:    z.string().max(100).optional(),
  firmaId:      z.string().uuid().optional(),
  objektId:     z.string().uuid().optional(),
  einheitId:    z.string().uuid().optional(),
  baustelleId:  z.string().uuid().optional(),
  faelligAm:    z.string().optional().transform(v => v ? new Date(v) : undefined),
  zuweisungen:  z.array(z.string().uuid()).default([]), // teamMitglied IDs
})

const TodoUpdateSchema = TodoCreateSchema.partial()

// ── Hilfsfunktion – Todo mit Relations laden ─────────────────────────────────

async function loadTodo(prisma: any, id: string, tenantId: string) {
  return prisma.todo.findFirst({
    where: { id, tenantId },
    include: {
      firma:  { select: { id: true, name: true } },
      objekt: { select: { id: true, bezeichnung: true } },
      einheit:{ select: { id: true, bezeichnung: true } },
      zuweisungen: { include: { teamMitglied: { select: { id: true, name: true, rolle: true } } } },
    },
  })
}

// ── Routes ───────────────────────────────────────────────────────────────────

export const todoRoutes: FastifyPluginAsync = async (fastify) => {
  const p = fastify.prisma

  // ── Team-Mitglieder ────────────────────────────────────────────────────────

  fastify.get('/team', auth(fastify), async (req) => {
    const items = await p.teamMitglied.findMany({
      where: { tenantId: tid(req), aktiv: true },
      orderBy: { name: 'asc' },
    })
    return { data: items }
  })

  fastify.post('/team', auth(fastify), async (req, reply) => {
    const body = TeamMitgliedSchema.parse(req.body)
    const item = await p.teamMitglied.create({ data: { tenantId: tid(req), ...body } })
    return reply.status(201).send({ data: item })
  })

  fastify.patch('/team/:id', auth(fastify), async (req) => {
    const { id } = req.params as { id: string }
    const body = TeamMitgliedSchema.partial().parse(req.body)
    const item = await p.teamMitglied.update({ where: { id }, data: body })
    return { data: item }
  })

  fastify.delete('/team/:id', auth(fastify), async (req) => {
    const { id } = req.params as { id: string }
    await p.teamMitglied.update({ where: { id }, data: { aktiv: false } })
    return { data: { id, deleted: true } }
  })

  // ── Todos ──────────────────────────────────────────────────────────────────

  fastify.get('/', auth(fastify), async (req) => {
    const q = req.query as any
    const where: any = { tenantId: tid(req) }
    if (q.status)      where.status      = q.status
    if (q.prioritaet)  where.prioritaet  = q.prioritaet
    if (q.baustelleId) where.baustelleId = q.baustelleId
    if (q.firmaId)     where.firmaId     = q.firmaId
    if (q.objektId)    where.objektId    = q.objektId
    if (q.teamId) {
      where.zuweisungen = { some: { teamMitgliedId: q.teamId } }
    }

    const items = await p.todo.findMany({
      where,
      include: {
        firma:  { select: { id: true, name: true } },
        objekt: { select: { id: true, bezeichnung: true } },
        einheit:{ select: { id: true, bezeichnung: true } },
        zuweisungen: { include: { teamMitglied: { select: { id: true, name: true, rolle: true } } } },
      },
      orderBy: [{ prioritaet: 'desc' }, { faelligAm: 'asc' }, { erstelltAm: 'desc' }],
    })
    return { data: items }
  })

  fastify.post('/', auth(fastify), async (req, reply) => {
    const { zuweisungen, ...rest } = TodoCreateSchema.parse(req.body)
    const todo = await p.todo.create({
      data: {
        tenantId: tid(req),
        ...rest,
        erstelltVon: (req as any).currentUser?.sub,
        zuweisungen: zuweisungen.length ? {
          create: zuweisungen.map((teamMitgliedId: string) => ({ teamMitgliedId }))
        } : undefined,
      },
    })
    return reply.status(201).send({ data: await loadTodo(p, todo.id, tid(req)) })
  })

  fastify.patch('/:id', auth(fastify), async (req) => {
    const { id } = req.params as { id: string }
    const { zuweisungen, ...rest } = TodoUpdateSchema.parse(req.body)

    // Status → erledigtAm setzen
    const data: any = { ...rest }
    if (rest.status === 'erledigt' && !data.erledigtAm) data.erledigtAm = new Date()
    if (rest.status && rest.status !== 'erledigt') data.erledigtAm = null

    await p.todo.update({ where: { id }, data })

    // Zuweisungen aktualisieren wenn übergeben
    if (zuweisungen !== undefined) {
      await p.todoZuweisung.deleteMany({ where: { todoId: id } })
      if (zuweisungen.length) {
        await p.todoZuweisung.createMany({
          data: zuweisungen.map((teamMitgliedId: string) => ({ todoId: id, teamMitgliedId })),
        })
      }
    }

    return { data: await loadTodo(p, id, tid(req)) }
  })

  fastify.delete('/:id', auth(fastify), async (req) => {
    const { id } = req.params as { id: string }
    await p.todo.delete({ where: { id } })
    return { data: { id, deleted: true } }
  })
}
