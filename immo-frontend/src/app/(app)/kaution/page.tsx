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
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { Plus, Vault, CheckCircle2, Clock, AlertTriangle, Pencil } from 'lucide-react'
import { euro } from '@/lib/format'

interface Kaution {
  id: string
  betrag: number; erhaltenAm?: string; konto?: string; zinsen?: number
  rueckgabeAm?: string; rueckgabeBetrag?: number; abzuege?: number; abzuegeGrund?: string; notizen?: string
  mietvertragId: string
  mietvertrag: {
    einheit: { bezeichnung: string; objekt: { bezeichnung: string } }
    mietvertragMieter: { mieter: { vorname?: string; nachname: string } }[]
  }
}

interface MV { id: string; einheit: { bezeichnung: string; objekt: { bezeichnung: string } }; mietvertragMieter: { mieter: { vorname?: string; nachname: string } }[] }

const defaultForm = {
  mietvertragId: '', betrag: '', erhaltenAm: '', konto: '',
  zinsen: '', rueckgabeAm: '', rueckgabeBetrag: '', abzuege: '', abzuegeGrund: '', notizen: '',
}

export default function KautionPage() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(defaultForm)
  const [editing, setEditing] = useState<Kaution | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['kaution'],
    queryFn: () => api.get<{ data: Kaution[] }>('/kaution').then(r => r.data.data),
  })

  const { data: mietvertraegeRes } = useQuery({
    queryKey: ['mietvertraege-select'],
    queryFn: () => api.get<{ data: MV[] }>('/mietvertraege').then(r => r.data.data),
  })

  const saveMut = useMutation({
    mutationFn: (f: typeof defaultForm) => api.post('/kaution', {
      mietvertragId:  f.mietvertragId,
      betrag:         Number(f.betrag),
      erhaltenAm:     f.erhaltenAm     || undefined,
      konto:          f.konto          || undefined,
      zinsen:         f.zinsen         ? Number(f.zinsen)         : undefined,
      rueckgabeAm:    f.rueckgabeAm    || undefined,
      rueckgabeBetrag: f.rueckgabeBetrag ? Number(f.rueckgabeBetrag) : undefined,
      abzuege:        f.abzuege        ? Number(f.abzuege)        : undefined,
      abzuegeGrund:   f.abzuegeGrund   || undefined,
      notizen:        f.notizen        || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kaution'] })
      toast.success('Kaution gespeichert'); setOpen(false); setEditing(null); setForm(defaultForm)
    },
    onError: () => toast.error('Fehler beim Speichern'),
  })

  const kautionen = data ?? []
  const mietvertraege: MV[] = mietvertraegeRes ?? []

  const gesamt        = kautionen.reduce((s, k) => s + Number(k.betrag), 0)
  const zurueckgezahlt = kautionen.filter(k => k.rueckgabeAm).length
  const ausstehend    = kautionen.filter(k => !k.erhaltenAm).length

  function set(key: string, val: string) { setForm(f => ({ ...f, [key]: val })) }

  function openEdit(k: Kaution) {
    setEditing(k)
    setForm({
      mietvertragId: k.mietvertragId,
      betrag:        String(k.betrag),
      erhaltenAm:    k.erhaltenAm    ? k.erhaltenAm.slice(0, 10)    : '',
      konto:         k.konto         ?? '',
      zinsen:        k.zinsen        != null ? String(k.zinsen)        : '',
      rueckgabeAm:   k.rueckgabeAm   ? k.rueckgabeAm.slice(0, 10)   : '',
      rueckgabeBetrag: k.rueckgabeBetrag != null ? String(k.rueckgabeBetrag) : '',
      abzuege:       k.abzuege       != null ? String(k.abzuege)       : '',
      abzuegeGrund:  k.abzuegeGrund  ?? '',
      notizen:       k.notizen       ?? '',
    })
    setOpen(true)
  }

  function kautionStatus(k: Kaution) {
    if (k.rueckgabeAm)  return { label: 'Zurückgezahlt', style: 'bg-green-100 text-green-700', icon: <CheckCircle2 className="h-3 w-3" /> }
    if (!k.erhaltenAm)  return { label: 'Noch nicht erhalten', style: 'bg-red-100 text-red-700', icon: <AlertTriangle className="h-3 w-3" /> }
    return { label: 'Gehalten', style: 'bg-blue-100 text-blue-700', icon: <Vault className="h-3 w-3" /> }
  }

  return (
    <div>
      <PageHeader
        title="Kautionsverwaltung"
        description="Mietkautionen erfassen, verwalten und zurückzahlen"
        action={<Button onClick={() => { setEditing(null); setForm(defaultForm); setOpen(true) }}><Plus className="h-4 w-4 mr-1" />Neue Kaution</Button>}
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="rounded-xl border bg-blue-50 border-blue-200 p-3">
          <p className="text-xs text-slate-500 mb-1">Gesamt verwahrt</p>
          <p className="text-xl font-bold text-blue-700">{euro(gesamt)}</p>
        </div>
        <div className="rounded-xl border bg-green-50 border-green-200 p-3">
          <p className="text-xs text-slate-500 mb-1">Zurückgezahlt</p>
          <p className="text-xl font-bold text-green-700">{zurueckgezahlt}</p>
        </div>
        <div className={`rounded-xl border p-3 ${ausstehend > 0 ? 'bg-red-50 border-red-200' : 'bg-slate-50'}`}>
          <p className="text-xs text-slate-500 mb-1">Noch nicht erhalten</p>
          <p className={`text-xl font-bold ${ausstehend > 0 ? 'text-red-700' : 'text-slate-700'}`}>{ausstehend}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : kautionen.length === 0 ? (
        <div className="border border-dashed rounded-lg p-10 text-center text-slate-400">
          <Vault className="h-10 w-10 mx-auto mb-2 opacity-30" />
          Noch keine Kautionen erfasst.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {kautionen.map(k => {
            const st = kautionStatus(k)
            const mieter = k.mietvertrag.mietvertragMieter[0]?.mieter
            const netto = Number(k.betrag) - (Number(k.abzuege) || 0) + (Number(k.zinsen) || 0)
            return (
              <Card key={k.id} className="hover:shadow-md transition-shadow">
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="font-medium text-sm">{k.mietvertrag.einheit.objekt.bezeichnung} · {k.mietvertrag.einheit.bezeichnung}</p>
                      {mieter && <p className="text-xs text-slate-500">{mieter.vorname} {mieter.nachname}</p>}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${st.style}`}>
                        {st.icon}{st.label}
                      </span>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(k)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs mt-2">
                    <div>
                      <p className="text-slate-400">Betrag</p>
                      <p className="font-semibold text-sm">{euro(Number(k.betrag))}</p>
                    </div>
                    {k.erhaltenAm && (
                      <div>
                        <p className="text-slate-400">Erhalten am</p>
                        <p>{new Date(k.erhaltenAm).toLocaleDateString('de-DE')}</p>
                      </div>
                    )}
                    {k.konto && (
                      <div className="col-span-2">
                        <p className="text-slate-400">Konto / Sparbuch</p>
                        <p>{k.konto}</p>
                      </div>
                    )}
                    {k.rueckgabeAm && (
                      <div>
                        <p className="text-slate-400">Rückgabe</p>
                        <p>{new Date(k.rueckgabeAm).toLocaleDateString('de-DE')} · {euro(k.rueckgabeBetrag ?? netto)}</p>
                      </div>
                    )}
                    {(Number(k.abzuege) || 0) > 0 && (
                      <div>
                        <p className="text-slate-400">Abzüge</p>
                        <p className="text-red-600">−{euro(Number(k.abzuege))}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) { setEditing(null); setForm(defaultForm) } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Kaution bearbeiten' : 'Kaution erfassen'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {!editing && (
              <div className="space-y-1">
                <Label>Mietvertrag *</Label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.mietvertragId}
                  onChange={e => set('mietvertragId', e.target.value)}
                >
                  <option value="">— wählen —</option>
                  {mietvertraege.map(mv => {
                    const m = mv.mietvertragMieter?.[0]?.mieter
                    return (
                      <option key={mv.id} value={mv.id}>
                        {mv.einheit.objekt.bezeichnung} · {mv.einheit.bezeichnung}{m ? ` (${m.nachname})` : ''}
                      </option>
                    )
                  })}
                </select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Betrag (€) *</Label><Input type="number" step="0.01" value={form.betrag} onChange={e => set('betrag', e.target.value)} /></div>
              <div className="space-y-1"><Label>Erhalten am</Label><Input type="date" value={form.erhaltenAm} onChange={e => set('erhaltenAm', e.target.value)} /></div>
            </div>
            <div className="space-y-1"><Label>Konto / Sparbuch</Label><Input value={form.konto} onChange={e => set('konto', e.target.value)} placeholder="z.B. Tagesgeldkonto IBAN…" /></div>
            <div className="space-y-1"><Label>Zinsen (€)</Label><Input type="number" step="0.01" value={form.zinsen} onChange={e => set('zinsen', e.target.value)} /></div>
            <div className="border-t pt-3">
              <p className="text-xs text-slate-500 mb-2 font-medium">Rückgabe (bei Auszug)</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Rückgabedatum</Label><Input type="date" value={form.rueckgabeAm} onChange={e => set('rueckgabeAm', e.target.value)} /></div>
                <div className="space-y-1"><Label>Zurückgezahlt (€)</Label><Input type="number" step="0.01" value={form.rueckgabeBetrag} onChange={e => set('rueckgabeBetrag', e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div className="space-y-1"><Label>Abzüge (€)</Label><Input type="number" step="0.01" value={form.abzuege} onChange={e => set('abzuege', e.target.value)} /></div>
                <div className="space-y-1"><Label>Grund der Abzüge</Label><Input value={form.abzuegeGrund} onChange={e => set('abzuegeGrund', e.target.value)} placeholder="z.B. Schäden Bad" /></div>
              </div>
            </div>
            <div className="space-y-1"><Label>Notizen</Label><Textarea value={form.notizen} onChange={e => set('notizen', e.target.value)} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); setEditing(null); setForm(defaultForm) }}>Abbrechen</Button>
            <Button onClick={() => saveMut.mutate(form)} disabled={!form.betrag || (!editing && !form.mietvertragId) || saveMut.isPending}>
              {saveMut.isPending ? 'Speichern…' : 'Speichern'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
