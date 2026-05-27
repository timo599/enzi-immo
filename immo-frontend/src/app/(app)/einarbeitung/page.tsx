'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { getUser } from '@/lib/auth'
import {
  GraduationCap, Plus, Pencil, Trash2, ChevronDown, ChevronRight,
  CheckCircle2, Circle, Clock, ArrowRight, Info, AlertTriangle,
  Layers, Share2, Copy, Check, Globe, Lock, X, Save, BookOpen,
  Users, User, RefreshCw,
} from 'lucide-react'
import { Button }   from '@/components/ui/button'
import { Input }    from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge }    from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

// ── Types ─────────────────────────────────────────────────────

type ProgTyp = 'intern' | 'extern'
type FortschrittStatus = 'offen' | 'in_bearbeitung' | 'erledigt'

interface Schritt {
  id: string; typ: string; titel: string; inhalt?: string
  bedingungen?: { wenn: string; dann: string }[]
}

interface Fortschritt {
  id: string; modulId: string; status: FortschrittStatus
  notizen?: string; erledigtAm?: string
}

interface Modul {
  id: string; titel: string; beschreibung?: string; inhalt?: string
  schritte: Schritt[]; leitfadenIds: string[]
  reihenfolge: number; pflicht: boolean
  fortschritte: Fortschritt[]
  _count?: { fortschritte: number }
}

interface Einarbeitung {
  id: string; titel: string; beschreibung?: string
  typ: ProgTyp; zielRolle?: string | null
  zugangscode?: string | null; gueltigBis?: string | null
  aktiv: boolean; erstelltAm: string
  module: Modul[]
}

interface Leitfaden {
  id: string; titel: string; kategorie?: string
}

// ── Helpers ───────────────────────────────────────────────────

const ROLLEN_LABEL: Record<string, string> = {
  admin: 'Admin', verwalter: 'Verwalter',
  assistent: 'Assistent', eigentuemer_readonly: 'Eigentümer',
}

function statusIcon(s: FortschrittStatus) {
  if (s === 'erledigt')       return <CheckCircle2 className="w-4 h-4 text-green-500" />
  if (s === 'in_bearbeitung') return <Clock className="w-4 h-4 text-amber-500" />
  return <Circle className="w-4 h-4 text-slate-300" />
}

function statusLabel(s: FortschrittStatus) {
  if (s === 'erledigt')       return 'Erledigt'
  if (s === 'in_bearbeitung') return 'In Bearbeitung'
  return 'Offen'
}

function progressPct(module: Modul[]): number {
  if (!module.length) return 0
  const done = module.filter(m => m.fortschritte?.[0]?.status === 'erledigt').length
  return Math.round((done / module.length) * 100)
}

// ── Progress Bar ──────────────────────────────────────────────

