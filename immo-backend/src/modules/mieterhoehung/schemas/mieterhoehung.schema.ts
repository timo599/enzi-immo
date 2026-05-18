import { z } from 'zod'

export const BerechneMieterhoehungSchema = z.object({
  mietvertragId: z.string().uuid(),
})

export const MieterhoehungListQuerySchema = z.object({
  mietvertragId: z.string().uuid().optional(),
  objektId:      z.string().uuid().optional(),
  ampelStatus:   z.enum(['faellig', 'bald_faellig', 'geplant', 'kein_handlungsbedarf', 'manuelle_pruefung']).optional(),
  page:          z.coerce.number().int().positive().default(1),
  pageSize:      z.coerce.number().int().min(1).max(100).default(20),
})

export const MieterhoehungIdParamSchema = z.object({
  id: z.string().uuid(),
})

export const AktualisiereMieterhoehungSchema = z.object({
  neueMiete:             z.number().positive().optional(),
  indexAktuellerWert:    z.number().positive().optional(),
  indexQuelle:           z.string().max(200).optional(),
  pruefungshinweis:      z.string().max(1000).optional(),
  status:                z.enum(['berechnet', 'in_pruefung', 'freigegeben', 'abgeschlossen']).optional(),
})

export type BerechneMieterhoehungInput = z.infer<typeof BerechneMieterhoehungSchema>
export type MieterhoehungListQuery     = z.infer<typeof MieterhoehungListQuerySchema>
export type AktualisiereMieterhoehungInput = z.infer<typeof AktualisiereMieterhoehungSchema>
