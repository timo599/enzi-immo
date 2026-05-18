import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import { ZodError } from 'zod'
import { AppError } from '../utils/errors.js'

const errorHandlerPlugin: FastifyPluginAsync = fp(async (fastify) => {
  fastify.setErrorHandler((error, request, reply) => {
    const log = request.log

    // Zod validation errors
    if (error instanceof ZodError) {
      log.info({ err: error }, 'Validation error')
      return reply.status(422).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Eingabedaten ungültig',
          details: error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
            code: e.code,
          })),
        },
      })
    }

    // Application errors (typed)
    if (error instanceof AppError) {
      log.info({ err: error }, `AppError: ${error.code}`)
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      })
    }

    // Fastify validation errors (JSON Schema)
    if (error.validation) {
      return reply.status(400).send({
        error: {
          code: 'BAD_REQUEST',
          message: 'Anfrage ungültig',
          details: error.validation,
        },
      })
    }

    // JWT errors
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Ungültiges oder abgelaufenes Token' },
      })
    }

    // Prisma unique constraint
    if ((error as { code?: string }).code === 'P2002') {
      return reply.status(409).send({
        error: { code: 'CONFLICT', message: 'Datensatz existiert bereits' },
      })
    }

    // Prisma record not found
    if ((error as { code?: string }).code === 'P2025') {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Datensatz nicht gefunden' },
      })
    }

    // Rate-Limit (Fastify wirft 429 als generischen Error)
    if ((error as { statusCode?: number }).statusCode === 429) {
      return reply.status(429).send({
        error: { code: 'RATE_LIMIT', message: error.message || 'Zu viele Anfragen' },
      })
    }

    // Andere Fastify HTTP-Errors mit korrektem statusCode durchreichen
    const sc = (error as { statusCode?: number }).statusCode
    if (sc && sc >= 400 && sc < 500) {
      return reply.status(sc).send({
        error: { code: 'CLIENT_ERROR', message: error.message || 'Anfrage fehlgeschlagen' },
      })
    }

    // Unexpected errors – don't leak internals
    log.error({ err: error }, 'Unhandled error')
    return reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Interner Serverfehler',
      },
    })
  })
})

export default errorHandlerPlugin
