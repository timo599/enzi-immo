import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { randomBytes } from 'crypto'

const auth = (f: any) => ({ preHandler: [f.authenticate] })
const tid  = (req: any) => req.tenantId as string

const BaustelleCreateSchema = z.object({
  name:         z.string().min(1).max(300),
  beschreibung: z.string().optional(),
  status:       z.enum(['planung','aktiv','pausiert','abgeschlossen']).default('planung'),
  firmaId:      z.string().uuid().optional(),
  objektId:     z.string().uuid().optional(),
  startDatum:   z.string().optional().transform(v => v ? new Date(v) : undefined),
  endDatum:     z.string().optional().transform(v => v ? new Date(v) : undefined),
  budget:       z.number().optional(),
  kostenBisher: z.number().optional(),
  notizen:      z.string().optional(),
  mitglieder:   z.array(z.object({
    teamMitgliedId: z.string().uuid(),
    rolle: z.string().default('arbeiter'),
  })).default([]),
})

const BaustelleUpdateSchema = BaustelleCreateSchema.partial()

async function loadBaustelle(prisma: any, id: string, tenantId: string) {
  return prisma.baustelle.findFirst({
    where: { id, tenantId },
    include: {
      firma:  { select: { id: true, name: true } },
      objekt: { select: { id: true, bezeichnung: true, strasse: true, hausnummer: true } },
      zuweisungen: { include: { teamMitglied: { select: { id: true, name: true, rolle: true, telefon: true } } } },
      todos: {
        include: {
          zuweisungen: { include: { teamMitglied: { select: { id: true, name: true } } } },
        },
        orderBy: { erstelltAm: 'desc' },
      },
    },
  })
}

export const baustelleRoutes: FastifyPluginAsync = async (fastify) => {
  const p = fastify.prisma

  // ── Admin: alle Baustellen ─────────────────────────────────────────────────

  fastify.get('/', auth(fastify), async (req) => {
    const q = req.query as any
    const where: any = { tenantId: tid(req) }
    if (q.status)  where.status  = q.status
    if (q.firmaId) where.firmaId = q.firmaId

    const items = await p.baustelle.findMany({
      where,
      include: {
        firma:  { select: { id: true, name: true } },
        objekt: { select: { id: true, bezeichnung: true } },
        zuweisungen: { include: { teamMitglied: { select: { id: true, name: true } } } },
        _count: { select: { todos: true } },
      },
      orderBy: [{ status: 'asc' }, { startDatum: 'desc' }],
    })
    return { data: items }
  })

  fastify.post('/', auth(fastify), async (req, reply) => {
    const { mitglieder, ...rest } = BaustelleCreateSchema.parse(req.body)
    // Zugangscode generieren
    const zugangscode = randomBytes(3).toString('hex').toUpperCase()
    const item = await p.baustelle.create({
      data: {
        tenantId: tid(req),
        zugangscode,
        ...rest,
        zuweisungen: mitglieder.length ? {
          create: mitglieder.map(m => ({ teamMitgliedId: m.teamMitgliedId, rolle: m.rolle }))
        } : undefined,
      },
    })
    return reply.status(201).send({ data: await loadBaustelle(p, item.id, tid(req)) })
  })

  fastify.get('/:id', auth(fastify), async (req) => {
    const { id } = req.params as { id: string }
    const item = await loadBaustelle(p, id, tid(req))
    if (!item) return (req as any).server.httpErrors?.notFound('Baustelle nicht gefunden')
    return { data: item }
  })

  fastify.patch('/:id', auth(fastify), async (req) => {
    const { id } = req.params as { id: string }
    const { mitglieder, ...rest } = BaustelleUpdateSchema.parse(req.body)

    await p.baustelle.update({ where: { id }, data: rest })

    if (mitglieder !== undefined) {
      await p.baustelleZuweisung.deleteMany({ where: { baustelleId: id } })
      if (mitglieder.length) {
        await p.baustelleZuweisung.createMany({
          data: mitglieder.map(m => ({ baustelleId: id, teamMitgliedId: m.teamMitgliedId, rolle: m.rolle })),
        })
      }
    }

    return { data: await loadBaustelle(p, id, tid(req)) }
  })

  fastify.delete('/:id', auth(fastify), async (req) => {
    const { id } = req.params as { id: string }
    await p.baustelle.delete({ where: { id } })
    return { data: { id, deleted: true } }
  })

  // ── Bauarbeiter-Zugang (public, nur Zugangscode) ───────────────────────────
  // GET /baustellen/zugang/:code — gibt Baustellen-Info für Bauarbeiter zurück (kein JWT nötig)

  fastify.get('/zugang/:code', async (req, reply) => {
    const { code } = req.params as { code: string }
    const baustelle = await p.baustelle.findFirst({
      where: { zugangscode: code.toUpperCase(), status: { in: ['planung','aktiv'] } },
      include: {
        firma:  { select: { name: true } },
        objekt: { select: { bezeichnung: true, strasse: true, hausnummer: true, plz: true, stadt: true } },
        zuweisungen: { include: { teamMitglied: { select: { name: true, rolle: true, telefon: true } } } },
        todos: {
          where: { status: { not: 'abgebrochen' } },
          include: {
            zuweisungen: { include: { teamMitglied: { select: { name: true } } } },
          },
          orderBy: [{ prioritaet: 'desc' }, { faelligAm: 'asc' }],
        },
      },
    })
    if (!baustelle) return reply.status(404).send({ error: 'Ungültiger Zugangscode' })
    return { data: baustelle }
  })

  // Bauarbeiter kann Todo-Status ändern (kein Auth nötig, nur Zugangscode)
  fastify.patch('/zugang/:code/todo/:todoId', async (req, reply) => {
    const { code, todoId } = req.params as { code: string; todoId: string }
    const baustelle = await p.baustelle.findFirst({
      where: { zugangscode: code.toUpperCase(), status: { in: ['planung','aktiv'] } },
    })
    if (!baustelle) return reply.status(403).send({ error: 'Ungültiger Code' })

    const body = z.object({
      status: z.enum(['offen','in_bearbeitung','erledigt']),
    }).parse(req.body)

    const todo = await p.todo.update({
      where: { id: todoId },
      data: {
        status: body.status,
        erledigtAm: body.status === 'erledigt' ? new Date() : null,
      },
    })
    return { data: todo }
  })
}
