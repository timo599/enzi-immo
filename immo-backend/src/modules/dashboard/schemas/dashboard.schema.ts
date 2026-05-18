import { z } from 'zod'

export const DashboardQuerySchema = z.object({
  objektId: z.string().uuid().optional(),
})

export type DashboardQuery = z.infer<typeof DashboardQuerySchema>
