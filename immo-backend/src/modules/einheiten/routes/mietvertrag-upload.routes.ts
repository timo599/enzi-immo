/**
 * POST /einheiten/:id/mietvertrag-upload
 *
 * Lädt einen Mietvertrag als PDF/Bild zur Einheit hoch, extrahiert die Felder
 * via Claude (OCR/Vision) und legt automatisch an:
 *   - Mieter (falls nicht vorhanden – über Name + ggf. Email gematcht)
 *   - Mietvertrag, verknüpft mit Einheit + Mieter
 *
 * Antwortet mit dem angelegten Vertrag inklusive Mieter-Zuordnung.
 */
import type { FastifyPluginAsync } from 'fastify'
import Anthropic from '@anthropic-ai/sdk'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const PROMPT = `Du bist ein Experte für deutsche Mietverträge. Analysiere diesen Mietvertrag und extrahiere die folgenden Felder als JSON.
Gib NUR das JSON zurück, keine Erklärungen, keine Markdown-Code-Fences.

Schema (alle Felder optional; nur ausfüllen wenn eindeutig im Dokument erkennbar):
{
  "mieter": {
    "anrede": "herr|frau|divers|firma",
    "vorname": "",
    "nachname": "",
    "firmenname": "",
    "strasse": "",
    "hausnummer": "",
    "plz": "",
    "stadt": "",
    "telefon": "",
    "email": ""
  },
  "vertrag": {
    "mietart": "wohnraum|gewerbe",
    "vertragsbeginn": "YYYY-MM-DD",
    "vertragsende": "YYYY-MM-DD",
    "nettomiete": 0,
    "nkVorauszahlung": 0,
    "kaution": 0,
    "mietflaecheM2": 0
  }
}

Wichtig:
- Datumsformat strikt YYYY-MM-DD
- Zahlen ohne Währungssymbol, Punkt als Dezimaltrenner
- Wenn kein Vertragsende erkennbar: Feld weglassen (unbefristet)
- Bei Firmen: anrede="firma", firmenname setzen, nachname kann leer bleiben`

type ExtractedData = {
  mieter?: {
    anrede?: string
    vorname?: string
    nachname?: string
    firmenname?: string
    strasse?: string
    hausnummer?: string
    plz?: string
    stadt?: string
    telefon?: string
    email?: string
  }
  vertrag?: {
    mietart?: 'wohnraum' | 'gewerbe'
    vertragsbeginn?: string
    vertragsende?: string
    nettomiete?: number
    nkVorauszahlung?: number
    kaution?: number
    mietflaecheM2?: number
  }
}

