import { z } from 'zod'

const MietartEnum = z.enum(['wohnraum', 'gewerbe'])

const VertragsklauselSchema = z.object({
  klauselTyp: z.string().min(1).max(50),
  inhalt: z.string().min(1).max(5000),
  gueltigAb: z.string().date().optional(),
  gueltigBis: z.string().date().optional(),
  betrag: z.number().positive().optional(),
  manuellPruefen: z.boolean().default(true),
})

const MieterZuordnungSchema = z.object({
  mieterId: z.string().uuid(),
  rolle: z.enum(['hauptmieter', 'mitmieter']).default('hauptmieter'),
  seit: z.string().date(),
  bis: z.string().date().optional(),
})

const CreateMietvertragBase = z.object({
  einheitId: z.string().uuid(),
  mietart: MietartEnum,
  vertragsbeginn: z.string().date(),
  vertragsende: z.string().date().optional(),
  nettomiete: z.number().positive(),
  nkVorauszahlung: z.number().min(0).default(0),
  kaution: z.number().positive().optional(),
  mietflaecheM2: z.number().positive().optional(),
  indexKlausel: z.boolean().default(false),
  indexTyp: z.string().max(50).optional(),
  indexBasisjahr: z.number().int().min(1990).max(new Date().getFullYear()).optional(),
  indexBasiswert: z.number().positive().optional(),
  kuendigungsfristMieter: z.number().int().min(1).default(3),
  kuendigungsfristVerm: z.number().int().min(1).default(3),
  notizen: z.string().max(2000).optional(),
  mieter: z.array(MieterZuordnungSchema).default([]),
  klauseln: z.array(VertragsklauselSchema).optional(),
})

export const CreateMietvertragSchema = CreateMietvertragBase
  .refine(
    (d) => !d.vertragsende || new Date(d.vertragsende) > new Date(d.vertragsbeginn),
    { message: 'Vertragsende muss nach Vertragsbeginn liegen', path: ['vertragsende'] },
  )
  .refine(
    (d) => !d.indexKlausel || (d.indexTyp && d.indexBasisjahr && d.indexBasiswert),
    { message: 'Bei Indexklausel: indexTyp, indexBasisjahr und indexBasiswert sind Pflicht', path: ['indexKlausel'] },
  )
  .refine(
    (d) => d.mietart === 'gewerbe' || d.kuendigungsfristMieter >= 3,
    { message: 'Wohnraum: Kündigungsfrist Mieter mindestens 3 Monate (§ 573c BGB)', path: ['kuendigungsfristMieter'] },
  )

export const UpdateMietvertragSchema = CreateMietvertragBase
  .omit({ einheitId: true, mietart: true, mieter: true, klauseln: true })
  .partial()

export const ListMietvertraegeQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  einheitId: z.string().uuid().optional(),
  objektId: z.string().uuid().optional(),
  mietart: MietartEnum.optional(),
  aktiv: z.enum(['true', 'false']).optional(),
})
export const MietvertragIdParamSchema = z.object({ id: z.string().uuid() })

export type CreateMietvertragInput = z.infer<typeof CreateMietvertragSchema>
export type UpdateMietvertragInput = z.infer<typeof UpdateMietvertragSchema>
export type ListMietvertraegeQuery = z.infer<typeof ListMietvertraegeQuerySchema>
