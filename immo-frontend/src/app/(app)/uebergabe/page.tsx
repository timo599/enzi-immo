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
import { Plus, ClipboardCheck, ArrowDownToLine, ArrowUpFromLine, KeyRound, Zap, Flame, Droplets } from 'lucide-react'

type Zustand = 'gut' | 'maengel' | 'nicht_geprueft'
interface Raum { name: string; zustand: Zustand; maengel?: string; notizen?: string }
interface Protokoll {
  id: string; typ: 'einzug' | 'auszug'; datum: string
  schluessel?: number; notizen?: string
  zaehlerstandStrom?: number; zaehlerstandGas?: number; zaehlerstandWasser?: number
  raeume: Raum[]
  einheit: { id: string; bezeichnung: string; objekt: { bezeichnung: string } }
  mietvertrag?: { id: string; mietvertragMieter: { mieter: { vorname?: string; nachname: string } }[] } | null
}

const STANDARD_RAEUME = ['Flur', 'Wohnzimmer', 'Schlafzimmer', 'Küche', 'Bad', 'WC', 'Balkon/Terrasse', 'Keller']
const ZUSTAND_STYLE: Record<Zustand, string> = {
  gut:            'bg-green-100 text-green-700',
  maengel:        'bg-red-100 text-red-700',
  nicht_geprueft: 'bg-slate-100 text-slate-500',
}

const defaultForm = {
  einheitId: '', mietvertragId: '', typ: 'einzug' as 'einzug' | 'auszug',
  datum: new Date().toISOString().slice(0, 10),
  zaehlerstandStrom: '', zaehlerstandGas: '', zaehlerstandWasser: '',
  schluessel: '', notizen: '',
  raeume: STANDARD_RAEUME.map(n => ({ name: n, zustand: 'nicht_geprueft' as Zustand, maengel: '', notizen: '' })),
}

