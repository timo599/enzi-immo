export function euro(value: number | string | undefined | null): string {
  const n = Number(value ?? 0)
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
}

export function datum(iso: string | Date | undefined | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function prozent(value: number): string {
  return `${value.toFixed(1)} %`
}

export function kurzName(vorname?: string | null, nachname?: string | null): string {
  return [vorname, nachname].filter(Boolean).join(' ') || '—'
}
