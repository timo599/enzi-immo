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
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { Plus, Wrench, CheckCircle2, Clock, AlertCircle, Euro } from 'lucide-react'
import { euro } from '@/lib/format'

interface Objekt { id: string; bezeichnung: string }
interface Einheit { id: string; bezeichnung: string; objekt?: { bezeichnung: string } }
interface Reparatur {
  id: string; titel: string; beschreibung?: string; status: ReparaturStatus
  kosten: number | null; datum: string; erledigtAm?: string; handwerker?: string
  erstelltAm: string
  einheit?: Einheit | null
  objekt?: Objekt | null
}
type ReparaturStatus = 'offen' | 'in_bearbeitung' | 'erledigt'

const STATUS_LABEL: Record<ReparaturStatus, string> = {
  offen: 'Offen', in_bearbeitung: 'In Bearbeitung', erledigt: 'Erledigt',
}
const STATUS_STYLE: Record<ReparaturStatus, string> = {
  offen:         'bg-red-100 text-red-700 border-red-200',
  in_bearbeitung:'bg-blue-100 text-blue-700 border-blue-200',
  erledigt:      'bg-green-100 text-green-700 border-green-200',
}
const STATUS_ICON: Record<ReparaturStatus, React.ReactNode> = {
  offen:         <AlertCircle className="h-3.5 w-3.5" />,
  in_bearbeitung:<Clock className="h-3.5 w-3.5" />,
  erledigt:      <CheckCircle2 className="h-3.5 w-3.5" />,
}

const defaultForm = {
  titel: '', beschreibung: '', status: 'offen' as ReparaturStatus,
  kosten: '', datum: new Date().toISOString().slice(0, 10),
  handwerker: '', einheitId: '', objektId: '', erledigtAm: '',
}

