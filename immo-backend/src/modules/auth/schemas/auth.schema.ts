import { z } from 'zod'

export const LoginSchema = z.object({
  email: z.string().min(1, 'Benutzername ist erforderlich'),
  password: z.string().min(1, 'Passwort ist erforderlich'),
})

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  vorname: z.string().min(1).max(100).optional(),
  nachname: z.string().min(1).max(100).optional(),
  tenantName: z.string().min(3).max(100),
})

export const RefreshTokenSchema = z.object({
  refreshToken: z.string(),
})

export type LoginInput = z.infer<typeof LoginSchema>
export type RegisterInput = z.infer<typeof RegisterSchema>
