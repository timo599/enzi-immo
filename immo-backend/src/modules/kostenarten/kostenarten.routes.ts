import type { FastifyPluginAsync } from 'fastify'

export const kostenartenRoutes: FastifyPluginAsync = async (fastify) => {
  const auth = { preHandler: [fastify.authenticate] }

  // ── GET /kostenarten ─────────────────────────────────────────
  fastify.get('/', auth, async (req: any, reply) => {
    const items = await fastify.prisma.kostenart.findMany({
      where: { tenantId: req.tenantId, aktiv: true },
      orderBy: { bezeichnung: 'asc' },
      select: {
        id: true,
        kuerzel: true,
        bezeichnung: true,
        umlagefaehig: true,
        schluesselStandard: true,
        heizkvRelevant: true,
      },
    })
    return reply.send({ data: items })
  })
}
