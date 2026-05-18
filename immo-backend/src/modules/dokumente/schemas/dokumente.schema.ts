import { z } from 'zod'

// ─── Allowed MIME types ────────────────────────────────────────
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/tiff',
] as const

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number]

export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024 // 25 MB

export const DokumentKategorieEnum = z.enum([
  'rechnung',
  'mietvertrag',
  'mietvertrag_anlage',
  'kuendigung',
  'uebergabeprotokoll',
  'minol',
  'zaehler_foto',
  'zaehlerstand',
  'betriebskostenabrechnung',
  'versicherung',
  'grundsteuer',
  'korrespondenz',
  'ausweis',
  'bankverbindung',
  'sonstiges',
])

// ─── Upload ────────────────────────────────────────────────────
export const UploadQuerySchema = z.object({
  zeitraumId:        z.string().uuid('Ungültige Zeitraum-ID').optional(),
  einheitId:         z.string().uuid().optional(),
  objektId:          z.string().uuid().optional(),
  mieterId:          z.string().uuid().optional(),
  mietvertragId:     z.string().uuid().optional(),
  dokumentKategorie: DokumentKategorieEnum.default('sonstiges'),
  titel:             z.string().max(200).optional(),
  beschreibung:      z.string().max(2000).optional(),
})

// ─── List / query params ───────────────────────────────────────
export const ListDokumenteQuerySchema = z.object({
  zeitraumId:        z.string().uuid().optional(),
  einheitId:         z.string().uuid().optional(),
  objektId:          z.string().uuid().optional(),
  mieterId:          z.string().uuid().optional(),
  mietvertragId:     z.string().uuid().optional(),
  dokumentKategorie: DokumentKategorieEnum.optional(),
  extractionStatus:  z
    .enum(['pending', 'processing', 'extracted', 'needs_review', 'reviewed', 'failed', 'manual'])
    .optional(),
  page:     z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
})

// ─── Update Metadata (titel, beschreibung, kategorie, relations) ─
export const UpdateDokumentMetaSchema = z.object({
  titel:             z.string().max(200).nullable().optional(),
  beschreibung:      z.string().max(2000).nullable().optional(),
  dokumentKategorie: DokumentKategorieEnum.optional(),
  einheitId:         z.string().uuid().nullable().optional(),
  objektId:          z.string().uuid().nullable().optional(),
  mieterId:          z.string().uuid().nullable().optional(),
  mietvertragId:     z.string().uuid().nullable().optional(),
}).strict()

// ─── Path params ───────────────────────────────────────────────
export const DokumentIdParamSchema = z.object({
  id: z.string().uuid('Ungültige Dokument-ID'),
})

export const JobIdParamSchema = z.object({
  jobId: z.string().min(1),
})

// ─── Review: manual correction ────────────────────────────────
// Allows updating individual extracted fields before confirmation.
export const PatchReviewSchema = z
  .object({
    rechnungsdatum:    z.string().date('Ungültiges Datum (YYYY-MM-DD)').optional().nullable(),
    rechnungsnummer:   z.string().max(100).optional().nullable(),
    lieferantName:     z.string().max(200).optional().nullable(),
    lieferantAdresse:  z.string().max(500).optional().nullable(),
    nettobetrag:       z.number().positive().optional().nullable(),
    bruttobetrag:      z.number().positive().optional().nullable(),
    mwstSatz:          z.number().min(0).max(100).optional().nullable(),
    periodeVon:        z.string().date().optional().nullable(),
    periodeBis:        z.string().date().optional().nullable(),
    // erkannte_kostenart deliberately NOT patchable here –
    // it must go through the confirm flow with explicit kostenartId
    objektHinweis:     z.string().max(500).optional().nullable(),
    beschreibungFreitext: z.string().max(2000).optional().nullable(),
    reviewNotizen:     z.string().max(2000).optional(),
    // Allow resolving specific flags (e.g. user confirms a rounding diff is OK)
    resolvedFlags:     z.array(z.string()).optional(),
  })
  .strict()

// ─── Review: confirm ──────────────────────────────────────────
export const ConfirmReviewSchema = z
  .object({
    // kostenartId is REQUIRED at confirm time
    kostenartId: z.string().uuid('Ungültige Kostenart-ID'),
    // If rechnungsdatum is null, this explanation is required
    rechnungsdatumFehltBegruendung: z.string().max(500).optional(),
    reviewNotizen: z.string().max(2000).optional(),
  })
  .strict()

// ─── Review: reject ───────────────────────────────────────────
export const RejectReviewSchema = z.object({
  begruendung: z.string().min(1).max(500),
})

// ─── Review: set to manual ────────────────────────────────────
export const SetManualSchema = z.object({
  begruendung: z.string().min(1).max(500),
})

// ─── Types ────────────────────────────────────────────────────
export type ListDokumenteQuery  = z.infer<typeof ListDokumenteQuerySchema>
export type PatchReviewInput    = z.infer<typeof PatchReviewSchema>
export type ConfirmReviewInput  = z.infer<typeof ConfirmReviewSchema>
export type RejectReviewInput   = z.infer<typeof RejectReviewSchema>
export type SetManualInput      = z.infer<typeof SetManualSchema>
