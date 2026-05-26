'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { Plus, CheckCircle2, Circle, Clock, XCircle, Users, Pencil, Trash2, UserPlus, AlertCircle } from 'lucide-react'
import { datum } from '@/lib/format'

// ── Typen ──────────────────────────────────────────────────────────────────────
type TodoStatus    = 'offen'|'in_bearbeitung'|'erledigt'|'abgebrochen'
type TodoPrio      = 'niedrig'|'mittel'|'hoch'|'dringend'

interface TeamMitglied { id: string; name: string; rolle: string; email?: string; telefon?: string }
interface Todo {
  id: string; titel: string; beschreibung?: string
  status: TodoStatus; prioritaet: TodoPrio; kategorie?: string
  faelligAm?: string; erledigtAm?: string; erstelltAm: string
  firma?: { id: string; name: string }
  objekt?: { id: string; bezeichnung: string }
  einheit?: { id: string; bezeichnung: string }
  zuweisungen: { teamMitglied: TeamMitglied }[]
}
interface Firma  { id: string; name: string }
interface Objekt { id: string; bezeichnung: string }

// ── Badges ─────────────────────────────────────────────────────────────────────
const PRIO_COLOR: Record<TodoPrio, string> = {
  niedrig: 'bg-slate-100 text-slate-600',
  mittel:  'bg-blue-100 text-blue-700',
  hoch:    'bg-orange-100 text-orange-700',
  dringend:'bg-red-100 text-red-700',
}
const PRIO_LABEL: Record<TodoPrio, string> = {
  niedrig:'Niedrig', mittel:'Mittel', hoch:'Hoch', dringend:'Dringend',
}
const STATUS_ICON: Record<TodoStatus, React.ReactNode> = {
  offen:         <Circle className="h-4 w-4 text-slate-400" />,
  in_bearbeitung:<Clock className="h-4 w-4 text-blue-500" />,
  erledigt:      <CheckCircle2 className="h-4 w-4 text-green-500" />,
  abgebrochen:   <XCircle className="h-4 w-4 text-slate-300" />,
}
const STATUS_LABEL: Record<TodoStatus, string> = {
  offen:'Offen', in_bearbeitung:'In Bearbeitung', erledigt:'Erledigt', abgebrochen:'Abgebrochen',
}

const defaultForm = {
  titel: '', beschreibung: '', status: 'offen' as TodoStatus, prioritaet: 'mittel' as TodoPrio,
  kategorie: '', firmaId: '', objektId: '', einheitId: '', faelligAm: '',
  zuweisungen: [] as string[],
}

