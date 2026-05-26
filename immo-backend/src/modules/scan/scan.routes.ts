import type { FastifyPluginAsync } from 'fastify'
import Anthropic from '@anthropic-ai/sdk'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'

export const scanRoutes: FastifyPluginAsync = async (fastify) => {
  const auth = { preHandler: [fastify.authenticate] }

  /**
   * POST /scan/beleg
   * Analysiert ein hochgeladenes Dokument (dokumentId) per KI
   * und extrahiert strukturierte Rechnungsdaten.
   */
  fastify.post('/beleg', auth, async (req: any, reply) => {
    const { dokumentId } = req.body as { dokumentId?: string }
    if (!dokumentId) return reply.status(400).send({ error: 'dokumentId fehlt' })

    const dok = await fastify.prisma.dokument.findFirst({
      where: { id: dokumentId, tenantId: req.tenantId },
    })
    if (!dok) return reply.status(404).send({ error: 'Dokument nicht gefunden' })

    const s3 = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region:   process.env.S3_REGION ?? 'eu-central-003',
      credentials: {
        accessKeyId:     process.env.S3_ACCESS_KEY ?? '',
        secretAccessKey: process.env.S3_SECRET_KEY ?? '',
      },
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    })

    let imageBase64: string
    const mimeType = dok.mimeType ?? 'application/pdf'
    type ImgMedia = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
    let mediaType: ImgMedia = 'image/jpeg'
    if (mimeType.includes('png'))  mediaType = 'image/png'
    else if (mimeType.includes('webp')) mediaType = 'image/webp'
    else if (mimeType.includes('gif')) mediaType = 'image/gif'
    else if (mimeType.includes('pdf')) mediaType = 'image/jpeg' // PDFs: text-only fallback

    const isPdf = mimeType.includes('pdf')

    try {
      const obj = await s3.send(new GetObjectCommand({
        Bucket: process.env.S3_BUCKET ?? 'enzi-immo-docs',
        Key:    dok.s3Key,
      }))
      const chunks: Uint8Array[] = []
      const stream = obj.Body as AsyncIterable<Uint8Array>
      for await (const chunk of stream) chunks.push(chunk)
      imageBase64 = Buffer.concat(chunks).toString('base64')
    } catch (e: any) {
      return reply.status(500).send({ error: `Datei konnte nicht geladen werden: ${e.message}` })
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const extractionPrompt = `Du analysierst eine Rechnung / einen Beleg für eine österreichische Immobilienverwaltung.

Extrahiere folgende Informationen als JSON (fehlende Werte als null):
{
  "rechnungsdatum": "YYYY-MM-DD oder null",
  "faelligkeitsdatum": "YYYY-MM-DD oder null",
  "rechnungsnummer": "String oder null",
  "lieferant": "Firmenname / Name des Absenders",
  "lieferantAdresse": "Adresse oder null",
  "lieferantUstId": "UID/USt-IdNr oder null",
  "beschreibung": "Kurzbeschreibung der Leistung (1-2 Sätze)",
  "nettobetrag": Zahl oder null,
  "mwstSatz": Zahl (z.B. 20) oder null,
  "mwstBetrag": Zahl oder null,
  "gesamtbetrag": Zahl (Brutto),
  "waehrung": "EUR",
  "bezugsobjekt": "Gebäude / Adresse falls erkennbar oder null",
  "kategorie": "Eine von: Reparatur|Wartung|Reinigung|Versicherung|Steuern|Verwaltung|Energie|Sonstiges",
  "iban": "IBAN des Lieferanten oder null",
  "bic": "BIC oder null",
  "verwendungszweck": "empfohlener Verwendungszweck für Überweisung oder null"
}

Antworte NUR mit dem JSON-Objekt, ohne Erklärungen.`

    let extracted: any
    try {
      const msgContent: Anthropic.MessageParam['content'] = isPdf
        ? [{ type: 'text', text: `[Inhalt des PDFs "${dok.originalName}" konnte nicht als Bild geladen werden. Versuche Text-Extraktion basierend auf dem Dateinamen.]\n\n${extractionPrompt}` }]
        : [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
            { type: 'text', text: extractionPrompt },
          ]

      const response = await anthropic.messages.create({
        model:      process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-5',
        max_tokens: 1024,
        messages:   [{ role: 'user', content: msgContent }],
      })
      const text = (response.content[0] as Anthropic.TextBlock).text.trim()
      const match = text.match(/\{[\s\S]*\}/)
      extracted = match ? JSON.parse(match[0]) : { fehler: 'Konnte kein JSON extrahieren' }
    } catch (e: any) {
      return reply.status(500).send({ error: `KI-Analyse fehlgeschlagen: ${e.message}` })
    }

    // Extrahierte Daten als JSON in notizen speichern
    await fastify.prisma.dokument.update({
      where: { id: dokumentId },
      data:  { extractedData: extracted, extractionStatus: 'extracted' },
    })

    return reply.send({ data: extracted, dokumentId })
  })
}
