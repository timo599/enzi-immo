'use client'

import { useState } from 'react'
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
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Plus, HardHat, Copy, CheckCircle2, Clock, Circle, XCircle, Pencil, Trash2, ExternalLink, AlertCircle } from 'lucide-react'
import { euro } from '@/lib/format'

// ── Typen ──────────────────────────────────────────────────────────────────────
type BauStatus = 'planung'|'aktiv'|'pausiert'|'abgeschlossen'
type TodoStatus = 'offen'|'in_bearbeitung'|'erledigt'|'abgebrochen'
type TodoPrio   = 'niedrig'|'mittel'|'hoch'|'dringend'

interface TeamMitglied { id: string; name: string; rolle: string; telefon?: string }
interface BaustelleTodo {
  id: string; titel: string; status: TodoStatus; prioritaet: TodoPrio; beschreibung?: string; faelligAm?: string
  zuweisungen: { teamMitglied: { name: string } }[]
}
interface Baustelle {
  id: string; name: string; beschreibung?: string; status: BauStatus
  zugangscode?: string
  firma?: { id: string; name: string }
  objekt?: { id: string; bezeichnung: string; strasse: string; hausnummer: string }
  zuweisungen: { teamMitglied: TeamMitglied; rolle: string }[]
  todos: BaustelleTodo[]
  startDatum?: string; endDatum?: string; budget?: number; kostenBisher?: number
  _count?: { todos: number }
}
interface Firma  { id: string; name: string }
interface Objekt { id: string; bezeichnung: string }

// ── Badges ─────────────────────────────────────────────────────────────────────
const STATUS_COLOR: Record<BauStatus, string> = {
  planung:       'bg-slate-100 text-slate-700',
  aktiv:         'bg-green-100 text-green-700',
  pausiert:      'bg-yellow-100 text-yellow-700',
  abgeschlossen: 'bg-blue-100 text-blue-700',
}
const STATUS_LABEL: Record<BauStatus, string> = {
  planung:'Planung', aktiv:'Aktiv', pausiert:'Pausiert', abgeschlossen:'Abgeschlossen',
}
const TODO_STATUS_ICON: Record<TodoStatus, React.ReactNode> = {
  offen:         <Circle className="h-3.5 w-3.5 text-slate-400" />,
  in_bearbeitung:<Clock className="h-3.5 w-3.5 text-blue-500" />,
  erledigt:      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />,
  abgebrochen:   <XCircle className="h-3.5 w-3.5 text-slate-300" />,
}
const PRIO_COLOR: Record<TodoPrio, string> = {
  niedrig:'bg-slate-100 text-slate-500', mittel:'bg-blue-100 text-blue-600',
  hoch:'bg-orange-100 text-orange-600', dringend:'bg-red-100 text-red-600',
}

const defaultForm = {
  name: '', beschreibung: '', status: 'planung' as BauStatus,
  firmaId: '', objektId: '', startDatum: '', endDatum: '',
  budget: '', kostenBisher: '', notizen: '',
  mitglieder: [] as string[], // team IDs
}

