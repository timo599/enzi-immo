'use client'

export interface CurrentUser {
  id: string
  email: string
  vorname?: string
  nachname?: string
  rolle: string
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('immo_token')
}

export function getUser(): CurrentUser | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem('immo_user')
  if (!raw) return null
  try { return JSON.parse(raw) as CurrentUser } catch { return null }
}

export function setAuth(token: string, user: CurrentUser) {
  localStorage.setItem('immo_token', token)
  localStorage.setItem('immo_user', JSON.stringify(user))
}

export function clearAuth() {
  localStorage.removeItem('immo_token')
  localStorage.removeItem('immo_user')
}

export function isLoggedIn(): boolean {
  return Boolean(getToken())
}
