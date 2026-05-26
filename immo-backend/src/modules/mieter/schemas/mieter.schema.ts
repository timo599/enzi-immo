import { z } from 'zod'

export const CreateMieterSchema = z.object({
  anrede:       z.enum(['herr', 'frau', 'divers', 'firma']).optional(),
  vorname:      z.string().max(100).optional(),
  nachname:     z.string().min(1, 'Nachname ist Pflicht').max(200),
  firmenname:   z.string().max(200).optional(),
  zusatz:       z.string().max(100).optional(),
  strasse:      z.string().max(200).optional(),
  hausnummer:   z.string().max(20).optional(),
  plz:          z.string().max(10).optional(),
  stadt:        z.string().max(100).optional(),
  email:        z.string().email().optional().or(z.literal('')).transform(v => v || undefined),
  telefon:      z.string().max(50).optional(),
  iban:         z.string().max(50).optional().transform(v => v?.replace(/\s/g, '') || undefined),
  steuernummer: z.string().max(50).optional(),
  notizen:      z.string().max(2000).optional(),
})

export const UpdateMieterSchema = CreateMieterSchema.partial()
export const ListMieterQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(500).default(20),
  search: z.string().max(100).optional(),
})
export const MieterIdParamSchema = z.object({ id: z.string().uuid() })

export type CreateMieterInput = z.infer<typeof CreateMieterSchema>
export type UpdateMieterInput = z.infer<typeof UpdateMieterSchema>
export type ListMieterQuery = z.infer<typeof ListMieterQuerySchema>
