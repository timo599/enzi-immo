'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import {
  Plus, HardHat, Copy, CheckCircle2, Clock, Circle, XCircle, Pencil,
  Trash2, ExternalLink, AlertCircle, TrendingUp, Calendar, Euro,
} from 'lucide-react'
import { euro } from '@/lib/format'

// ── Typen ──────────────────────────────────────────────────────────────────────
type BauStatus  = 'planung' | 'aktiv' | 'pausiert' | 'abgeschlossen'
type TodoStatus = 'offen' | 'in_bearbeitung' | 'erledigt' | 'abgebrochen'
type TodoPrio   = 'niedrig' | 'mittel' | 'hoch' | 'dringend'

interface TeamMitglied { id: string; name: string; rolle: string; telefon?: string }
interface BaustelleTodo {
  id: string; titel: string; status: TodoStatus; prioritaet: TodoPrio
  beschreibung?: string; faelligAm?: string
  zuweisungen: { teamMitglied: { name: string } }[]
}
interface Baustelle {
  id: string; name: string; beschreibung?: string; status: BauStatus
  zugangscode?: string
  firma?:  { id: string; name: string }
  objekt?: { id: string; bezeichnung: string; strasse: string; hausnummer: string }
  zuweisungen: { teamMitglied: TeamMitglied; rolle: string }[]
  todos: BaustelleTodo[]
  startDatum?: string; endDatum?: string; budget?: number; kostenBisher?: number
  notizen?: string
  _count?: { todos: number }
}
interface Firma  { id: string; name: string }
interface Objekt { id: string; bezeichnung: string }

// ── Konstanten ─────────────────────────────────────────────────────────────────
const STATUS_COLOR: Record<BauStatus, string> = {
  planung:       'bg-slate-100 text-slate-700',
  aktiv:         'bg-green-100 text-green-700',
  pausiert:      'bg-yellow-100 text-yellow-700',
  abgeschlossen: 'bg-blue-100 text-blue-700',
}
const STATUS_LABEL: Record<BauStatus, string> = {
  planung: 'Planung', aktiv: 'Aktiv', pausiert: 'Pausiert', abgeschlossen: 'Abgeschlossen',
}
const STATUS_ORDER: Record<BauStatus, number> = { aktiv: 0, planung: 1, pausiert: 2, abgeschlossen: 3 }

const PRIO_COLOR: Record<TodoPrio, string> = {
  niedrig:  'bg-slate-100 text-slate-500',
  mittel:   'bg-blue-100 text-blue-600',
  hoch:     'bg-orange-100 text-orange-600',
  dringend: 'bg-red-100 text-red-600',
}

function TodoStatusIcon({ status }: { status: TodoStatus }) {
  if (status === 'offen')          return <Circle className="h-3.5 w-3.5 text-slate-400" />
  if (status === 'in_bearbeitung') return <Clock className="h-3.5 w-3.5 text-blue-500" />
  if (status === 'erledigt')       return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
  return <XCircle className="h-3.5 w-3.5 text-slate-300" />
}

// Fortschrittsbalken
function ProgressBar({ done, total, color = 'bg-green-500' }: { done: number; total: number; color?: string }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-muted-foreground shrink-0">{done}/{total}</span>
    </div>
  )
}

const defaultForm = {
  name: '', beschreibung: '', status: 'planung' as BauStatus,
  firmaId: '', objektId: '', startDatum: '', endDatum: '',
  budget: '', kostenBisher: '', notizen: '',
  mitglieder: [] as string[],
}
const defaultTodoForm = {
  titel: '', beschreibung: '', prioritaet: 'mittel' as TodoPrio, faelligAm: '', zuweisungen: [] as string[],
}