// ── Baustellen-Seite ───────────────────────────────────────────────────────────
export default function BaustellenPage() {
  const qc = useQueryClient()
  const [selected, setSelected]   = useState<Baustelle|null>(null)
  const [dialogOpen, setOpen]     = useState(false)
  const [editing, setEditing]     = useState<Baustelle|null>(null)
  const [form, setForm]           = useState(defaultForm)
  const [todoForm, setTodoForm]   = useState({ titel: '', beschreibung: '', prioritaet: 'mittel' as TodoPrio, faelligAm: '', zuweisungen: [] as string[] })
  const [todoOpen, setTodoOpen]   = useState(false)

  const { data: bauRes }   = useQuery({ queryKey:['baustellen'], queryFn: () => api.get('/baustellen').then(r => r.data.data) })
  const { data: teamRes }  = useQuery({ queryKey:['team'],       queryFn: () => api.get('/todos/team').then(r => r.data.data) })
  const { data: firmenRes }= useQuery({ queryKey:['firmen'],     queryFn: () => api.get('/firmen').then(r => r.data.data) })
  const { data: objektRes }= useQuery({ queryKey:['objekte'],    queryFn: () => api.get('/objekte', { params: { pageSize: 200 } }).then(r => r.data.data) })

  // Detailansicht
  const { data: detailRes } = useQuery({
    queryKey: ['baustelle', selected?.id],
    queryFn: () => api.get(`/baustellen/${selected!.id}`).then(r => r.data.data),
    enabled: !!selected,
  })
  const detail: Baustelle|null = detailRes ?? null

  const baustellen: Baustelle[]   = bauRes   ?? []
  const team:       TeamMitglied[]= teamRes  ?? []
  const firmen:     Firma[]        = firmenRes?? []
  const objekte:    Objekt[]       = objektRes ?? []

  const save = useMutation({
    mutationFn: (d: typeof form) => {
      const payload: any = {
        ...d,
        budget:       d.budget       ? Number(d.budget) : undefined,
        kostenBisher: d.kostenBisher ? Number(d.kostenBisher) : undefined,
        firmaId:      d.firmaId  || undefined,
        objektId:     d.objektId || undefined,
        startDatum:   d.startDatum || undefined,
        endDatum:     d.endDatum || undefined,
        mitglieder: d.mitglieder.map(id => ({ teamMitgliedId: id, rolle: 'arbeiter' })),
      }
      return editing ? api.patch(`/baustellen/${editing.id}`, payload) : api.post('/baustellen', payload)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['baustellen'] }); setOpen(false); toast.success(editing ? 'Gespeichert' : 'Baustelle angelegt') },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Fehler'),
  })

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/baustellen/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['baustellen'] }); setSelected(null); toast.success('Gelöscht') },
  })

  const addTodo = useMutation({
    mutationFn: (d: typeof todoForm) => api.post('/todos', {
      ...d,
      baustelleId: selected!.id,
      zuweisungen: d.zuweisungen,
      faelligAm: d.faelligAm || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['baustelle', selected?.id] })
      setTodoOpen(false)
      setTodoForm({ titel: '', beschreibung: '', prioritaet: 'mittel', faelligAm: '', zuweisungen: [] })
      toast.success('Aufgabe hinzugefügt')
    },
  })

  const todoStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TodoStatus }) => api.patch(`/todos/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['baustelle', selected?.id] }),
  })

  function openCreate() {
    setEditing(null); setForm(defaultForm); setOpen(true)
  }
  function openEdit(b: Baustelle) {
    setEditing(b)
    setForm({
      name: b.name, beschreibung: b.beschreibung ?? '', status: b.status,
      firmaId: b.firma?.id ?? '', objektId: b.objekt?.id ?? '',
      startDatum: b.startDatum?.slice(0,10) ?? '', endDatum: b.endDatum?.slice(0,10) ?? '',
      budget: b.budget?.toString() ?? '', kostenBisher: b.kostenBisher?.toString() ?? '',
      notizen: '', mitglieder: b.zuweisungen.map(z => z.teamMitglied.id),
    })
    setOpen(true)
  }
  function toggleMitglied(id: string) {
    setForm(f => ({ ...f, mitglieder: f.mitglieder.includes(id) ? f.mitglieder.filter(x => x !== id) : [...f.mitglieder, id] }))
  }
  function copyCode(code: string) {
    const url = `${window.location.origin}/baustelle/${code}`
    navigator.clipboard.writeText(url)
    toast.success('Bauarbeiter-Link kopiert')
  }

  const today = new Date().toISOString().slice(0,10)

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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ── Linke Spalte: Übersicht ──────────────────────────────────── */}
        <div className="space-y-3 lg:col-span-1">
          {baustellen.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl">
              <HardHat className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Noch keine Baustellen</p>
            </div>
          ) : (
            baustellen.map(b => (
              <Card
                key={b.id}
                className={`cursor-pointer transition-all hover:shadow-md ${selected?.id === b.id ? 'ring-2 ring-primary' : ''}`}
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
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                        {b._count && <span>📋 {b._count.todos} Aufgaben</span>}
                        {b.zugangscode && (
                          <button
                            onClick={e => { e.stopPropagation(); copyCode(b.zugangscode!) }}
                            className="flex items-center gap-0.5 hover:text-primary"
                          >
                            <Copy className="h-2.5 w-2.5" /> {b.zugangscode}
                          </button>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); openEdit(b) }}
                      className="p-1 hover:bg-muted rounded text-muted-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* ── Rechte Spalte: Detailansicht ─────────────────────────────── */}
        <div className="lg:col-span-2">
          {!detail ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm border-2 border-dashed rounded-xl">
              ← Baustelle auswählen
            </div>
          ) : (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{detail.name}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {detail.firma?.name}{detail.objekt ? ` · ${detail.objekt.bezeichnung}` : ''}
                        {detail.objekt && `, ${detail.objekt.strasse} ${detail.objekt.hausnummer}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {detail.zugangscode && (
                        <button
                          onClick={() => window.open(`/baustelle/${detail.zugangscode}`, '_blank')}
                          className="flex items-center gap-1 text-xs bg-orange-50 text-orange-700 border border-orange-200 px-2 py-1 rounded-lg hover:bg-orange-100"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Bauarbeiter-Ansicht
                        </button>
                      )}
                      <button onClick={() => del.mutate(detail.id)} className="text-muted-foreground hover:text-destructive p-1">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {/* Info-Zeile */}
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mb-3">
                    {detail.startDatum && <span>▶ {new Date(detail.startDatum).toLocaleDateString('de-DE')}</span>}
                    {detail.endDatum   && <span>⏹ {new Date(detail.endDatum).toLocaleDateString('de-DE')}</span>}
                    {detail.budget     && <span>💰 Budget: {euro(Number(detail.budget))}</span>}
                    {detail.kostenBisher && <span>💸 Bisher: {euro(Number(detail.kostenBisher))}</span>}
                  </div>

                  {/* Team */}
                  {detail.zuweisungen.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {detail.zuweisungen.map(z => (
                        <span key={z.teamMitglied.id} className="text-[10px] px-2 py-0.5 bg-muted rounded-full">
                          👷 {z.teamMitglied.name} <span className="opacity-60">{z.rolle}</span>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Bauarbeiter-Zugangscode */}
                  {detail.zugangscode && (
                    <div className="flex items-center gap-2 p-2 bg-orange-50 rounded-lg mb-3">
                      <HardHat className="h-4 w-4 text-orange-600 shrink-0" />
                      <div className="flex-1">
                        <p className="text-xs font-medium text-orange-800">Zugangscode für Bauarbeiter</p>
                        <p className="text-xs text-orange-600 font-mono">{window.location.origin}/baustelle/{detail.zugangscode}</p>
                      </div>
                      <button onClick={() => copyCode(detail.zugangscode!)} className="text-orange-600 hover:text-orange-800">
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Aufgaben */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">Aufgaben ({detail.todos.length})</h3>
                  <Button size="sm" variant="outline" onClick={() => setTodoOpen(true)}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Aufgabe
                  </Button>
                </div>

                {detail.todos.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6 border-2 border-dashed rounded-lg">Noch keine Aufgaben</p>
                ) : (
                  <div className="space-y-1.5">
                    {detail.todos.map(todo => {
                      const isOverdue = todo.faelligAm && todo.faelligAm.slice(0,10) < today && !['erledigt','abgebrochen'].includes(todo.status)
                      return (
                        <div key={todo.id} className={`flex items-center gap-2 p-2.5 bg-muted/30 rounded-lg border ${isOverdue ? 'border-red-200 bg-red-50/30' : 'border-transparent'}`}>
                          <button onClick={() => todoStatus.mutate({
                            id: todo.id,
                            status: todo.status === 'offen' ? 'in_bearbeitung' : todo.status === 'in_bearbeitung' ? 'erledigt' : 'offen'
                          })}>
                            {TODO_STATUS_ICON[todo.status]}
                          </button>
                          <div className="flex-1 min-w-0">
                            <span className={`text-xs ${todo.status === 'erledigt' ? 'line-through text-muted-foreground' : ''}`}>{todo.titel}</span>
                            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                              <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${PRIO_COLOR[todo.prioritaet]}`}>{todo.prioritaet}</span>
                              {todo.zuweisungen.map(z => (
                                <span key={z.teamMitglied.name} className="text-[9px] text-muted-foreground">👤 {z.teamMitglied.name}</span>
                              ))}
                              {todo.faelligAm && (
                                <span className={`text-[9px] ${isOverdue ? 'text-red-500 font-medium' : 'text-muted-foreground'}`}>
                                  📅 {new Date(todo.faelligAm).toLocaleDateString('de-DE')}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
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
              <Input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="z.B. Dachsanierung H182" />
            </div>
            <div>
              <Label>Beschreibung</Label>
              <Textarea rows={2} value={form.beschreibung} onChange={e => setForm(f => ({...f, beschreibung: e.target.value}))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({...f, status: v as BauStatus}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(['planung','aktiv','pausiert','abgeschlossen'] as BauStatus[]).map(s => (
                      <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Firma</Label>
                <Select value={form.firmaId || '__none__'} onValueChange={(v: string | null) => setForm(f => ({...f, firmaId: (!v || v === '__none__') ? '' : v}))}>
                  <SelectTrigger><SelectValue placeholder="Keine" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Keine</SelectItem>
                    {firmen.map((fi: Firma) => <SelectItem key={fi.id} value={fi.id}>{fi.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Objekt</Label>
              <Select value={form.objektId || '__none__'} onValueChange={(v: string | null) => setForm(f => ({...f, objektId: (!v || v === '__none__') ? '' : v}))}>
                <SelectTrigger><SelectValue placeholder="Kein Objekt" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Kein Objekt</SelectItem>
                  {objekte.map((o: Objekt) => <SelectItem key={o.id} value={o.id}>{o.bezeichnung}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Start</Label><Input type="date" value={form.startDatum} onChange={e => setForm(f => ({...f, startDatum: e.target.value}))} /></div>
              <div><Label>Ende</Label><Input type="date" value={form.endDatum} onChange={e => setForm(f => ({...f, endDatum: e.target.value}))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Budget (€)</Label><Input type="number" value={form.budget} onChange={e => setForm(f => ({...f, budget: e.target.value}))} placeholder="0" /></div>
              <div><Label>Kosten bisher (€)</Label><Input type="number" value={form.kostenBisher} onChange={e => setForm(f => ({...f, kostenBisher: e.target.value}))} placeholder="0" /></div>
            </div>

            {/* Team-Zuweisung */}
            <div>
              <Label>Bauarbeiter zuweisen</Label>
              {team.length === 0 ? (
                <p className="text-xs text-muted-foreground mt-1">Team unter „Aufgaben → Team" anlegen</p>
              ) : (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {team.map((m: TeamMitglied) => (
                    <button
                      key={m.id} type="button"
                      onClick={() => toggleMitglied(m.id)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        form.mitglieder.includes(m.id) ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted border-border'
                      }`}
                    >
                      {m.name} <span className="opacity-60 text-[9px]">{m.rolle}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Button
              className="w-full"
              disabled={!form.name || save.isPending}
              onClick={() => save.mutate(form)}
            >
              {save.isPending ? 'Speichere…' : editing ? 'Speichern' : 'Baustelle anlegen'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Aufgabe zur Baustelle hinzufügen ─────────────────────────────── */}
      <Dialog open={todoOpen} onOpenChange={setTodoOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Aufgabe hinzufügen</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Titel *</Label>
              <Input value={todoForm.titel} onChange={e => setTodoForm(f => ({...f, titel: e.target.value}))} placeholder="Was ist zu tun?" />
            </div>
            <div>
              <Label>Beschreibung</Label>
              <Textarea rows={2} value={todoForm.beschreibung} onChange={e => setTodoForm(f => ({...f, beschreibung: e.target.value}))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Priorität</Label>
                <Select value={todoForm.prioritaet} onValueChange={v => setTodoForm(f => ({...f, prioritaet: v as TodoPrio}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(['niedrig','mittel','hoch','dringend'] as TodoPrio[]).map(p => (
                      <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Fällig am</Label>
                <Input type="date" value={todoForm.faelligAm} onChange={e => setTodoForm(f => ({...f, faelligAm: e.target.value}))} />
              </div>
            </div>
            {detail?.zuweisungen.length ? (
              <div>
                <Label>Zuweisen an</Label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {detail.zuweisungen.map(z => (
                    <button
                      key={z.teamMitglied.id} type="button"
                      onClick={() => setTodoForm(f => ({
                        ...f,
                        zuweisungen: f.zuweisungen.includes(z.teamMitglied.id)
                          ? f.zuweisungen.filter(x => x !== z.teamMitglied.id)
                          : [...f.zuweisungen, z.teamMitglied.id]
                      }))}
                      className={`text-xs px-2 py-0.5 rounded-full border ${todoForm.zuweisungen.includes(z.teamMitglied.id) ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted border-border'}`}
                    >
                      {z.teamMitglied.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <Button
              className="w-full"
              disabled={!todoForm.titel || addTodo.isPending}
              onClick={() => addTodo.mutate(todoForm)}
            >
              {addTodo.isPending ? 'Speichere…' : 'Aufgabe hinzufügen'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
