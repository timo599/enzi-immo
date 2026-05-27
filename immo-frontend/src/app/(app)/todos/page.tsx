'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import {
  Plus, CheckCircle2, Circle, Clock, XCircle, Users, Pencil, Trash2,
  UserPlus, AlertCircle, Search, X,
} from 'lucide-react'

// ── Typen ──────────────────────────────────────────────────────────────────────
type TodoStatus = 'offen' | 'in_bearbeitung' | 'erledigt' | 'abgebrochen'
type TodoPrio   = 'niedrig' | 'mittel' | 'hoch' | 'dringend'

interface TeamMitglied { id: string; name: string; rolle: string; email?: string; telefon?: string }
interface Todo {
  id: string; titel: string; beschreibung?: string
  status: TodoStatus; prioritaet: TodoPrio; kategorie?: string
  faelligAm?: string; erledigtAm?: string; erstelltAm: string
  firma?:   { id: string; name: string }
  objekt?:  { id: string; bezeichnung: string }
  einheit?: { id: string; bezeichnung: string }
  zuweisungen: { teamMitglied: TeamMitglied }[]
}
interface Firma  { id: string; name: string }
interface Objekt { id: string; bezeichnung: string }

// ── Konstanten ─────────────────────────────────────────────────────────────────
const PRIO_ORDER: Record<TodoPrio, number> = { dringend: 0, hoch: 1, mittel: 2, niedrig: 3 }

const PRIO_COLOR: Record<TodoPrio, string> = {
  niedrig: 'bg-slate-100 text-slate-600',
  mittel:  'bg-blue-100 text-blue-700',
  hoch:    'bg-orange-100 text-orange-700',
  dringend:'bg-red-100 text-red-700',
}
const PRIO_LABEL: Record<TodoPrio, string> = {
  niedrig: 'Niedrig', mittel: 'Mittel', hoch: 'Hoch', dringend: 'Dringend',
}
const STATUS_LABEL: Record<TodoStatus, string> = {
  offen: 'Offen', in_bearbeitung: 'In Bearbeitung', erledigt: 'Erledigt', abgebrochen: 'Abgebrochen',
}
const STATUS_NEXT: Record<TodoStatus, TodoStatus> = {
  offen: 'in_bearbeitung', in_bearbeitung: 'erledigt', erledigt: 'offen', abgebrochen: 'offen',
}
const STATUS_NEXT_LABEL: Record<TodoStatus, string> = {
  offen: 'Starten', in_bearbeitung: 'Abschließen', erledigt: 'Wieder öffnen', abgebrochen: 'Wieder öffnen',
}

