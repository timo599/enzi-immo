import { z } from 'zod'

const VerbrauchstypEnum = z.enum([
  'oel', 'strom_gemein', 'strom_einheit', 'gas', 'wasser_kalt', 'wasser_warm', 'fernwaerme',
])

const CreateVerbrauchBase = z.object({
  objektId:            z.string().uuid(),
  zeitraumId:          z.string().uuid(),
  verbrauchstyp:       VerbrauchstypEnum,
  anfangsbestand:      z.number().nonnegative().optional(),
  anfangsbestandDatum: z.string().date().optional(),
  endbestand:          z.number().nonnegative().optional(),
  endbestandDatum:     z.string().date().optional(),
  einheit:             z.string().default('liter'),
  notizen:             z.string().max(1000).optional(),
})

export const CreateVerbrauchSchema = CreateVerbrauchBase.refine(
  (d) => !d.anfangsbestandDatum || !d.endbestandDatum ||
    new Date(d.endbestandDatum) >= new Date(d.anfangsbestandDatum),
  { message: 'Enddatum muss nach Anfangsdatum liegen', path: ['endbestandDatum'] },
)

export const UpdateVerbrauchSchema = CreateVerbrauchBase
  .omit({ objektId: true, zeitraumId: true, verbrauchstyp: true })
  .partial()

export const CreateOelZukaufSchema = z.object({
  kaufdatum:        z.string().date(),
  mengeLiter:       z.number().positive(),
  preisJeLiter:     z.number().positive().optional(),
  preisGesamt:      z.number().positive(),
  kostenpositionId: z.string().uuid().optional(),
  notizen:          z.string().max(500).optional(),
})

export const ListVerbrauchQuerySchema = z.object({
  zeitraumId:    z.string().uuid().optional(),
  objektId:      z.string().uuid().optional(),
  verbrauchstyp: VerbrauchstypEnum.optional(),
  page:          z.coerce.number().int().positive().default(1),
  pageSize:      z.coerce.number().int().positive().max(100).default(20),
})

export const VerbrauchIdParamSchema = z.object({ id: z.string().uuid() })

export type CreateVerbrauchInput  = z.infer<typeof CreateVerbrauchSchema>
export type UpdateVerbrauchInput  = z.infer<typeof UpdateVerbrauchSchema>
export type CreateOelZukaufInput  = z.infer<typeof CreateOelZukaufSchema>
export type ListVerbrauchQuery    = z.infer<typeof ListVerbrauchQuerySchema>