export const einheitMietvertragUploadRoutes: FastifyPluginAsync = async (fastify) => {
  const auth = { preHandler: [fastify.authenticate] }

  fastify.post<{ Params: { id: string } }>(
    '/:id/mietvertrag-upload',
    auth,
    async (req, reply) => {
      const r = req as any
      const ctx = { tenantId: r.tenantId as string, userId: r.currentUser.sub as string }
      const einheitId = req.params.id

      // 1. Einheit prüfen (gehört zum Tenant?)
      const einheit = await prisma.einheit.findFirst({
        where: { id: einheitId, tenantId: ctx.tenantId, deletedAt: null },
      })
      if (!einheit) {
        return reply.status(404).send({ error: { message: 'Einheit nicht gefunden' } })
      }

      // 2. Datei aus dem Request lesen
      const data = await req.file()
      if (!data) {
        return reply.status(400).send({ error: { message: 'Keine Datei hochgeladen' } })
      }
      const chunks: Buffer[] = []
      for await (const chunk of data.file) chunks.push(chunk as Buffer)
      const fileBuffer = Buffer.concat(chunks)
      const mime = data.mimetype

      const isImage = mime.startsWith('image/')
      const isPdf = mime === 'application/pdf'
      if (!isImage && !isPdf) {
        return reply.status(400).send({ error: { message: 'Nur PDF oder Bild (JPG/PNG) erlaubt' } })
      }

      // 3. API-Key prüfen
      const apiKey = process.env['ANTHROPIC_API_KEY']
      if (!apiKey) {
        return reply.status(503).send({
          error: { message: 'OCR-Extraktion nicht konfiguriert (ANTHROPIC_API_KEY fehlt)' },
        })
      }

      // 4. Claude-Vision aufrufen
      const client = new Anthropic({ apiKey })
      const contentBlock: any = isPdf
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBuffer.toString('base64') } }
        : { type: 'image',    source: { type: 'base64', media_type: mime,              data: fileBuffer.toString('base64') } }

      let extracted: ExtractedData
      try {
        const response = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 1500,
          messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: PROMPT }] }],
        })
        const raw = response.content
          .filter((b: any) => b.type === 'text')
          .map((b: any) => b.text)
          .join('')
        const jsonMatch = raw.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
          return reply.status(422).send({ error: { message: 'Keine strukturierten Daten extrahierbar' } })
        }
        extracted = JSON.parse(jsonMatch[0])
      } catch (err: any) {
        fastify.log.error(err, 'Mietvertrag-OCR fehlgeschlagen')
        const msg = err?.status === 401
          ? 'Anthropic-API-Key ungültig'
          : err?.status === 429
            ? 'KI-Rate-Limit erreicht – bitte später nochmal'
            : 'KI-Extraktion fehlgeschlagen'
        return reply.status(502).send({ error: { message: msg } })
      }

      // 5. Pflichtfelder validieren
      const m = extracted.mieter || {}
      const v = extracted.vertrag || {}
      const mieterName = (m.firmenname || m.nachname || '').trim()
      if (!mieterName) {
        return reply.status(422).send({
          error: { message: 'Kein Mieter-Name im Vertrag erkennbar – bitte manuell anlegen' },
          partial: extracted,
        })
      }
      if (!v.vertragsbeginn) {
        return reply.status(422).send({
          error: { message: 'Vertragsbeginn nicht erkennbar – bitte manuell ergänzen' },
          partial: extracted,
        })
      }
      if (!v.nettomiete || v.nettomiete <= 0) {
        return reply.status(422).send({
          error: { message: 'Nettomiete nicht erkennbar – bitte manuell ergänzen' },
          partial: extracted,
        })
      }

      // 6. Mieter find-or-create (Match über Name + ggf. Email)
      let mieter = await prisma.mieter.findFirst({
        where: {
          tenantId: ctx.tenantId,
          deletedAt: null,
          OR: [
            m.email ? { email: m.email } : { id: '__never__' },
            m.firmenname
              ? { firmenname: { equals: m.firmenname, mode: 'insensitive' } }
              : {
                  AND: [
                    { nachname: { equals: m.nachname ?? '', mode: 'insensitive' } },
                    m.vorname
                      ? { vorname: { equals: m.vorname, mode: 'insensitive' } }
                      : { id: { not: '__never__' } },
                  ],
                },
          ],
        },
      })

      let mieterCreated = false
      if (!mieter) {
        const allowedAnrede = ['herr', 'frau', 'divers', 'firma']
        const anrede = allowedAnrede.includes(m.anrede ?? '')
          ? (m.anrede as 'herr' | 'frau' | 'divers' | 'firma')
          : (m.firmenname ? 'firma' : undefined)

        mieter = await prisma.mieter.create({
          data: {
            tenantId:   ctx.tenantId,
            anrede:     anrede ?? null,
            vorname:    m.vorname?.trim() || null,
            nachname:   (m.nachname?.trim() || m.firmenname?.trim() || 'Unbekannt'),
            firmenname: m.firmenname?.trim() || null,
            strasse:    m.strasse?.trim() || null,
            hausnummer: m.hausnummer?.trim() || null,
            plz:        m.plz?.trim() || null,
            stadt:      m.stadt?.trim() || null,
            telefon:    m.telefon?.trim() || null,
            email:      m.email?.trim() || null,
          },
        })
        mieterCreated = true
      }

      // 7. Überlappenden Vertrag auf dieser Einheit prüfen
      const start = new Date(v.vertragsbeginn)
      const end = v.vertragsende ? new Date(v.vertragsende) : null
      const overlap = await prisma.mietvertrag.findFirst({
        where: {
          einheitId,
          deletedAt: null,
          AND: [
            { vertragsbeginn: { lte: end ?? new Date('9999-12-31') } },
            { OR: [{ vertragsende: null }, { vertragsende: { gte: start } }] },
          ],
        },
      })
      if (overlap) {
        return reply.status(409).send({
          error: {
            message: `Überlappender Mietvertrag auf dieser Einheit (ID: ${overlap.id}). Bitte zuerst beenden oder Datum prüfen.`,
          },
          extracted,
          mieter: { id: mieter.id, created: mieterCreated },
        })
      }

      // 8. Mietvertrag anlegen + Mieter-Zuordnung in Transaktion
      const mietart = v.mietart === 'gewerbe' ? 'gewerbe' : 'wohnraum'
      const vertrag = await prisma.$transaction(async (tx) => {
        const created = await tx.mietvertrag.create({
          data: {
            tenantId:               ctx.tenantId,
            einheitId,
            erstelltVon:            ctx.userId,
            mietart,
            vertragsbeginn:         start,
            vertragsende:           end,
            nettomiete:             v.nettomiete!,
            nkVorauszahlung:        v.nkVorauszahlung ?? 0,
            kaution:                v.kaution ?? null,
            mietflaecheM2:          v.mietflaecheM2 ?? null,
            kuendigungsfristMieter: mietart === 'wohnraum' ? 3 : 6,
            kuendigungsfristVerm:   mietart === 'wohnraum' ? 3 : 6,
          },
        })
        await tx.mietvertragMieter.create({
          data: {
            mietvertragId: created.id,
            mieterId:      mieter!.id,
            rolle:         'hauptmieter',
            seit:          start,
          },
        })
        return tx.mietvertrag.findUnique({
          where: { id: created.id },
          include: {
            einheit: { select: { id: true, bezeichnung: true, objekt: { select: { bezeichnung: true } } } },
            mietvertragMieter: { include: { mieter: { select: { id: true, vorname: true, nachname: true, firmenname: true } } } },
          },
        })
      })

      return reply.status(201).send({
        data: vertrag,
        meta: {
          mieterCreated,
          mieterId: mieter.id,
          warnings: mietart === 'gewerbe'
            ? ['Gewerbe-Mietvertrag: Mieterhöhungen nur nach juristischer Prüfung.']
            : [],
        },
      })
    },
  )
}
