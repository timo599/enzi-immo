'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { mietvertraegeApi, einheitenApi, mieterApi } from '@/lib/api'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { euro, datum } from '@/lib/format'
import { Plus, FileText, CalendarDays, FolderOpen, User, Info } from 'lucide-react'
import { DocumentSection } from '@/components/document-section'

interface Vertrag {
  id: string; mietart: string; vertragsbeginn: string; vertragsende?: string
  nettomiete: number; nkVorauszahlung: number; kaution?: number; mietflaecheM2?: number
  notizen?: string
  einheit?: { id: string; bezeichnung: string; objekt?: { bezeichnung: string } }
  mietvertragMieter?: { mieter: { id: string; vorname?: string; nachname: string } ; rolle: string }[]
}

const defaultForm = {
  einheitId: '', mietart: 'wohnraum', vertragsbeginn: '', vertragsende: '',
  nettomiete: '', nkVorauszahlung: '', kaution: '', mieterId: '',
}

export default function MietvertraegePage() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(defaultForm)
  const [selected, setSelected] = useState<Vertrag | null>(null)

  const { data, isLoading } = useQuery({ queryKey: ['mietvertraege'], queryFn: () => mietvertraegeApi.list() })
  const { data: einData } = useQuery({ queryKey: ['einheiten'], queryFn: () => einheitenApi.list() })
  const { data: miData } = useQuery({ queryKey: ['mieter'], queryFn: () => mieterApi.list() })

  const saveMut = useMutation({
    mutationFn: (f: typeof defaultForm) => {
      const body = {
        einheitId:       f.einheitId,
        mietart:         f.mietart,
        vertragsbeginn:  f.vertragsbeginn,
        ...(f.vertragsende ? { vertragsende: f.vertragsende } : {}),
        nettomiete:      parseFloat(f.nettomiete) || 0,
        nkVorauszahlung: parseFloat(f.nkVorauszahlung) || 0,
        ...(f.kaution ? { kaution: parseFloat(f.kaution) } : {}),
        mieter: f.mieterId
          ? [{ mieterId: f.mieterId, rolle: 'hauptmieter', seit: f.vertragsbeginn }]
          : [],
      }
      return mietvertraegeApi.create(body)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mietvertraege'] })
      toast.success('Mietvertrag angelegt')
      setOpen(false)
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error?.message ?? 'Fehler beim Speichern'
      toast.error(msg)
    },
  })

  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })) }

  const vertraege: Vertrag[] = data?.data?.data ?? []
  const einheiten: { id: string; bezeichnung: string }[] = einData?.data?.data ?? []
  const mieter: { id: string; vorname?: string; nachname: string }[] = miData?.data?.data ?? []

  const canSave = !!(form.einheitId && form.vertragsbeginn && form.nettomiete && form.mieterId)

  function isAktiv(v: Vertrag) {
    const heute = new Date()
    return new Date(v.vertragsbeginn) <= heute && (!v.vertragsende || new Date(v.vertragsende) >= heute)
  }

  return (
    <div>
      <PageHeader
        title="Mietverträge"
        description="Alle aktiven und historischen Mietverträge"
        action={<Button onClick={() => { setForm(defaultForm); setOpen(true) }}><Plus className="h-4 w-4 mr-1" />Neuer Vertrag</Button>}
      />

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : vertraege.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-slate-400">
          Noch keine Mietverträge. Legen Sie zuerst Objekte, Einheiten und Mieter an.
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {vertraege.map((v) => {
            const aktiv = isAktiv(v)
            const mieterName = v.mietvertragMieter?.[0]?.mieter
              ? [v.mietvertragMieter[0].mieter.vorname, v.mietvertragMieter[0].mieter.nachname].filter(Boolean).join(' ')
              : '—'
            return (
              <Card key={v.id} className="cursor-pointer hover:shadow-md transition" onClick={() => setSelected(v)}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium truncate">{v.einheit?.bezeichnung ?? '—'}</p>
                        <p className="text-xs text-slate-400">{v.einheit?.objekt?.bezeichnung}</p>
                        <p className="text-sm text-slate-600 mt-0.5">{mieterName}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-slate-900">{euro(v.nettomiete)}</p>
                      <p className="text-xs text-slate-400">+ {euro(v.nkVorauszahlung)} NK</p>
                      <Badge variant={aktiv ? 'default' : 'secondary'} className="mt-1">{aktiv ? 'Aktiv' : 'Beendet'}</Badge>
                    </div>
                  </div>
                  <div className="mt-2 flex gap-3 text-xs text-slate-400 items-center">
                    <CalendarDays className="h-3 w-3" />
                    <span>{datum(v.vertragsbeginn)} — {v.vertragsende ? datum(v.vertragsende) : 'unbefristet'}</span>
                    <Badge variant="outline">{v.mietart}</Badge>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ── Detail-Sheet ────────────────────────────────────────────── */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Mietvertrag · {selected.einheit?.bezeichnung}
                </SheetTitle>
                <p className="text-sm text-muted-foreground">{selected.einheit?.objekt?.bezeichnung}</p>
              </SheetHeader>

              <Tabs defaultValue="info" className="mt-4">
                <TabsList className="w-full grid grid-cols-3">
                  <TabsTrigger value="info"><Info className="h-3.5 w-3.5 mr-1.5" />Konditionen</TabsTrigger>
                  <TabsTrigger value="mieter"><User className="h-3.5 w-3.5 mr-1.5" />Mieter</TabsTrigger>
                  <TabsTrigger value="dokumente"><FolderOpen className="h-3.5 w-3.5 mr-1.5" />Dokumente</TabsTrigger>
                </TabsList>

                <TabsContent value="info" className="mt-4 space-y-3 text-sm">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Mietart" value={selected.mietart} />
                    <Field label="Status" value={(selected.vertragsende && new Date(selected.vertragsende) < new Date()) ? 'Beendet' : 'Aktiv'} />
                    <Field label="Beginn" value={datum(selected.vertragsbeginn)} />
                    <Field label="Ende" value={selected.vertragsende ? datum(selected.vertragsende) : 'unbefristet'} />
                    <Field label="Nettomiete" value={euro(selected.nettomiete)} />
                    <Field label="NK-Vorauszahlung" value={euro(selected.nkVorauszahlung)} />
                    {selected.kaution !== undefined && selected.kaution !== null && <Field label="Kaution" value={euro(selected.kaution)} />}
                    {selected.mietflaecheM2 && <Field label="Mietfläche" value={`${selected.mietflaecheM2} m²`} />}
                  </div>
                  {selected.notizen && (
                    <div>
                      <p className="text-xs text-muted-foreground">Notizen</p>
                      <p className="text-sm">{selected.notizen}</p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="mieter" className="mt-4">
                  {!selected.mietvertragMieter || selected.mietvertragMieter.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">Keine Mieter zugeordnet</p>
                  ) : (
                    <ul className="space-y-2">
                      {selected.mietvertragMieter.map((mvm, i) => (
                        <li key={i} className="border rounded-lg p-3 flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <div className="flex-1">
                            <p className="text-sm font-medium">
                              {[mvm.mieter.vorname, mvm.mieter.nachname].filter(Boolean).join(' ')}
                            </p>
                            <p className="text-xs text-muted-foreground">{mvm.rolle}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </TabsContent>

                <TabsContent value="dokumente" className="mt-4">
                  <DocumentSection scope="mietvertrag" entityId={selected.id} />
                </TabsContent>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Neuer Mietvertrag</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Einheit *</Label>
              <Select value={form.einheitId} onValueChange={(v) => set('einheitId', v ?? '')}>
                <SelectTrigger><SelectValue placeholder="Auswählen…" /></SelectTrigger>
                <SelectContent>{einheiten.map((e) => <SelectItem key={e.id} value={e.id}>{e.bezeichnung}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="space-y-1"><Label>Hauptmieter *</Label>
              <Select value={form.mieterId} onValueChange={(v) => set('mieterId', v ?? '')}>
                <SelectTrigger><SelectValue placeholder="Auswählen…" /></SelectTrigger>
                <SelectContent>{mieter.map((m) => <SelectItem key={m.id} value={m.id}>{[m.vorname, m.nachname].filter(Boolean).join(' ')}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="space-y-1"><Label>Mietart</Label>
              <Select value={form.mietart} onValueChange={(v) => set('mietart', v ?? 'wohnraum')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="wohnraum">Wohnraum</SelectItem>
                  <SelectItem value="gewerbe">Gewerbe</SelectItem>
                </SelectContent>
              </Select></div>
            <div className="space-y-1"><Label>Vertragsbeginn *</Label>
              <Input type="date" value={form.vertragsbeginn} onChange={(e) => set('vertragsbeginn', e.target.value)} /></div>
            <div className="space-y-1"><Label>Vertragsende</Label>
              <Input type="date" value={form.vertragsende} onChange={(e) => set('vertragsende', e.target.value)} /></div>
            <div className="space-y-1"><Label>Nettomiete (€) *</Label>
              <Input type="number" min="0" step="0.01" value={form.nettomiete} onChange={(e) => set('nettomiete', e.target.value)} placeholder="850.00" /></div>
            <div className="space-y-1"><Label>NK-Vorauszahlung (€)</Label>
              <Input type="number" min="0" step="0.01" value={form.nkVorauszahlung} onChange={(e) => set('nkVorauszahlung', e.target.value)} placeholder="150.00" /></div>
            <div className="space-y-1"><Label>Kaution (€)</Label>
              <Input type="number" min="0" step="0.01" value={form.kaution} onChange={(e) => set('kaution', e.target.value)} placeholder="2550.00" /></div>
          </div>
          {!canSave && (
            <p className="text-xs text-slate-400">* Pflichtfelder: Einheit, Mieter, Vertragsbeginn, Nettomiete</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Abbrechen</Button>
            <Button onClick={() => saveMut.mutate(form)} disabled={!canSave || saveMut.isPending}>
              {saveMut.isPending ? 'Speichern…' : 'Speichern'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  )
}
