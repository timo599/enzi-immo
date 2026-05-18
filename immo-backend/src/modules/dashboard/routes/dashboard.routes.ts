import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { DashboardService } from '../services/dashboard.service.js'
import { DashboardQuerySchema } from '../schemas/dashboard.schema.js'
import { z } from 'zod'

export const dashboardRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new DashboardService(fastify.prisma)
  const auth = { preHandler: [fastify.authenticate] }

  const ctx = (req: FastifyRequest): import('../../../types/common.js').RequestContext => ({
    tenantId:  req.tenantId,
    userId:    req.currentUser.sub,
    ipAddress: req.ip,
    ...(req.headers['user-agent'] !== undefined ? { userAgent: req.headers['user-agent'] } : {}),
  })

  /** GET /dashboard/kpis */
  fastify.get('/kpis', auth, async (req, reply) => {
    const { objektId } = DashboardQuerySchema.parse(req.query)
    const result = await service.getKpis(ctx(req), objektId)
    return reply.send(result)
  })

  /** GET /dashboard/cashflow */
  fastify.get('/cashflow', auth, async (req, reply) => {
    const { objektId } = DashboardQuerySchema.parse(req.query)
    const { monate } = z.object({ monate: z.coerce.number().int().min(1).max(24).default(6) })
      .parse(req.query)
    const result = await service.getCashflow(ctx(req), monate, objektId)
    return reply.send(result)
  })

  /** GET /dashboard/ampel */
  fastify.get('/ampel', auth, async (req, reply) => {
    const result = await service.getAmpel(ctx(req))
    return reply.send(result)
  })
}
