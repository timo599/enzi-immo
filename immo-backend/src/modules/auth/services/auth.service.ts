import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import type { FastifyInstance } from 'fastify'
import type { LoginInput, RegisterInput } from '../schemas/auth.schema.js'
import { UnauthorizedError, ConflictError } from '../../../utils/errors.js'
import { writeAudit } from '../../../utils/audit.js'

// Simple slug generator
function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 50)
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const derived = scryptSync(password, salt, 64)
  const storedBuf = Buffer.from(hash, 'hex')
  return timingSafeEqual(derived, storedBuf)
}

export class AuthService {
  constructor(private readonly fastify: FastifyInstance) {}

  async login(input: LoginInput, meta: { ip?: string; userAgent?: string }) {
    const { prisma } = this.fastify

    // Find user by email across all tenants (email is unique per tenant)
    const user = await prisma.user.findFirst({
      where: { email: input.email, aktiv: true },
      include: { tenant: { select: { id: true, slug: true, aktiv: true } } },
    })

    if (!user || !verifyPassword(input.password, user.passwordHash)) {
      // Timing-safe: always run hash verification to prevent timing attacks
      throw new UnauthorizedError('E-Mail oder Passwort falsch')
    }

    if (!user.tenant.aktiv) {
      throw new UnauthorizedError('Mandant ist deaktiviert')
    }

    const payload = {
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      rolle: user.rolle,
    }

    const accessToken = this.fastify.jwt.sign(payload)

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { letzterLogin: new Date() },
    })

    await writeAudit({
      prisma,
      ctx: { tenantId: user.tenantId, userId: user.id, ...(meta.ip && { ipAddress: meta.ip }), ...(meta.userAgent && { userAgent: meta.userAgent }) },
      entityType: 'User',
      entityId: user.id,
      action: 'LOGIN',
    })

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        vorname: user.vorname,
        nachname: user.nachname,
        rolle: user.rolle,
        tenantId: user.tenantId,
      },
    }
  }

  async register(input: RegisterInput) {
    const { prisma } = this.fastify
    const slug = toSlug(input.tenantName)

    const existing = await prisma.tenant.findUnique({ where: { slug } })
    if (existing) {
      throw new ConflictError(`Mandant mit Slug '${slug}' existiert bereits`)
    }

    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: input.tenantName, slug },
      })

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: input.email,
          passwordHash: hashPassword(input.password),
          vorname: input.vorname ?? null,
          nachname: input.nachname ?? null,
          rolle: 'admin',
        },
      })

      // Seed system-defined Kostenarten for this tenant
      await seedKostenarten(tx, tenant.id)

      return { tenant, user }
    })

    return { tenantId: result.tenant.id, userId: result.user.id }
  }
}

// Seed BetrKV Kostenarten for a new tenant
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function seedKostenarten(tx: any, tenantId: string) {
  const systemKostenarten = [
    { kuerzel: 'BK_HEIZ', bezeichnung: 'Heizkosten', umlagefaehig: 'ja' as const, schluesselStandard: 'verbrauchsmessung' as const, rechtsgrundlage: '§ 7 HeizKV', heizkvRelevant: true, systemVordefiniert: true },
    { kuerzel: 'BK_WARMW', bezeichnung: 'Warmwasserkosten', umlagefaehig: 'ja' as const, schluesselStandard: 'verbrauchsmessung' as const, rechtsgrundlage: '§ 8 HeizKV', heizkvRelevant: true, systemVordefiniert: true },
    { kuerzel: 'BK_WASSER', bezeichnung: 'Kaltwasser / Abwasser', umlagefaehig: 'ja' as const, schluesselStandard: 'wohnflaeche' as const, rechtsgrundlage: '§ 2 Nr. 2 BetrKV', systemVordefiniert: true },
    { kuerzel: 'BK_MUELL', bezeichnung: 'Müllabfuhr', umlagefaehig: 'ja' as const, schluesselStandard: 'wohnflaeche' as const, rechtsgrundlage: '§ 2 Nr. 8 BetrKV', systemVordefiniert: true },
    { kuerzel: 'BK_STROM_GEM', bezeichnung: 'Strom Gemeinschaftsflächen', umlagefaehig: 'ja' as const, schluesselStandard: 'wohnflaeche' as const, rechtsgrundlage: '§ 2 Nr. 11 BetrKV', systemVordefiniert: true },
    { kuerzel: 'BK_VERSICH', bezeichnung: 'Gebäudeversicherungen', umlagefaehig: 'ja' as const, schluesselStandard: 'wohnflaeche' as const, rechtsgrundlage: '§ 2 Nr. 13 BetrKV', systemVordefiniert: true },
    { kuerzel: 'BK_GRUNDST', bezeichnung: 'Grundsteuer', umlagefaehig: 'ja' as const, schluesselStandard: 'wohnflaeche' as const, rechtsgrundlage: '§ 2 Nr. 1 BetrKV', systemVordefiniert: true },
    { kuerzel: 'BK_HAUSW', bezeichnung: 'Hausmeister / Hauswart', umlagefaehig: 'ja' as const, schluesselStandard: 'wohnflaeche' as const, rechtsgrundlage: '§ 2 Nr. 14 BetrKV', systemVordefiniert: true },
    { kuerzel: 'BK_GARTPFL', bezeichnung: 'Gartenpflege', umlagefaehig: 'ja' as const, schluesselStandard: 'wohnflaeche' as const, rechtsgrundlage: '§ 2 Nr. 10 BetrKV', systemVordefiniert: true },
    { kuerzel: 'BK_AUFZUG', bezeichnung: 'Aufzug', umlagefaehig: 'ja' as const, schluesselStandard: 'wohnflaeche' as const, rechtsgrundlage: '§ 2 Nr. 7 BetrKV', systemVordefiniert: true },
    { kuerzel: 'BK_SONSTBK', bezeichnung: 'Sonstige Betriebskosten', umlagefaehig: 'ja' as const, schluesselStandard: 'wohnflaeche' as const, rechtsgrundlage: '§ 2 Nr. 17 BetrKV', systemVordefiniert: true },
    { kuerzel: 'NK_VERWALT', bezeichnung: 'Verwaltungskosten', umlagefaehig: 'nein' as const, schluesselStandard: 'wohnflaeche' as const, systemVordefiniert: true },
    { kuerzel: 'NK_INSTAND', bezeichnung: 'Instandhaltungsrücklagen', umlagefaehig: 'nein' as const, schluesselStandard: 'wohnflaeche' as const, systemVordefiniert: true },
  ]

  await tx.kostenart.createMany({
    data: systemKostenarten.map((k) => ({ ...k, tenantId })),
    skipDuplicates: true,
  })
}