export default function UebergabePage() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(defaultForm)
  const [selected, setSelected] = useState<Protokoll | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['uebergabe'],
    queryFn: () => api.get<{ data: Protokoll[] }>('/uebergabe').then(r => r.data.data),
  })

  const { data: einheitenRes } = useQuery({
    queryKey: ['einheiten-select'],
    queryFn: () => api.get<{ data: { id: string; bezeichnung: string; objekt?: { bezeichnung: string } }[] }>('/einheiten').then(r => r.data.data),
  })

  const saveMut = useMutation({
    mutationFn: (f: typeof defaultForm) => api.post('/uebergabe', {
      einheitId:     f.einheitId,
      mietvertragId: f.mietvertragId || undefined,
      typ:           f.typ,
      datum:         f.datum,
      zaehlerstandStrom:  f.zaehlerstandStrom  ? Number(f.zaehlerstandStrom)  : undefined,
      zaehlerstandGas:    f.zaehlerstandGas    ? Number(f.zaehlerstandGas)    : undefined,
      zaehlerstandWasser: f.zaehlerstandWasser ? Number(f.zaehlerstandWasser) : undefined,
      schluessel:    f.schluessel ? Number(f.schluessel) : undefined,
      notizen:       f.notizen || undefined,
      raeume:        f.raeume.filter(r => r.zustand !== 'nicht_geprueft' || r.maengel || r.notizen),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['uebergabe'] })
      toast.success('Protokoll gespeichert')
      setOpen(false); setForm(defaultForm)
    },
    onError: () => toast.error('Fehler beim Speichern'),
  })

  const protokolle = data ?? []
  const einheiten = einheitenRes ?? []

  function updateRaum(idx: number, key: keyof Raum, val: string) {
    setForm(f => {
      const raeume = [...f.raeume]
      raeume[idx] = { ...raeume[idx], [key]: val }
      return { ...f, raeume }
    })
  }

  function addRaum() {
    setForm(f => ({ ...f, raeume: [...f.raeume, { name: '', zustand: 'nicht_geprueft', maengel: '', notizen: '' }] }))
  }

  const maengelCount = (p: Protokoll) => p.raeume.filter(r => r.zustand === 'maengel').length

  return (
    <div>
      <PageHeader
        title="Übergabeprotokolle"
        description="Einzug und Auszug digital dokumentieren"
        action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" />Neues Protokoll</Button>}
      />

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>
      ) : protokolle.length === 0 ? (
        <div className="border border-dashed rounded-lg p-10 text-center text-slate-400">
          <ClipboardCheck className="h-10 w-10 mx-auto mb-2 opacity-30" />
          Noch keine Protokolle — erstell das erste Übergabeprotokoll.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {protokolle.map(p => {
            const mieter = p.mietvertrag?.mietvertragMieter?.[0]?.mieter
            const maengel = maengelCount(p)
            return (
              <Card key={p.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelected(p)}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      {p.typ === 'einzug'
                        ? <ArrowDownToLine className="h-4 w-4 text-green-500 shrink-0" />
                        : <ArrowUpFromLine className="h-4 w-4 text-orange-500 shrink-0" />}
                      <span className="font-medium text-sm">{p.einheit.objekt.bezeichnung} · {p.einheit.bezeichnung}</span>
                    </div>
                    <Badge variant="outline" className={`text-[10px] shrink-0 ${p.typ === 'einzug' ? 'text-green-600 border-green-300' : 'text-orange-600 border-orange-300'}`}>
                      {p.typ === 'einzug' ? 'Einzug' : 'Auszug'}
                    </Badge>
                  </div>
                  {mieter && <p className="text-xs text-slate-500">{mieter.vorname} {mieter.nachname}</p>}
                  <p className="text-xs text-slate-400 mt-1">{new Date(p.datum).toLocaleDateString('de-DE')}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                    {p.schluessel != null && <span><KeyRound className="h-3 w-3 inline mr-0.5" />{p.schluessel} Schlüssel</span>}
                    {maengel > 0 && <span className="text-red-500 font-medium">{maengel} Mängel</span>}
                    {maengel === 0 && p.raeume.length > 0 && <span className="text-green-600">Keine Mängel</span>}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Detail-Ansicht */}
      {selected && (
        <Dialog open={!!selected} onOpenChange={o => !o && setSelected(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {selected.typ === 'einzug' ? <ArrowDownToLine className="h-5 w-5 text-green-500" /> : <ArrowUpFromLine className="h-5 w-5 text-orange-500" />}
                {selected.typ === 'einzug' ? 'Einzugsprotokoll' : 'Auszugsprotokoll'} — {selected.einheit.objekt.bezeichnung} · {selected.einheit.bezeichnung}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  { icon: <Zap className="h-4 w-4" />, label: 'Strom', val: selected.zaehlerstandStrom },
                  { icon: <Flame className="h-4 w-4" />, label: 'Gas', val: selected.zaehlerstandGas },
                  { icon: <Droplets className="h-4 w-4" />, label: 'Wasser', val: selected.zaehlerstandWasser },
                ].map(z => (
                  <div key={z.label} className="rounded-lg border bg-slate-50 p-3">
                    <div className="flex items-center justify-center gap-1 text-slate-500 mb-1">{z.icon}<span className="text-xs">{z.label}</span></div>
                    <p className="font-mono font-semibold">{z.val != null ? z.val : '—'}</p>
                  </div>
                ))}
              </div>
              {selected.schluessel != null && (
                <p className="flex items-center gap-2 text-slate-600"><KeyRound className="h-4 w-4" /><strong>{selected.schluessel}</strong> Schlüssel</p>
              )}
              <div className="space-y-2">
                {selected.raeume.map((r, i) => (
                  <div key={i} className={`rounded-lg border p-3 ${r.zustand === 'maengel' ? 'border-red-200 bg-red-50/40' : r.zustand === 'gut' ? 'border-green-200 bg-green-50/30' : 'border-slate-100'}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{r.name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${ZUSTAND_STYLE[r.zustand]}`}>
                        {r.zustand === 'gut' ? 'Gut' : r.zustand === 'maengel' ? 'Mängel' : 'Nicht geprüft'}
                      </span>
                    </div>
                    {r.maengel && <p className="text-xs text-red-600 mt-1">⚠ {r.maengel}</p>}
                    {r.notizen && <p className="text-xs text-slate-500 mt-0.5">{r.notizen}</p>}
                  </div>
                ))}
              </div>
              {selected.notizen && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500 mb-1">Allgemeine Notizen</p>
                  <p className="text-sm">{selected.notizen}</p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Neues Protokoll Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Neues Übergabeprotokoll</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Typ</Label>
                <Select value={form.typ} onValueChange={v => setForm(f => ({ ...f, typ: v as 'einzug' | 'auszug' }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="einzug">Einzug</SelectItem>
                    <SelectItem value="auszug">Auszug</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Datum</Label>
                <Input type="date" value={form.datum} onChange={e => setForm(f => ({ ...f, datum: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Einheit *</Label>
              <Select value={form.einheitId || undefined} onValueChange={v => setForm(f => ({ ...f, einheitId: v ?? '' }))}>
                <SelectTrigger><SelectValue placeholder="Einheit wählen…" /></SelectTrigger>
                <SelectContent>
                  {einheiten.map(e => <SelectItem key={e.id} value={e.id}>{e.objekt?.bezeichnung} · {e.bezeichnung}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Zählerstände */}
            <div>
              <Label className="mb-2 block">Zählerstände</Label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { key: 'zaehlerstandStrom',  label: 'Strom (kWh)',  icon: <Zap className="h-3.5 w-3.5" /> },
                  { key: 'zaehlerstandGas',    label: 'Gas (m³)',     icon: <Flame className="h-3.5 w-3.5" /> },
                  { key: 'zaehlerstandWasser', label: 'Wasser (m³)',  icon: <Droplets className="h-3.5 w-3.5" /> },
                ].map(z => (
                  <div key={z.key} className="space-y-1">
                    <Label className="text-xs flex items-center gap-1">{z.icon}{z.label}</Label>
                    <Input type="number" step="0.001"
                      value={(form as any)[z.key]}
                      onChange={e => setForm(f => ({ ...f, [z.key]: e.target.value }))}
                      placeholder="0.000" />
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <Label>Schlüsselanzahl</Label>
              <Input type="number" min="0" value={form.schluessel}
                onChange={e => setForm(f => ({ ...f, schluessel: e.target.value }))} placeholder="z.B. 2" className="max-w-[120px]" />
            </div>

            {/* Räume */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Raumzustand</Label>
                <Button size="sm" variant="outline" onClick={addRaum} className="text-xs h-7">
                  <Plus className="h-3 w-3 mr-1" />Raum
                </Button>
              </div>
              <div className="space-y-2">
                {form.raeume.map((r, i) => (
                  <div key={i} className="rounded-lg border border-slate-100 p-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Input value={r.name} onChange={e => updateRaum(i, 'name', e.target.value)} placeholder="Raumname" className="text-sm" />
                      <Select value={r.zustand} onValueChange={v => updateRaum(i, 'zustand', v as Zustand)}>
                        <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gut">✅ Gut</SelectItem>
                          <SelectItem value="maengel">⚠️ Mängel</SelectItem>
                          <SelectItem value="nicht_geprueft">— Nicht geprüft</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {r.zustand === 'maengel' && (
                      <Input value={r.maengel ?? ''} onChange={e => updateRaum(i, 'maengel', e.target.value)}
                        placeholder="Mängeldetails…" className="text-sm border-red-200" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <Label>Allgemeine Notizen</Label>
              <Textarea value={form.notizen} onChange={e => setForm(f => ({ ...f, notizen: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); setForm(defaultForm) }}>Abbrechen</Button>
            <Button onClick={() => saveMut.mutate(form)} disabled={!form.einheitId || saveMut.isPending}>
              {saveMut.isPending ? 'Speichern…' : 'Protokoll speichern'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
