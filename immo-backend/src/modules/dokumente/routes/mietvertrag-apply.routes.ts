import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getCtx = (req: any) => ({
  tenantId: req.tenantId as string,
  userId:   req.currentUser.sub as string,
})

const BodySchema = z.object({
  einheitId: z.string().uuid(),
  dryRun:    z.boolean().optional().default(false),
})

export const mietvertragApplyRoutes: FastifyPluginAsync = async (fastify) => {
  const prisma = fastify.prisma
  const auth   = { preHandler: [fastify.authenticate] }

  // POST /dokumente/:id/mietvertrag-apply
  fastify.post('/:id/mietvertrag-apply', { ...auth }, async (req, reply) => {
    const { id: dokumentId } = req.params as { id: string }
    const { tenantId, userId } = getCtx(req)
    const body = BodySchema.parse(req.body)

    // Dokument + Extraktion laden
    const dok = await prisma.dokument.findFirst({
      where:   { id: dokumentId, tenantId },
      include: { extraktion: true },
    })
    if (!dok)             return reply.status(404).send({ error: 'Dokument nicht gefunden' })
    if (!dok.extraktion)  return reply.status(422).send({ error: 'Noch keine Extraktion vorhanden' })

    const fields    = dok.extraktion.extractedFields as Record<string, unknown>
    const m         = (fields['mieter']       ?? {}) as Record<string, unknown>
    const v         = (fields['vertrag']      ?? {}) as Record<string, unknown>
    const staffeln  = (fields['staffelmieten'] ?? []) as Array<{ datum: string; betrag: number }>

    // Einheit prüfen
    const einheit = await prisma.einheit.findFirst({
      where: { id: body.einheitId, tenantId },
    })
    if (!einheit) return reply.status(404).send({ error: 'Einheit nicht gefunden' })

    // Dry-Run: nur Vorschau
    if (body.dryRun) {
      return reply.send({ data: {
        dryRun:  true,
        mieter:  m,
        vertrag: v,
        staffeln,
        einheit: { id: einheit.id, bezeichnung: einheit.bezeichnung },
      }})
    }

    // Mieter suchen oder anlegen
    let mieter = null
    if (m['nachname']) {
      mieter = await prisma.mieter.findFirst({
        where: {
          tenantId,
          nachname: { equals: String(m['nachname']), mode: 'insensitive' },
          ...(m['vorname'] ? { vorname: { equals: String(m['vorname']), mode: 'insensitive' } } : {}),
        },
      })
    }

    const mieterNeu = !mieter
    if (!mieter) {
      mieter = await prisma.mieter.create({
        data: {
          tenantId,
          vorname:  String(m['vorname'] ?? ''),
          nachname: String(m['nachname'] ?? ''),
          strasse:  m['strasse'] ? String(m['strasse']) : null,
          plz:      m['plz']     ? String(m['plz'])     : null,
          stadt:    m['stadt']   ? String(m['stadt'])   : null,
        },
      })
    }

    // Mietvertrag anlegen
    const mietvertrag = await prisma.mietvertrag.create({
      data: {
        tenantId,
        einheitId:       body.einheitId,
        mietart:         'wohnraum',
        vertragsbeginn:  v['vertragsbeginn'] ? new Date(String(v['vertragsbeginn'])) : new Date(),
        vertragsende:    v['vertragsende']   ? new Date(String(v['vertragsende']))   : null,
        nettomiete:      v['nettomiete']     ? Number(v['nettomiete'])     : 0,
        nkVorauszahlung: v['nk_vorauszahlung'] ? Number(v['nk_vorauszahlung']) : 0,
        kaution:         v['kaution']        ? Number(v['kaution'])        : 0,
        erstelltVon:     userId,
      },
    })

    // Mieter-Vertragsverknüpfung anlegen
    await prisma.mietvertragMieter.create({
      data: { mietvertragId: mietvertrag.id, mieterId: mieter.id, seit: new Date() },
    })

    // Staffelmieten als Vertragsklauseln
    if (staffeln.length > 0) {
      await prisma.vertragsklausel.createMany({
        data: staffeln.map((s) => ({
          tenantId,
          mietvertragId: mietvertrag.id,
          klauselTyp:    'staffelmiete',
          inhalt:        `Staffelmiete ab ${s.datum}: ${s.betrag} EUR`,
          gueltigAb:     new Date(s.datum),
          betrag:        s.betrag,
        })),
      })
    }

    return reply.send({ data: {
      mieterId:      mieter.id,
      mietvertragId: mietvertrag.id,
      mieterNeu,
      vertragNeu:    true,
    }})
  })
}
