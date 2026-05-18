import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { SYSTEM_PROMPT, USER_PROMPT_TEMPLATE, PROMPT_VERSION, CONFIDENCE_THRESHOLDS } from './extraction.prompts.js'

// ─── Anthropic client singleton ────────────────────────────────

let _client: Anthropic | null = null

function getClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env['ANTHROPIC_API_KEY']
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY environment variable is required')
    _client = new Anthropic({ apiKey })
  }
  return _client
}

const MODEL = process.env['ANTHROPIC_MODEL'] ?? 'claude-sonnet-4-20250514'

// ─── Raw extraction schema (Claude output) ────────────────────

const LieferantSchema = z.object({
  name:          z.string().nullable(),
  adresse:       z.string().nullable(),
  steuernummer:  z.string().nullable(),
})

const KostenartVorschlagSchema = z.object({
  vorschlag:    z.string().nullable(),
  begruendung:  z.string(),
})

const KonfliktSchema = z.object({
  typ:          z.string(),
  beschreibung: z.string(),
  werte:        z.record(z.unknown()).optional(),
})

const ConfidenceMapSchema = z.object({
  rechnungsdatum:        z.number().min(0).max(1),
  rechnungsnummer:       z.number().min(0).max(1),
  lieferant:             z.number().min(0).max(1),
  nettobetrag:           z.number().min(0).max(1),
  bruttobetrag:          z.number().min(0).max(1),
  mwst_satz:             z.number().min(0).max(1),
  periode_von:           z.number().min(0).max(1),
  periode_bis:           z.number().min(0).max(1),
  erkannte_kostenart:    z.number().min(0).max(1),
  objekt_hinweis:        z.number().min(0).max(1),
  beschreibung_freitext: z.number().min(0).max(1),
})

const RawExtractionSchema = z.object({
  rechnungsdatum:       z.string().nullable(),
  rechnungsnummer:      z.string().nullable(),
  lieferant:            LieferantSchema,
  nettobetrag:          z.number().nullable(),
  bruttobetrag:         z.number().nullable(),
  mwst_satz:            z.number().nullable(),
  mwst_betrag:          z.number().nullable(),
  periode_von:          z.string().nullable(),
  periode_bis:          z.string().nullable(),
  erkannte_kostenart:   KostenartVorschlagSchema,
  objekt_hinweis:       z.string().nullable(),
  beschreibung_freitext: z.string().nullable(),
  confidence_map:        ConfidenceMapSchema,
  flags:                 z.array(z.string()),
  konflikte:             z.array(KonfliktSchema),
})

export type RawExtraction = z.infer<typeof RawExtractionSchema>

// ─── Processed extraction result ──────────────────────────────

export interface ProcessedExtraction {
  extractedFields:  RawExtraction
  confidenceMap:    Record<string, number>
  flags:            string[]
  needsReview:      boolean
  modelVersion:     string
  promptVersion:    string
  tokensInput:      number
  tokensOutput:     number
  rawResponse:      string
}

// ─── Main extraction function ──────────────────────────────────

export async function extractFromDocument(
  fileBuffer: Buffer,
  mimeType:   string,
  filename:   string,
  additionalContext?: string,
): Promise<ProcessedExtraction> {
  const client = getClient()

  // Build the message content – Claude supports PDF and images natively
  type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
  type DocumentMediaType = 'application/pdf'

  const base64Data = fileBuffer.toString('base64')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contentBlock: any =
    mimeType === 'application/pdf'
      ? ({
          type: 'document',
          source: {
            type:       'base64',
            media_type: 'application/pdf',
            data:       base64Data,
          },
        })
      : ({
          type: 'image',
          source: {
            type:       'base64',
            media_type: mimeType as ImageMediaType,
            data:       base64Data,
          },
        })

  const response = await client.messages.create({
    model:      MODEL,
    max_tokens: 2048,
    system:     SYSTEM_PROMPT,
    messages: [
      {
        role:    'user',
        content: [
          contentBlock,
          {
            type: 'text',
            text: USER_PROMPT_TEMPLATE(filename, additionalContext),
          },
        ],
      },
    ],
  })

  const rawText = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('')

  // Parse and validate Claude's JSON output
  let parsed: RawExtraction
  try {
    const json = JSON.parse(rawText.trim())
    parsed = RawExtractionSchema.parse(json)
  } catch (err) {
    throw new ExtractionParseError(
      `Claude returned invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
      rawText,
    )
  }

  // ── Post-processing: derive additional flags ─────────────────

  const derivedFlags = new Set<string>(parsed.flags)

  // Betrag-Konflikt: Netto + MwSt ≠ Brutto (Toleranz 2 Cent)
  if (
    parsed.nettobetrag !== null &&
    parsed.mwst_satz !== null &&
    parsed.bruttobetrag !== null
  ) {
    const calculated = parsed.nettobetrag * (1 + parsed.mwst_satz / 100)
    if (Math.abs(calculated - parsed.bruttobetrag) > 0.02) {
      derivedFlags.add('betrag_konflikt')
    }
  }

  // Fields below confidence threshold → needs_review
  for (const [field, threshold] of Object.entries(CONFIDENCE_THRESHOLDS)) {
    const score = parsed.confidence_map[field as keyof typeof parsed.confidence_map]
    if (score !== undefined && score < threshold) {
      derivedFlags.add(`${field}_niedrig_confidence`)
    }
  }

  // erkannte_kostenart is ALWAYS needs_review (architectural invariant)
  // This flag marks it as confirmation-required, regardless of confidence
  derivedFlags.add('kostenart_bestaetigung_erforderlich')

  const finalFlags = Array.from(derivedFlags)

  // needs_review: true if any confidence below threshold or conflict flags
  const needsReview =
    finalFlags.some((f) =>
      f.endsWith('_niedrig_confidence') ||
      f === 'betrag_konflikt' ||
      f === 'datum_fehlt' ||
      f === 'betrag_fehlt',
    ) ||
    parsed.konflikte.length > 0

  return {
    extractedFields:  parsed,
    confidenceMap:    parsed.confidence_map as unknown as Record<string, number>,
    flags:            finalFlags,
    needsReview,
    modelVersion:     MODEL,
    promptVersion:    PROMPT_VERSION,
    tokensInput:      response.usage.input_tokens,
    tokensOutput:     response.usage.output_tokens,
    rawResponse:      rawText,
  }
}

// ─── Typed extraction error ────────────────────────────────────

export class ExtractionParseError extends Error {
  constructor(
    message:             string,
    public rawResponse:  string,
  ) {
    super(message)
    this.name = 'ExtractionParseError'
  }
}
