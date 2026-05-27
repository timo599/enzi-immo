'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import {
  Search, Building2, Home, Users, FileText, Loader2, X,
} from 'lucide-react'
import { mieterApi, objekteApi, einheitenApi, mietvertraegeApi } from '@/lib/api'

interface Result {
  id: string
  type: 'mieter' | 'objekt' | 'einheit' | 'mietvertrag'
  label: string
  sublabel?: string
  href: string
}

export function QuickSearch() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')

  // Cmd+K / Ctrl+K Shortcut
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(true)
      }
      if (e.key === 'Escape' && open) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Daten lazy laden, nur wenn Dialog offen
  const { data: mieter, isLoading: lM } = useQuery({
    queryKey: ['quicksearch-mieter'],
    queryFn:  async () => (await mieterApi.list({ pageSize: 500 })).data?.data ?? [],
    enabled:  open,
    staleTime: 60_000,
  })
  const { data: objekte, isLoading: lO } = useQuery({
    queryKey: ['quicksearch-objekte'],
    queryFn:  async () => (await objekteApi.list()).data?.data ?? (await objekteApi.list()).data ?? [],
    enabled:  open,
    staleTime: 60_000,
  })
  const { data: einheiten, isLoading: lE } = useQuery({
    queryKey: ['quicksearch-einheiten'],
    queryFn:  async () => (await einheitenApi.list({ pageSize: 500 })).data?.data ?? [],
    enabled:  open,
    staleTime: 60_000,
  })
  const { data: vertraege, isLoading: lV } = useQuery({
    queryKey: ['quicksearch-vertraege'],
    queryFn:  async () => (await mietvertraegeApi.list({ pageSize: 500 })).data?.data ?? [],
    enabled:  open,
    staleTime: 60_000,
  })

  const isLoading = lM || lO || lE || lV

  const results: Result[] = useMemo(() => {
    if (!q.trim() || q.trim().length < 2) return []
    const needle = q.trim().toLowerCase()
    const r: Result[] = []
    for (const m of (mieter ?? []) as any[]) {
      const name = [m.vorname, m.nachname].filter(Boolean).join(' ')
      const hay = [name, m.firmenname, m.email, m.stadt].filter(Boolean).join(' ').toLowerCase()
      if (hay.includes(needle)) r.push({
        id: m.id, type: 'mieter',
        label: m.firmenname || name || m.nachname || '?',
        sublabel: [m.email, m.stadt].filter(Boolean).join(' · '),
        href: '/mieter',
      })
    }
    for (const o of (objekte ?? []) as any[]) {
      const hay = [o.bezeichnung, o.strasse, o.plz, o.stadt].filter(Boolean).join(' ').toLowerCase()
      if (hay.includes(needle)) r.push({
        id: o.id, type: 'objekt',
        label: o.bezeichnung || '?',
        sublabel: [o.plz, o.stadt].filter(Boolean).join(' '),
        href: '/objekte',
      })
    }
    for (const e of (einheiten ?? []) as any[]) {
      const hay = [e.bezeichnung, e.objekt?.bezeichnung].filter(Boolean).join(' ').toLowerCase()
      if (hay.includes(needle)) r.push({
        id: e.id, type: 'einheit',
        label: e.bezeichnung || '?',
        sublabel: e.objekt?.bezeichnung,
        href: '/einheiten',
      })
    }
    for (const v of (vertraege ?? []) as any[]) {
      const ein  = v.einheit?.bezeichnung
      const obj  = v.einheit?.objekt?.bezeichnung
      const hay = [ein, obj].filter(Boolean).join(' ').toLowerCase()
      if (hay.includes(needle)) r.push({
        id: v.id, type: 'mietvertrag',
        label: `${ein ?? '?'} — ${obj ?? '?'}`,
        sublabel: v.nettomiete ? `${v.nettomiete} € netto` : undefined,
        href: '/mietvertraege',
      })
    }
    return r.slice(0, 25)
  }, [q, mieter, objekte, einheiten, vertraege])

  function go(r: Result) {
    setOpen(false)
    setQ('')
    router.push(r.href)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md border border-border/40 bg-background/30 hover:bg-background/50 text-xs text-muted-foreground transition"
        title="Schnellsuche (⌘K)"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">Suchen…</span>
        <kbd className="ml-auto text-[10px] bg-muted px-1 py-0.5 rounded font-mono">⌘K</kbd>
      </button>
    )
  }

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-start justify-center pt-[15vh]"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl mx-4 bg-popover border border-border rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[60vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Mieter, Objekt, Einheit, Vertrag…"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && results.length > 0) {
                go(results[0]!)
              }
            }}
          />
          <button
            onClick={() => setOpen(false)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {q.trim().length < 2 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">
              Mindestens 2 Zeichen eingeben…
            </div>
          ) : isLoading ? (
            <div className="p-6 flex items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Lade…
            </div>
          ) : results.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">
              Keine Treffer für „{q}"
            </div>
          ) : (
            <ul className="py-1">
              {results.map((r, i) => {
                const Icon = r.type === 'mieter' ? Users
                  : r.type === 'objekt' ? Building2
                  : r.type === 'einheit' ? Home
                  : FileText
                return (
                  <li key={`${r.type}-${r.id}`}>
                    <button
                      onClick={() => go(r)}
                      className="w-full text-left px-3 py-2 hover:bg-accent flex items-center gap-3"
                    >
                      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm truncate">{r.label}</div>
                        {r.sublabel && (
                          <div className="text-xs text-muted-foreground truncate">{r.sublabel}</div>
                        )}
                      </div>
                      <span className="text-[10px] uppercase text-muted-foreground tracking-wider">{r.type}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        <div className="px-3 py-1.5 border-t border-border text-[10px] text-muted-foreground flex items-center justify-between">
          <span>{results.length > 0 ? `${results.length} Treffer` : ''}</span>
          <span><kbd className="bg-muted px-1 rounded">⏎</kbd> öffnen · <kbd className="bg-muted px-1 rounded">esc</kbd> schließen</span>
        </div>
      </div>
    </div>
  )
}
