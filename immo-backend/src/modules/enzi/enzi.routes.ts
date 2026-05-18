import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { EnziService } from './enzi.service.js'

const ChatSchema = z.object({
  messages: z.array(z.object({
    role:    z.enum(['user', 'assistant']),
    content: z.string().min(1).max(8000),
  })).min(1).max(40),
})

export const enziRoutes: FastifyPluginAsync = async (fastify) => {
  const auth = { preHandler: [fastify.authenticate] }
  const service = new EnziService(fastify.prisma)

  // ── POST /enzi/chat ────────────────────────────────────────────────────────
  fastify.post('/chat', auth, async (req: any, reply) => {
    const body = ChatSchema.parse(req.body)
    const result = await service.chat({
      tenantId: req.tenantId,
      userId:   req.currentUser.sub,
      messages: body.messages,
    })
    return reply.send({ data: result })
  })
}