// ── Haupt-Seite ────────────────────────────────────────────────────────────────
export default function TodosPage() {
  const qc = useQueryClient()
  const [filter, setFilter]     = useState<TodoStatus|'alle'>('alle')
  const [dialogOpen, setOpen]   = useState(false)
  const [teamOpen, setTeamOpen] = useState(false)
  const [editing, setEditing]   = useState<Todo|null>(null)
  const [form, setForm]         = useState(defaultForm)
  const [teamForm, setTeamForm] = useState({ name: '', email: '', telefon: '', rolle: 'mitarbeiter' })

  const { data: todosRes }  = useQuery({ queryKey:['todos', filter], queryFn: () => api.get('/todos', { params: filter !== 'alle' ? { status: filter } : {} }).then(r => r.data.data) })
  const { data: teamRes }   = useQuery({ queryKey:['team'],   queryFn: () => api.get('/todos/team').then(r => r.data.data) })
  const { data: firmenRes } = useQuery({ queryKey:['firmen'], queryFn: () => api.get('/firmen').then(r => r.data.data) })
  const { data: objekteRes }= useQuery({ queryKey:['objekte'],queryFn: () => api.get('/objekte', { params: { pageSize: 200 } }).then(r => r.data.data) })

  const todos:    Todo[]        = todosRes  ?? []
  const team:     TeamMitglied[]= teamRes   ?? []
  const firmen:   Firma[]       = firmenRes ?? []
  const objekte:  Objekt[]      = objekteRes?? []

  const saveTodo = useMutation({
    mutationFn: (d: typeof form) => editing
      ? api.patch(`/todos/${editing.id}`, d)
      : api.post('/todos', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['todos'] }); setOpen(false); toast.success(editing ? 'Gespeichert' : 'Aufgabe angelegt') },
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['team'] }); setTeamOpen(false); toast.success('Mitglied angelegt'); setTeamForm({ name:'', email:'', telefon:'', rolle:'mitarbeiter' }) },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Fehler'),
  })

  const delTeam = useMutation({
    mutationFn: (id: string) => api.delete(`/todos/team/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['team'] }); toast.success('Entfernt') },
  })

  function openCreate() {
    setEditing(null)
    setForm(defaultForm)
    setOpen(true)
  }
  function openEdit(t: Todo) {
    setEditing(t)
    setForm({
      titel: t.titel, beschreibung: t.beschreibung ?? '', status: t.status,
      prioritaet: t.prioritaet, kategorie: t.kategorie ?? '',
      firmaId: t.firma?.id ?? '', objektId: t.objekt?.id ?? '',
      einheitId: t.einheit?.id ?? '',
      faelligAm: t.faelligAm ? t.faelligAm.slice(0,10) : '',
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

  // Overdue check
  const today = new Date().toISOString().slice(0,10)

  const STATI: (TodoStatus|'alle')[] = ['alle','offen','in_bearbeitung','erledigt','abgebrochen']

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 max-w-5xl mx-auto">
      <PageHeader
        title="Aufgaben"
        description="Firmenübergreifende To-Do-Liste mit Zuweisung"
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

      {/* Filter-Tabs */}
      <Tabs value={filter} onValueChange={v => setFilter(v as any)}>
        <TabsList className="flex-wrap h-auto gap-1 bg-transparent p-0">
          {STATI.map(s => (
            <TabsTrigger
              key={s}
              value={s}
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground border border-border rounded-lg text-xs px-3 py-1.5 capitalize"
            >
              {s === 'alle' ? 'Alle' : STATUS_LABEL[s as TodoStatus]}
              {s !== 'alle' && (
                <span className="ml-1.5 bg-white/20 rounded-full px-1.5 text-[10px]">
                  {todos.filter(t => t.status === s).length}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {STATI.map(s => (
          <TabsContent key={s} value={s}>
            <div className="space-y-2 mt-3">
              {todos.filter(t => s === 'alle' || t.status === s).length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  {s === 'erledigt' ? '🎉 Keine erledigten Aufgaben' : 'Keine Aufgaben'}
                </div>
              ) : (
                todos.filter(t => s === 'alle' || t.status === s).map(todo => {
                  const isOverdue = todo.faelligAm && todo.faelligAm.slice(0,10) < today && todo.status !== 'erledigt' && todo.status !== 'abgebrochen'
                  return (
                    <Card key={todo.id} className={`transition-all hover:shadow-sm ${todo.status === 'erledigt' ? 'opacity-60' : ''} ${isOverdue ? 'border-red-200' : ''}`}>
                      <CardContent className="p-3">
                        <div className="flex items-start gap-3">
                          {/* Status-Toggle */}
                          <button
                            className="mt-0.5 shrink-0"
                            onClick={() => statusMut.mutate({ id: todo.id, status: todo.status === 'offen' ? 'in_bearbeitung' : todo.status === 'in_bearbeitung' ? 'erledigt' : 'offen' })}
                          >
                            {STATUS_ICON[todo.status]}
                          </button>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`font-medium text-sm ${todo.status === 'erledigt' ? 'line-through text-muted-foreground' : ''}`}>
                                {todo.titel}
                              </span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${PRIO_COLOR[todo.prioritaet]}`}>
                                {PRIO_LABEL[todo.prioritaet]}
                              </span>
                              {todo.kategorie && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 rounded-full text-slate-600">{todo.kategorie}</span>
                              )}
                              {isOverdue && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full flex items-center gap-0.5">
                                  <AlertCircle className="h-2.5 w-2.5" /> Überfällig
                                </span>
                              )}
                            </div>

                            {todo.beschreibung && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{todo.beschreibung}</p>
                            )}

                            <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                              {todo.firma  && <span>🏢 {todo.firma.name}</span>}
                              {todo.objekt && <span>🏠 {todo.objekt.bezeichnung}</span>}
                              {todo.faelligAm && (
                                <span className={isOverdue ? 'text-red-500 font-medium' : ''}>
                                  📅 {new Date(todo.faelligAm).toLocaleDateString('de-DE')}
                                </span>
                              )}
                              {todo.zuweisungen.length > 0 && (
                                <span className="flex items-center gap-1">
                                  👤 {todo.zuweisungen.map(z => z.teamMitglied.name).join(', ')}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => openEdit(todo)} className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => { if (confirm('Löschen?')) delTodo.mutate(todo.id) }} className="p-1 hover:bg-red-50 rounded text-muted-foreground hover:text-red-500">
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
          </TabsContent>
        ))}
      </Tabs>

      {/* ── Todo-Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Aufgabe bearbeiten' : 'Neue Aufgabe'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Titel *</Label>
              <Input value={form.titel} onChange={e => setForm(f => ({...f, titel: e.target.value}))} placeholder="Was ist zu tun?" />
            </div>
            <div>
              <Label>Beschreibung</Label>
              <Textarea rows={2} value={form.beschreibung} onChange={e => setForm(f => ({...f, beschreibung: e.target.value}))} placeholder="Details…" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Priorität</Label>
                <Select value={form.prioritaet} onValueChange={v => setForm(f => ({...f, prioritaet: v as TodoPrio}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(['niedrig','mittel','hoch','dringend'] as TodoPrio[]).map(p => (
                      <SelectItem key={p} value={p}>{PRIO_LABEL[p]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({...f, status: v as TodoStatus}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(['offen','in_bearbeitung','erledigt','abgebrochen'] as TodoStatus[]).map(s => (
                      <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Kategorie</Label>
                <Input value={form.kategorie} onChange={e => setForm(f => ({...f, kategorie: e.target.value}))} placeholder="z.B. Reinigung, Elektro…" />
              </div>
              <div>
                <Label>Fällig am</Label>
                <Input type="date" value={form.faelligAm} onChange={e => setForm(f => ({...f, faelligAm: e.target.value}))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
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
              <div>
                <Label>Objekt</Label>
                <Select value={form.objektId || '__none__'} onValueChange={(v: string | null) => setForm(f => ({...f, objektId: (!v || v === '__none__') ? '' : v}))}>
                  <SelectTrigger><SelectValue placeholder="Keines" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Keines</SelectItem>
                    {objekte.map((o: Objekt) => <SelectItem key={o.id} value={o.id}>{o.bezeichnung}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Team-Zuweisung */}
            <div>
              <Label>Zuweisen an</Label>
              {team.length === 0 ? (
                <p className="text-xs text-muted-foreground mt-1">Noch kein Team — erst Mitglieder anlegen.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {team.map((m: TeamMitglied) => (
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
                      <span className="ml-1 opacity-60 text-[9px]">{m.rolle}</span>
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
      <Dialog open={teamOpen} onOpenChange={setTeamOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Team verwalten</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Bestehendes Team */}
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {team.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Noch keine Mitglieder</p>
              ) : team.map((m: TeamMitglied) => (
                <div key={m.id} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium">{m.name}</p>
                    <p className="text-xs text-muted-foreground">{m.rolle}{m.email ? ` · ${m.email}` : ''}</p>
                  </div>
                  <button onClick={() => delTeam.mutate(m.id)} className="text-muted-foreground hover:text-destructive p-1">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="border-t pt-3">
              <p className="text-sm font-medium mb-2 flex items-center gap-1"><UserPlus className="h-4 w-4" /> Neues Mitglied</p>
              <div className="space-y-2">
                <Input placeholder="Name *" value={teamForm.name} onChange={e => setTeamForm(f => ({...f, name: e.target.value}))} />
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="E-Mail" value={teamForm.email} onChange={e => setTeamForm(f => ({...f, email: e.target.value}))} />
                  <Input placeholder="Telefon" value={teamForm.telefon} onChange={e => setTeamForm(f => ({...f, telefon: e.target.value}))} />
                </div>
                <Select value={teamForm.rolle} onValueChange={(v: string | null) => setTeamForm(f => ({...f, rolle: v ?? f.rolle}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['mitarbeiter','verwalter','handwerker','bauarbeiter','bauleiter','extern'].map(r => (
                      <SelectItem key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</SelectItem>
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
