import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { ExportService } from '../services/export.service.js'

const UuidParam   = z.object({ id: z.string().uuid() })
const ListQuery   = z.object({ referenzId: z.string().uuid().optional() })

export const exportRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new ExportService(fastify.prisma)
  const auth = { preHandler: [fastify.authenticate] }

  const ctx = (req: FastifyRequest): import('../../../types/common.js').RequestContext => ({
    tenantId:  req.tenantId,
    userId:    req.currentUser.sub,
    ipAddress: req.ip,
    ...(req.headers['user-agent'] !== undefined ? { userAgent: req.headers['user-agent'] } : {}),
  })

  /** POST /exporte/nk-abrechnungen/:id/pdf
   * Erzeugt (oder liefert gecachtes) PDF für eine NK-Abrechnung */
  fastify.post('/nk-abrechnungen/:id/pdf', auth, async (req, reply) => {
    const { id } = UuidParam.parse(req.params)
    const result = await service.erstelleNkAbrechnungPdf(ctx(req), id)
    return reply.status(result.data.neu ? 201 : 200).send(result)
  })

  /** GET /exporte
   * Liste aller Exporte, optional gefiltert nach referenzId */
  fastify.get('/', auth, async (req, reply) => {
    const { referenzId } = ListQuery.parse(req.query)
    const result = await service.listExporte(ctx(req), referenzId)
    return reply.send(result)
  })
}
