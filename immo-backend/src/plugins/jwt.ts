import fp from 'fastify-plugin'
import fastifyJwt from '@fastify/jwt'
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import { ForbiddenError, UnauthorizedError } from '../utils/errors.js'

export interface JwtPayload {
  sub: string        // userId
  tenantId: string
  email: string
  rolle: string
  iat?: number
  exp?: number
}

declare module 'fastify' {
  interface FastifyInstance {
    /** Call this on routes that require authentication */
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    /** Call this to require a specific role */
    requireRole: (...roles: string[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload
    user: JwtPayload
  }
}

const jwtPlugin: FastifyPluginAsync = fp(async (fastify) => {
  const secret = process.env['JWT_SECRET']
  if (!secret) throw new Error('JWT_SECRET environment variable is required')

  fastify.register(fastifyJwt, {
    secret,
    sign: {
      expiresIn: process.env['JWT_ACCESS_EXPIRES_IN'] ?? '15m',
    },
  })

  fastify.decorate(
    'authenticate',
    async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      try {
        await request.jwtVerify<JwtPayload>()
      } catch {
        throw new UnauthorizedError('Ungültiges oder abgelaufenes Token')
      }

      // Decorate request with convenience accessors
      request.currentUser = request.user
      request.tenantId = request.user.tenantId

      if (request.currentUser.rolle === 'eigentuemer_readonly') {
        const method = request.method.toUpperCase()
        const path = request.url.split('?')[0] ?? request.url
        const isReadRequest    = method === 'GET' || method === 'HEAD' || method === 'OPTIONS'
        const isAllowedChat    = method === 'POST' && path === '/api/v1/enzi/chat'
        // Todos & Allgemeine Infos: Jürgen darf anlegen, bearbeiten und lesen
        const isAllowedTodo    = path.startsWith('/api/v1/todos') &&
                                 ['GET','POST','PATCH','DELETE'].includes(method)
        const isAllowedInfos   = path.startsWith('/api/v1/allgemeine-infos') &&
                                 ['GET','PUT'].includes(method)

        if (!isReadRequest && !isAllowedChat && !isAllowedTodo && !isAllowedInfos) {
          throw new ForbiddenError('Dieser Zugang ist nur lesend. Änderungen an Todos und Infos sind erlaubt.')
        }
      }
    },
  )

  fastify.decorate(
    'requireRole',
    (...roles: string[]) =>
      async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
        if (!roles.includes(request.currentUser.rolle)) {
          throw new UnauthorizedError(`Rolle ${request.currentUser.rolle} hat keinen Zugriff`)
        }
      },
  )
})

export default jwtPlugin
