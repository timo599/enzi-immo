import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

const MODEL = process.env['ANTHROPIC_MODEL'] ?? 'claude-sonnet-4-6'

let _client: Anthropic | null = null
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] })
  return _client
}

export const MIETVERTRAG_PROMPT_VERSION = 'mv1.0.0'

const SYSTEM_PROMPT = `Du bist ein spezialisiertes System zur Extraktion von Daten aus deutschen Mietverträgen.

Extrahiere alle relevanten Informationen und antworte NUR mit einem validen JSON-Objekt. Kein Markdown, keine Erklärungen.

{
  "mieter": {
    "vorname": "String oder null",
    "nachname": "String oder null",
    "geburtsdatum": "YYYY-MM-DD oder null",
    "strasse": "String oder null",
    "plz": "String oder null",
    "stadt": "String oder null"
  },
  "einheit": {
    "bezeichnung": "String oder null (z.B. 'EG links', 'Wohnung 3')",
    "wohnflaeche_m2": Zahl oder null,
    "etage": "String oder null",
    "strasse": "String oder null",
    "plz": "String oder null",
    "stadt": "String oder null"
  },
  "vertrag": {
    "vertragsbeginn": "YYYY-MM-DD oder null",
    "vertragsende": "YYYY-MM-DD oder null (null = unbefristet)",
    "nettomiete": Zahl oder null,
    "nk_vorauszahlung": Zahl oder null,
    "kaution": Zahl oder null,
    "mietart": "staffel" | "index" | "basis" | null
  },
  "staffelmieten": [
    { "datum": "YYYY-MM-DD", "betrag": Zahl }
  ],
  "indexmiete": {
    "basis_index": Zahl oder null,
    "basisjahr": Zahl oder null,
    "intervall_monate": Zahl oder null
  },
  "confidence_map": {
    "mieter_name": 0.0,
    "mieter_adresse": 0.0,
    "vertragsbeginn": 0.0,
    "nettomiete": 0.0,
    "nk_vorauszahlung": 0.0,
    "einheit": 0.0
  },
  "flags": []
}

REGELN:
- Geldbeträge als Dezimalzahlen ohne Währungssymbol (z.B. 850.00)
- Datumsangaben als ISO 8601 (YYYY-MM-DD)
- staffelmieten: Array mit allen Staffelstufen, leer wenn keine Staffelmiete
- flags: z.B. ["staffelmiete_erkannt", "unbefristet", "indexmiete_erkannt"]
- Confidence 1.0 = eindeutig, 0.0 = nicht gefunden`

const MietvertragSchema = z.object({
  mieter: z.object({
    vorname:      z.string().nullable().default(null),
    nachname:     z.string().nullable().default(null),
    geburtsdatum: z.string().nullable().default(null),
    strasse:      z.string().nullable().default(null),
    plz:          z.string().nullable().default(null),
    stadt:        z.string().nullable().default(null),
  }),
  einheit: z.object({
    bezeichnung:    z.string().nullable().default(null),
    wohnflaeche_m2: z.number().nullable().default(null),
    etage:          z.string().nullable().default(null),
    strasse:        z.string().nullable().default(null),
    plz:            z.string().nullable().default(null),
    stadt:          z.string().nullable().default(null),
  }),
  vertrag: z.object({
    vertragsbeginn:   z.string().nullable().default(null),
    vertragsende:     z.string().nullable().default(null),
    nettomiete:       z.number().nullable().default(null),
    nk_vorauszahlung: z.number().nullable().default(null),
    kaution:          z.number().nullable().default(null),
    mietart:          z.string().nullable().default(null),
  }),
  staffelmieten: z.array(z.object({
    datum:  z.string(),
    betrag: z.number(),
  })).default([]),
  indexmiete: z.object({
    basis_index:      z.number().nullable().default(null),
    basisjahr:        z.number().nullable().default(null),
    intervall_monate: z.number().nullable().default(null),
  }).nullable().default(null),
  confidence_map: z.record(z.number()).default({}),
  flags:          z.array(z.string()).default([]),
})

export async function extractMietvertragFromDocument(
  fileBuffer: Buffer,
  mimeType:   string,
  originalName: string,
) {
  const isPdf = mimeType === 'application/pdf'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contentBlock: any = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBuffer.toString('base64') } }
    : { type: 'image',    source: { type: 'base64', media_type: mimeType,           data: fileBuffer.toString('base64') } }

  const response = await getClient().messages.create({
    model:      MODEL,
    max_tokens: 2048,
    system:     SYSTEM_PROMPT,
    messages:   [{ role: 'user', content: [contentBlock, { type: 'text', text: `Extrahiere alle Daten aus diesem Mietvertrag: ${originalName}` }] }],
  })

  const raw     = response.content.find(b => b.type === 'text')?.text ?? '{}'
  const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim()
  const parsed  = MietvertragSchema.parse(JSON.parse(cleaned))

  const needsReview = Object.values(parsed.confidence_map).some(v => v < 0.7)

  return {
    extractedFields: parsed,
    rawResponse:     { content: raw },
    confidenceMap:   parsed.confidence_map,
    flags:           parsed.flags,
    needsReview,
    modelVersion:    MODEL,
    promptVersion:   MIETVERTRAG_PROMPT_VERSION,
    tokensInput:     response.usage.input_tokens,
    tokensOutput:    response.usage.output_tokens,
  }
}
