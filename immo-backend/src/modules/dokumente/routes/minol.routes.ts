/**
 * Minol / Wärmemessdienst OCR
 * POST /dokumente/minol-ocr  – PDF hochladen, Claude extrahiert Verbrauchsdaten pro Einheit
 */
import type { FastifyPluginAsync } from 'fastify'
import Anthropic from '@anthropic-ai/sdk'

const MINOL_PROMPT = `Du bist ein Experte für Heizkostenabrechnungen und Minol-Berichte.
Analysiere diesen Wärmemessdienst-/Heizkostenabrechnung-Bericht und extrahiere alle Verbrauchsdaten.
Gib NUR das JSON zurück, keine Erklärungen, keine Markdown-Blöcke.

Schema:
{
  "objekt": {
    "strasse": "",
    "hausnummer": "",
    "plz": "",
    "stadt": "",
    "abrechnungszeitraum_von": "",
    "abrechnungszeitraum_bis": ""
  },
  "einheiten": [
    {
      "bezeichnung": "",
      "lage": "",
      "mieter": "",
      "verbrauch_heizung_einheit": null,
      "verbrauch_heizung_gesamt": null,
      "verbrauch_warmwasser_einheit": null,
      "verbrauch_warmwasser_gesamt": null,
      "einheit_prozent": null,
      "kosten_heizung": null,
      "kosten_warmwasser": null,
      "kosten_gesamt": null
    }
  ],
  "gesamt": {
    "verbrauch_heizung_gesamt": null,
    "verbrauch_warmwasser_gesamt": null,
    "kosten_gesamt": null,
    "messdienst": ""
  }
}

Datumsformat: YYYY-MM-DD. Zahlen ohne Einheit/Währungssymbol. Wenn ein Wert nicht vorhanden ist, null setzen.`

export const minolOcrRoutes: FastifyPluginAsync = async (fastify) => {
  const auth = { preHandler: [fastify.authenticate] }

  fastify.post('/minol-ocr', auth, async (req, reply) => {
    const data = await req.file()
    if (!data) return reply.status(400).send({ error: { message: 'Keine Datei hochgeladen' } })

    const chunks: Buffer[] = []
    for await (const chunk of data.file) chunks.push(chunk as Buffer)
    const fileBuffer = Buffer.concat(chunks)

    const mime = data.mimetype
    if (!mime.startsWith('image/') && mime !== 'application/pdf') {
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
        model: process.env['ANTHROPIC_MODEL'] ?? 'claude-sonnet-4-6',
        max_tokens: 2048,
        messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: MINOL_PROMPT }] }],
      })

      const raw = response.content.filter(b => b.type === 'text').map(b => (b as any).text).join('')
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (!jsonMatch) return reply.status(422).send({ error: { message: 'Extraktion fehlgeschlagen – kein JSON erkannt' } })

      const extracted = JSON.parse(jsonMatch[0])
      return reply.send({ data: extracted })
    } catch (err) {
      fastify.log.error(err, 'Minol OCR fehlgeschlagen')
      return reply.status(500).send({ error: { message: 'KI-Extraktion fehlgeschlagen' } })
    }
  })
}
