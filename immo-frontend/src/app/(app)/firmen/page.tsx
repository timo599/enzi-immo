'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { firmenApi } from '@/lib/api'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Plus, Briefcase, Building2, Pencil, Trash2 } from 'lucide-react'

interface Firma {
  id: string; name: string; rechtsform?: string; strasse?: string
  plz?: string; stadt?: string; notizen?: string; aktiv: boolean
  _count?: { objekte: number }
}

const RECHTSFORMEN = ['GmbH', 'GmbH & Co. KG', 'AG', 'UG (haftungsbeschränkt)', 'KG', 'OHG', 'GbR', 'Einzelunternehmen', 'e.K.', 'Sonstige']
const defaultForm = { name: '', rechtsform: '', strasse: '', plz: '', stadt: '', notizen: '' }

export default function FirmenPage() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Firma | null>(null)
  const [form, setForm] = useState(defaultForm)

  const { data, isLoading } = useQuery({ queryKey: ['firmen'], queryFn: () => firmenApi.list() })

  const saveMut = useMutation({
    mutationFn: (f: typeof defaultForm) =>
      editing ? firmenApi.update(editing.id, f) : firmenApi.create(f),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['firmen'] })
      toast.success(editing ? 'Firma aktualisiert' : 'Firma angelegt')
      setOpen(false)
    },
    onError: () => toast.error('Fehler beim Speichern'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => firmenApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['firmen'] }); toast.success('Firma gelöscht') },
    onError: () => toast.error('Fehler beim Löschen'),
  })

  function openCreate() { setEditing(null); setForm(defaultForm); setOpen(true) }
  function openEdit(f: Firma) {
    setEditing(f)
    setForm({ name: f.name, rechtsform: f.rechtsform ?? '', strasse: f.strasse ?? '',
      plz: f.plz ?? '', stadt: f.stadt ?? '', notizen: f.notizen ?? '' })
    setOpen(true)
  }
  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })) }

  const firmen: Firma[] = data?.data?.data ?? []

  return (
    <div>
      <PageHeader
        title="Firmen"
        description="Verwaltungsgesellschaften und Eigentümer-Unternehmen"
        action={<Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" />Neue Firma</Button>}
      />

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : firmen.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-slate-400">
          <Briefcase className="h-10 w-10 mx-auto mb-3 opacity-30" />
          Noch keine Firmen. Legen Sie Ihre erste Firma an.
        </CardContent></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {firmen.map((f) => (
            <Card key={f.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-5">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Briefcase className="h-5 w-5 text-blue-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{f.name}</p>
                      {f.rechtsform && <p className="text-xs text-slate-400">{f.rechtsform}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(f)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:text-red-600"
                      onClick={() => { if (confirm(`"${f.name}" löschen?`)) deleteMut.mutate(f.id) }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {(f.strasse || f.stadt) && (
                  <p className="text-sm text-slate-500 mt-1">
                    {f.strasse && <span>{f.strasse}, </span>}
                    {f.plz && <span>{f.plz} </span>}
                    {f.stadt && <span>{f.stadt}</span>}
                  </p>
                )}
                <div className="mt-3 flex items-center gap-2">
                  {f._count !== undefined && (
                    <div className="flex items-center gap-1 text-xs text-slate-400">
                      <Building2 className="h-3.5 w-3.5" />
                      <span>{f._count.objekte} Objekte</span>
                    </div>
                  )}
                  <Badge variant={f.aktiv ? 'default' : 'secondary'} className="text-xs">{f.aktiv ? 'aktiv' : 'inaktiv'}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Firma bearbeiten' : 'Neue Firma'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label>Firmenname *</Label>
                <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Mustermann GmbH" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Rechtsform</Label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.rechtsform}
                  onChange={(e) => set('rechtsform', e.target.value)}
                >
                  <option value="">— wählen —</option>
                  {RECHTSFORMEN.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Straße &amp; Hausnummer</Label>
                <Input value={form.strasse} onChange={(e) => set('strasse', e.target.value)} placeholder="Musterstraße 1" />
              </div>
              <div className="space-y-1">
                <Label>PLZ</Label>
                <Input value={form.plz} onChange={(e) => set('plz', e.target.value)} placeholder="70173" />
              </div>
              <div className="space-y-1">
                <Label>Stadt</Label>
                <Input value={form.stadt} onChange={(e) => set('stadt', e.target.value)} placeholder="Stuttgart" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Notizen</Label>
                <Input value={form.notizen} onChange={(e) => set('notizen', e.target.value)} placeholder="Interne Anmerkungen…" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Abbrechen</Button>
            <Button onClick={() => saveMut.mutate(form)} disabled={!form.name || saveMut.isPending}>
              {saveMut.isPending ? 'Speichern…' : 'Speichern'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
