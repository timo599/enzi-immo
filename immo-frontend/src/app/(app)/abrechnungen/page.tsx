'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { abrechnungApi, exportApi, objekteApi } from '@/lib/api'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { euro, datum } from '@/lib/format'
import { Plus, Download, CheckCircle, Calculator, AlertTriangle } from 'lucide-react'

interface Abrechnung {
  id: string; status: string; abrechnungsbeginn: string; abrechnungsende: string
  nachzahlungOderGuthaben: number; vorauszahlungenGesamt: number; gesamtkostenAnteil: number
  mietvertrag?: { einheit?: { bezeichnung: string }; mietvertragMieter?: { mieter: { nachname: string } }[] }
}

interface Zeitraum { id: string; bezeichnung: string; von: string; bis: string; status: string }

const STATUS_BADGE: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  entwurf: 'secondary', in_pruefung: 'outline', freigegeben: 'default', versendet: 'default', abgeschlossen: 'default',
}

export default function AbrechnungenPage() {
  const qc = useQueryClient()
  const [zeitraumOpen, setZeitraumOpen] = useState(false)
  const [tab, setTab] = useState('abrechnungen')
  const [zeitraumForm, setZeitraumForm] = useState({ objektId: '', bezeichnung: '', von: '', bis: '' })

  const { data: zaData, isLoading: zaLoading } = useQuery({ queryKey: ['zeitraeume'], queryFn: () => abrechnungApi.zeitraeume.list() })
  const { data: abData, isLoading: abLoading } = useQuery({ queryKey: ['abrechnungen'], queryFn: () => abrechnungApi.list() })
  const { data: objData } = useQuery({ queryKey: ['objekte'], queryFn: () => objekteApi.list() })

  const zeitraumMut = useMutation({
    mutationFn: () => abrechnungApi.zeitraeume.create(zeitraumForm),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['zeitraeume'] }); toast.success('Abrechnungszeitraum angelegt'); setZeitraumOpen(false) },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? 'Fehler beim Anlegen'),
  })

  const berechneMut = useMutation({
    mutationFn: (zeitraumId: string) => abrechnungApi.berechne({ zeitraumId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['abrechnungen'] }); qc.invalidateQueries({ queryKey: ['zeitraeume'] }); toast.success('Berechnung abgeschlossen'); setTab('abrechnungen') },
    onError: (err: any) => {
      const details = err?.response?.data?.error?.details
      if (details?.blockers?.length) {
        toast.error(`Fehlende Voraussetzung: ${details.blockers[0].message}`)
      } else {
        toast.error(err?.response?.data?.error?.message ?? 'Fehler bei der Berechnung')
      }
    },
  })

  const freigebenMut = useMutation({
    mutationFn: (id: string) => abrechnungApi.freigeben(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['abrechnungen'] }); toast.success('Abrechnung freigegeben') },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? 'Fehler beim Freigeben'),
  })

  const pdfMut = useMutation({
    mutationFn: (id: string) => exportApi.nkPdf(id),
    onSuccess: (res) => {
      const url: string = res.data?.data?.url
      if (url) window.open(url, '_blank')
      toast.success('PDF erstellt')
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? 'PDF-Erstellung fehlgeschlagen'),
  })

  const zeitraeume: Zeitraum[] = zaData?.data?.data ?? []
  const abrechnungen: Abrechnung[] = abData?.data?.data ?? []
  const objekte: { id: string; bezeichnung: string }[] = objData?.data?.data ?? []

  function setZF(k: string, v: string) { setZeitraumForm((f) => ({ ...f, [k]: v })) }

  return (
    <div>
      <PageHeader
        title="NK-Abrechnungen"
        description="Nebenkostenabrechnungen erstellen, prüfen und versenden"
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setZeitraumOpen(true)}><Plus className="h-4 w-4 mr-1" />Zeitraum</Button>
          </div>
        }
      />

      <Tabs value={tab} onValueChange={setTab} className="mb-4">
        <TabsList>
          <TabsTrigger value="abrechnungen">Abrechnungen</TabsTrigger>
          <TabsTrigger value="zeitraeume">Zeiträume</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === 'abrechnungen' && (
        abLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
        ) : abrechnungen.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-slate-400">
            Noch keine Abrechnungen. Legen Sie zuerst einen Abrechnungszeitraum an.
          </CardContent></Card>
        ) : (
          <div className="space-y-3">
            {abrechnungen.map((a) => {
              const istGuthaben = a.nachzahlungOderGuthaben < 0
              const mieterName = a.mietvertrag?.mietvertragMieter?.[0]?.mieter.nachname ?? '—'
              return (
                <Card key={a.id}>
                  <CardContent className="py-4">
                    <div className="flex items-start gap-4 justify-between">
                      <div className="min-w-0">
                        <p className="font-medium">{a.mietvertrag?.einheit?.bezeichnung ?? '—'}</p>
                        <p className="text-sm text-slate-500">{mieterName} · {datum(a.abrechnungsbeginn)} – {datum(a.abrechnungsende)}</p>
                        <div className="mt-2 flex gap-3 text-xs text-slate-400">
                          <span>Kosten: {euro(a.gesamtkostenAnteil)}</span>
                          <span>VZ: {euro(a.vorauszahlungenGesamt)}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-lg font-bold ${istGuthaben ? 'text-green-600' : 'text-red-600'}`}>
                          {istGuthaben ? 'Guthaben' : 'Nachzahlung'}: {euro(Math.abs(a.nachzahlungOderGuthaben))}
                        </p>
                        <Badge variant={STATUS_BADGE[a.status] ?? 'secondary'}>{a.status}</Badge>
                        <div className="flex gap-1 mt-2 justify-end">
                          {a.status === 'entwurf' && (
                            <Button size="sm" variant="outline" onClick={() => freigebenMut.mutate(a.id)}>
                              <CheckCircle className="h-3.5 w-3.5 mr-1" />Freigeben
                            </Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => pdfMut.mutate(a.id)} disabled={pdfMut.isPending}>
                            <Download className="h-3.5 w-3.5 mr-1" />PDF
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )
      )}

      {tab === 'zeitraeume' && (
        <div className="space-y-3">
          {zaLoading ? (
            <Skeleton className="h-32" />
          ) : zeitraeume.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-slate-400">Noch keine Zeiträume</CardContent></Card>
          ) : (
            zeitraeume.map((z) => (
              <Card key={z.id}>
                <CardContent className="py-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium">{z.bezeichnung}</p>
                    <p className="text-sm text-slate-400">{datum(z.von)} – {datum(z.bis)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={z.status === 'abgeschlossen' ? 'default' : 'secondary'}>{z.status}</Badge>
                    {z.status !== 'abgeschlossen' && (
                      <Button size="sm" variant="outline"
                        onClick={() => berechneMut.mutate(z.id)}
                        disabled={berechneMut.isPending}>
                        <Calculator className="h-3.5 w-3.5 mr-1" />
                        {berechneMut.isPending ? 'Berechnung…' : 'Berechnen'}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Zeitraum Dialog */}
      <Dialog open={zeitraumOpen} onOpenChange={setZeitraumOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Abrechnungszeitraum anlegen</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Objekt *</Label>
              <Select value={zeitraumForm.objektId} onValueChange={(v) => setZF('objektId', v ?? '')}>
                <SelectTrigger><SelectValue placeholder="Auswählen…" /></SelectTrigger>
                <SelectContent>{objekte.map((o) => <SelectItem key={o.id} value={o.id}>{o.bezeichnung}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="space-y-1"><Label>Bezeichnung</Label>
              <Input value={zeitraumForm.bezeichnung} onChange={(e) => setZF('bezeichnung', e.target.value)} placeholder="NK 2024" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Von</Label><Input type="date" value={zeitraumForm.von} onChange={(e) => setZF('von', e.target.value)} /></div>
              <div className="space-y-1"><Label>Bis</Label><Input type="date" value={zeitraumForm.bis} onChange={(e) => setZF('bis', e.target.value)} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setZeitraumOpen(false)}>Abbrechen</Button>
            <Button onClick={() => zeitraumMut.mutate()} disabled={zeitraumMut.isPending}>{zeitraumMut.isPending ? 'Anlegen…' : 'Anlegen'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
