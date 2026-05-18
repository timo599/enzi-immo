/**
 * OCR-Extraktion für Mietverträge
 * POST /mietvertraege/ocr – PDF hochladen, Claude extrahiert Felder
 */
import type { FastifyPluginAsync } from 'fastify'
import Anthropic from '@anthropic-ai/sdk'

const PROMPT = `Du bist ein Experte für deutsche Mietverträge. Analysiere diesen Mietvertrag und extrahiere folgende Informationen als JSON.
Gib NUR das JSON zurück, keine Erklärungen.

Schema (alle Felder optional, nur ausfüllen wenn eindeutig erkennbar):
{
  "mieter": {
    "vorname": "",
    "nachname": "",
    "strasse": "",
    "hausnummer": "",
    "plz": "",
    "stadt": "",
    "telefon": "",
    "email": ""
  },
  "einheit": {
    "bezeichnung": "",
    "strasse": "",
    "hausnummer": "",
    "plz": "",
    "stadt": "",
    "wohnflaecheM2": null,
    "etage": ""
  },
  "vertrag": {
    "vertragsbeginn": "",
    "vertragsende": "",
    "nettomiete": null,
    "nkVorauszahlung": null,
    "kaution": null,
    "mietflaecheM2": null,
    "mietart": "wohnraum"
  }
}

Datumsformat: YYYY-MM-DD. Zahlen ohne Währungssymbol.`

export const mietvertragOcrRoutes: FastifyPluginAsync = async (fastify) => {
  const auth = { preHandler: [fastify.authenticate] }

  fastify.post('/ocr', auth, async (req, reply) => {
    const data = await req.file()
    if (!data) return reply.status(400).send({ error: { message: 'Keine Datei' } })

    const chunks: Buffer[] = []
    for await (const chunk of data.file) chunks.push(chunk as Buffer)
    const fileBuffer = Buffer.concat(chunks)

    const mime = data.mimetype
    const isImage = mime.startsWith('image/')
    if (!isImage && mime !== 'application/pdf') {
      return reply.status(400).send({ error: { message: 'Nur PDF oder Bild erlaubt' } })
    }

    const apiKey = process.env['ANTHROPIC_API_KEY']
    if (!apiKey) return reply.status(503).send({ error: { message: 'KI-Extraktion nicht konfiguriert' } })

    const client = new Anthropic({ apiKey })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contentBlock: any = mime === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBuffer.toString('base64') } }
      : { type: 'image', source: { type: 'base64', media_type: mime, data: fileBuffer.toString('base64') } }

    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: PROMPT }] }],
      })

      const raw = response.content.filter(b => b.type === 'text').map(b => (b as any).text).join('')
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (!jsonMatch) return reply.status(422).send({ error: { message: 'Extraktion fehlgeschlagen' } })

      const extracted = JSON.parse(jsonMatch[0])
      return reply.send({ data: extracted })
    } catch (err) {
      fastify.log.error(err, 'OCR Mietvertrag fehlgeschlagen')
      return reply.status(500).send({ error: { message: 'KI-Extraktion fehlgeschlagen' } })
    }
  })
}
