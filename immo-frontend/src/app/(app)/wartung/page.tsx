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
import { Plus, CheckCircle2, Clock, AlertTriangle, CalendarClock } from 'lucide-react'

interface Wartungsaufgabe {
  id: string; titel: string; beschreibung?: string
  intervallMonate: number; letzteAusfuehrung?: string; naechstFaellig?: string; aktiv: boolean
  objekt?: { id: string; bezeichnung: string } | null
  einheit?: { id: string; bezeichnung: string } | null
}

const INTERVALLE = [
  { value: 1,   label: 'Monatlich' },
  { value: 3,   label: 'Vierteljährlich' },
  { value: 6,   label: 'Halbjährlich' },
  { value: 12,  label: 'Jährlich' },
  { value: 24,  label: 'Alle 2 Jahre' },
  { value: 36,  label: 'Alle 3 Jahre' },
  { value: 60,  label: 'Alle 5 Jahre' },
]

function statusInfo(task: Wartungsaufgabe) {
  if (!task.naechstFaellig) return { label: 'Noch nicht geplant', color: 'text-slate-400', urgent: false, soon: false }
  const heute = new Date()
  const faellig = new Date(task.naechstFaellig)
  const diff = Math.ceil((faellig.getTime() - heute.getTime()) / (1000 * 60 * 60 * 24))
  if (diff < 0)  return { label: `${Math.abs(diff)} Tage überfällig`, color: 'text-red-600',    urgent: true,  soon: false, diff }
  if (diff <= 30) return { label: `in ${diff} Tagen fällig`,          color: 'text-orange-500',  urgent: false, soon: true,  diff }
  if (diff <= 60) return { label: `in ${diff} Tagen fällig`,          color: 'text-yellow-600',  urgent: false, soon: false, diff }
  return { label: `in ${diff} Tagen fällig`,                          color: 'text-green-600',   urgent: false, soon: false, diff }
}

const defaultForm = {
  titel: '', beschreibung: '', intervallMonate: 12,
  letzteAusfuehrung: '', objektId: '', einheitId: '',
}

