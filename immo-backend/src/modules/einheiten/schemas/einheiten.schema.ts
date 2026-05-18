import { z } from 'zod'

const EinheitstypEnum = z.enum([
  'wohnung', 'gewerbe', 'buero', 'laden', 'lager', 'stellplatz', 'praxis', 'loft', 'sonstiges',
])

const CreateEinheitBase = z.object({
  objektId:       z.string().uuid('Ungültige Objekt-ID'),
  bezeichnung:    z.string().min(1).max(200),
  einheitenTyp:   EinheitstypEnum.default('wohnung'),
  wohnflaecheM2:  z.number().positive().optional(),
  nutzflaecheM2:  z.number().positive().optional(),
  etage:          z.string().max(20).optional(),
  meaAnteil:      z.number().int().positive().optional(),
  personenAnzahl: z.number().int().positive().optional(),
  notizen:        z.string().max(2000).optional(),
})

export const CreateEinheitSchema = CreateEinheitBase

export const UpdateEinheitSchema = CreateEinheitBase.partial().omit({ objektId: true })
export const ListEinheitenQuerySchema = z.object({
  page:     z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  objektId: z.string().uuid().optional(),
  search:   z.string().max(100).optional(),
})
export const EinheitIdParamSchema = z.object({ id: z.string().uuid() })

export type CreateEinheitInput = z.infer<typeof CreateEinheitSchema>
export type UpdateEinheitInput = z.infer<typeof UpdateEinheitSchema>
export type ListEinheitenQuery = z.infer<typeof ListEinheitenQuerySchema>