function ProgressBar({ pct }: { pct: number }) {
  const color = pct === 100 ? 'bg-green-500' : pct > 50 ? 'bg-blue-500' : 'bg-slate-300'
  return (
    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

// ── Modul Card ────────────────────────────────────────────────

function ModulCard({
  modul, idx, isAdmin, onFortschritt,
}: {
  modul: Modul
  idx: number
  isAdmin: boolean
  onFortschritt: (modulId: string, status: FortschrittStatus) => void
}) {
  const [open, setOpen] = useState(false)
  const fort = modul.fortschritte?.[0]
  const status: FortschrittStatus = fort?.status ?? 'offen'

  return (
    <div className={`border rounded-lg bg-white overflow-hidden transition-all ${
      status === 'erledigt' ? 'border-green-200' : 'border-slate-200'
    }`}>
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50"
        onClick={() => setOpen(v => !v)}
      >
        <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 flex-shrink-0">
          {idx + 1}
        </span>
        {statusIcon(status)}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium truncate ${status === 'erledigt' ? 'line-through text-slate-400' : 'text-slate-800'}`}>
            {modul.titel}
          </p>
          {modul.beschreibung && (
            <p className="text-xs text-slate-400 truncate">{modul.beschreibung}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {modul.pflicht && (
            <span className="text-xs text-red-400 font-medium">Pflicht</span>
          )}
          {!isAdmin && (
            <Select
              value={status}
              onValueChange={(v: string | null) => {
                if (v) onFortschritt(modul.id, v as FortschrittStatus)
              }}
            >
              <SelectTrigger
                className="h-7 text-xs w-36 border-slate-200"
                onClick={e => e.stopPropagation()}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="offen">Offen</SelectItem>
                <SelectItem value="in_bearbeitung">In Bearbeitung</SelectItem>
                <SelectItem value="erledigt">Erledigt</SelectItem>
              </SelectContent>
            </Select>
          )}
          {isAdmin && modul._count !== undefined && (
            <span className="text-xs text-slate-400">{modul._count.fortschritte} Teilnehmer</span>
          )}
          {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
        </div>
      </div>

      {open && (modul.inhalt || modul.schritte?.length > 0) && (
        <div className="px-4 pb-4 pt-0 space-y-3 border-t bg-slate-50">
          {modul.inhalt && (
            <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap pt-3">{modul.inhalt}</p>
          )}
          {modul.schritte?.length > 0 && (
            <div className={modul.inhalt ? '' : 'pt-3'}>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Schritte</p>
              <div className="space-y-1.5">
                {modul.schritte.map((s, si) => (
                  <div key={s.id} className="flex items-start gap-2 text-sm">
                    <span className="w-5 h-5 rounded-full bg-white border text-xs font-bold flex items-center justify-center text-slate-400 flex-shrink-0 mt-0.5">
                      {si + 1}
                    </span>
                    <div className="flex-1">
                      <p className="font-medium text-slate-700">{s.titel}</p>
                      {s.inhalt && <p className="text-xs text-slate-500 mt-0.5">{s.inhalt}</p>}
                      {s.bedingungen?.map((b, bi) => (
                        <div key={bi} className="flex items-center gap-1 mt-1 text-xs bg-amber-50 px-2 py-1 rounded">
                          <span className="text-amber-600 font-medium">Wenn</span>
                          <span className="text-amber-800">{b.wenn}</span>
                          <ArrowRight className="w-3 h-3 text-amber-400" />
                          <span className="text-amber-600 font-medium">Dann</span>
                          <span className="text-amber-800">{b.dann}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Program Card ──────────────────────────────────────────────

function ProgramCard({
  item, isAdmin, onEdit, onDelete, onFortschritt, onCopyLink,
}: {
  item: Einarbeitung
  isAdmin: boolean
  onEdit: () => void
  onDelete: () => void
  onFortschritt: (modulId: string, status: FortschrittStatus) => void
  onCopyLink: (code: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const pct = progressPct(item.module)

  function copyLink() {
    if (!item.zugangscode) return
    const url = `${window.location.origin}/onboarding/${item.zugangscode}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    onCopyLink(item.zugangscode)
  }

  return (
    <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              {item.typ === 'extern' ? (
                <span className="flex items-center gap-1 text-xs bg-sky-50 text-sky-700 px-2 py-0.5 rounded-full font-medium">
                  <Globe className="w-3 h-3" /> Extern / Standalone
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                  <Lock className="w-3 h-3" /> Intern
                </span>
              )}
              {item.zielRolle && (
                <span className="flex items-center gap-1 text-xs bg-violet-50 text-violet-700 px-2 py-0.5 rounded-full">
                  <Users className="w-3 h-3" />
                  {ROLLEN_LABEL[item.zielRolle] ?? item.zielRolle}
                </span>
              )}
              {item.module.length > 0 && (
                <span className="text-xs text-slate-400">{item.module.length} Module</span>
              )}
            </div>

            <h3 className="font-semibold text-slate-900 text-base">{item.titel}</h3>
            {item.beschreibung && (
              <p className="text-sm text-slate-500 mt-0.5 line-clamp-2">{item.beschreibung}</p>
            )}

            {/* Progress (nur intern für eigenen User) */}
            {!isAdmin && item.typ === 'intern' && item.module.length > 0 && (
              <div className="mt-2 space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Fortschritt</span>
                  <span>{pct}%</span>
                </div>
                <ProgressBar pct={pct} />
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            {item.typ === 'extern' && item.zugangscode && (
              <Button variant="ghost" size="icon" className="h-7 w-7" title="Link kopieren" onClick={copyLink}>
                {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
              </Button>
            )}
            {isAdmin && (
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

      {/* Expand modules */}
      {item.module.length > 0 && (
        <>
          <button
            onClick={() => setOpen(v => !v)}
            className="w-full flex items-center gap-2 px-5 py-2 text-xs text-slate-500 hover:bg-slate-50 border-t transition-colors"
          >
            {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            {open ? 'Module verbergen' : `${item.module.length} Module anzeigen`}
          </button>

          {open && (
            <div className="px-4 pb-4 space-y-2 bg-slate-50 border-t">
              <div className="pt-3 space-y-2">
                {item.module.map((m, i) => (
                  <ModulCard
                    key={m.id}
                    modul={m}
                    idx={i}
                    isAdmin={isAdmin}
                    onFortschritt={onFortschritt}
                  />
                ))}
              </div>

              {item.typ === 'extern' && item.zugangscode && (
                <div className="mt-3 bg-sky-50 border border-sky-200 rounded-lg p-3 flex items-center gap-3">
                  <Globe className="w-4 h-4 text-sky-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-sky-800">Öffentlicher Zugangscode</p>
                    <p className="text-xs text-sky-600 font-mono">{item.zugangscode}</p>
                  </div>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={copyLink}>
                    {copied ? <><Check className="w-3 h-3 mr-1" />Kopiert</> : <><Copy className="w-3 h-3 mr-1" />Link</>}
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Modul Form Row ────────────────────────────────────────────

interface ModulFormItem {
  _key: string; titel: string; beschreibung: string; inhalt: string
  reihenfolge: number; pflicht: boolean
  schritte: { id: string; typ: string; titel: string; inhalt: string }[]
}

function emptyModul(idx: number): ModulFormItem {
  return { _key: crypto.randomUUID(), titel: '', beschreibung: '', inhalt: '', reihenfolge: idx, pflicht: true, schritte: [] }
}

// ── Main Page ─────────────────────────────────────────────────

export default function EinarbeitungPage() {
  const qc = useQueryClient()
  const currentUser = getUser()
  const isAdmin = currentUser?.rolle === 'admin' || currentUser?.rolle === 'verwalter'

  const [adminView,    setAdminView]    = useState(false)
  const [dialogOpen,   setDialogOpen]   = useState(false)
  const [editItem,     setEditItem]     = useState<Einarbeitung | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Einarbeitung | null>(null)

  // Form state
  const [fTitel,    setFTitel]    = useState('')
  const [fDesc,     setFDesc]     = useState('')
  const [fTyp,      setFTyp]      = useState<ProgTyp>('intern')
  const [fRolle,    setFRolle]    = useState('')
  const [fModule,   setFModule]   = useState<ModulFormItem[]>([])

  // ── Queries ──
  const endpoint = adminView && isAdmin ? '/einarbeitung/admin' : '/einarbeitung'
  const { data: items = [], isLoading, refetch } = useQuery<Einarbeitung[]>({
    queryKey: ['einarbeitung', adminView],
    queryFn: () => api.get(endpoint).then(r => r.data.data),
  })

  const { data: leitfaeden = [] } = useQuery<Leitfaden[]>({
    queryKey: ['leitfaden-admin'],
    queryFn: () => api.get('/leitfaden/admin').then(r => r.data.data),
    enabled: isAdmin,
  })

  // ── Mutations ──
  const createMut = useMutation({
    mutationFn: (body: unknown) => api.post('/einarbeitung', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['einarbeitung'] }); setDialogOpen(false) },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: unknown }) => api.patch(`/einarbeitung/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['einarbeitung'] }); setDialogOpen(false) },
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/einarbeitung/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['einarbeitung'] }); setDeleteTarget(null) },
  })

  const fortschrittMut = useMutation({
    mutationFn: ({ modulId, status }: { modulId: string; status: FortschrittStatus }) =>
      api.patch(`/einarbeitung/module/${modulId}/fortschritt`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['einarbeitung'] }),
  })

  const codeRefreshMut = useMutation({
    mutationFn: (id: string) => api.post(`/einarbeitung/${id}/code`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['einarbeitung'] }),
  })

  // ── Split intern/extern for display ──
  const internItems  = useMemo(() => items.filter(i => i.typ === 'intern'), [items])
  const externItems  = useMemo(() => items.filter(i => i.typ === 'extern'), [items])

  // ── Handlers ──
  function openCreate() {
    setEditItem(null)
    setFTitel(''); setFDesc(''); setFTyp('intern'); setFRolle(''); setFModule([])
    setDialogOpen(true)
  }

  function openEdit(item: Einarbeitung) {
    setEditItem(item)
    setFTitel(item.titel)
    setFDesc(item.beschreibung ?? '')
    setFTyp(item.typ)
    setFRolle(item.zielRolle ?? '')
    setFModule(item.module.map(m => ({
      _key: m.id, titel: m.titel, beschreibung: m.beschreibung ?? '',
      inhalt: m.inhalt ?? '', reihenfolge: m.reihenfolge, pflicht: m.pflicht,
      schritte: m.schritte.map(s => ({ id: s.id, typ: s.typ, titel: s.titel, inhalt: s.inhalt ?? '' })),
    })))
    setDialogOpen(true)
  }

  function handleSave() {
    const body = {
      titel: fTitel.trim(), beschreibung: fDesc || null, typ: fTyp,
      zielRolle: fRolle || null,
      module: fModule.map((m, i) => ({
        titel: m.titel, beschreibung: m.beschreibung || null, inhalt: m.inhalt || null,
        reihenfolge: i, pflicht: m.pflicht,
        schritte: m.schritte.map(s => ({ id: s.id, typ: s.typ, titel: s.titel, inhalt: s.inhalt || undefined })),
      })),
    }
    if (editItem) updateMut.mutate({ id: editItem.id, body })
    else createMut.mutate(body)
  }

  function addModul() { setFModule(m => [...m, emptyModul(m.length)]) }
  function removeModul(key: string) { setFModule(m => m.filter(x => x._key !== key)) }
  function updateModul(key: string, patch: Partial<ModulFormItem>) {
    setFModule(m => m.map(x => x._key === key ? { ...x, ...patch } : x))
  }

  const saving = createMut.isPending || updateMut.isPending

  // ── UI ────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center">
            <GraduationCap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Einarbeitung & Nachfolge</h1>
            <p className="text-sm text-slate-500">
              {adminView ? 'Alle Programme verwalten' : 'Deine Einarbeitungsprogramme'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button variant={adminView ? 'default' : 'outline'} size="sm" onClick={() => setAdminView(v => !v)} className="text-xs">
              <Layers className="w-3.5 h-3.5 mr-1.5" />
              {adminView ? 'Meine Ansicht' : 'Alle verwalten'}
            </Button>
          )}
          {isAdmin && (
            <Button size="sm" onClick={openCreate} className="bg-violet-600 hover:bg-violet-700 text-white">
              <Plus className="w-4 h-4 mr-1.5" /> Neu
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-slate-400">
          <GraduationCap className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p>Lade Programme…</p>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <GraduationCap className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="font-medium">Noch keine Programme vorhanden</p>
          {isAdmin && <p className="text-sm mt-1">Klicke auf „Neu" um das erste Programm zu erstellen.</p>}
        </div>
      ) : (
        <div className="space-y-8">
          {/* Intern */}
          {internItems.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Lock className="w-4 h-4 text-indigo-500" />
                <h2 className="font-semibold text-slate-700">Interne Programme</h2>
                <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{internItems.length}</span>
              </div>
              <div className="space-y-3">
                {internItems.map(item => (
                  <ProgramCard
                    key={item.id} item={item} isAdmin={isAdmin && adminView}
                    onEdit={() => openEdit(item)}
                    onDelete={() => setDeleteTarget(item)}
                    onFortschritt={(modulId, status) => fortschrittMut.mutate({ modulId, status })}
                    onCopyLink={() => {}}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Extern */}
          {externItems.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Globe className="w-4 h-4 text-sky-500" />
                <h2 className="font-semibold text-slate-700">Externe Programme / Nachfolge</h2>
                <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{externItems.length}</span>
                <span className="text-xs text-slate-500 ml-1">— per Link teilbar, kein Login nötig</span>
              </div>
              <div className="space-y-3">
                {externItems.map(item => (
                  <ProgramCard
                    key={item.id} item={item} isAdmin={isAdmin && adminView}
                    onEdit={() => openEdit(item)}
                    onDelete={() => setDeleteTarget(item)}
                    onFortschritt={(modulId, status) => fortschrittMut.mutate({ modulId, status })}
                    onCopyLink={() => {}}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ── Create/Edit Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem ? 'Programm bearbeiten' : 'Neues Programm'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Titel *</label>
              <Input placeholder="z.B. Einarbeitung Verwalter" value={fTitel} onChange={e => setFTitel(e.target.value)} />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Beschreibung</label>
              <Textarea className="resize-none min-h-[70px]" placeholder="Ziel und Umfang des Programms…" value={fDesc} onChange={e => setFDesc(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Typ</label>
                <Select value={fTyp} onValueChange={(v: string | null) => setFTyp((v ?? 'intern') as ProgTyp)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="intern">🔒 Intern (mit Login)</SelectItem>
                    <SelectItem value="extern">🌐 Extern (Zugangscode-Link)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Ziel-Rolle (optional)</label>
                <Select value={fRolle || '__alle__'} onValueChange={(v: string | null) => setFRolle(!v || v === '__alle__' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Alle Rollen" /></SelectTrigger>
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

            {fTyp === 'extern' && (
              <div className="bg-sky-50 border border-sky-200 rounded-lg p-3 text-xs text-sky-700">
                <Globe className="w-3.5 h-3.5 inline mr-1.5" />
                Ein Zugangscode wird automatisch generiert. Der Link kann ohne Login aufgerufen werden — z.B. für BENIQUE, externe Partner oder Nachfolgeregelungen.
              </div>
            )}

            {/* Module */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-slate-600">Module ({fModule.length})</label>
              </div>
              <div className="space-y-3">
                {fModule.map((m, i) => (
                  <div key={m._key} className="border rounded-lg p-3 bg-slate-50 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-white border text-xs font-bold flex items-center justify-center text-slate-400 flex-shrink-0">
                        {i + 1}
                      </span>
                      <Input
                        className="flex-1 h-7 text-xs"
                        placeholder="Modul-Titel *"
                        value={m.titel}
                        onChange={e => updateModul(m._key, { titel: e.target.value })}
                      />
                      <label className="flex items-center gap-1.5 text-xs text-slate-500 flex-shrink-0 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={m.pflicht}
                          onChange={e => updateModul(m._key, { pflicht: e.target.checked })}
                          className="rounded"
                        />
                        Pflicht
                      </label>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400" onClick={() => removeModul(m._key)}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <Input
                      className="text-xs h-7"
                      placeholder="Kurzbeschreibung (optional)"
                      value={m.beschreibung}
                      onChange={e => updateModul(m._key, { beschreibung: e.target.value })}
                    />
                    <Textarea
                      className="text-xs resize-none min-h-[60px]"
                      placeholder="Ausführlicher Inhalt, Erläuterungen, Links…"
                      value={m.inhalt}
                      onChange={e => updateModul(m._key, { inhalt: e.target.value })}
                    />
                  </div>
                ))}
                <Button variant="outline" size="sm" className="w-full text-xs" onClick={addModul}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Modul hinzufügen
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
            <Button onClick={handleSave} disabled={!fTitel.trim() || saving} className="bg-violet-600 hover:bg-violet-700 text-white">
              <Save className="w-4 h-4 mr-1.5" />
              {saving ? 'Speichern…' : 'Speichern'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ── */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Programm löschen?</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-600">
            <strong>„{deleteTarget?.titel}"</strong> und alle zugehörigen Module & Fortschritte werden dauerhaft gelöscht.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Abbrechen</Button>
            <Button variant="destructive" disabled={deleteMut.isPending}
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}>
              Löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