export default function WartungPage() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(defaultForm)
  const [erledigtId, setErledigtId] = useState<string | null>(null)
  const [erledigtDatum, setErledigtDatum] = useState(new Date().toISOString().slice(0, 10))

  const { data, isLoading } = useQuery({
    queryKey: ['wartung'],
    queryFn: () => api.get<{ data: Wartungsaufgabe[] }>('/wartung').then(r => r.data.data),
  })

  const { data: einheitenRes } = useQuery({
    queryKey: ['einheiten-select'],
    queryFn: () => api.get<{ data: { id: string; bezeichnung: string; objekt?: { bezeichnung: string } }[] }>('/einheiten').then(r => r.data.data),
  })

  const saveMut = useMutation({
    mutationFn: (body: typeof defaultForm) => api.post('/wartung', {
      ...body,
      intervallMonate: Number(body.intervallMonate),
      einheitId: body.einheitId || undefined,
      letzteAusfuehrung: body.letzteAusfuehrung || undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['wartung'] }); toast.success('Wartungsaufgabe gespeichert'); setOpen(false); setForm(defaultForm) },
    onError: () => toast.error('Fehler beim Speichern'),
  })

  const erledigtMut = useMutation({
    mutationFn: ({ id, datum }: { id: string; datum: string }) =>
      api.post(`/wartung/${id}/erledigt`, { datum }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['wartung'] }); toast.success('Als erledigt markiert'); setErledigtId(null) },
    onError: () => toast.error('Fehler'),
  })

  const aufgaben = data ?? []
  const einheiten = einheitenRes ?? []

  // Sortierung: überfällig → bald fällig → ok
  const sorted = [...aufgaben].sort((a, b) => {
    const fa = a.naechstFaellig ? new Date(a.naechstFaellig).getTime() : Infinity
    const fb = b.naechstFaellig ? new Date(b.naechstFaellig).getTime() : Infinity
    return fa - fb
  })

  const ueberfaellig = aufgaben.filter(t => {
    if (!t.naechstFaellig) return false
    return new Date(t.naechstFaellig) < new Date()
  }).length

  function set(k: string, v: string | number) { setForm(f => ({ ...f, [k]: v })) }

  return (
    <div>
      <PageHeader
        title="Wartungsplan"
        description="Wiederkehrende Prüfpflichten und Wartungsintervalle"
        action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" />Neue Aufgabe</Button>}
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="rounded-xl border bg-slate-50 p-3">
          <p className="text-xs text-slate-500 mb-1">Aufgaben gesamt</p>
          <p className="text-2xl font-bold text-slate-700">{aufgaben.length}</p>
        </div>
        <div className={`rounded-xl border p-3 ${ueberfaellig > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
          <p className="text-xs text-slate-500 mb-1">Überfällig</p>
          <p className={`text-2xl font-bold ${ueberfaellig > 0 ? 'text-red-700' : 'text-green-700'}`}>{ueberfaellig}</p>
        </div>
        <div className="rounded-xl border bg-orange-50 border-orange-200 p-3">
          <p className="text-xs text-slate-500 mb-1">In 30 Tagen fällig</p>
          <p className="text-2xl font-bold text-orange-700">
            {aufgaben.filter(t => {
              if (!t.naechstFaellig) return false
              const d = Math.ceil((new Date(t.naechstFaellig).getTime() - Date.now()) / 86400000)
              return d >= 0 && d <= 30
            }).length}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : sorted.length === 0 ? (
        <div className="border border-dashed rounded-lg p-10 text-center text-slate-400">
          Noch keine Wartungsaufgaben — leg jetzt los.
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map(t => {
            const info = statusInfo(t)
            return (
              <div key={t.id} className={`flex items-center gap-4 rounded-xl border px-4 py-3 transition-all hover:shadow-sm
                ${info.urgent ? 'border-red-200 bg-red-50/50' : info.soon ? 'border-orange-200 bg-orange-50/30' : 'bg-white'}`}>

                {/* Status-Indikator */}
                <div className={`shrink-0 ${info.urgent ? 'text-red-500' : info.soon ? 'text-orange-400' : 'text-green-500'}`}>
                  {info.urgent ? <AlertTriangle className="h-5 w-5" /> : info.soon ? <Clock className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{t.titel}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {INTERVALLE.find(i => i.value === t.intervallMonate)?.label ?? `${t.intervallMonate} Mo.`}
                    </Badge>
                    {(t.objekt || t.einheit) && (
                      <span className="text-xs text-muted-foreground">
                        {t.einheit ? t.einheit.bezeichnung : t.objekt?.bezeichnung}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className={`text-xs font-medium ${info.color}`}>
                      <CalendarClock className="h-3 w-3 inline mr-0.5" />
                      {t.naechstFaellig
                        ? new Date(t.naechstFaellig).toLocaleDateString('de-DE')
                        : '—'} · {info.label}
                    </span>
                    {t.letzteAusfuehrung && (
                      <span className="text-xs text-slate-400">
                        Zuletzt: {new Date(t.letzteAusfuehrung).toLocaleDateString('de-DE')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Action */}
                <Button size="sm" variant="outline" onClick={() => setErledigtId(t.id)}
                  className="shrink-0 text-xs">
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Erledigt
                </Button>
              </div>
            )
          })}
        </div>
      )}

      {/* Neue Aufgabe Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Neue Wartungsaufgabe</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Titel *</Label>
              <Input value={form.titel} onChange={e => set('titel', e.target.value)} placeholder="z.B. Heizungswartung" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Intervall</Label>
                <Select value={String(form.intervallMonate)} onValueChange={v => set('intervallMonate', Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INTERVALLE.map(i => <SelectItem key={i.value} value={String(i.value)}>{i.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Letzte Ausführung</Label>
                <Input type="date" value={form.letzteAusfuehrung} onChange={e => set('letzteAusfuehrung', e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Einheit (optional)</Label>
              <Select value={form.einheitId || undefined} onValueChange={v => set('einheitId', v ?? '')}>
                <SelectTrigger><SelectValue placeholder="— gesamtes Objekt —" /></SelectTrigger>
                <SelectContent>
                  {einheiten.map(e => (
                    <SelectItem key={e.id} value={e.id}>{e.objekt?.bezeichnung} · {e.bezeichnung}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Beschreibung</Label>
              <Textarea value={form.beschreibung} onChange={e => set('beschreibung', e.target.value)} rows={2} placeholder="Details zur Wartung…" />
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

      {/* Erledigt-Dialog */}
      <Dialog open={!!erledigtId} onOpenChange={o => !o && setErledigtId(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle>Wartung als erledigt markieren</DialogTitle></DialogHeader>
          <div className="space-y-1">
            <Label>Ausführungsdatum</Label>
            <Input type="date" value={erledigtDatum} onChange={e => setErledigtDatum(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setErledigtId(null)}>Abbrechen</Button>
            <Button onClick={() => erledigtMut.mutate({ id: erledigtId!, datum: erledigtDatum })}
              disabled={erledigtMut.isPending}>
              <CheckCircle2 className="h-4 w-4 mr-1" />Bestätigen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
