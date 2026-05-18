'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { mieterhoehungApi, mietvertraegeApi } from '@/lib/api'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { euro, datum } from '@/lib/format'
import { Calculator, TrendingUp, AlertTriangle, CheckCircle, Clock } from 'lucide-react'

interface Erhoehung {
  id: string; einheit: string; mieter: string; aktuelleMiete: number
  neueMiete?: number; ampelStatus: string
  naechstmoeglichesDatum: string; juristischePruefungNoetig: boolean
  status: string; erhoehungstyp?: string
}

function ampelFarbe(datum: string): 'rot' | 'gelb' | 'gruen' {
  const tage = Math.ceil((new Date(datum).getTime() - Date.now()) / 86400000)
  if (tage <= 30) return 'rot'
  if (tage <= 90) return 'gelb'
  return 'gruen'
}

const AMPEL_BADGE: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  faellig:              'destructive',
  bald_faellig:         'outline',
  geplant:              'secondary',
  kein_handlungsbedarf: 'default',
  manuelle_pruefung:    'destructive',
}

export default function MieterhoehungenPage() {
  const qc = useQueryClient()
  const [berechneOpen, setBerechneOpen] = useState(false)
  const [mietvertragId, setMietvertragId] = useState('')

  const { data, isLoading } = useQuery({ queryKey: ['mieterhoehungen'], queryFn: () => mieterhoehungApi.list() })
  const { data: mvData } = useQuery({ queryKey: ['mietvertraege'], queryFn: () => mietvertraegeApi.list() })

  const berechneMut = useMutation({
    mutationFn: () => mieterhoehungApi.berechne(mietvertragId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mieterhoehungen'] }); toast.success('Berechnung abgeschlossen'); setBerechneOpen(false) },
    onError: () => toast.error('Fehler bei der Berechnung'),
  })

  const abschliessenMut = useMutation({
    mutationFn: (id: string) => mieterhoehungApi.update(id, { status: 'abgeschlossen' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mieterhoehungen'] }); toast.success('Als abgeschlossen markiert') },
    onError: () => toast.error('Fehler'),
  })

  const erhoehungen: Erhoehung[] = data?.data?.data ?? []
  type Vertrag = {
    id: string
    nettomiete?: number
    einheit?: { bezeichnung: string; objekt?: { bezeichnung?: string } }
    mietvertragMieter?: { mieter: { nachname?: string; vorname?: string; firmenname?: string } }[]
  }
  const mietvertraege: Vertrag[] = mvData?.data?.data ?? []
  function vertragLabel(v: Vertrag): string {
    const m = v.mietvertragMieter?.[0]?.mieter
    const mieterName = m?.firmenname || [m?.vorname, m?.nachname].filter(Boolean).join(' ').trim() || '— ohne Mieter —'
    const ein = v.einheit?.bezeichnung ?? '?'
    const obj = v.einheit?.objekt?.bezeichnung ?? ''
    return `${ein}${obj ? ', ' + obj : ''} · ${mieterName}`
  }

  return (
    <div>
      <PageHeader
        title="Mieterhöhungen"
        description="§558 BGB – Automatische Berechnung von Erhöhungspotenzial und Fristen"
        action={<Button onClick={() => setBerechneOpen(true)}><Calculator className="h-4 w-4 mr-1" />Berechnen</Button>}
      />

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : erhoehungen.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-slate-400">
          Noch keine Berechnungen. Starten Sie eine Berechnung für einen Mietvertrag.
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {erhoehungen.map((e) => {
            const farbe = ampelFarbe(e.naechstmoeglichesDatum)
            return (
            <Card key={e.id} className={farbe === 'rot' ? 'border-red-200 bg-red-50/30' : farbe === 'gelb' ? 'border-yellow-200 bg-yellow-50/20' : ''}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {farbe === 'rot' ? <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" /> :
                       farbe === 'gelb' ? <Clock className="h-4 w-4 text-yellow-500 shrink-0" /> :
                       <TrendingUp className="h-4 w-4 text-green-500 shrink-0" />}
                      <span className="font-medium">{e.einheit}</span>
                    </div>
                    <p className="text-sm text-slate-500">{e.mieter}</p>
                    <p className="text-xs text-slate-400 mt-1">Frühestens ab: {datum(e.naechstmoeglichesDatum)}</p>
                    {e.juristischePruefungNoetig && (
                      <p className="text-xs text-orange-600 mt-1 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />Juristische Prüfung erforderlich
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0 space-y-1">
                    <p className="text-sm text-slate-500">Aktuell: <span className="font-medium">{euro(e.aktuelleMiete)}</span></p>
                    {e.neueMiete && (
                      <p className="text-sm text-green-700">Max: <span className="font-semibold">{euro(e.neueMiete)}</span></p>
                    )}
                    <Badge variant={AMPEL_BADGE[e.ampelStatus] ?? 'secondary'}>{e.ampelStatus.replace(/_/g, ' ')}</Badge>
                    {e.status !== 'abgeschlossen' && (
                      <div className="mt-2">
                        <Button size="sm" variant="outline" onClick={() => abschliessenMut.mutate(e.id)}>
                          <CheckCircle className="h-3.5 w-3.5 mr-1" />Abschließen
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )})}
        </div>
      )}

      {/* Berechnen Dialog */}
      <Dialog open={berechneOpen} onOpenChange={setBerechneOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Mieterhöhung berechnen</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-slate-500">Berechnet das frühestmögliche Datum und die zulässige Höchstmiete nach §558 BGB (20% Kappungsgrenze in 36 Monaten).</p>
            <div className="space-y-1"><Label>Mietvertrag *</Label>
              <Select value={mietvertragId} onValueChange={(v) => setMietvertragId(v ?? '')}>
                <SelectTrigger><SelectValue placeholder="Auswählen…" /></SelectTrigger>
                <SelectContent>
                  {mietvertraege.map((mv) => (
                    <SelectItem key={mv.id} value={mv.id}>
                      {vertragLabel(mv)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBerechneOpen(false)}>Abbrechen</Button>
            <Button onClick={() => berechneMut.mutate()} disabled={!mietvertragId || berechneMut.isPending}>
              {berechneMut.isPending ? 'Berechnen…' : 'Berechnen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
