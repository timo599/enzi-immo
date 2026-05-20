import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

const MODEL = process.env['ANTHROPIC_MODEL'] ?? 'claude-sonnet-4-6'

let _client: Anthropic | null = null
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] })
  return _client
}

export const NK_ABRECHNUNG_PROMPT_VERSION = 'nk1.0.0'

const SYSTEM_PROMPT = `Du bist ein System zur Extraktion von Daten aus deutschen Nebenkostenabrechnungen.

Extrahiere alle Einheiten, Personenzahlen, Wohnflächen, Kostenarten und Verteilungsschlüssel.
Antworte NUR mit einem validen JSON-Objekt:

{
  "abrechnungszeitraum": {
    "von": "YYYY-MM-DD oder null",
    "bis": "YYYY-MM-DD oder null"
  },
  "objekt_bezeichnung": "String oder null",
  "einheiten": [
    {
      "bezeichnung": "String (z.B. 'EG links', 'Wohnung 1', '1. OG rechts')",
      "wohnflaeche_m2": Zahl oder null,
      "personen_anzahl": Zahl oder null,
      "mieter_name": "String oder null"
    }
  ],
  "kostenarten": [
    {
      "bezeichnung": "String",
      "gesamtbetrag": Zahl oder null,
      "schluessel_verwendet": "wohnflaeche" | "personenzahl" | "gleiche_teile" | "verbrauchsmessung" | null
    }
  ],
  "gesamt_betrag": Zahl oder null,
  "flags": []
}

WICHTIG:
- Alle Einheiten aus der Abrechnung erfassen, auch wenn Daten unvollständig
- Personenzahlen aus Abrechnungsspalten oder Tabellen extrahieren
- Wohnflächen aus Flächenangaben extrahieren
- Verteilungsschlüssel aus der Berechnungsmethode ableiten
- flags: z.B. ["personenzahl_aus_tabelle", "wohnflaeche_aus_schluessel"]`

const NkAbrechnungSchema = z.object({
  abrechnungszeitraum: z.object({
    von: z.string().nullable().default(null),
    bis: z.string().nullable().default(null),
  }),
  objekt_bezeichnung: z.string().nullable().default(null),
  einheiten: z.array(z.object({
    bezeichnung:     z.string(),
    wohnflaeche_m2:  z.number().nullable().default(null),
    personen_anzahl: z.number().nullable().default(null),
    mieter_name:     z.string().nullable().default(null),
  })).default([]),
  kostenarten: z.array(z.object({
    bezeichnung:          z.string(),
    gesamtbetrag:         z.number().nullable().default(null),
    schluessel_verwendet: z.string().nullable().default(null),
  })).default([]),
  gesamt_betrag: z.number().nullable().default(null),
  flags:         z.array(z.string()).default([]),
})

export async function extractNkAbrechnungFromDocument(
  fileBuffer:   Buffer,
  mimeType:     string,
  originalName: string,
) {
  const isPdf = mimeType === 'application/pdf'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contentBlock: any = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBuffer.toString('base64') } }
    : { type: 'image',    source: { type: 'base64', media_type: mimeType,           data: fileBuffer.toString('base64') } }

  const response = await getClient().messages.create({
    model:      MODEL,
    max_tokens: 4096,
    system:     SYSTEM_PROMPT,
    messages:   [{ role: 'user', content: [contentBlock, { type: 'text', text: `Extrahiere alle Daten aus dieser Nebenkostenabrechnung: ${originalName}` }] }],
  })

  const raw     = response.content.find(b => b.type === 'text')?.text ?? '{}'
  const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim()
  const parsed  = NkAbrechnungSchema.parse(JSON.parse(cleaned))

  return {
    extractedFields: parsed,
    rawResponse:     { content: raw },
    confidenceMap:   {} as Record<string, number>,
    flags:           parsed.flags,
    needsReview:     true,
    modelVersion:    MODEL,
    promptVersion:   NK_ABRECHNUNG_PROMPT_VERSION,
    tokensInput:     response.usage.input_tokens,
    tokensOutput:    response.usage.output_tokens,
  }
}
