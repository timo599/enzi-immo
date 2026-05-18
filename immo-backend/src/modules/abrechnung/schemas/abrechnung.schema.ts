import { z } from 'zod'

export const BerechneAbrechnungSchema = z.object({
  zeitraumId: z.string().uuid('Ungültige Zeitraum-ID'),
})

export const AbrechnungIdParamSchema = z.object({
  id: z.string().uuid(),
})

export const ZeitraumIdParamSchema = z.object({
  zeitraumId: z.string().uuid(),
})

export const ListAbrechnungenQuerySchema = z.object({
  zeitraumId:    z.string().uuid().optional(),
  mietvertragId: z.string().uuid().optional(),
  status:        z.enum(['entwurf', 'in_pruefung', 'freigegeben', 'versendet', 'abgeschlossen']).optional(),
  page:          z.coerce.number().int().positive().default(1),
  pageSize:      z.coerce.number().int().positive().max(100).default(20),
})

export const FreigabeSchema = z.object({
  notizen: z.string().max(1000).optional(),
})

export const CreateZeitraumSchema = z.object({
  objektId:    z.string().uuid(),
  bezeichnung: z.string().min(1).max(200),
  von:         z.string().date(),
  bis:         z.string().date(),
})

export const ListZeitraeumenQuerySchema = z.object({
  objektId: z.string().uuid().optional(),
  page:     z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
})

export type BerechneAbrechnungInput  = z.infer<typeof BerechneAbrechnungSchema>
export type ListAbrechnungenQuery    = z.infer<typeof ListAbrechnungenQuerySchema>
export type FreigabeInput            = z.infer<typeof FreigabeSchema>
export type CreateZeitraumInput      = z.infer<typeof CreateZeitraumSchema>
export type ListZeitraeumenQuery     = z.infer<typeof ListZeitraeumenQuerySchema>
