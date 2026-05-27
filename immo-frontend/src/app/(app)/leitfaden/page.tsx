'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { getUser } from '@/lib/auth'
import {
  BookOpen,
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  Euro,
  Building2,
  User,
  Users,
  CheckCircle2,
  ArrowRight,
  AlertTriangle,
  Info,
  Layers,
  X,
  Save,
  Search,
} from 'lucide-react'
import { Button }   from '@/components/ui/button'
import { Input }    from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge }    from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ── Types ─────────────────────────────────────────────────────────────────────

type SchrittTyp = 'info' | 'schritt' | 'entscheidung'

interface Schritt {
  id:           string
  typ:          SchrittTyp
  titel:        string
  inhalt?:      string
  bedingungen?: { wenn: string; dann: string }[]
}

interface Objekt { id: string; bezeichnung: string; stadt: string }
interface UserRef { id: string; vorname?: string; nachname?: string }
interface UserFull { id: string; email: string; vorname?: string; nachname?: string; rolle: string }

interface Leitfaden {
  id:           string
  titel:        string
  kategorie?:   string
  beschreibung?: string
  inhalt?:      string
  userId?:      string | null
  fuerRolle?:   string | null
  objektId?:    string | null
  schritte:     Schritt[]
  budgetGrenze?: number | null
  sortierung:   number
  aktiv:        boolean
  erstelltAm:  string
  objekt?:     Objekt | null
  user?:       UserRef | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const KATEGORIEN = [
  'Reparaturen & Instandhaltung',
  'Mieter & Kommunikation',
  'Finanzen & Zahlungen',
  'Rechtliches & Verträge',
  'Übergaben & Protokolle',
  'Notfälle & Dringend',
  'Sonstiges',
]

const ROLLEN_LABEL: Record<string, string> = {
  admin:               'Admin',
  verwalter:           'Verwalter',
  assistent:           'Assistent',
  eigentuemer_readonly:'Eigentümer',
}

function rolleLabel(rolle?: string | null): string {
  if (!rolle) return ''
  return ROLLEN_LABEL[rolle] ?? rolle
}

function budgetLabel(v?: number | null): string {
  if (!v) return ''
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
}

function categoryColor(kat?: string): string {
  if (!kat) return 'bg-slate-100 text-slate-700'
  if (kat.includes('Reparatur') || kat.includes('Instand')) return 'bg-orange-100 text-orange-700'
  if (kat.includes('Mieter'))  return 'bg-blue-100 text-blue-700'
  if (kat.includes('Finanz'))  return 'bg-green-100 text-green-700'
  if (kat.includes('Rechtl'))  return 'bg-purple-100 text-purple-700'
  if (kat.includes('Überg'))   return 'bg-teal-100 text-teal-700'
  if (kat.includes('Notfall') || kat.includes('Dring')) return 'bg-red-100 text-red-700'
  return 'bg-slate-100 text-slate-700'
}

// ── Schritt Components ────────────────────────────────────────────────────────

function SchrittIcon({ typ }: { typ: SchrittTyp }) {
  if (typ === 'info')        return <Info className="w-4 h-4 text-blue-500" />
  if (typ === 'schritt')     return <CheckCircle2 className="w-4 h-4 text-green-500" />
  if (typ === 'entscheidung') return <AlertTriangle className="w-4 h-4 text-amber-500" />
  return null
}

function SchrittCard({ schritt, idx }: { schritt: Schritt; idx: number }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border rounded-lg bg-white overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
      >
        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500">
          {idx + 1}
        </span>
        <SchrittIcon typ={schritt.typ} />
        <span className="flex-1 font-medium text-sm text-slate-800">{schritt.titel}</span>
        {(schritt.inhalt || schritt.bedingungen?.length) ? (
          open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />
        ) : null}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-0 space-y-3">
          {schritt.inhalt && (
            <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{schritt.inhalt}</p>
          )}
          {schritt.bedingungen && schritt.bedingungen.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Entscheidungsbaum</p>
              {schritt.bedingungen.map((b, i) => (
                <div key={i} className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded p-2">
                  <span className="text-xs font-medium text-amber-700 flex-shrink-0">Wenn:</span>
                  <span className="text-xs text-amber-800 flex-1">{b.wenn}</span>
                  <ArrowRight className="w-3 h-3 text-amber-400 flex-shrink-0 mt-0.5" />
                  <span className="text-xs font-medium text-amber-700 flex-shrink-0">Dann:</span>
                  <span className="text-xs text-amber-800 flex-1">{b.dann}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Leitfaden Card ────────────────────────────────────────────────────────────

function LeitfadenCard({
  item,
  canEdit,
  onEdit,
  onDelete,
}: {
  item: Leitfaden
  canEdit: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {item.kategorie && (
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${categoryColor(item.kategorie)}`}>
                  {item.kategorie}
                </span>
              )}
              {item.budgetGrenze && (
                <span className="flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                  <Euro className="w-3 h-3" />
                  bis {budgetLabel(item.budgetGrenze)}
                </span>
              )}
              {item.objekt && (
                <span className="flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">
                  <Building2 className="w-3 h-3" />
                  {item.objekt.bezeichnung}
                </span>
              )}
              {item.userId && item.user && (
                <span className="flex items-center gap-1 text-xs bg-violet-50 text-violet-700 px-2 py-0.5 rounded-full">
                  <User className="w-3 h-3" />
                  {[item.user.vorname, item.user.nachname].filter(Boolean).join(' ')}
                </span>
              )}
              {!item.userId && item.fuerRolle && (
                <span className="flex items-center gap-1 text-xs bg-sky-50 text-sky-700 px-2 py-0.5 rounded-full">
                  <Users className="w-3 h-3" />
                  {rolleLabel(item.fuerRolle)}
                </span>
              )}
              {!item.userId && !item.fuerRolle && (
                <span className="flex items-center gap-1 text-xs bg-slate-50 text-slate-500 px-2 py-0.5 rounded-full">
                  <Users className="w-3 h-3" />
                  Alle
                </span>
              )}
            </div>
            <h3 className="font-semibold text-slate-900 text-base leading-snug">{item.titel}</h3>
            {item.beschreibung && (
              <p className="text-sm text-slate-500 mt-1 line-clamp-2">{item.beschreibung}</p>
            )}
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            {canEdit && (
              <>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600" onClick={onDelete}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Expandable content */}
      {(item.inhalt || item.schritte?.length > 0) && (
        <>
          <button
            onClick={() => setExpanded(v => !v)}
            className="w-full flex items-center gap-2 px-5 py-2 text-xs text-slate-500 hover:bg-slate-50 transition-colors border-t"
          >
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            {expanded ? 'Weniger anzeigen' : `Details & Schritte anzeigen${item.schritte?.length ? ` (${item.schritte.length})` : ''}`}
          </button>

          {expanded && (
            <div className="px-5 pb-5 space-y-4 border-t bg-slate-50">
              {item.inhalt && (
                <div className="pt-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Beschreibung</p>
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{item.inhalt}</p>
                </div>
              )}

              {item.schritte?.length > 0 && (
                <div className={item.inhalt ? '' : 'pt-4'}>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Vorgehensweise</p>
                  <div className="space-y-2">
                    {item.schritte.map((s, i) => (
                      <SchrittCard key={s.id} schritt={s} idx={i} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Schritt Editor ────────────────────────────────────────────────────────────

function SchrittEditor({
  schritte,
  onChange,
}: {
  schritte: Schritt[]
  onChange: (s: Schritt[]) => void
}) {
  function add() {
    onChange([...schritte, {
      id: crypto.randomUUID(),
      typ: 'schritt',
      titel: '',
      inhalt: '',
      bedingungen: [],
    }])
  }

  function remove(id: string) {
    onChange(schritte.filter(s => s.id !== id))
  }

  function update(id: string, patch: Partial<Schritt>) {
    onChange(schritte.map(s => s.id === id ? { ...s, ...patch } : s))
  }

  function addBedingung(id: string) {
    const s = schritte.find(s => s.id === id)
    if (!s) return
    update(id, { bedingungen: [...(s.bedingungen ?? []), { wenn: '', dann: '' }] })
  }

  function updateBedingung(id: string, idx: number, field: 'wenn' | 'dann', val: string) {
    const s = schritte.find(s => s.id === id)
    if (!s) return
    const b = [...(s.bedingungen ?? [])]
    b[idx] = { ...b[idx], [field]: val }
    update(id, { bedingungen: b })
  }

  function removeBedingung(id: string, idx: number) {
    const s = schritte.find(s => s.id === id)
    if (!s) return
    update(id, { bedingungen: (s.bedingungen ?? []).filter((_, i) => i !== idx) })
  }

  return (
    <div className="space-y-3">
      {schritte.map((s, i) => (
        <div key={s.id} className="border rounded-lg p-3 bg-slate-50 space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-white border text-xs font-bold flex items-center justify-center text-slate-500 flex-shrink-0">
              {i + 1}
            </span>
            <Select
              value={s.typ}
              onValueChange={(v: string | null) => update(s.id, { typ: (v ?? 'schritt') as SchrittTyp })}
            >
              <SelectTrigger className="w-36 h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="schritt">✅ Schritt</SelectItem>
                <SelectItem value="info">ℹ️ Info</SelectItem>
                <SelectItem value="entscheidung">⚠️ Entscheidung</SelectItem>
              </SelectContent>
            </Select>
            <Input
              className="flex-1 h-7 text-xs"
              placeholder="Titel des Schritts"
              value={s.titel}
              onChange={e => update(s.id, { titel: e.target.value })}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-red-400 hover:text-red-600 flex-shrink-0"
              onClick={() => remove(s.id)}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>

          <Textarea
            className="text-xs min-h-[60px] resize-none"
            placeholder="Erläuterung (optional)"
            value={s.inhalt ?? ''}
            onChange={e => update(s.id, { inhalt: e.target.value })}
          />

          {s.typ === 'entscheidung' && (
            <div className="space-y-2">
              {(s.bedingungen ?? []).map((b, bi) => (
                <div key={bi} className="flex items-center gap-1">
                  <span className="text-xs text-amber-600 font-medium flex-shrink-0">Wenn</span>
                  <Input
                    className="flex-1 h-6 text-xs"
                    placeholder="Bedingung"
                    value={b.wenn}
                    onChange={e => updateBedingung(s.id, bi, 'wenn', e.target.value)}
                  />
                  <ArrowRight className="w-3 h-3 text-slate-400 flex-shrink-0" />
                  <span className="text-xs text-green-600 font-medium flex-shrink-0">Dann</span>
                  <Input
                    className="flex-1 h-6 text-xs"
                    placeholder="Maßnahme"
                    value={b.dann}
                    onChange={e => updateBedingung(s.id, bi, 'dann', e.target.value)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-slate-400"
                    onClick={() => removeBedingung(s.id, bi)}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => addBedingung(s.id)}>
                + Bedingung
              </Button>
            </div>
          )}
        </div>
      ))}

      <Button variant="outline" size="sm" className="w-full text-xs" onClick={add}>
        <Plus className="w-3.5 h-3.5 mr-1" />
        Schritt hinzufügen
      </Button>
    </div>
  )
}

// ── Form Dialog ───────────────────────────────────────────────────────────────

interface FormState {
  titel:        string
  kategorie:    string
  beschreibung: string
  inhalt:       string
  userId:       string
  fuerRolle:    string
  objektId:     string
  budgetGrenze: string
  sortierung:   string
  schritte:     Schritt[]
}

function emptyForm(): FormState {
  return {
    titel: '', kategorie: '', beschreibung: '', inhalt: '',
    userId: '', fuerRolle: '', objektId: '',
    budgetGrenze: '', sortierung: '0', schritte: [],
  }
}

function formFromItem(item: Leitfaden): FormState {
  return {
    titel:        item.titel,
    kategorie:    item.kategorie ?? '',
    beschreibung: item.beschreibung ?? '',
    inhalt:       item.inhalt ?? '',
    userId:       item.userId ?? '',
    fuerRolle:    item.fuerRolle ?? '',
    objektId:     item.objektId ?? '',
    budgetGrenze: item.budgetGrenze != null ? String(item.budgetGrenze) : '',
    sortierung:   String(item.sortierung),
    schritte:     item.schritte ?? [],
  }
}

function formToBody(f: FormState) {
  return {
    titel:        f.titel.trim(),
    kategorie:    f.kategorie || null,
    beschreibung: f.beschreibung || null,
    inhalt:       f.inhalt || null,
    userId:       f.userId || null,
    fuerRolle:    f.userId ? null : (f.fuerRolle || null),
    objektId:     f.objektId || null,
    budgetGrenze: f.budgetGrenze ? parseFloat(f.budgetGrenze) : null,
    sortierung:   parseInt(f.sortierung) || 0,
    schritte:     f.schritte,
  }
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function LeitfadenPage() {
  const qc = useQueryClient()
  const currentUser = getUser()
  const isAdmin = currentUser?.rolle === 'admin' || currentUser?.rolle === 'verwalter'

  const [adminView,    setAdminView]    = useState(false)
  const [search,       setSearch]       = useState('')
  const [filterKat,    setFilterKat]    = useState('')
  const [dialogOpen,   setDialogOpen]   = useState(false)
  const [editItem,     setEditItem]     = useState<Leitfaden | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Leitfaden | null>(null)
  const [form,         setForm]         = useState<FormState>(emptyForm)

  // ── Queries ──
  const endpoint = adminView && isAdmin ? '/leitfaden/admin' : '/leitfaden'
  const { data: items = [], isLoading } = useQuery<Leitfaden[]>({
    queryKey: ['leitfaden', adminView],
    queryFn: () => api.get(endpoint).then(r => r.data.data),
  })

  const { data: objekteRes } = useQuery({
    queryKey: ['objekte-mini'],
    queryFn: () => api.get('/objekte', { params: { pageSize: 200 } }).then(r => r.data.data as Objekt[]),
    enabled: isAdmin,
  })

  const { data: usersRes } = useQuery<UserFull[]>({
    queryKey: ['users-mini'],
    queryFn: () => api.get('/auth/users').then(r => r.data.data as UserFull[]),
    enabled: isAdmin,
  })

  // ── Mutations ──
  const createMut = useMutation({
    mutationFn: (body: unknown) => api.post('/leitfaden', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leitfaden'] }); setDialogOpen(false) },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: unknown }) => api.patch(`/leitfaden/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leitfaden'] }); setDialogOpen(false) },
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/leitfaden/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leitfaden'] }); setDeleteTarget(null) },
  })

  // ── Filter ──
  const filtered = useMemo(() => {
    const s = search.toLowerCase()
    return items.filter(it => {
      if (filterKat && it.kategorie !== filterKat) return false
      if (!s) return true
      return (
        it.titel.toLowerCase().includes(s) ||
        it.beschreibung?.toLowerCase().includes(s) ||
        it.inhalt?.toLowerCase().includes(s) ||
        it.objekt?.bezeichnung.toLowerCase().includes(s)
      )
    })
  }, [items, search, filterKat])

  // ── Group by category ──
  const grouped = useMemo(() => {
    const map = new Map<string, Leitfaden[]>()
    filtered.forEach(it => {
      const k = it.kategorie ?? 'Sonstiges'
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(it)
    })
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, 'de'))
  }, [filtered])

  // ── Handlers ──
  function openCreate() {
    setEditItem(null)
    setForm(emptyForm())
    setDialogOpen(true)
  }

  function openEdit(item: Leitfaden) {
    setEditItem(item)
    setForm(formFromItem(item))
    setDialogOpen(true)
  }

  function handleSave() {
    const body = formToBody(form)
    if (!body.titel) return
    if (editItem) {
      updateMut.mutate({ id: editItem.id, body })
    } else {
      createMut.mutate(body)
    }
  }

  const saving = createMut.isPending || updateMut.isPending
  const allKats = useMemo(() => Array.from(new Set(items.map(i => i.kategorie).filter(Boolean))) as string[], [items])

  // ── UI ──────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Firmenleitfaden</h1>
            <p className="text-sm text-slate-500">
              {adminView ? 'Alle Einträge verwalten' : 'Deine persönlichen Richtlinien & Entscheidungshilfen'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button
              variant={adminView ? 'default' : 'outline'}
              size="sm"
              onClick={() => setAdminView(v => !v)}
              className="text-xs"
            >
              <Layers className="w-3.5 h-3.5 mr-1.5" />
              {adminView ? 'Meine Ansicht' : 'Alle verwalten'}
            </Button>
          )}
          {isAdmin && (
            <Button size="sm" onClick={openCreate} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              <Plus className="w-4 h-4 mr-1.5" />
              Neu
            </Button>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
          <Input
            className="pl-8 h-9 text-sm"
            placeholder="Suchen…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {allKats.length > 1 && (
          <Select
            value={filterKat || '__alle__'}
            onValueChange={(v: string | null) => setFilterKat(!v || v === '__alle__' ? '' : v)}
          >
            <SelectTrigger className="h-9 w-52 text-sm">
              <SelectValue placeholder="Alle Kategorien" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__alle__">Alle Kategorien</SelectItem>
              {allKats.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="text-center py-16 text-slate-400">
          <BookOpen className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p>Lade Leitfaden…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="font-medium">
            {items.length === 0 ? 'Noch keine Einträge vorhanden' : 'Keine Einträge gefunden'}
          </p>
          {items.length === 0 && isAdmin && (
            <p className="text-sm mt-1">Klicke auf „Neu" um den ersten Leitfaden-Eintrag zu erstellen.</p>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map(([kat, entries]) => (
            <div key={kat}>
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${categoryColor(kat)}`}>{kat}</span>
                <span className="text-xs text-slate-400">{entries.length} Eintrag{entries.length !== 1 ? 'einträge' : ''}</span>
              </div>
              <div className="space-y-3">
                {entries.map(item => (
                  <LeitfadenCard
                    key={item.id}
                    item={item}
                    canEdit={isAdmin}
                    onEdit={() => openEdit(item)}
                    onDelete={() => setDeleteTarget(item)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Create / Edit Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem ? 'Eintrag bearbeiten' : 'Neuer Leitfaden-Eintrag'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Titel */}
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Titel *</label>
              <Input
                placeholder="z.B. Beauftragung Kleinreparatur"
                value={form.titel}
                onChange={e => setForm(f => ({ ...f, titel: e.target.value }))}
              />
            </div>

            {/* Kategorie */}
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Kategorie</label>
              <Select
                value={form.kategorie || '__leer__'}
                onValueChange={(v: string | null) => setForm(f => ({ ...f, kategorie: (!v || v === '__leer__') ? '' : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Kategorie wählen…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__leer__">— Keine —</SelectItem>
                  {KATEGORIEN.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Sichtbarkeit */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Sichtbar für Person</label>
                <Select
                  value={form.userId || '__alle__'}
                  onValueChange={(v: string | null) => setForm(f => ({ ...f, userId: (!v || v === '__alle__') ? '' : v, fuerRolle: '' }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Person auswählen…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__alle__">— Alle / nach Rolle —</SelectItem>
                    {(usersRes ?? []).map(u => (
                      <SelectItem key={u.id} value={u.id}>
                        {[u.vorname, u.nachname].filter(Boolean).join(' ') || u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Oder für Rolle</label>
                <Select
                  value={form.fuerRolle || '__alle__'}
                  onValueChange={(v: string | null) => setForm(f => ({ ...f, fuerRolle: (!v || v === '__alle__') ? '' : v }))}
                  disabled={Boolean(form.userId)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Rolle wählen…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__alle__">— Alle Rollen —</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="verwalter">Verwalter</SelectItem>
                    <SelectItem value="assistent">Assistent</SelectItem>
                    <SelectItem value="eigentuemer_readonly">Eigentümer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Objekt + Budget */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Bezieht sich auf Objekt</label>
                <Select
                  value={form.objektId || '__alle__'}
                  onValueChange={(v: string | null) => setForm(f => ({ ...f, objektId: (!v || v === '__alle__') ? '' : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Objekt wählen…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__alle__">— Alle Objekte —</SelectItem>
                    {(objekteRes ?? []).map(o => (
                      <SelectItem key={o.id} value={o.id}>{o.bezeichnung} ({o.stadt})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Budget-Grenze (€)</label>
                <Input
                  type="number"
                  placeholder="z.B. 500"
                  value={form.budgetGrenze}
                  onChange={e => setForm(f => ({ ...f, budgetGrenze: e.target.value }))}
                />
              </div>
            </div>

            {/* Kurzbeschreibung */}
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Kurzbeschreibung</label>
              <Input
                placeholder="Kurze Zusammenfassung (erscheint in der Übersicht)"
                value={form.beschreibung}
                onChange={e => setForm(f => ({ ...f, beschreibung: e.target.value }))}
              />
            </div>

            {/* Hauptinhalt */}
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Ausführlicher Inhalt</label>
              <Textarea
                placeholder="Detaillierte Beschreibung, Hintergrund, Beispiele…"
                className="min-h-[100px] resize-none"
                value={form.inhalt}
                onChange={e => setForm(f => ({ ...f, inhalt: e.target.value }))}
              />
            </div>

            {/* Schritte */}
            <div>
              <label className="text-xs font-medium text-slate-600 mb-2 block">Vorgehensschritte & Entscheidungsbaum</label>
              <SchrittEditor
                schritte={form.schritte}
                onChange={schritte => setForm(f => ({ ...f, schritte }))}
              />
            </div>

            {/* Sortierung */}
            <div className="w-32">
              <label className="text-xs font-medium text-slate-600 mb-1 block">Sortierung</label>
              <Input
                type="number"
                value={form.sortierung}
                onChange={e => setForm(f => ({ ...f, sortierung: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
            <Button
              onClick={handleSave}
              disabled={!form.titel.trim() || saving}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              <Save className="w-4 h-4 mr-1.5" />
              {saving ? 'Speichern…' : 'Speichern'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm Dialog ── */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Eintrag löschen?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            <strong>„{deleteTarget?.titel}"</strong> wird dauerhaft gelöscht.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Abbrechen</Button>
            <Button
              variant="destructive"
              disabled={deleteMut.isPending}
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
            >
              Löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