export default function ReparaturenPage() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(defaultForm)
  const [filter, setFilter] = useState<ReparaturStatus | 'alle'>('alle')

  const { data, isLoading } = useQuery({
    queryKey: ['reparaturen', filter],
    queryFn: () => api.get<{ data: Reparatur[] }>(`/reparaturen${filter !== 'alle' ? `?status=${filter}` : ''}`).then(r => r.data.data),
  })

  const { data: einheitenRes } = useQuery({
    queryKey: ['einheiten-select'],
    queryFn: () => api.get<{ data: Einheit[] }>('/einheiten').then(r => r.data.data),
  })

  const saveMut = useMutation({
    mutationFn: (body: typeof defaultForm) => api.post('/reparaturen', {
      ...body,
      kosten:    body.kosten ? Number(body.kosten) : undefined,
      einheitId: body.einheitId || undefined,
      objektId:  body.objektId  || undefined,
      erledigtAm: body.erledigtAm || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reparaturen'] })
      toast.success('Reparatur gespeichert')
      setOpen(false); setForm(defaultForm)
    },
    onError: () => toast.error('Fehler beim Speichern'),
  })

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ReparaturStatus }) =>
      api.patch(`/reparaturen/${id}`, { status, ...(status === 'erledigt' ? { erledigtAm: new Date().toISOString().slice(0, 10) } : {}) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reparaturen'] }); toast.success('Status aktualisiert') },
  })

  const reparaturen: Reparatur[] = data ?? []
  const einheiten: Einheit[] = einheitenRes ?? []

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })) }

  const offen       = reparaturen.filter(r => r.status === 'offen').length
  const inArbeit    = reparaturen.filter(r => r.status === 'in_bearbeitung').length
  const erledigt    = reparaturen.filter(r => r.status === 'erledigt').length
  const gesamtKosten = reparaturen.filter(r => r.status === 'erledigt' && r.kosten).reduce((s, r) => s + Number(r.kosten), 0)

  return (
    <div>
      <PageHeader
        title="Reparaturen"
        description="Handwerker, Schäden und Wartungsaufträge verwalten"
        action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" />Neue Reparatur</Button>}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Offen',         value: offen,    color: 'text-red-700',   bg: 'bg-red-50',   icon: <AlertCircle  className="h-4 w-4 text-red-400" /> },
          { label: 'In Bearbeitung',value: inArbeit, color: 'text-blue-700',  bg: 'bg-blue-50',  icon: <Clock        className="h-4 w-4 text-blue-400" /> },
          { label: 'Erledigt',      value: erledigt, color: 'text-green-700', bg: 'bg-green-50', icon: <CheckCircle2 className="h-4 w-4 text-green-400" /> },
          { label: 'Kosten (erledigt)', value: euro(gesamtKosten), color: 'text-slate-700', bg: 'bg-slate-50', icon: <Euro className="h-4 w-4 text-slate-400" /> },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border p-3 ${s.bg}`}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-slate-500">{s.label}</p>
              {s.icon}
            </div>
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {(['alle', 'offen', 'in_bearbeitung', 'erledigt'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium border transition-all ${filter === f ? 'bg-primary text-white border-primary' : 'border-slate-200 text-slate-600 hover:border-primary/50'}`}
          >
            {f === 'alle' ? 'Alle' : STATUS_LABEL[f]}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : reparaturen.length === 0 ? (
        <div className="border border-dashed rounded-lg p-10 text-center text-slate-400">
          Keine Reparaturen gefunden
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {reparaturen.map(r => (
            <Card key={r.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Wrench className="h-4 w-4 text-slate-400 shrink-0" />
                    <span className="font-medium text-sm truncate">{r.titel}</span>
                  </div>
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium shrink-0 ${STATUS_STYLE[r.status]}`}>
                    {STATUS_ICON[r.status]}{STATUS_LABEL[r.status]}
                  </span>
                </div>

                {r.einheit && (
                  <p className="text-xs text-slate-500 mb-1">
                    {r.einheit.objekt?.bezeichnung} · {r.einheit.bezeichnung}
                  </p>
                )}
                {r.handwerker && <p className="text-xs text-slate-400">Handwerker: {r.handwerker}</p>}
                {r.beschreibung && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{r.beschreibung}</p>}

                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{new Date(r.datum).toLocaleDateString('de-DE')}</span>
                    {r.kosten && <span className="text-xs font-medium text-slate-600">{euro(Number(r.kosten))}</span>}
                  </div>
                  {r.status !== 'erledigt' && (
                    <div className="flex gap-1">
                      {r.status === 'offen' && (
                        <button
                          onClick={() => updateStatus.mutate({ id: r.id, status: 'in_bearbeitung' })}
                          className="rounded px-2 py-0.5 text-[10px] font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                        >In Bearb.</button>
                      )}
                      <button
                        onClick={() => updateStatus.mutate({ id: r.id, status: 'erledigt' })}
                        className="rounded px-2 py-0.5 text-[10px] font-medium bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
                      >Erledigt</button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Neue Reparatur</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Titel *</Label>
              <Input value={form.titel} onChange={e => set('titel', e.target.value)} placeholder="z.B. Heizungsthermostat defekt" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Datum</Label>
                <Input type="date" value={form.datum} onChange={e => set('datum', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => set('status', v as ReparaturStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Einheit (optional)</Label>
                <Select value={form.einheitId || undefined} onValueChange={v => set('einheitId', v ?? '')}>
                  <SelectTrigger><SelectValue placeholder="— keine —" /></SelectTrigger>
                  <SelectContent>
                    {einheiten.map(e => <SelectItem key={e.id} value={e.id}>{e.objekt?.bezeichnung} · {e.bezeichnung}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Handwerker</Label>
                <Input value={form.handwerker} onChange={e => set('handwerker', e.target.value)} placeholder="Name oder Firma" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Kosten (€)</Label>
              <Input type="number" step="0.01" value={form.kosten} onChange={e => set('kosten', e.target.value)} placeholder="0,00" />
            </div>
            <div className="space-y-1">
              <Label>Beschreibung</Label>
              <Textarea value={form.beschreibung} onChange={e => set('beschreibung', e.target.value)} rows={3} placeholder="Details zur Reparatur…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); setForm(defaultForm) }}>Abbrechen</Button>
            <Button onClick={() => saveMut.mutate(form)} disabled={!form.titel || saveMut.isPending}>
              {saveMut.isPending ? 'Speichern…' : 'Speichern'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
