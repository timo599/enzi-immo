import { z } from 'zod'

// ─── Upload / Import ─────────────────────────────────────────────────────────

export const ImportQuerySchema = z.object({
  bankkontoId: z.string().uuid('bankkontoId muss eine UUID sein').optional(),
  format: z.enum(['mt940', 'sparkasse', 'volksbank', 'ing', 'dkb', 'comdirect', 'generic']).optional().default('generic'),
  profil: z
    .enum(['sparkasse', 'volksbank', 'ing', 'dkb', 'comdirect', 'generic'])
    .optional()
    .default('generic'),
})

// ─── Liste Kontoauszüge ──────────────────────────────────────────────────────

export const ListKontoauszuegeQuerySchema = z.object({
  bankkontoId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

// ─── Liste Buchungszeilen ────────────────────────────────────────────────────

export const ListBuchungenQuerySchema = z.object({
  matchingStatus: z
    .enum(['unmatched', 'auto_matched', 'manually_matched', 'ambiguous', 'ignored'])
    .optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})

// ─── Manuelle Zuordnung ──────────────────────────────────────────────────────

export const ZuordnenBodySchema = z.object({
  mietvertragId: z.string().uuid(),
  buchungstyp: z.enum([
    'miete',
    'nk_vorauszahlung',
    'miete_und_nk',
    'nk_nachzahlung',
    'kaution',
    'nk_guthaben',
    'sonstiges',
  ]),
  begruendung: z.string().optional(),
})

// ─── Ignorieren ──────────────────────────────────────────────────────────────

export const IgnorierenBodySchema = z.object({
  begruendung: z.string().min(1, 'Begründung ist Pflicht'),
})

// ─── Soll/Ist-Query ──────────────────────────────────────────────────────────

export const SollIstQuerySchema = z.object({
  von: z.string().date('Format: YYYY-MM-DD'),
  bis: z.string().date('Format: YYYY-MM-DD'),
  objektId: z.string().uuid().optional(),
  mietvertragId: z.string().uuid().optional(),
})

// ─── Offene Posten Query ─────────────────────────────────────────────────────

export const OffenePostenQuerySchema = z.object({
  nurMitRueckstand: z.coerce.boolean().default(false),
  objektId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

// ─── Params ──────────────────────────────────────────────────────────────────

export const UuidParamSchema = z.object({
  id: z.string().uuid(),
})
