'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { UserPlus, Trash2, Key, Globe, ToggleLeft, ToggleRight } from 'lucide-react'
import { toast } from 'sonner'

interface PortalUser {
  id: string
  mieterId: string
  email: string
  aktiv: boolean
  letzterLogin: string | null
  erstelltAm: string
  mieter: { vorname: string | null; nachname: string; email: string | null } | null
}

interface Mieter {
  id: string
  vorname: string | null
  nachname: string
}

export default function PortalPage() {
  const qc = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState({ mieterId: '', email: '', passwort: '' })

  const { data: usersRes } = useQuery({
    queryKey: ['portal-users'],
    queryFn:  () => api.get<{ data: PortalUser[] }>('/portal/users').then(r => r.data.data),
  })
  const { data: mieterRes } = useQuery({
    queryKey: ['mieter-list-portal'],
    queryFn:  () => api.get<{ data: Mieter[] }>('/mieter').then(r => r.data.data),
  })

  const create = useMutation({
    mutationFn: (d: typeof form) => api.post('/portal/users', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['portal-users'] }); setDialogOpen(false); setForm({ mieterId: '', email: '', passwort: '' }); toast.success('Portalzugang angelegt') },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Fehler'),
  })

  const toggle = useMutation({
    mutationFn: ({ id, aktiv }: { id: string; aktiv: boolean }) => api.patch(`/portal/users/${id}`, { aktiv }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portal-users'] }),
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Fehler'),
  })

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/portal/users/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['portal-users'] }); toast.success('Gelöscht') },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Fehler'),
  })

  const users = usersRes ?? []
  const mieter = mieterRes ?? []

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 max-w-4xl mx-auto">
      <PageHeader
        title="Mieter-Portal"
        description="Zugänge für das Mieter-Self-Service-Portal verwalten"
        action={
          <Button onClick={() => setDialogOpen(true)} size="sm">
            <UserPlus className="h-4 w-4 mr-2" />
            Zugang anlegen
          </Button>
        }
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            Portal-URL für Mieter
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-1">Teile diesen Link mit deinen Mietern:</p>
          <code className="text-xs bg-muted px-3 py-1.5 rounded-md block select-all">
            {typeof window !== 'undefined' ? `${window.location.origin}/mieterportal` : '…/mieterportal'}
          </code>
        </CardContent>
      </Card>

      {users.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-border p-12 text-center text-muted-foreground">
          <Key className="h-8 w-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Noch keine Portal-Zugänge angelegt</p>
        </div>
      ) : (
        <div className="space-y-3">
          {users.map(u => (
            <Card key={u.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-medium text-sm">
                      {u.mieter ? `${u.mieter.vorname ?? ''} ${u.mieter.nachname}`.trim() : u.mieterId}
                    </p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                    {u.letzterLogin && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Letzter Login: {new Date(u.letzterLogin).toLocaleDateString('de-AT')}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggle.mutate({ id: u.id, aktiv: !u.aktiv })}
                      className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium border transition-colors ${u.aktiv ? 'bg-primary/10 text-primary border-primary/30' : 'bg-muted text-muted-foreground border-border'}`}
                    >
                      {u.aktiv ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
                      {u.aktiv ? 'Aktiv' : 'Inaktiv'}
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => { if (confirm('Zugang löschen?')) del.mutate(u.id) }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Portalzugang anlegen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Mieter</Label>
              <Select value={form.mieterId} onValueChange={(v: string | null) => setForm(f => ({ ...f, mieterId: v ?? '' }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Mieter wählen…" />
                </SelectTrigger>
                <SelectContent>
                  {mieter.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.vorname ?? ''} {m.nachname}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>E-Mail</Label>
              <Input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="mieter@example.at"
              />
            </div>
            <div>
              <Label>Passwort (min. 6 Zeichen)</Label>
              <Input
                type="password"
                value={form.passwort}
                onChange={e => setForm(f => ({ ...f, passwort: e.target.value }))}
                placeholder="••••••"
              />
            </div>
            <Button
              className="w-full"
              disabled={!form.mieterId || !form.email || form.passwort.length < 6 || create.isPending}
              onClick={() => create.mutate(form)}
            >
              {create.isPending ? 'Wird angelegt…' : 'Zugang anlegen'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
