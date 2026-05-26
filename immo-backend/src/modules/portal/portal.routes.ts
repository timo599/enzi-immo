import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { scryptSync, randomBytes, timingSafeEqual } from 'crypto'

function hashPw(pw: string): string {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(pw, salt, 64).toString('hex')}`
}

function verifyPw(pw: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const buf = scryptSync(pw, salt, 64)
  return timingSafeEqual(buf, Buffer.from(hash, 'hex'))
}

const UuidParam = z.object({ id: z.string().uuid() })

export const portalRoutes: FastifyPluginAsync = async (fastify) => {
  const auth = { preHandler: [fastify.authenticate] }

  // ── Admin: Portalzugang anlegen / verwalten ──────────────

  /** GET /portal/users — alle Portal-User des Tenants */
  fastify.get('/users', auth, async (req: any, reply) => {
    const users = await fastify.prisma.mieterPortalUser.findMany({
      where: { tenantId: req.tenantId },
      include: { mieter: { select: { vorname: true, nachname: true, email: true } } },
      orderBy: { erstelltAm: 'desc' },
    })
    return reply.send({ data: users })
  })

  /** POST /portal/users — Portal-User für Mieter anlegen / aktualisieren */
  fastify.post('/users', auth, async (req: any, reply) => {
    const Body = z.object({
      mieterId: z.string().uuid(),
      email:    z.string().email(),
      passwort: z.string().min(6),
    })
    const { mieterId, email, passwort } = Body.parse(req.body)
    const passwordHash = hashPw(passwort)

    const existing = await fastify.prisma.mieterPortalUser.findFirst({
      where: { tenantId: req.tenantId, mieterId },
    })
    if (existing) {
      const updated = await fastify.prisma.mieterPortalUser.update({
        where: { id: existing.id },
        data: { email, passwordHash, aktiv: true },
      })
      return reply.send({ data: updated })
    }
    const user = await fastify.prisma.mieterPortalUser.create({
      data: { tenantId: req.tenantId, mieterId, email, passwordHash },
    })
    return reply.status(201).send({ data: user })
  })

  /** PATCH /portal/users/:id — aktiv/inaktiv */
  fastify.patch('/users/:id', auth, async (req: any, reply) => {
    const { id } = UuidParam.parse(req.params)
    const { aktiv } = z.object({ aktiv: z.boolean() }).parse(req.body)
    const u = await fastify.prisma.mieterPortalUser.findFirst({ where: { id, tenantId: req.tenantId } })
    if (!u) return reply.status(404).send({ error: 'Not found' })
    const updated = await fastify.prisma.mieterPortalUser.update({ where: { id }, data: { aktiv } })
    return reply.send({ data: updated })
  })

  /** DELETE /portal/users/:id */
  fastify.delete('/users/:id', auth, async (req: any, reply) => {
    const { id } = UuidParam.parse(req.params)
    const u = await fastify.prisma.mieterPortalUser.findFirst({ where: { id, tenantId: req.tenantId } })
    if (!u) return reply.status(404).send({ error: 'Not found' })
    await fastify.prisma.mieterPortalUser.delete({ where: { id } })
    return reply.status(204).send()
  })

  // ── Mieter-Login (öffentlich) ────────────────────────────

  /** POST /portal/login — Mieter-Login */
  fastify.post('/login', async (req: any, reply) => {
    const { email, passwort } = z.object({
      email:    z.string().email(),
      passwort: z.string(),
    }).parse(req.body)

    const user = await fastify.prisma.mieterPortalUser.findFirst({
      where: { email, aktiv: true },
      include: {
        mieter: {
          include: {
            mietvertragMieter: {
              include: {
                mietvertrag: {
                  include: {
                    einheit: { include: { objekt: true } },
                    mieterhoehungen: { orderBy: { erstelltAm: 'desc' }, take: 3 },
                  },
                },
              },
            },
          },
        },
      },
    })
    if (!user || !verifyPw(passwort, user.passwordHash)) {
      return reply.status(401).send({ error: 'Ungültige Zugangsdaten' })
    }

    await fastify.prisma.mieterPortalUser.update({
      where: { id: user.id },
      data: { letzterLogin: new Date() },
    })

    const token = fastify.jwt.sign(
      { sub: user.id, tenantId: user.tenantId, email: user.email, rolle: 'mieter_portal' } as any,
      { expiresIn: '30d' }
    )
    const { mieter } = user as any
    return reply.send({ token, mieter })
  })

  // ── Mieter-Portal API (token-geschützt) ─────────────────

  const portalAuth = { preHandler: [async (req: any, reply: any) => {
    try {
      await req.jwtVerify()
      if (req.user.rolle !== 'mieter_portal') return reply.status(403).send({ error: 'Kein Portal-Token' })
      // Load mieterId from portal user record
      const pu = await fastify.prisma.mieterPortalUser.findFirst({ where: { id: req.user.sub } })
      if (!pu) return reply.status(403).send({ error: 'Portal-User nicht gefunden' })
      req.portalMieterId = pu.mieterId
    } catch { return reply.status(401).send({ error: 'Invalid token' }) }
  }]}

  /** GET /portal/me — eigene Daten */
  fastify.get('/me', portalAuth, async (req: any, reply) => {
    const mieter = await fastify.prisma.mieter.findUnique({
      where: { id: req.portalMieterId },
      include: {
        mietvertragMieter: {
          include: {
            mietvertrag: {
              include: {
                einheit: { include: { objekt: true } },
                mieterhoehungen: { orderBy: { erstelltAm: 'desc' }, take: 3 },
              },
            },
          },
        },
      },
    })
    return reply.send({ data: mieter })
  })

  /** GET /portal/dokumente — eigene Dokumente */
  fastify.get('/dokumente', portalAuth, async (req: any, reply) => {
    const mieterId = req.portalMieterId as string
    const mv = await fastify.prisma.mietvertragMieter.findMany({
      where: { mieterId },
      select: { mietvertragId: true },
    })
    const vIds = mv.map(m => m.mietvertragId)
    const docs = await fastify.prisma.dokument.findMany({
      where: {
        tenantId: req.user.tenantId,
        OR: [
          { mietvertragId: { in: vIds } },
          { mieterId },
        ],
      },
      orderBy: { hochgeladenAm: 'desc' },
    })
    return reply.send({ data: docs })
  })

  /** GET /portal/reparaturen — Reparaturen für eigene Einheiten */
  fastify.get('/reparaturen', portalAuth, async (req: any, reply) => {
    const mieterId = req.portalMieterId as string
    const mv = await fastify.prisma.mietvertragMieter.findMany({
      where: { mieterId },
      select: { mietvertrag: { select: { einheitId: true } } },
    })
    const eIds = mv.map(m => m.mietvertrag.einheitId)
    const reps = await fastify.prisma.reparatur.findMany({
      where: { tenantId: req.user.tenantId, einheitId: { in: eIds } },
      include: { einheit: { select: { bezeichnung: true } } },
      orderBy: { erstelltAm: 'desc' },
    })
    return reply.send({ data: reps })
  })
}
