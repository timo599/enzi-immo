import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { scryptSync, randomBytes } from 'crypto'
import { LoginSchema, RegisterSchema } from '../schemas/auth.schema.js'
import { AuthService } from '../services/auth.service.js'

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new AuthService(fastify)

  /** POST /auth/login */
  fastify.post('/login', async (request, reply) => {
    const body = LoginSchema.parse(request.body)
    const ua = request.headers['user-agent']
    const result = await service.login(body, {
      ip: request.ip,
      ...(ua !== undefined && { userAgent: ua }),
    })
    return reply.status(200).send({ data: result })
  })

  /** POST /auth/register – creates a new tenant + admin user */
  fastify.post('/register', async (request, reply) => {
    const body = RegisterSchema.parse(request.body)
    const result = await service.register(body)
    return reply.status(201).send({ data: result })
  })

  /** GET /auth/me – returns current user info */
  fastify.get('/me', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const user = await fastify.prisma.user.findFirst({
      where: { id: request.currentUser.sub, aktiv: true },
      select: { id: true, email: true, vorname: true, nachname: true, rolle: true, tenantId: true },
    })
    return reply.send({ data: user })
  })

  /**
   * GET /auth/users-list — listet alle Benutzer (ohne Auth, nur mit RESET_SECRET)
   * Nur für die initiale Kontowiederherstellung.
   */
  fastify.get('/users-list', async (request, reply) => {
    const secret = process.env['RESET_SECRET']
    const provided = (request.headers['x-reset-secret'] as string | undefined) ?? ''
    if (!secret || provided !== secret) {
      return reply.status(403).send({ error: 'Forbidden' })
    }
    const users = await fastify.prisma.user.findMany({
      select: { id: true, email: true, vorname: true, nachname: true, rolle: true, aktiv: true, tenantId: true },
      take: 50,
    })
    return reply.send({ data: users })
  })

  /**
   * POST /auth/reset-password — setzt Passwort ohne Login (nur mit RESET_SECRET)
   * Body: { email, newPassword }
   */
  fastify.post('/reset-password', async (request, reply) => {
    const secret = process.env['RESET_SECRET']
    const provided = (request.headers['x-reset-secret'] as string | undefined) ?? ''
    if (!secret || provided !== secret) {
      return reply.status(403).send({ error: 'Forbidden' })
    }
    const body = z.object({
      email:       z.string().email(),
      newPassword: z.string().min(8),
    }).parse(request.body)

    const user = await fastify.prisma.user.findFirst({ where: { email: body.email } })
    if (!user) return reply.status(404).send({ error: 'Benutzer nicht gefunden' })

    await fastify.prisma.user.update({
      where: { id: user.id },
      data:  { passwordHash: hashPassword(body.newPassword), aktiv: true },
    })
    return reply.send({ data: { ok: true, email: user.email, message: 'Passwort wurde zurückgesetzt' } })
  })
}