function StatusIcon({ status, size = 'md' }: { status: TodoStatus; size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'h-3.5 w-3.5' : 'h-5 w-5'
  if (status === 'offen')          return <Circle className={`${cls} text-slate-300`} />
  if (status === 'in_bearbeitung') return <Clock className={`${cls} text-blue-500`} />
  if (status === 'erledigt')       return <CheckCircle2 className={`${cls} text-green-500`} />
  return <XCircle className={`${cls} text-slate-300`} />
}

const defaultForm = {
  titel: '', beschreibung: '', status: 'offen' as TodoStatus, prioritaet: 'mittel' as TodoPrio,
  kategorie: '', firmaId: '', objektId: '', einheitId: '', faelligAm: '',
  zuweisungen: [] as string[],
}

// ── Haupt-Seite ────────────────────────────────────────────────────────────────
export default function TodosPage() {
  const qc = useQueryClient()

  // Filter-State
  const [filterStatus,   setFilterStatus]   = useState<TodoStatus | 'alle'>('alle')
  const [filterPrio,     setFilterPrio]     = useState('')
  const [filterAssignee, setFilterAssignee] = useState('')
  const [search,         setSearch]         = useState('')

  // Dialoge
  const [dialogOpen, setOpen]   = useState(false)
  const [teamOpen, setTeamOpen] = useState(false)
  const [editing, setEditing]   = useState<Todo | null>(null)
  const [form, setForm]         = useState(defaultForm)
  const [teamForm, setTeamForm] = useState({ name: '', email: '', telefon: '', rolle: 'mitarbeiter' })
  const [editTeam, setEditTeam] = useState<TeamMitglied | null>(null)
  const [editTeamForm, setEditTeamForm] = useState({ name: '', email: '', telefon: '', rolle: '' })

  // Daten laden – immer alle, client-seitig filtern
  const { data: todosRes } = useQuery({
    queryKey: ['todos'],
    queryFn: () => api.get('/todos', { params: { pageSize: 500 } }).then(r => r.data.data),
  })
  const { data: teamRes }   = useQuery({ queryKey: ['team'],   queryFn: () => api.get('/todos/team').then(r => r.data.data) })
  const { data: firmenRes } = useQuery({ queryKey: ['firmen'], queryFn: () => api.get('/firmen').then(r => r.data.data) })
  const { data: objekteRes }= useQuery({ queryKey: ['objekte'],queryFn: () => api.get('/objekte', { params: { pageSize: 500 } }).then(r => r.data.data) })

  const todos:   Todo[]         = todosRes  ?? []
  const team:    TeamMitglied[] = teamRes   ?? []
  const firmen:  Firma[]        = firmenRes ?? []
  const objekte: Objekt[]       = objekteRes?? []

  const today = new Date().toISOString().slice(0, 10)

  // ── Stats ────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    offen:         todos.filter(t => t.status === 'offen').length,
    inBearbeitung: todos.filter(t => t.status === 'in_bearbeitung').length,
    ueberfaellig:  todos.filter(t => t.faelligAm && t.faelligAm.slice(0, 10) < today && !['erledigt', 'abgebrochen'].includes(t.status)).length,
    erledigt:      todos.filter(t => t.status === 'erledigt').length,
  }), [todos, today])

  // ── Gefilterte & sortierte Liste ─────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...todos]
    if (filterStatus !== 'alle') list = list.filter(t => t.status === filterStatus)
    if (filterPrio)     list = list.filter(t => t.prioritaet === filterPrio)
    if (filterAssignee) list = list.filter(t => t.zuweisungen.some(z => z.teamMitglied.id === filterAssignee))
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(t =>
        t.titel.toLowerCase().includes(q) ||
        t.beschreibung?.toLowerCase().includes(q) ||
        t.firma?.name.toLowerCase().includes(q) ||
        t.objekt?.bezeichnung.toLowerCase().includes(q) ||
        t.kategorie?.toLowerCase().includes(q)
      )
    }
    // Sortierung: Überfällig → Priorität → Fälligdatum → Erstelldatum
    return list.sort((a, b) => {
      const aOver = a.faelligAm && a.faelligAm.slice(0, 10) < today && !['erledigt', 'abgebrochen'].includes(a.status) ? 1 : 0
      const bOver = b.faelligAm && b.faelligAm.slice(0, 10) < today && !['erledigt', 'abgebrochen'].includes(b.status) ? 1 : 0
      if (bOver - aOver !== 0) return bOver - aOver
      const pDiff = (PRIO_ORDER[a.prioritaet] ?? 2) - (PRIO_ORDER[b.prioritaet] ?? 2)
      if (pDiff !== 0) return pDiff
      if (a.faelligAm && b.faelligAm) return a.faelligAm.localeCompare(b.faelligAm)
      if (a.faelligAm) return -1
      if (b.faelligAm) return 1
      return b.erstelltAm.localeCompare(a.erstelltAm)
    })
  }, [todos, filterStatus, filterPrio, filterAssignee, search, today])

  // ── Mutationen ────────────────────────────────────────────────────────────
  const saveTodo = useMutation({
    mutationFn: (d: typeof form) => editing
      ? api.patch(`/todos/${editing.id}`, d)
      : api.post('/todos', d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['todos'] })
      setOpen(false)
      toast.success(editing ? 'Gespeichert' : 'Aufgabe angelegt')
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Fehler'),
  })

  const delTodo = useMutation({
    mutationFn: (id: string) => api.delete(`/todos/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['todos'] }); toast.success('Gelöscht') },
  })

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TodoStatus }) => api.patch(`/todos/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['todos'] }),
  })

  const saveTeam = useMutation({
    mutationFn: (d: typeof teamForm) => api.post('/todos/team', d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team'] })
      setTeamOpen(false)
      toast.success('Mitglied angelegt')
      setTeamForm({ name: '', email: '', telefon: '', rolle: 'mitarbeiter' })
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Fehler'),
  })

  const updateTeam = useMutation({
    mutationFn: ({ id, ...d }: { id: string } & typeof editTeamForm) => api.patch(`/todos/team/${id}`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['team'] }); setEditTeam(null); toast.success('Gespeichert') },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Fehler'),
  })

  const delTeam = useMutation({
    mutationFn: (id: string) => api.delete(`/todos/team/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['team'] }); toast.success('Entfernt') },
  })

  // ── Hilfsfunktionen ───────────────────────────────────────────────────────
  function openCreate() { setEditing(null); setForm(defaultForm); setOpen(true) }
  function openEdit(t: Todo) {
    setEditing(t)
    setForm({
      titel: t.titel, beschreibung: t.beschreibung ?? '', status: t.status,
      prioritaet: t.prioritaet, kategorie: t.kategorie ?? '',
      firmaId: t.firma?.id ?? '', objektId: t.objekt?.id ?? '', einheitId: t.einheit?.id ?? '',
      faelligAm: t.faelligAm ? t.faelligAm.slice(0, 10) : '',
      zuweisungen: t.zuweisungen.map(z => z.teamMitglied.id),
    })
    setOpen(true)
  }
  function toggleZuweisung(id: string) {
    setForm(f => ({
      ...f,
      zuweisungen: f.zuweisungen.includes(id)
        ? f.zuweisungen.filter(x => x !== id)
        : [...f.zuweisungen, id],
    }))
  }
  function openEditTeam(m: TeamMitglied) {
    setEditTeam(m)
    setEditTeamForm({ name: m.name, email: m.email ?? '', telefon: m.telefon ?? '', rolle: m.rolle })
  }
  const hasActiveFilter = filterPrio || filterAssignee || search || filterStatus !== 'alle'

  const STATI: (TodoStatus | 'alle')[] = ['alle', 'offen', 'in_bearbeitung', 'erledigt', 'abgebrochen']

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6 max-w-5xl mx-auto">
      <PageHeader
        title="Aufgaben"
        description="Firmenübergreifende To-Do-Liste mit Teamzuweisung"
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setTeamOpen(true)}>
              <Users className="h-4 w-4 mr-1" /> Team
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" /> Neue Aufgabe
            </Button>
          </div>
        }
      />

      {/* ── Stat-Karten ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Offen',         value: stats.offen,         color: 'text-slate-700',  bg: 'bg-slate-50',   border: 'border-slate-200', statusFilter: 'offen' as const },
          { label: 'In Bearbeitung',value: stats.inBearbeitung, color: 'text-blue-700',   bg: 'bg-blue-50',    border: 'border-blue-200',  statusFilter: 'in_bearbeitung' as const },
          { label: 'Überfällig',    value: stats.ueberfaellig,  color: 'text-red-700',    bg: 'bg-red-50',     border: 'border-red-200',   statusFilter: 'alle' as const },
          { label: 'Erledigt',      value: stats.erledigt,      color: 'text-green-700',  bg: 'bg-green-50',   border: 'border-green-200', statusFilter: 'erledigt' as const },
        ].map(card => (
          <button
            key={card.label}
            onClick={() => setFilterStatus(card.statusFilter)}
            className={`rounded-xl border p-3 text-left transition-all hover:shadow-sm ${card.bg} ${card.border} ${filterStatus === card.statusFilter ? 'ring-2 ring-primary' : ''}`}
          >
            <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
            <p className={`text-xs font-medium mt-0.5 ${card.color} opacity-80`}>{card.label}</p>
          </button>
        ))}
      </div>

      {/* ── Filter-Zeile ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {/* Suche */}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Suche…"
            className="pl-8 h-8 text-sm"
          />
        </div>

        {/* Status-Tabs (kompakt) */}
        <div className="flex gap-1 flex-wrap">
          {STATI.map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                filterStatus === s
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border bg-background hover:bg-muted text-muted-foreground'
              }`}
            >
              {s === 'alle' ? 'Alle' : STATUS_LABEL[s as TodoStatus]}
              {s !== 'alle' && (
                <span className="ml-1 opacity-60 text-[10px]">
                  {todos.filter(t => t.status === s).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Priorität */}
        <Select value={filterPrio || '__alle__'} onValueChange={(v: string | null) => setFilterPrio(!v || v === '__alle__' ? '' : v)}>
          <SelectTrigger className="h-8 w-[130px] text-xs">
            <SelectValue placeholder="Priorität" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__alle__">Alle Prioritäten</SelectItem>
            {(['dringend', 'hoch', 'mittel', 'niedrig'] as TodoPrio[]).map(p => (
              <SelectItem key={p} value={p}>{PRIO_LABEL[p]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Person */}
        {team.length > 0 && (
          <Select value={filterAssignee || '__alle__'} onValueChange={(v: string | null) => setFilterAssignee(!v || v === '__alle__' ? '' : v)}>
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue placeholder="Person" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__alle__">Alle Personen</SelectItem>
              {team.map(m => (
                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Filter zurücksetzen */}
        {hasActiveFilter && (
          <button
            onClick={() => { setFilterStatus('alle'); setFilterPrio(''); setFilterAssignee(''); setSearch('') }}
            className="h-8 px-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg"
          >
            <X className="h-3 w-3" /> Zurücksetzen
          </button>
        )}
      </div>

      {/* ── Aufgabenliste ─────────────────────────────────────────────────── */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm">{hasActiveFilter ? 'Keine Aufgaben für diesen Filter' : 'Noch keine Aufgaben'}</p>
          </div>
        ) : (
          filtered.map(todo => {
            const isOverdue = todo.faelligAm && todo.faelligAm.slice(0, 10) < today
              && !['erledigt', 'abgebrochen'].includes(todo.status)
            const nextStatus = STATUS_NEXT[todo.status]

            return (
              <Card
                key={todo.id}
                className={`transition-all hover:shadow-sm ${
                  todo.status === 'erledigt' || todo.status === 'abgebrochen' ? 'opacity-55' : ''
                } ${isOverdue ? 'border-red-200' : ''}`}
              >
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    {/* Status-Toggle mit Tooltip */}
                    <div className="group relative mt-0.5 shrink-0">
                      <button
                        title={STATUS_NEXT_LABEL[todo.status]}
                        className="active:scale-90 transition-transform"
                        onClick={() => statusMut.mutate({ id: todo.id, status: nextStatus })}
                      >
                        <StatusIcon status={todo.status} />
                      </button>
                      <div className="absolute left-7 top-0 hidden group-hover:flex items-center bg-foreground text-background text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap z-10 pointer-events-none">
                        {STATUS_NEXT_LABEL[todo.status]}
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Titel + Badges */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`font-medium text-sm ${
                          todo.status === 'erledigt' || todo.status === 'abgebrochen'
                            ? 'line-through text-muted-foreground' : ''
                        }`}>
                          {todo.titel}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${PRIO_COLOR[todo.prioritaet]}`}>
                          {PRIO_LABEL[todo.prioritaet]}
                        </span>
                        {todo.kategorie && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 rounded-full text-slate-600">
                            {todo.kategorie}
                          </span>
                        )}
                        {isOverdue && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full flex items-center gap-0.5">
                            <AlertCircle className="h-2.5 w-2.5" /> Überfällig
                          </span>
                        )}
                      </div>

                      {/* Beschreibung */}
                      {todo.beschreibung && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{todo.beschreibung}</p>
                      )}

                      {/* Meta */}
                      <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                        {todo.firma   && <span>🏢 {todo.firma.name}</span>}
                        {todo.objekt  && <span>🏠 {todo.objekt.bezeichnung}</span>}
                        {todo.faelligAm && (
                          <span className={isOverdue ? 'text-red-500 font-medium' : ''}>
                            📅 {new Date(todo.faelligAm).toLocaleDateString('de-DE')}
                          </span>
                        )}
                        {todo.zuweisungen.length > 0 && (
                          <span>👤 {todo.zuweisungen.map(z => z.teamMitglied.name).join(', ')}</span>
                        )}
                        {todo.erledigtAm && (
                          <span className="text-green-600">
                            ✓ {new Date(todo.erledigtAm).toLocaleDateString('de-DE')}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Aktionen */}
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        onClick={() => openEdit(todo)}
                        className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                        title="Bearbeiten"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => { if (confirm('Aufgabe löschen?')) delTodo.mutate(todo.id) }}
                        className="p-1.5 hover:bg-red-50 rounded-lg text-muted-foreground hover:text-red-500 transition-colors"
                        title="Löschen"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      {filtered.length > 0 && (
        <p className="text-xs text-center text-muted-foreground pb-2">
          {filtered.length} Aufgabe{filtered.length !== 1 ? 'n' : ''}
        </p>
      )}

      {/* ── Todo-Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Aufgabe bearbeiten' : 'Neue Aufgabe'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Titel *</Label>
              <Input
                value={form.titel}
                onChange={e => setForm(f => ({ ...f, titel: e.target.value }))}
                placeholder="Was ist zu tun?"
                autoFocus
              />
            </div>
            <div>
              <Label>Beschreibung</Label>
              <Textarea
                rows={2}
                value={form.beschreibung}
                onChange={e => setForm(f => ({ ...f, beschreibung: e.target.value }))}
                placeholder="Details, Hinweise…"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Priorität</Label>
                <Select value={form.prioritaet} onValueChange={v => setForm(f => ({ ...f, prioritaet: v as TodoPrio }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(['niedrig', 'mittel', 'hoch', 'dringend'] as TodoPrio[]).map(p => (
                      <SelectItem key={p} value={p}>{PRIO_LABEL[p]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as TodoStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(['offen', 'in_bearbeitung', 'erledigt', 'abgebrochen'] as TodoStatus[]).map(s => (
                      <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Kategorie</Label>
                <Input
                  value={form.kategorie}
                  onChange={e => setForm(f => ({ ...f, kategorie: e.target.value }))}
                  placeholder="z.B. Reinigung, Elektro…"
                />
              </div>
              <div>
                <Label>Fällig am</Label>
                <Input type="date" value={form.faelligAm} onChange={e => setForm(f => ({ ...f, faelligAm: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
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
              <div>
                <Label>Objekt</Label>
                <Select
                  value={form.objektId || '__none__'}
                  onValueChange={(v: string | null) => setForm(f => ({ ...f, objektId: (!v || v === '__none__') ? '' : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Keines" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Keines</SelectItem>
                    {objekte.map(o => <SelectItem key={o.id} value={o.id}>{o.bezeichnung}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Team-Zuweisung */}
            <div>
              <Label>Zuweisen an</Label>
              {team.length === 0 ? (
                <p className="text-xs text-muted-foreground mt-1">
                  Noch kein Team — erst Mitglieder anlegen (Button „Team").
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {team.map(m => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleZuweisung(m.id)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        form.zuweisungen.includes(m.id)
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-muted border-border hover:bg-muted/80'
                      }`}
                    >
                      {m.name}
                      <span className="ml-1 opacity-50 text-[9px]">{m.rolle}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Button
              className="w-full"
              disabled={!form.titel || saveTodo.isPending}
              onClick={() => saveTodo.mutate(form)}
            >
              {saveTodo.isPending ? 'Speichere…' : editing ? 'Speichern' : 'Aufgabe anlegen'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Team-Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={teamOpen} onOpenChange={v => { setTeamOpen(v); if (!v) setEditTeam(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" /> Team verwalten
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">

            {/* Bestehendes Team */}
            <div className="space-y-1.5 max-h-52 overflow-y-auto">
              {team.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Noch keine Mitglieder</p>
              ) : team.map(m => (
                <div key={m.id}>
                  {editTeam?.id === m.id ? (
                    /* Inline-Bearbeiten */
                    <div className="space-y-2 p-2 border border-primary/30 rounded-lg bg-primary/5">
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          value={editTeamForm.name}
                          onChange={e => setEditTeamForm(f => ({ ...f, name: e.target.value }))}
                          placeholder="Name"
                          className="h-7 text-xs"
                        />
                        <Select
                          value={editTeamForm.rolle}
                          onValueChange={(v: string | null) => setEditTeamForm(f => ({ ...f, rolle: v ?? f.rolle }))}
                        >
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {['mitarbeiter','verwalter','handwerker','bauarbeiter','bauleiter','extern'].map(r => (
                              <SelectItem key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input placeholder="E-Mail" value={editTeamForm.email} onChange={e => setEditTeamForm(f => ({ ...f, email: e.target.value }))} className="h-7 text-xs" />
                        <Input placeholder="Telefon" value={editTeamForm.telefon} onChange={e => setEditTeamForm(f => ({ ...f, telefon: e.target.value }))} className="h-7 text-xs" />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm" className="flex-1 h-7 text-xs"
                          disabled={!editTeamForm.name || updateTeam.isPending}
                          onClick={() => updateTeam.mutate({ id: m.id, ...editTeamForm })}
                        >
                          Speichern
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditTeam(null)}>
                          Abbrechen
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-2 bg-muted/40 rounded-lg">
                      <div>
                        <p className="text-sm font-medium">{m.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {m.rolle}
                          {m.email    ? ` · ${m.email}` : ''}
                          {m.telefon  ? ` · ${m.telefon}` : ''}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => openEditTeam(m)} className="p-1 hover:bg-muted rounded text-muted-foreground">
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => { if (confirm(`${m.name} entfernen?`)) delTeam.mutate(m.id) }}
                          className="p-1 hover:bg-red-50 rounded text-muted-foreground hover:text-red-500"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Neues Mitglied */}
            <div className="border-t pt-3">
              <p className="text-sm font-medium mb-2 flex items-center gap-1">
                <UserPlus className="h-4 w-4" /> Neues Mitglied
              </p>
              <div className="space-y-2">
                <Input
                  placeholder="Name *"
                  value={teamForm.name}
                  onChange={e => setTeamForm(f => ({ ...f, name: e.target.value }))}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="E-Mail" value={teamForm.email} onChange={e => setTeamForm(f => ({ ...f, email: e.target.value }))} />
                  <Input placeholder="Telefon" value={teamForm.telefon} onChange={e => setTeamForm(f => ({ ...f, telefon: e.target.value }))} />
                </div>
                <Select
                  value={teamForm.rolle}
                  onValueChange={(v: string | null) => setTeamForm(f => ({ ...f, rolle: v ?? f.rolle }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['mitarbeiter', 'verwalter', 'handwerker', 'bauarbeiter', 'bauleiter', 'extern'].map(r => (
                      <SelectItem key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  className="w-full"
                  disabled={!teamForm.name || saveTeam.isPending}
                  onClick={() => saveTeam.mutate(teamForm)}
                >
                  {saveTeam.isPending ? 'Speichere…' : 'Mitglied hinzufügen'}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
