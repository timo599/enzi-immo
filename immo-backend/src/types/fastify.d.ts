import type { JwtPayload } from '../plugins/jwt.js'

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by JWT auth middleware – always present on protected routes */
    currentUser: JwtPayload
    /** Convenience shorthand for currentUser.tenantId */
    tenantId: string
  }
}
