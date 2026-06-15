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
  titel:                z.string().min(1).max(300),
  beschreibung:         z.string().optional(),
  status:               z.enum(['offen','in_bearbeitung','erledigt','abgebrochen']).default('offen'),
  prioritaet:           z.enum(['niedrig','mittel','hoch','dringend']).default('mittel'),
  kategorie:            z.string().max(100).optional(),
  firmaId:              z.string().uuid().optional(),
  objektId:             z.string().uuid().optional(),
  einheitId:            z.string().uuid().optional(),
  baustelleId:          z.string().uuid().optional(),
  faelligAm:            z.string().optional().transform(v => v ? new Date(v) : undefined),
  zuweisungen:          z.array(z.string().uuid()).default([]),
  zustaendigerUserId:   z.string().uuid().optional().nullable(), // direkte User-Zuweisung
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
      zustaendigerUser: { select: { id: true, vorname: true, nachname: true, email: true } },
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
    if (q.userId) {
      where.zustaendigerUserId = q.userId
    }

    const items = await p.todo.findMany({
      where,
      include: {
        firma:  { select: { id: true, name: true } },
        objekt: { select: { id: true, bezeichnung: true } },
        einheit:{ select: { id: true, bezeichnung: true } },
        zuweisungen: { include: { teamMitglied: { select: { id: true, name: true, rolle: true } } } },
        zustaendigerUser: { select: { id: true, vorname: true, nachname: true, email: true } },
      },
      orderBy: [{ prioritaet: 'desc' }, { faelligAm: 'asc' }, { erstelltAm: 'desc' }],
    })
    return { data: items }
  })

  fastify.post('/', auth(fastify), async (req, reply) => {
    const { zuweisungen, zustaendigerUserId, ...rest } = TodoCreateSchema.parse(req.body)
    const todo = await p.todo.create({
      data: {
        tenantId: tid(req),
        ...rest,
        erstelltVon:        (req as any).currentUser?.sub,
        zustaendigerUserId: zustaendigerUserId ?? null,
        zuweisungen: zuweisungen.length ? {
          create: zuweisungen.map((teamMitgliedId: string) => ({ teamMitgliedId }))
        } : undefined,
      },
    })
    return reply.status(201).send({ data: await loadTodo(p, todo.id, tid(req)) })
  })

  fastify.patch('/:id', auth(fastify), async (req) => {
    const { id } = req.params as { id: string }
    const { zuweisungen, zustaendigerUserId, ...rest } = TodoUpdateSchema.parse(req.body)

    // Status → erledigtAm setzen
    const data: any = { ...rest }
    if (rest.status === 'erledigt' && !data.erledigtAm) data.erledigtAm = new Date()
    if (rest.status && rest.status !== 'erledigt') data.erledigtAm = null
    if (zustaendigerUserId !== undefined) data.zustaendigerUserId = zustaendigerUserId ?? null

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

// ── Allgemeine Infos ──────────────────────────────────────────────────────────

const DEFAULT_SEKTIONEN = [
  { schluessel: 'wichtige_kontakte',  titel: 'Wichtige Kontakte & Ansprechpartner', reihenfolge: 1 },
  { schluessel: 'zugaenge_passwoerter', titel: 'Zugänge & Passwörter',              reihenfolge: 2 },
  { schluessel: 'ablaeuf_fristen',    titel: 'Wichtige Abläufe & Fristen',          reihenfolge: 3 },
  { schluessel: 'hausordnung_regeln', titel: 'Hausordnung & interne Regeln',        reihenfolge: 4 },
  { schluessel: 'dienstleister',      titel: 'Dienstleister & Handwerker',          reihenfolge: 5 },
  { schluessel: 'notizen',            titel: 'Allgemeine Notizen',                  reihenfolge: 6 },
]

// Blockiert nur reine Lese/Handwerker/Mieter-Rollen
// Axel, Bastian, Kirsten, NCVerwaltung, Jürgen → alle erlaubt
const BLOCKED_ROLLEN_INFOS = ['handwerker', 'mieter', 'mieterportal']

function checkInfosZugang(req: any, reply: any): boolean {
  const rolle = req.currentUser?.rolle ?? ''
  if (BLOCKED_ROLLEN_INFOS.includes(rolle)) {
    reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Allgemeine Infos sind für Handwerker und Mieter nicht zugänglich.' } })
    return false
  }
  return true
}

export const allgemeineInfosRoutes: FastifyPluginAsync = async (fastify) => {
  const p   = fastify.prisma
  const a   = { preHandler: [fastify.authenticate] }
  const ten = (req: any) => req.tenantId as string
  const usr = (req: any) => (req as any).currentUser?.email as string | undefined

  // Alle Sektionen laden (fehlende Default-Sektionen werden angelegt)
  fastify.get('/', a, async (req, reply) => {
    if (!checkInfosZugang(req, reply)) return
    const tenantId = ten(req)
    // Defaults anlegen falls noch nicht vorhanden
    for (const s of DEFAULT_SEKTIONEN) {
      await p.$executeRawUnsafe(
        `INSERT INTO allgemeine_infos (tenant_id, schluessel, titel, inhalt, reihenfolge)
         VALUES ($1::uuid, $2, $3, '', $4)
         ON CONFLICT (tenant_id, schluessel) DO NOTHING`,
        tenantId, s.schluessel, s.titel, s.reihenfolge
      )
    }
    const items = await p.$queryRawUnsafe(
      `SELECT id, schluessel, titel, inhalt, reihenfolge, geaendert_am, geaendert_von
       FROM allgemeine_infos
       WHERE tenant_id = $1::uuid
       ORDER BY reihenfolge, titel`,
      tenantId
    )
    return { data: items }
  })

  // Einzelne Sektion aktualisieren (upsert)
  fastify.put('/:schluessel', a, async (req, reply) => {
    if (!checkInfosZugang(req, reply)) return
    const { schluessel } = req.params as { schluessel: string }
    const { inhalt, titel } = z.object({
      inhalt: z.string(),
      titel:  z.string().optional(),
    }).parse(req.body)
    const tenantId = ten(req)
    const geaendertVon = usr(req)

    await p.$executeRawUnsafe(
      `INSERT INTO allgemeine_infos (tenant_id, schluessel, titel, inhalt, geaendert_am, geaendert_von)
       VALUES ($1::uuid, $2, $3, $4, now(), $5)
       ON CONFLICT (tenant_id, schluessel) DO UPDATE SET
         inhalt = EXCLUDED.inhalt,
         titel  = CASE WHEN EXCLUDED.titel <> '' THEN EXCLUDED.titel ELSE allgemeine_infos.titel END,
         geaendert_am  = now(),
         geaendert_von = EXCLUDED.geaendert_von`,
      tenantId, schluessel, titel ?? schluessel, inhalt, geaendertVon ?? null
    )
    const row = await p.$queryRawUnsafe(
      `SELECT id, schluessel, titel, inhalt, reihenfolge, geaendert_am, geaendert_von
       FROM allgemeine_infos WHERE tenant_id=$1::uuid AND schluessel=$2 LIMIT 1`,
      tenantId, schluessel
    )
    return { data: (row as any[])[0] }
  })
}