// ── Hauptseite ─────────────────────────────────────────────────────────────────
export default function BaustellenPage() {
  const qc = useQueryClient()
  const [selected,     setSelected]   = useState<Baustelle | null>(null)
  const [dialogOpen,   setOpen]       = useState(false)
  const [editing,      setEditing]    = useState<Baustelle | null>(null)
  const [form,         setForm]       = useState(defaultForm)
  const [todoOpen,     setTodoOpen]   = useState(false)
  const [todoForm,     setTodoForm]   = useState(defaultTodoForm)
  const [filterStatus, setFilterStatus] = useState<BauStatus | 'alle'>('alle')
  const [delConfirm,   setDelConfirm] = useState<string | null>(null)

  const { data: bauRes }    = useQuery({ queryKey: ['baustellen'],        queryFn: () => api.get('/baustellen').then(r => r.data.data) })
  const { data: teamRes }   = useQuery({ queryKey: ['team'],              queryFn: () => api.get('/todos/team').then(r => r.data.data) })
  const { data: firmenRes } = useQuery({ queryKey: ['firmen'],            queryFn: () => api.get('/firmen').then(r => r.data.data) })
  const { data: objektRes } = useQuery({ queryKey: ['objekte'],           queryFn: () => api.get('/objekte', { params: { pageSize: 200 } }).then(r => r.data.data) })
  const { data: detailRes } = useQuery({
    queryKey: ['baustelle', selected?.id],
    queryFn: () => api.get(`/baustellen/${selected!.id}`).then(r => r.data.data),
    enabled: !!selected,
  })

  const allBaustellen: Baustelle[]   = bauRes    ?? []
  const team:          TeamMitglied[]= teamRes   ?? []
  const firmen:        Firma[]       = firmenRes ?? []
  const objekte:       Objekt[]      = objektRes ?? []
  const detail:        Baustelle | null = detailRes ?? null

  // Gefiltert + sortiert
  const baustellen = useMemo(() => {
    let list = filterStatus === 'alle'
      ? [...allBaustellen]
      : allBaustellen.filter(b => b.status === filterStatus)
    return list.sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9))
  }, [allBaustellen, filterStatus])

  // Stats
  const stats = useMemo(() => ({
    aktiv:   allBaustellen.filter(b => b.status === 'aktiv').length,
    planung: allBaustellen.filter(b => b.status === 'planung').length,
    done:    allBaustellen.filter(b => b.status === 'abgeschlossen').length,
  }), [allBaustellen])

  const today = new Date().toISOString().slice(0, 10)

  // ── Mutationen ─────────────────────────────────────────────────────────────
  const save = useMutation({
    mutationFn: (d: typeof form) => {
      const payload: any = {
        ...d,
        budget:       d.budget       ? Number(d.budget)       : undefined,
        kostenBisher: d.kostenBisher ? Number(d.kostenBisher) : undefined,
        firmaId:      d.firmaId   || undefined,
        objektId:     d.objektId  || undefined,
        startDatum:   d.startDatum || undefined,
        endDatum:     d.endDatum   || undefined,
        mitglieder:   d.mitglieder.map(id => ({ teamMitgliedId: id, rolle: 'arbeiter' })),
      }
      return editing ? api.patch(`/baustellen/${editing.id}`, payload) : api.post('/baustellen', payload)
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['baustellen'] })
      if (editing) qc.invalidateQueries({ queryKey: ['baustelle', editing.id] })
      setOpen(false)
      toast.success(editing ? 'Gespeichert' : 'Baustelle angelegt')
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Fehler'),
  })

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/baustellen/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['baustellen'] })
      setSelected(null)
      setDelConfirm(null)
      toast.success('Baustelle gelöscht')
    },
  })

  const addTodo = useMutation({
    mutationFn: (d: typeof todoForm) => api.post('/todos', {
      ...d,
      baustelleId: selected!.id,
      faelligAm: d.faelligAm || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['baustelle', selected?.id] })
      setTodoOpen(false)
      setTodoForm(defaultTodoForm)
      toast.success('Aufgabe hinzugefügt')
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Fehler'),
  })

  const delTodo = useMutation({
    mutationFn: (id: string) => api.delete(`/todos/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['baustelle', selected?.id] }); toast.success('Aufgabe gelöscht') },
  })

  const todoStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TodoStatus }) => api.patch(`/todos/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['baustelle', selected?.id] }),
  })

  // ── Hilfsfunktionen ────────────────────────────────────────────────────────
  function openCreate() { setEditing(null); setForm(defaultForm); setOpen(true) }
  function openEdit(b: Baustelle) {
    setEditing(b)
    setForm({
      name: b.name, beschreibung: b.beschreibung ?? '', status: b.status,
      firmaId: b.firma?.id ?? '', objektId: b.objekt?.id ?? '',
      startDatum: b.startDatum?.slice(0, 10) ?? '', endDatum: b.endDatum?.slice(0, 10) ?? '',
      budget: b.budget?.toString() ?? '', kostenBisher: b.kostenBisher?.toString() ?? '',
      notizen: b.notizen ?? '',
      mitglieder: b.zuweisungen.map(z => z.teamMitglied.id),
    })
    setOpen(true)
  }
  function toggleMitglied(id: string) {
    setForm(f => ({ ...f, mitglieder: f.mitglieder.includes(id) ? f.mitglieder.filter(x => x !== id) : [...f.mitglieder, id] }))
  }
  function toggleTodoMitglied(id: string) {
    setTodoForm(f => ({ ...f, zuweisungen: f.zuweisungen.includes(id) ? f.zuweisungen.filter(x => x !== id) : [...f.zuweisungen, id] }))
  }

  function copyCode(code: string) {
    const url = `${window.location.origin}/baustelle/${code}`
    navigator.clipboard.writeText(url).then(() => toast.success('Link kopiert!'))
  }
  function shareWhatsApp(code: string, name: string) {
    const url = `${window.location.origin}/baustelle/${code}`
    window.open(`https://wa.me/?text=${encodeURIComponent(`Baustellenplan: ${name}\n${url}`)}`, '_blank')
  }

  // Todo-Fortschritt für Karte
  function todoProgress(b: Baustelle) {
    const total = b._count?.todos ?? b.todos?.length ?? 0
    const done  = b.todos?.filter(t => t.status === 'erledigt').length ?? 0
    return { done, total }
  }

  const BAU_STATI: (BauStatus | 'alle')[] = ['alle', 'aktiv', 'planung', 'pausiert', 'abgeschlossen']

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 max-w-6xl mx-auto">
      <PageHeader
        title="Baustellen"
        description="Bauprojekte planen, Aufgaben verwalten & Bauarbeiter-Zugang"
        action={
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" /> Neue Baustelle
          </Button>
        }
      />

      {/* ── Mini-Stats ──────────────────────────────────────────────────── */}
      <div className="flex gap-3 flex-wrap">
        {[
          { label: 'Aktiv',        value: stats.aktiv,   color: 'text-green-700',  bg: 'bg-green-50',  filter: 'aktiv' as const },
          { label: 'In Planung',   value: stats.planung, color: 'text-slate-700',  bg: 'bg-slate-50',  filter: 'planung' as const },
          { label: 'Abgeschlossen',value: stats.done,    color: 'text-blue-700',   bg: 'bg-blue-50',   filter: 'abgeschlossen' as const },
        ].map(s => (
          <button
            key={s.label}
            onClick={() => setFilterStatus(filterStatus === s.filter ? 'alle' : s.filter)}
            className={`flex-1 min-w-[90px] rounded-xl border p-2.5 text-left hover:shadow-sm transition-all ${s.bg} ${filterStatus === s.filter ? 'ring-2 ring-primary' : ''}`}
          >
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className={`text-[11px] font-medium ${s.color} opacity-80`}>{s.label}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">

        {/* ── Linke Spalte: Liste ───────────────────────────────────────── */}
        <div className="space-y-2">
          {/* Status-Filter */}
          <div className="flex gap-1 flex-wrap">
            {BAU_STATI.map(s => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`text-[11px] px-2 py-1 rounded-lg border transition-colors ${
                  filterStatus === s
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted'
                }`}
              >
                {s === 'alle' ? 'Alle' : STATUS_LABEL[s as BauStatus]}
                {s !== 'alle' && (
                  <span className="ml-1 opacity-60">
                    {allBaustellen.filter(b => b.status === s).length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {baustellen.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl">
              <HardHat className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Keine Baustellen</p>
            </div>
          ) : (
            baustellen.map(b => {
              const { done, total } = todoProgress(b)
              return (
                <Card
                  key={b.id}
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    selected?.id === b.id ? 'ring-2 ring-primary shadow-md' : ''
                  } ${b.status === 'abgeschlossen' ? 'opacity-70' : ''}`}
                  onClick={() => setSelected(b)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm">{b.name}</p>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLOR[b.status]}`}>
                            {STATUS_LABEL[b.status]}
                          </span>
                        </div>
                        {b.objekt && <p className="text-xs text-muted-foreground mt-0.5">🏠 {b.objekt.bezeichnung}</p>}
                        {b.firma  && <p className="text-xs text-muted-foreground">🏢 {b.firma.name}</p>}

                        {/* Fortschrittsbalken */}
                        {total > 0 && (
                          <div className="mt-2">
                            <ProgressBar done={done} total={total} />
                          </div>
                        )}

                        {/* Daten */}
                        <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground flex-wrap">
                          {b.startDatum && (
                            <span>📅 {new Date(b.startDatum).toLocaleDateString('de-DE')}</span>
                          )}
                          {b.zugangscode && (
                            <button
                              onClick={e => { e.stopPropagation(); copyCode(b.zugangscode!) }}
                              className="flex items-center gap-0.5 hover:text-primary font-mono"
                              title="Link kopieren"
                            >
                              <Copy className="h-2.5 w-2.5" /> {b.zugangscode}
                            </button>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); openEdit(b) }}
                        className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground shrink-0"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>

        {/* ── Rechte Spalte: Detail ─────────────────────────────────────── */}
        <div>
          {!detail ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm border-2 border-dashed rounded-xl gap-2">
              <HardHat className="h-8 w-8 opacity-20" />
              Baustelle auswählen
            </div>
          ) : (
            <div className="space-y-4">

              {/* ── Kopfkarte ──────────────────────────────────────────── */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-base">{detail.name}</CardTitle>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLOR[detail.status]}`}>
                          {STATUS_LABEL[detail.status]}
                        </span>
                      </div>
                      {(detail.firma || detail.objekt) && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {detail.firma?.name}
                          {detail.objekt ? `${detail.firma ? ' · ' : ''}${detail.objekt.bezeichnung}` : ''}
                          {detail.objekt?.strasse ? `, ${detail.objekt.strasse} ${detail.objekt.hausnummer}` : ''}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => openEdit(detail)}
                        className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground"
                        title="Bearbeiten"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setDelConfirm(detail.id)}
                        className="p-1.5 hover:bg-red-50 rounded-lg text-muted-foreground hover:text-red-500"
                        title="Löschen"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-0 space-y-3">
                  {/* Info-Zeile */}
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {detail.startDatum && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(detail.startDatum).toLocaleDateString('de-DE')}
                        {detail.endDatum && ` → ${new Date(detail.endDatum).toLocaleDateString('de-DE')}`}
                      </span>
                    )}
                    {detail.budget && (
                      <span className="flex items-center gap-1">
                        <Euro className="h-3 w-3" />
                        Budget: {euro(Number(detail.budget))}
                      </span>
                    )}
                  </div>

                  {/* Budget-Gauge */}
                  {detail.budget && detail.kostenBisher && (
                    <div>
                      <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                        <span>Kosten bisher: {euro(Number(detail.kostenBisher))}</span>
                        <span>{Math.round((Number(detail.kostenBisher) / Number(detail.budget)) * 100)}% von Budget</span>
                      </div>
                      <ProgressBar
                        done={Number(detail.kostenBisher)}
                        total={Number(detail.budget)}
                        color={Number(detail.kostenBisher) / Number(detail.budget) > 0.9 ? 'bg-red-500' : 'bg-primary'}
                      />
                    </div>
                  )}

                  {/* Beschreibung */}
                  {detail.beschreibung && (
                    <p className="text-xs text-muted-foreground">{detail.beschreibung}</p>
                  )}

                  {/* Team */}
                  {detail.zuweisungen.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {detail.zuweisungen.map(z => (
                        <span key={z.teamMitglied.id} className="text-[10px] px-2 py-0.5 bg-muted rounded-full flex items-center gap-1">
                          👷 {z.teamMitglied.name}
                          {z.teamMitglied.telefon && (
                            <a
                              href={`tel:${z.teamMitglied.telefon}`}
                              onClick={e => e.stopPropagation()}
                              className="text-primary hover:underline"
                            >
                              {z.teamMitglied.telefon}
                            </a>
                          )}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Zugangscode / Bauarbeiter-Link */}
                  {detail.zugangscode && (
                    <div className="rounded-xl border border-orange-200 bg-orange-50 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <HardHat className="h-4 w-4 text-orange-600 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-orange-800">Bauarbeiter-Zugangscode</p>
                          <p className="text-[11px] font-mono text-orange-700 break-all">
                            {typeof window !== 'undefined' ? `${window.location.origin}/baustelle/` : '/baustelle/'}
                            <span className="font-bold">{detail.zugangscode}</span>
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => copyCode(detail.zugangscode!)}
                          className="flex-1 flex items-center justify-center gap-1.5 text-xs bg-white text-orange-700 border border-orange-200 py-1.5 rounded-lg hover:bg-orange-100 transition-colors font-medium"
                        >
                          <Copy className="h-3.5 w-3.5" /> Link kopieren
                        </button>
                        <button
                          onClick={() => shareWhatsApp(detail.zugangscode!, detail.name)}
                          className="flex-1 flex items-center justify-center gap-1.5 text-xs bg-[#25D366] text-white py-1.5 rounded-lg hover:bg-[#1da851] transition-colors font-medium"
                        >
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                            <path d="M12 0C5.373 0 0 5.373 0 12c0 2.098.545 4.07 1.494 5.785L0 24l6.395-1.673A11.934 11.934 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.885 0-3.656-.507-5.18-1.394l-.371-.22-3.796.993 1.012-3.691-.242-.382A9.95 9.95 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
                          </svg>
                          WhatsApp
                        </button>
                        <button
                          onClick={() => window.open(`/baustelle/${detail.zugangscode}`, '_blank')}
                          className="flex items-center justify-center gap-1.5 text-xs bg-white text-orange-700 border border-orange-200 px-3 py-1.5 rounded-lg hover:bg-orange-100 transition-colors"
                          title="Bauarbeiter-Ansicht öffnen"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* ── Aufgaben ───────────────────────────────────────────── */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">Aufgaben</h3>
                    {detail.todos.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {detail.todos.filter(t => t.status === 'erledigt').length}/{detail.todos.length} erledigt
                      </span>
                    )}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setTodoOpen(true)}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Aufgabe
                  </Button>
                </div>

                {/* Fortschrittsbalken Aufgaben */}
                {detail.todos.length > 0 && (
                  <div className="mb-3">
                    <ProgressBar
                      done={detail.todos.filter(t => t.status === 'erledigt').length}
                      total={detail.todos.length}
                    />
                  </div>
                )}

                {detail.todos.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6 border-2 border-dashed rounded-lg">
                    Noch keine Aufgaben — Aufgabe hinzufügen um zu starten
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {[...detail.todos]
                      .sort((a, b) => {
                        // Erledigt nach unten
                        const aD = ['erledigt','abgebrochen'].includes(a.status) ? 1 : 0
                        const bD = ['erledigt','abgebrochen'].includes(b.status) ? 1 : 0
                        if (aD !== bD) return aD - bD
                        const PRIO: Record<string, number> = { dringend:0, hoch:1, mittel:2, niedrig:3 }
                        return (PRIO[a.prioritaet] ?? 2) - (PRIO[b.prioritaet] ?? 2)
                      })
                      .map(todo => {
                        const isOverdue = todo.faelligAm && todo.faelligAm.slice(0, 10) < today
                          && !['erledigt', 'abgebrochen'].includes(todo.status)
                        return (
                          <div
                            key={todo.id}
                            className={`group flex items-start gap-2 p-2.5 rounded-lg border transition-colors ${
                              ['erledigt','abgebrochen'].includes(todo.status) ? 'opacity-50 bg-muted/20 border-transparent' :
                              isOverdue ? 'border-red-200 bg-red-50/30' : 'bg-muted/30 border-transparent hover:border-border'
                            }`}
                          >
                            <button
                              className="mt-0.5 shrink-0"
                              title={todo.status === 'offen' ? 'Starten' : todo.status === 'in_bearbeitung' ? 'Abschließen' : 'Wieder öffnen'}
                              onClick={() => todoStatus.mutate({
                                id: todo.id,
                                status: todo.status === 'offen' ? 'in_bearbeitung'
                                  : todo.status === 'in_bearbeitung' ? 'erledigt' : 'offen',
                              })}
                            >
                              <TodoStatusIcon status={todo.status} />
                            </button>

                            <div className="flex-1 min-w-0">
                              <span className={`text-xs font-medium ${
                                ['erledigt','abgebrochen'].includes(todo.status) ? 'line-through text-muted-foreground' : ''
                              }`}>
                                {todo.titel}
                              </span>
                              {todo.beschreibung && (
                                <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{todo.beschreibung}</p>
                              )}
                              <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${PRIO_COLOR[todo.prioritaet]}`}>
                                  {todo.prioritaet}
                                </span>
                                {todo.faelligAm && (
                                  <span className={`text-[10px] ${isOverdue ? 'text-red-500 font-medium' : 'text-muted-foreground'}`}>
                                    {isOverdue && <AlertCircle className="h-2.5 w-2.5 inline mr-0.5" />}
                                    📅 {new Date(todo.faelligAm).toLocaleDateString('de-DE')}
                                  </span>
                                )}
                                {todo.zuweisungen.map(z => (
                                  <span key={z.teamMitglied.name} className="text-[10px] text-muted-foreground">
                                    👤 {z.teamMitglied.name}
                                  </span>
                                ))}
                              </div>
                            </div>

                            <button
                              onClick={() => { if (confirm('Aufgabe löschen?')) delTodo.mutate(todo.id) }}
                              className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-50 rounded text-muted-foreground hover:text-red-500 transition-all shrink-0"
                              title="Löschen"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        )
                      })}
                  </div>
                )}
              </div>

              {/* Notizen */}
              {detail.notizen && (
                <Card className="bg-amber-50 border-amber-200">
                  <CardContent className="p-3">
                    <p className="text-xs font-medium text-amber-800 mb-1">📝 Notizen</p>
                    <p className="text-xs text-amber-700">{detail.notizen}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Baustelle anlegen/bearbeiten ──────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Baustelle bearbeiten' : 'Neue Baustelle'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="z.B. Dachsanierung Zentrum"
                autoFocus
              />
            </div>
            <div>
              <Label>Beschreibung</Label>
              <Textarea rows={2} value={form.beschreibung} onChange={e => setForm(f => ({ ...f, beschreibung: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as BauStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(['planung', 'aktiv', 'pausiert', 'abgeschlossen'] as BauStatus[]).map(s => (
                      <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Firma</Label>
                <Select
                  value={form.firmaId || '__none__'}
                  onValueChange={(v: string | null) => setForm(f => ({ ...f, firmaId: (!v || v === '__none__') ? '' : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Keine" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Keine</SelectItem>
                    {firmen.map(fi => <SelectItem key={fi.id} value={fi.id}>{fi.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Objekt</Label>
              <Select
                value={form.objektId || '__none__'}
                onValueChange={(v: string | null) => setForm(f => ({ ...f, objektId: (!v || v === '__none__') ? '' : v }))}
              >
                <SelectTrigger><SelectValue placeholder="Kein Objekt" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Kein Objekt</SelectItem>
                  {objekte.map(o => <SelectItem key={o.id} value={o.id}>{o.bezeichnung}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Start</Label><Input type="date" value={form.startDatum} onChange={e => setForm(f => ({ ...f, startDatum: e.target.value }))} /></div>
              <div><Label>Ende (geplant)</Label><Input type="date" value={form.endDatum} onChange={e => setForm(f => ({ ...f, endDatum: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Budget (€)</Label><Input type="number" value={form.budget} onChange={e => setForm(f => ({ ...f, budget: e.target.value }))} placeholder="0" /></div>
              <div><Label>Kosten bisher (€)</Label><Input type="number" value={form.kostenBisher} onChange={e => setForm(f => ({ ...f, kostenBisher: e.target.value }))} placeholder="0" /></div>
            </div>
            <div>
              <Label>Notizen</Label>
              <Textarea rows={2} value={form.notizen} onChange={e => setForm(f => ({ ...f, notizen: e.target.value }))} placeholder="Interne Hinweise…" />
            </div>

            {/* Team */}
            <div>
              <Label>Bauarbeiter zuweisen</Label>
              {team.length === 0 ? (
                <p className="text-xs text-muted-foreground mt-1">Team unter „Aufgaben → Team" anlegen</p>
              ) : (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {team.map(m => (
                    <button
                      key={m.id} type="button"
                      onClick={() => toggleMitglied(m.id)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        form.mitglieder.includes(m.id)
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-muted border-border hover:bg-muted/80'
                      }`}
                    >
                      {m.name} <span className="opacity-50 text-[9px]">{m.rolle}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Button className="w-full" disabled={!form.name || save.isPending} onClick={() => save.mutate(form)}>
              {save.isPending ? 'Speichere…' : editing ? 'Speichern' : 'Baustelle anlegen'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Aufgabe hinzufügen ────────────────────────────────────────────── */}
      <Dialog open={todoOpen} onOpenChange={setTodoOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Aufgabe hinzufügen</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Titel *</Label>
              <Input
                value={todoForm.titel}
                onChange={e => setTodoForm(f => ({ ...f, titel: e.target.value }))}
                placeholder="Was ist zu tun?"
                autoFocus
              />
            </div>
            <div>
              <Label>Beschreibung</Label>
              <Textarea rows={2} value={todoForm.beschreibung} onChange={e => setTodoForm(f => ({ ...f, beschreibung: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Priorität</Label>
                <Select value={todoForm.prioritaet} onValueChange={v => setTodoForm(f => ({ ...f, prioritaet: v as TodoPrio }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(['niedrig', 'mittel', 'hoch', 'dringend'] as TodoPrio[]).map(p => (
                      <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Fällig am</Label>
                <Input type="date" value={todoForm.faelligAm} onChange={e => setTodoForm(f => ({ ...f, faelligAm: e.target.value }))} />
              </div>
            </div>

            {detail?.zuweisungen.length ? (
              <div>
                <Label>Zuweisen an</Label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {detail.zuweisungen.map(z => (
                    <button
                      key={z.teamMitglied.id} type="button"
                      onClick={() => toggleTodoMitglied(z.teamMitglied.id)}
                      className={`text-xs px-2 py-0.5 rounded-full border ${
                        todoForm.zuweisungen.includes(z.teamMitglied.id)
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-muted border-border'
                      }`}
                    >
                      {z.teamMitglied.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <Button className="w-full" disabled={!todoForm.titel || addTodo.isPending} onClick={() => addTodo.mutate(todoForm)}>
              {addTodo.isPending ? 'Speichere…' : 'Aufgabe hinzufügen'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Löschen-Bestätigung ───────────────────────────────────────────── */}
      <Dialog open={!!delConfirm} onOpenChange={v => !v && setDelConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Baustelle löschen?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Alle zugehörigen Aufgaben und Zuweisungen werden unwiderruflich gelöscht.
          </p>
          <div className="flex gap-2 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => setDelConfirm(null)}>Abbrechen</Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={del.isPending}
              onClick={() => delConfirm && del.mutate(delConfirm)}
            >
              {del.isPending ? 'Lösche…' : 'Löschen'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
