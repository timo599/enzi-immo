import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { ExportService } from '../services/export.service.js'
import { erstelleMieterlisteExcel } from '../services/mieterliste.service.js'
import { getMieterlisteView } from '../services/mieterliste-view.service.js'

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

  /** GET /exporte/mieterliste/view — JSON-Daten für Web-Ansicht */
  fastify.get('/mieterliste/view', auth, async (req, reply) => {
    const data = await getMieterlisteView(fastify.prisma, req.tenantId)
    return reply.send({ data })
  })

  /** PATCH /exporte/mieterliste/notiz/:mietvertragId — Notiz/Typ manuell speichern */
  fastify.patch('/mieterliste/notiz/:id', auth, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const body   = z.object({
      notizen:       z.string().optional(),
      erhoehungsTyp: z.string().optional(),
    }).parse(req.body)

    // Notizen auf Mietvertrag speichern
    if (body.notizen !== undefined) {
      await fastify.prisma.mietvertrag.update({
        where: { id, tenantId: req.tenantId },
        data:  { notizen: body.notizen },
      })
    }
    return reply.send({ data: { ok: true } })
  })

  /** GET /exporte/mieterliste — Excel-Download Mieterliste */
  fastify.get('/mieterliste', { ...auth }, async (req, reply) => {
    const buffer = await erstelleMieterlisteExcel(fastify.prisma, req.tenantId)
    const datum  = new Date().toISOString().slice(0, 10)
    reply
      .header('Content-Type',        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="Mieterliste_${datum}.xlsx"`)
      .header('Content-Length',      String(buffer.length))
    return reply.send(buffer)
  })
}
