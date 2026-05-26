import { z } from 'zod'

// ── Enums (mirror Prisma enums for validation) ────────────────
const HeizungsartEnum = z.enum(['oel', 'gas', 'fernwaerme', 'strom', 'waermepumpe', 'pellets', 'sonstiges'])

// ── Create ────────────────────────────────────────────────────
export const CreateObjektSchema = z.object({
  firmaId:             z.string().uuid().optional(),
  bezeichnung:         z.string().min(1).max(200),
  strasse:             z.string().min(1).max(200),
  hausnummer:          z.string().min(1).max(20),
  plz:                 z.string().regex(/^\d{5}$/, 'PLZ muss 5-stellig sein'),
  stadt:               z.string().min(1).max(100),
  bundesland:          z.string().max(50).optional(),
  baujahr:             z.number().int().min(1800).max(new Date().getFullYear()).optional(),
  heizungsart:         HeizungsartEnum,
  wohnflaecheGesamtM2: z.number().min(0).default(0),
  nutzflaecheGesamtM2: z.number().positive().optional(),
  meaGesamt:           z.number().int().positive().default(1000),
  notizen:             z.string().max(2000).optional(),
})

// ── Update (all fields optional) ──────────────────────────────
export const UpdateObjektSchema = CreateObjektSchema.partial()

// ── Query params ──────────────────────────────────────────────
export const ListObjekteQuerySchema = z.object({
  page:     z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(500).default(20),
  search:   z.string().max(100).optional(),
  aktiv:    z.enum(['true', 'false']).optional(),
  firmaId:  z.string().uuid().optional(),
})

// ── Path params ───────────────────────────────────────────────
export const ObjektIdParamSchema = z.object({
  id: z.string().uuid('Ungültige Objekt-ID'),
})

// ── Types ─────────────────────────────────────────────────────
export type CreateObjektInput = z.infer<typeof CreateObjektSchema>
export type UpdateObjektInput = z.infer<typeof UpdateObjektSchema>
export type ListObjekteQuery  = z.infer<typeof ListObjekteQuerySchema>
