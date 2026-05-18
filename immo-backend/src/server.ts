// Load .env first — Shell-env-Werte werden NICHT überschrieben (Node-Verhalten),
// daher bewusst override für leere Werte.
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
const envPath = resolve(process.cwd(), '.env')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i)
    if (!m) continue
    const [, key, rawVal] = m
    if (!key) continue
    const val = (rawVal ?? '').replace(/^["']|["']$/g, '')
    // Override wenn aktuelle env leer/undefined ist
    const cur = process.env[key]
    if (cur === undefined || cur === '') {
      process.env[key] = val
    }
  }
}

import Fastify from 'fastify'
import fastifyCors from '@fastify/cors'
import fastifyHelmet from '@fastify/helmet'
import fastifyRateLimit from '@fastify/rate-limit'
import fastifySensible from '@fastify/sensible'
import fastifyMultipart from '@fastify/multipart'
import fastifySwagger from '@fastify/swagger'
import fastifySwaggerUi from '@fastify/swagger-ui'

import prismaPlugin from './plugins/prisma.js'
import jwtPlugin from './plugins/jwt.js'
import errorHandlerPlugin from './plugins/error-handler.js'

import { authRoutes }               from './modules/auth/routes/auth.routes.js'
import { firmenRoutes }             from './modules/firmen/firmen.routes.js'
import { objekteRoutes }            from './modules/objekte/routes/objekte.routes.js'
import { einheitenRoutes }          from './modules/einheiten/routes/einheiten.routes.js'
import { einheitMietvertragUploadRoutes } from './modules/einheiten/routes/mietvertrag-upload.routes.js'
import { mieterRoutes }             from './modules/mieter/routes/mieter.routes.js'
import { mietvertraegeRoutes }      from './modules/mietvertraege/routes/mietvertraege.routes.js'
import { mietvertragOcrRoutes }     from './modules/mietvertraege/routes/ocr.routes.js'
import { dokumenteRoutes, jobsRoutes } from './modules/dokumente/routes/dokumente.routes.js'
import { verbrauchRoutes }          from './modules/verbrauch/routes/verbrauch.routes.js'
import { abrechnungRoutes, zeitraumAbrechnungRoutes } from './modules/abrechnung/routes/abrechnung.routes.js'
import {
  kontoauszugRoutes,
  buchungszeileRoutes,
  sollIstRoutes,
  offenePostenRoutes,
} from './modules/kontoauszug/routes/kontoauszug.routes.js'
import { dashboardRoutes }     from './modules/dashboard/routes/dashboard.routes.js'
import { mieterhoehungRoutes } from './modules/mieterhoehung/routes/mieterhoehung.routes.js'
import { exportRoutes }        from './modules/export/routes/export.routes.js'
import { zaehlerRoutes }        from './modules/zaehler/zaehler.routes.js'
import { minolOcrRoutes }       from './modules/dokumente/routes/minol.routes.js'
import { kostenartenRoutes }    from './modules/kostenarten/kostenarten.routes.js'
import { enziRoutes }           from './modules/enzi/enzi.routes.js'

const MAX_UPLOAD_BYTES = 26 * 1024 * 1024

const app = Fastify({
  logger: {
    level: process.env['LOG_LEVEL'] ?? 'info',
    ...(process.env['NODE_ENV'] === 'development'
      ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' } } }
      : {}),
  },
  trustProxy: true,
  bodyLimit: MAX_UPLOAD_BYTES,
})

async function buildApp() {
  await app.register(fastifyHelmet)
  // CORS: erlaubt localhost + jede LAN-IP (192.168.x.x / 10.x.x.x / 172.16-31.x.x)
  // im Dev-Mode, sodass Handy/Tablet im selben WLAN zugreifen können.
  const corsEnv = process.env['CORS_ORIGIN']
  const allowedOrigins = corsEnv
    ? corsEnv.split(',').map(s => s.trim())
    : null
  await app.register(fastifyCors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true)                     // curl/native
      if (allowedOrigins && allowedOrigins.includes(origin)) return cb(null, true)
      // Lokale Entwicklung / LAN
      if (/^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(origin)) {
        return cb(null, true)
      }
      cb(new Error('CORS blocked'), false)
    },
    credentials: true,
  })
  // Rate-Limit – im Development quasi deaktiviert, in Produktion via ENV setzen
  await app.register(fastifyRateLimit, {
    max:        Number(process.env['RATE_LIMIT_MAX']        ?? 10_000),
    timeWindow: Number(process.env['RATE_LIMIT_WINDOW_MS']  ?? 60_000),
  })
  await app.register(fastifyMultipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } })
  await app.register(fastifySensible)

  if (process.env['NODE_ENV'] !== 'production') {
    await app.register(fastifySwagger, { openapi: { info: { title: 'ImmoManager Pro API', version: '1.0.0' } } })
    await app.register(fastifySwaggerUi, { routePrefix: '/docs' })
  }

  await app.register(prismaPlugin)
  await app.register(jwtPlugin)
  await app.register(errorHandlerPlugin)

  app.get('/health', async () => {
    await app.prisma.$queryRaw`SELECT 1`
    return { status: 'ok', timestamp: new Date().toISOString() }
  })

  const API = '/api/v1'
  await app.register(authRoutes,                     { prefix: `${API}/auth` })
  await app.register(firmenRoutes,                   { prefix: `${API}/firmen` })
  await app.register(objekteRoutes,                  { prefix: `${API}/objekte` })
  await app.register(einheitenRoutes,                { prefix: `${API}/einheiten` })
  await app.register(einheitMietvertragUploadRoutes, { prefix: `${API}/einheiten` })
  await app.register(mieterRoutes,                   { prefix: `${API}/mieter` })
  await app.register(mietvertraegeRoutes,            { prefix: `${API}/mietvertraege` })
  await app.register(mietvertragOcrRoutes,           { prefix: `${API}/mietvertraege` })
  await app.register(dokumenteRoutes,                { prefix: `${API}/dokumente` })
  await app.register(jobsRoutes,                     { prefix: `${API}/jobs` })
  await app.register(verbrauchRoutes,                { prefix: `${API}/verbrauch` })
  await app.register(abrechnungRoutes,               { prefix: `${API}/abrechnungen` })
  await app.register(zeitraumAbrechnungRoutes,       { prefix: `${API}/abrechnungszeitraeume` })
  await app.register(kontoauszugRoutes,              { prefix: `${API}/kontoauszuege` })
  await app.register(buchungszeileRoutes,            { prefix: `${API}/buchungszeilen` })
  await app.register(sollIstRoutes,                  { prefix: `${API}/soll-ist` })
  await app.register(offenePostenRoutes,             { prefix: `${API}/offene-posten` })
  await app.register(dashboardRoutes,                { prefix: `${API}/dashboard` })
  await app.register(mieterhoehungRoutes,            { prefix: `${API}/mieterhoehungen` })
  await app.register(exportRoutes,                   { prefix: `${API}/exporte` })
  await app.register(zaehlerRoutes,                   { prefix: `${API}/zaehler` })
  await app.register(minolOcrRoutes,                  { prefix: `${API}/dokumente` })
  await app.register(kostenartenRoutes,               { prefix: `${API}/kostenarten` })
  await app.register(enziRoutes,                      { prefix: `${API}/enzi` })

  return app
}

async function start() {
  try {
    const server = await buildApp()
    await server.listen({ port: Number(process.env['PORT'] ?? 3000), host: process.env['HOST'] ?? '0.0.0.0' })
    server.log.info('ImmoManager Pro API running')
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
export { buildApp }
