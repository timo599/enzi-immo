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

  /** GET /dashboard/auslaufende-vertraege?tage=90 */
  fastify.get('/auslaufende-vertraege', auth, async (req, reply) => {
    const { tage } = z.object({ tage: z.coerce.number().int().min(1).max(365).default(90) })
      .parse(req.query)

    const heute = new Date()
    const bis   = new Date(heute)
    bis.setDate(bis.getDate() + tage)

    const vertraege = await fastify.prisma.mietvertrag.findMany({
      where: {
        tenantId:    req.tenantId,
        deletedAt:   null,
        vertragsende: { gte: heute, lte: bis },
      },
      include: {
        einheit: {
          select: {
            bezeichnung: true,
            objekt: { select: { bezeichnung: true, strasse: true, hausnummer: true } },
          },
        },
        mietvertragMieter: {
          where: { bis: null },
          include: { mieter: { select: { vorname: true, nachname: true } } },
          take: 1,
          orderBy: { seit: 'desc' },
        },
      },
      orderBy: { vertragsende: 'asc' },
    })

    const data = vertraege.map(v => {
      const diffMs   = new Date(v.vertragsende!).getTime() - heute.getTime()
      const restTage = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
      const mieter   = v.mietvertragMieter[0]?.mieter
      return {
        id:           v.id,
        einheit:      v.einheit.bezeichnung,
        objekt:       v.einheit.objekt.bezeichnung,
        adresse:      `${v.einheit.objekt.strasse} ${v.einheit.objekt.hausnummer}`,
        mieter:       mieter ? [mieter.vorname, mieter.nachname].filter(Boolean).join(' ') : '—',
        vertragsende: v.vertragsende!.toISOString().slice(0, 10),
        restTage,
        nettomiete:   Number(v.nettomiete),
      }
    })

    return reply.send({ data })
  })
}
