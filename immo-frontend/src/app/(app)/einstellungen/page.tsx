'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Settings, Users, Plus, Pencil, Trash2, Check, X, ShieldCheck, Eye, Wrench, UserCog } from 'lucide-react'
import { toast } from 'sonner'
import { usersApi, type UserRolle } from '@/lib/api'
import { getUser } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const ROLLEN: { value: UserRolle; label: string; icon: React.ReactNode; desc: string }[] = [
  { value: 'admin',                label: 'Admin',         icon: <ShieldCheck className="h-3.5 w-3.5" />, desc: 'Voller Zugriff + Benutzerverwaltung' },
  { value: 'verwalter',            label: 'Verwalter',     icon: <Wrench className="h-3.5 w-3.5" />,      desc: 'Alle Funktionen, kein Benutzerzugriff' },
  { value: 'assistent',            label: 'Assistent',     icon: <UserCog className="h-3.5 w-3.5" />,     desc: 'Lesen + einfache Bearbeitungen' },
  { value: 'eigentuemer_readonly', label: 'Eigentümer',    icon: <Eye className="h-3.5 w-3.5" />,         desc: 'Nur lesen' },
]

function RolleBadge({ rolle }: { rolle: UserRolle }) {
  const r = ROLLEN.find(x => x.value === rolle)
  const colors: Record<UserRolle, string> = {
    admin:                'bg-violet-100 text-violet-700 border-violet-200',
    verwalter:            'bg-blue-100 text-blue-700 border-blue-200',
    assistent:            'bg-amber-100 text-amber-700 border-amber-200',
    eigentuemer_readonly: 'bg-slate-100 text-slate-600 border-slate-200',
  }
  return (
    <Badge className={`gap-1 text-xs font-medium border ${colors[rolle]}`}>
      {r?.icon}{r?.label ?? rolle}
    </Badge>
  )
}

interface UserFormData {
  email:    string
  password: string
  vorname:  string
  nachname: string
  rolle:    UserRolle
}

const EMPTY_FORM: UserFormData = { email: '', password: '', vorname: '', nachname: '', rolle: 'verwalter' }

