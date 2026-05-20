import type { FastifyPluginAsync } from 'fastify'
import { createHash, randomUUID } from 'crypto'
import { z } from 'zod'
import { uploadFile, buildS3Key } from '../../lib/storage/storage.service.js'
import { enqueueExtraction } from '../../lib/queue/queue.service.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx = (req: any) => ({
  tenantId: req.tenantId as string,
  userId:   req.currentUser.sub as string,
})

export const lernmodusRoutes: FastifyPluginAsync = async (fastify) => {
  const prisma = fastify.prisma
  const auth   = { preHandler: [fastify.authenticate] }

  // ── POST /lernmodus/upload ────────────────────────────────────
  fastify.post('/upload', { ...auth }, async (req, reply) => {
    const { tenantId, userId } = ctx(req)

    const data = await (req as any).file()
    if (!data) return reply.status(400).send({ error: 'Keine Datei hochgeladen' })

    const buffer = await data.toBuffer()
    const uuid   = randomUUID()
    const s3Key  = buildS3Key(tenantId, 'lernmodus', uuid, data.filename as string)

    await uploadFile({ key: s3Key, body: buffer, mimeType: data.mimetype as string })

    const sha256 = createHash('sha256').update(buffer).digest('hex')

    const dokument = await prisma.dokument.create({
      data: {
        tenantId,
        dokumentKategorie: 'sonstiges',
        dokumentTyp:       'lernmodus_nk',
        originalName:      data.filename as string,
        s3Key,
        mimeType:          data.mimetype as string,
        fileSizeBytes:     BigInt(buffer.byteLength),
        sha256,
        extractionStatus:  'pending',
        hochgeladenVon:    userId,
      },
    })

    const session = await prisma.lernmodusSession.create({
      data: {
        tenantId,
        dokumentId:  dokument.id,
        erstelltVon: userId,
        status:      'extrahiert',
        rohDaten:    {},
      },
    })

    const jobId = await enqueueExtraction({
      dokumentId:  dokument.id,
      tenantId,
      s3Key,
      mimeType:    data.mimetype as string,
      zeitraumId:  undefined,
      attempt:     0,
      dokumentTyp: 'lernmodus_nk',
    })

    return reply.status(201).send({ data: { sessionId: session.id, dokumentId: dokument.id, jobId } })
  })

  // ── GET /lernmodus/sessionen ──────────────────────────────────
  fastify.get('/sessionen', { ...auth }, async (req, reply) => {
    const { tenantId } = ctx(req)
    const sessionen = await prisma.lernmodusSession.findMany({
      where:   { tenantId },
      include: {
        dokument: { select: { originalName: true, extractionStatus: true } },
        fragen:   { select: { id: true, bestaetigt: true } },
      },
      orderBy: { erstelltAm: 'desc' },
    })
    return reply.send({ data: sessionen })
  })

  // ── GET /lernmodus/sessionen/:id ──────────────────────────────
  fastify.get('/sessionen/:id', { ...auth }, async (req, reply) => {
    const { id }      = req.params as { id: string }
    const { tenantId } = ctx(req)
    const session = await prisma.lernmodusSession.findFirst({
      where:   { id, tenantId },
      include: {
        dokument: true,
        fragen:   { include: { einheit: { select: { id: true, bezeichnung: true } } } },
      },
    })
    if (!session) return reply.status(404).send({ error: 'Session nicht gefunden' })
    return reply.send({ data: session })
  })

  // ── POST /lernmodus/sessionen/:id/starten ────────────────────
  fastify.post('/sessionen/:id/starten', { ...auth }, async (req, reply) => {
    const { id }       = req.params as { id: string }
    const { tenantId } = ctx(req)

    const session = await prisma.lernmodusSession.findFirst({
      where:   { id, tenantId },
      include: { dokument: { include: { extraktion: true } } },
    })
    if (!session) return reply.status(404).send({ error: 'Session nicht gefunden' })
    if (!session.dokument?.extraktion) {
      return reply.status(422).send({ error: 'Extraktion noch nicht abgeschlossen' })
    }

    const rohDaten = session.dokument.extraktion.extractedFields as Record<string, unknown>
    const einheiten = (rohDaten['einheiten'] as Array<Record<string, unknown>>) ?? []
    const kostenarten = (rohDaten['kostenarten'] as Array<Record<string, unknown>>) ?? []

    // Bestehende Einheiten für Fuzzy-Match laden
    const dbEinheiten = await prisma.einheit.findMany({
      where:  { tenantId },
      select: { id: true, bezeichnung: true },
    })

    function matchEinheit(bezeichnung: string) {
      const lower = bezeichnung.toLowerCase()
      return dbEinheiten.find((e: { id: string; bezeichnung: string }) =>
        e.bezeichnung.toLowerCase().includes(lower) ||
        lower.includes(e.bezeichnung.toLowerCase())
      )
    }

    // Fragen generieren
    const fragenData: Array<{
      sessionId:     string
      frageTyp:      string
      fragentext:    string
      einheitRef:    string | null
      vorschlagWert: string | null
      einheitId:     string | null
    }> = []

    for (const einheit of einheiten) {
      const bez   = String(einheit['bezeichnung'] ?? '')
      const match = matchEinheit(bez)

      if (einheit['personen_anzahl'] != null) {
        fragenData.push({
          sessionId:     id,
          frageTyp:      'personen_einheit',
          fragentext:    `In Einheit "${bez}"${match ? ` (erkannt als: ${match.bezeichnung})` : ''} wohnten laut Abrechnung ${einheit['personen_anzahl']} Person(en). Stimmt das?`,
          einheitRef:    bez,
          vorschlagWert: String(einheit['personen_anzahl']),
          einheitId:     match?.id ?? null,
        })
      }

      if (einheit['wohnflaeche_m2'] != null) {
        fragenData.push({
          sessionId:     id,
          frageTyp:      'wohnflaeche',
          fragentext:    `Die Wohnfläche von "${bez}" ist laut Abrechnung ${einheit['wohnflaeche_m2']} m². Stimmt das?`,
          einheitRef:    bez,
          vorschlagWert: String(einheit['wohnflaeche_m2']),
          einheitId:     match?.id ?? null,
        })
      }
    }

    for (const ka of kostenarten) {
      if (ka['schluessel_verwendet']) {
        fragenData.push({
          sessionId:     id,
          frageTyp:      'kostenart_schluessel',
          fragentext:    `"${ka['bezeichnung']}" wurde nach "${ka['schluessel_verwendet']}" verteilt. Soll das als Standard gespeichert werden?`,
          einheitRef:    null,
          vorschlagWert: String(ka['schluessel_verwendet']),
          einheitId:     null,
        })
      }
    }

    await prisma.lernmodusFrage.deleteMany({ where: { sessionId: id } })
    const fragen = await prisma.$transaction(
      fragenData.map((f) => prisma.lernmodusFrage.create({ data: f }))
    )

    await prisma.lernmodusSession.update({
      where: { id },
      data:  { status: 'in_dialog', rohDaten: rohDaten as object },
    })

    return reply.send({ data: { fragen, anzahl: fragen.length } })
  })

  // ── PATCH /lernmodus/fragen/:id/beantworten ──────────────────
  fastify.patch('/fragen/:id/beantworten', { ...auth }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body   = z.object({
      antwortWert:   z.string(),
      einheitId:     z.string().uuid().optional().nullable(),
      ueberspringen: z.boolean().optional().default(false),
    }).parse(req.body)

    const frage = await prisma.lernmodusFrage.update({
      where: { id },
      data:  {
        antwortWert:   body.ueberspringen ? null : body.antwortWert,
        einheitId:     body.einheitId ?? null,
        bestaetigt:    !body.ueberspringen,
        beantwortetAm: new Date(),
      },
    })
    return reply.send({ data: frage })
  })

  // ── POST /lernmodus/sessionen/:id/abschliessen ───────────────
  fastify.post('/sessionen/:id/abschliessen', { ...auth }, async (req, reply) => {
    const { id }       = req.params as { id: string }
    const { tenantId } = ctx(req)

    const session = await prisma.lernmodusSession.findFirst({
      where:   { id, tenantId },
      include: { fragen: true },
    })
    if (!session) return reply.status(404).send({ error: 'Session nicht gefunden' })

    const bestaetigte = session.fragen.filter((f) => f.bestaetigt)
    let aktualisierteEinheiten = 0
    let neueKostenartRegeln    = 0

    const VALID_SCHLUESSEL = ['wohnflaeche', 'personenzahl', 'gleiche_teile', 'verbrauchsmessung', 'miteigentumsanteile']

    await prisma.$transaction(async (tx) => {
      for (const frage of bestaetigte) {
        if (frage.frageTyp === 'personen_einheit' && frage.einheitId && frage.antwortWert) {
          await tx.einheitLernwissen.upsert({
            where:  { tenantId_einheitId: { tenantId, einheitId: frage.einheitId } },
            create: { tenantId, einheitId: frage.einheitId, quelleSessionId: id, personenAnzahlBestaetigt: parseInt(frage.antwortWert) },
            update: { personenAnzahlBestaetigt: parseInt(frage.antwortWert), quelleSessionId: id },
          })
          aktualisierteEinheiten++
        }

        if (frage.frageTyp === 'wohnflaeche' && frage.einheitId && frage.antwortWert) {
          await tx.einheitLernwissen.upsert({
            where:  { tenantId_einheitId: { tenantId, einheitId: frage.einheitId } },
            create: { tenantId, einheitId: frage.einheitId, quelleSessionId: id, wohnflaecheBestaetigt: parseFloat(frage.antwortWert) },
            update: { wohnflaecheBestaetigt: parseFloat(frage.antwortWert), quelleSessionId: id },
          })
          aktualisierteEinheiten++
        }

        if (frage.frageTyp === 'kostenart_schluessel' && frage.antwortWert && frage.vorschlagWert) {
          const schluessel = frage.vorschlagWert
          if (VALID_SCHLUESSEL.includes(schluessel)) {
            // Kostenart-Bezeichnung aus fragentext extrahieren
            const match = frage.fragentext.match(/^"([^"]+)"/)
            const kuerzel = match?.[1] ?? frage.fragentext.split('"')[1] ?? 'UNBEKANNT'
            await tx.kostenartLernwissen.upsert({
              where:  { tenantId_kostenartKuerzel: { tenantId, kostenartKuerzel: kuerzel } },
              create: { tenantId, kostenartKuerzel: kuerzel, bevorzugterSchluessel: schluessel as any, quelleSessionId: id },
              update: { bevorzugterSchluessel: schluessel as any, quelleSessionId: id },
            })
            neueKostenartRegeln++
          }
        }
      }

      await tx.lernmodusSession.update({
        where: { id },
        data:  { status: 'abgeschlossen' },
      })
    })

    return reply.send({ data: { aktualisierteEinheiten, neueKostenartRegeln, bestaetigte: bestaetigte.length } })
  })
}
