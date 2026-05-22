/**
 * User-Management innerhalb eines Tenants
 * Alle Routen erfordern Admin-Rolle.
 */
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { scryptSync, randomBytes } from 'crypto'
import { ForbiddenError, NotFoundError, ConflictError } from '../../../utils/errors.js'

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

const CreateUserBody = z.object({
  email:    z.string().email(),
  password: z.string().min(8).max(128),
  vorname:  z.string().min(1).max(100).optional(),
  nachname: z.string().min(1).max(100).optional(),
  rolle:    z.enum(['admin', 'verwalter', 'assistent', 'eigentuemer_readonly']).default('verwalter'),
})

const UpdateUserBody = z.object({
  vorname:  z.string().min(1).max(100).optional(),
  nachname: z.string().min(1).max(100).optional(),
  rolle:    z.enum(['admin', 'verwalter', 'assistent', 'eigentuemer_readonly']).optional(),
  password: z.string().min(8).max(128).optional(),
  aktiv:    z.boolean().optional(),
})

export const usersRoutes: FastifyPluginAsync = async (fastify) => {
  const prisma = fastify.prisma
  const auth   = { preHandler: [fastify.authenticate] }

  function requireAdmin(req: any) {
    if (req.currentUser.rolle !== 'admin') {
      throw new ForbiddenError('Nur Administratoren können Benutzer verwalten')
    }
  }

  /** GET /auth/users — alle Benutzer des Tenants */
  fastify.get('/users', { ...auth }, async (req: any, reply) => {
    const users = await prisma.user.findMany({
      where:   { tenantId: req.tenantId },
      select:  { id: true, email: true, vorname: true, nachname: true, rolle: true, aktiv: true, letzterLogin: true, erstelltAm: true },
      orderBy: { erstelltAm: 'asc' },
    })
    return reply.send({ data: users })
  })

  /** POST /auth/users — neuen Benutzer im Tenant anlegen (nur Admin) */
  fastify.post('/users', { ...auth }, async (req: any, reply) => {
    requireAdmin(req)
    const body = CreateUserBody.parse(req.body)

    const existing = await prisma.user.findFirst({
      where: { tenantId: req.tenantId, email: body.email },
    })
    if (existing) throw new ConflictError(`Benutzer mit E-Mail '${body.email}' existiert bereits`)

    const user = await prisma.user.create({
      data: {
        tenantId:     req.tenantId,
        email:        body.email,
        passwordHash: hashPassword(body.password),
        vorname:      body.vorname ?? null,
        nachname:     body.nachname ?? null,
        rolle:        body.rolle,
      },
      select: { id: true, email: true, vorname: true, nachname: true, rolle: true, aktiv: true, erstelltAm: true },
    })
    return reply.status(201).send({ data: user })
  })

  /** PATCH /auth/users/:id — Benutzer aktualisieren (nur Admin) */
  fastify.patch('/users/:id', { ...auth }, async (req: any, reply) => {
    requireAdmin(req)
    const { id } = req.params as { id: string }
    const body   = UpdateUserBody.parse(req.body)

    const existing = await prisma.user.findFirst({
      where: { id, tenantId: req.tenantId },
    })
    if (!existing) throw new NotFoundError('Benutzer', id)

    // Admin kann sich nicht selbst deaktivieren
    if (body.aktiv === false && id === req.currentUser.sub) {
      throw new ForbiddenError('Eigenen Account kann man nicht deaktivieren')
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(body.vorname  !== undefined ? { vorname:      body.vorname }           : {}),
        ...(body.nachname !== undefined ? { nachname:     body.nachname }          : {}),
        ...(body.rolle    !== undefined ? { rolle:        body.rolle }             : {}),
        ...(body.aktiv    !== undefined ? { aktiv:        body.aktiv }             : {}),
        ...(body.password !== undefined ? { passwordHash: hashPassword(body.password) } : {}),
      },
      select: { id: true, email: true, vorname: true, nachname: true, rolle: true, aktiv: true },
    })
    return reply.send({ data: updated })
  })

  /** DELETE /auth/users/:id — Benutzer deaktivieren (nur Admin, kein Hard-Delete) */
  fastify.delete('/users/:id', { ...auth }, async (req: any, reply) => {
    requireAdmin(req)
    const { id } = req.params as { id: string }

    if (id === req.currentUser.sub) {
      throw new ForbiddenError('Eigenen Account kann man nicht löschen')
    }

    const existing = await prisma.user.findFirst({ where: { id, tenantId: req.tenantId } })
    if (!existing) throw new NotFoundError('Benutzer', id)

    await prisma.user.update({ where: { id }, data: { aktiv: false } })
    return reply.status(204).send()
  })
}
