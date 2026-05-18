import type { FastifyPluginAsync } from 'fastify'
import { LoginSchema, RegisterSchema } from '../schemas/auth.schema.js'
import { AuthService } from '../services/auth.service.js'

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
}