export default function EinstellungenPage() {
  const qc        = useQueryClient()
  const currentUser = getUser()
  const isAdmin   = currentUser?.rolle === 'admin'

  const [showCreate, setShowCreate]   = useState(false)
  const [editUser,   setEditUser]     = useState<{ id: string; rolle: UserRolle; vorname?: string; nachname?: string } | null>(null)
  const [newPw,      setNewPw]        = useState('')
  const [form,       setForm]         = useState<UserFormData>(EMPTY_FORM)

  const { data: usersRes, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn:  usersApi.list,
  })
  const users = (usersRes as any)?.data ?? []

  const createMut = useMutation({
    mutationFn: (body: typeof form) => usersApi.create(body),
    onSuccess: () => {
      toast.success('Benutzer angelegt')
      qc.invalidateQueries({ queryKey: ['users'] })
      setShowCreate(false)
      setForm(EMPTY_FORM)
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'Fehler beim Anlegen'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => usersApi.update(id, body),
    onSuccess: () => {
      toast.success('Gespeichert')
      qc.invalidateQueries({ queryKey: ['users'] })
      setEditUser(null)
      setNewPw('')
    },
    onError: () => toast.error('Fehler beim Speichern'),
  })

  const removeMut = useMutation({
    mutationFn: (id: string) => usersApi.remove(id),
    onSuccess: () => {
      toast.success('Benutzer deaktiviert')
      qc.invalidateQueries({ queryKey: ['users'] })
    },
    onError: () => toast.error('Fehler beim Deaktivieren'),
  })

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Settings className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-[20px] font-semibold">Einstellungen</h1>
          <p className="text-sm text-muted-foreground">Team-Zugänge und Berechtigungen verwalten</p>
        </div>
      </div>

      {/* Team-Sektion */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Team-Mitglieder</CardTitle>
          </div>
          {isAdmin && (
            <Button size="sm" className="h-8 gap-1.5" onClick={() => setShowCreate(true)}>
              <Plus className="h-3.5 w-3.5" />
              Benutzer einladen
            </Button>
          )}
        </CardHeader>
        <CardDescription className="px-6 pb-3 text-xs text-muted-foreground">
          {isAdmin
            ? 'Alle Benutzer können sich unter https://enzi-immo.vercel.app mit ihrer E-Mail-Adresse anmelden.'
            : 'Nur Administratoren können Benutzer verwalten.'}
        </CardDescription>
        <CardContent className="pt-0">
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Lade…</p>
          ) : (
            <div className="space-y-2">
              {users.map((u: any) => (
                <div key={u.id} className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${!u.aktiv ? 'opacity-50' : ''}`}>
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold shrink-0">
                    {(u.vorname ?? u.email).charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {[u.vorname, u.nachname].filter(Boolean).join(' ') || u.email}
                      {u.id === currentUser?.id && <span className="ml-1.5 text-xs text-muted-foreground">(du)</span>}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <RolleBadge rolle={u.rolle} />
                    {!u.aktiv && <Badge variant="outline" className="text-xs text-muted-foreground">Inaktiv</Badge>}
                    {isAdmin && u.id !== currentUser?.id && (
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7"
                          onClick={() => setEditUser({ id: u.id, rolle: u.rolle, vorname: u.vorname, nachname: u.nachname })}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {u.aktiv && (
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => removeMut.mutate(u.id)}
                            disabled={removeMut.isPending}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Login-Info */}
      <Card className="border-blue-200 bg-blue-50/50">
        <CardContent className="py-4 flex gap-3 items-start">
          <ShieldCheck className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-blue-800">Zugang für alle Geräte</p>
            <p className="text-blue-600 mt-0.5 text-xs">
              Die App ist unter <strong>https://enzi-immo.vercel.app</strong> von jedem Gerät erreichbar.
              Jedes Team-Mitglied braucht eine eigene E-Mail + Passwort — oben anlegen.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Dialog: Neuen Benutzer anlegen */}
      <Dialog open={showCreate} onOpenChange={(o) => { setShowCreate(o); if (!o) setForm(EMPTY_FORM) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Neuen Benutzer anlegen
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Vorname</Label>
                <Input value={form.vorname} onChange={e => setForm(f => ({ ...f, vorname: e.target.value }))} placeholder="Max" className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Nachname</Label>
                <Input value={form.nachname} onChange={e => setForm(f => ({ ...f, nachname: e.target.value }))} placeholder="Mustermann" className="h-8 text-sm" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">E-Mail <span className="text-destructive">*</span></Label>
              <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="max@beispiel.de" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Passwort <span className="text-destructive">*</span> (min. 8 Zeichen)</Label>
              <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Rolle</Label>
              <Select value={form.rolle} onValueChange={v => setForm(f => ({ ...f, rolle: v as UserRolle }))}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLLEN.map(r => (
                    <SelectItem key={r.value} value={r.value}>
                      <span className="flex items-center gap-2">{r.icon}<span>{r.label}</span><span className="text-muted-foreground text-xs">— {r.desc}</span></span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>Abbrechen</Button>
            <Button size="sm" onClick={() => createMut.mutate(form)}
              disabled={!form.email || !form.password || createMut.isPending}>
              <Check className="h-3.5 w-3.5 mr-1" />
              Anlegen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Benutzer bearbeiten */}
      <Dialog open={!!editUser} onOpenChange={(o) => { if (!o) { setEditUser(null); setNewPw('') } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              Benutzer bearbeiten
            </DialogTitle>
          </DialogHeader>
          {editUser && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Vorname</Label>
                  <Input defaultValue={editUser.vorname ?? ''} id="edit-vorname" className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Nachname</Label>
                  <Input defaultValue={editUser.nachname ?? ''} id="edit-nachname" className="h-8 text-sm" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Rolle</Label>
                <Select defaultValue={editUser.rolle} onValueChange={v => setEditUser(u => u ? { ...u, rolle: v as UserRolle } : null)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLLEN.map(r => (
                      <SelectItem key={r.value} value={r.value}>{r.label} — {r.desc}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Neues Passwort <span className="text-muted-foreground">(optional)</span></Label>
                <Input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Leer lassen = nicht ändern" className="h-8 text-sm" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setEditUser(null); setNewPw('') }}>Abbrechen</Button>
            <Button size="sm" disabled={updateMut.isPending} onClick={() => {
              if (!editUser) return
              const vorname  = (document.getElementById('edit-vorname') as HTMLInputElement)?.value
              const nachname = (document.getElementById('edit-nachname') as HTMLInputElement)?.value
              updateMut.mutate({ id: editUser.id, body: {
                rolle:    editUser.rolle,
                vorname:  vorname || undefined,
                nachname: nachname || undefined,
                ...(newPw ? { password: newPw } : {}),
              }})
            }}>
              <Check className="h-3.5 w-3.5 mr-1" />
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
