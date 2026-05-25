'use client'

import { useQuery } from '@tanstack/react-query'
import { api, dashboardApi } from '@/lib/api'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { CalendarClock, TrendingUp, Wrench, AlertTriangle } from 'lucide-react'
import { euro } from '@/lib/format'

interface AuslaufenderVertrag {
  id: string; einheit: string; objekt: string; adresse: string
  mieter: string; vertragsende: string; restTage: number; nettomiete: number
}
interface AmpelEintrag {
  id: string; einheit: string; mieter: string; aktuelleMiete: number
  neueMiete: number | null; naechstmoeglichesDatum: string
  ampelFarbe: 'rot' | 'gelb' | 'gruen'; juristischePruefungNoetig: boolean
}
interface Reparatur {
  id: string; titel: string; status: string; datum: string; kosten: number | null
  handwerker: string | null
  einheit?: { bezeichnung: string; objekt: { bezeichnung: string } } | null
  objekt?: { bezeichnung: string } | null
}

function RestTageChip({ tage }: { tage: number }) {
  const cls = tage <= 14 ? 'bg-red-100 text-red-700 border-red-200'
    : tage <= 30 ? 'bg-orange-100 text-orange-700 border-orange-200'
    : tage <= 60 ? 'bg-yellow-100 text-yellow-700 border-yellow-200'
    : 'bg-slate-100 text-slate-600 border-slate-200'
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      noch {tage} Tage
    </span>
  )
}

export default function FristenPage() {
  const { data: auslaufend, isLoading: loadAuslaufend } = useQuery({
    queryKey: ['fristen-auslaufend'],
    queryFn: () => api.get<{ data: AuslaufenderVertrag[] }>('/dashboard/auslaufende-vertraege?tage=180')
      .then(r => r.data.data),
  })

  const { data: ampelRes, isLoading: loadAmpel } = useQuery({
    queryKey: ['fristen-ampel'],
    queryFn: () => dashboardApi.ampel().then((r: any) => r.data?.data as AmpelEintrag[]),
  })

  const { data: repRes, isLoading: loadRep } = useQuery({
    queryKey: ['fristen-reparaturen'],
    queryFn: () => api.get<{ data: Reparatur[] }>('/reparaturen?status=offen').then(r => r.data.data),
  })

  const auslaufendData = auslaufend ?? []
  const ampelData: AmpelEintrag[] = ampelRes ?? []
  const repData: Reparatur[] = repRes ?? []

  const kritisch = auslaufendData.filter(v => v.restTage <= 30).length
    + ampelData.filter(a => a.ampelFarbe === 'rot').length
    + repData.length

  return (
    <div>
      <PageHeader
        title="Fristenübersicht"
        description="Auslaufende Verträge, fällige Erhöhungen und offene Reparaturen auf einen Blick"
      />

      {/* Summary-Chips */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className={`rounded-xl border p-3 ${kritisch > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
          <p className="text-xs text-slate-500 mb-1">Handlungsbedarf</p>
          <p className={`text-2xl font-bold ${kritisch > 0 ? 'text-red-700' : 'text-green-700'}`}>{kritisch}</p>
          <p className="text-xs text-slate-400">kritische Einträge</p>
        </div>
        <div className="rounded-xl border bg-blue-50 border-blue-200 p-3">
          <p className="text-xs text-slate-500 mb-1">Verträge (180 Tage)</p>
          <p className="text-2xl font-bold text-blue-700">{auslaufendData.length}</p>
          <p className="text-xs text-slate-400">laufen aus</p>
        </div>
        <div className="rounded-xl border bg-amber-50 border-amber-200 p-3">
          <p className="text-xs text-slate-500 mb-1">Erhöhungen</p>
          <p className="text-2xl font-bold text-amber-700">{ampelData.length}</p>
          <p className="text-xs text-slate-400">davon {ampelData.filter(a => a.ampelFarbe === 'rot').length} dringend</p>
        </div>
        <div className="rounded-xl border bg-orange-50 border-orange-200 p-3">
          <p className="text-xs text-slate-500 mb-1">Reparaturen offen</p>
          <p className="text-2xl font-bold text-orange-700">{repData.length}</p>
          <p className="text-xs text-slate-400">ausstehend</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Auslaufende Verträge */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-blue-500" />
              Auslaufende Mietverträge
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadAuslaufend ? <Skeleton className="h-40" /> : auslaufendData.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">Keine Verträge in den nächsten 180 Tagen</p>
            ) : (
              <div className="space-y-2">
                {auslaufendData.map(v => (
                  <div key={v.id} className="flex items-center gap-3 rounded-lg border border-slate-100 p-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{v.objekt} · {v.einheit}</p>
                      <p className="text-xs text-muted-foreground">{v.mieter} · bis {new Date(v.vertragsende).toLocaleDateString('de-DE')}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <RestTageChip tage={v.restTage} />
                      <span className="text-xs text-slate-500">{euro(v.nettomiete)}/Mo.</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Mieterhöhungen */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-amber-500" />
              Fällige Mieterhöhungen
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadAmpel ? <Skeleton className="h-40" /> : ampelData.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">Keine fälligen Erhöhungen</p>
            ) : (
              <div className="space-y-2">
                {ampelData.map(a => (
                  <div key={a.id} className="flex items-center gap-3 rounded-lg border border-slate-100 p-2.5">
                    <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${a.ampelFarbe === 'rot' ? 'bg-red-500' : a.ampelFarbe === 'gelb' ? 'bg-yellow-400' : 'bg-green-500'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{a.einheit}</p>
                      <p className="text-xs text-muted-foreground truncate">{a.mieter}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-medium">{euro(a.aktuelleMiete)}</p>
                      {a.neueMiete && <p className="text-xs text-green-600">→ {euro(a.neueMiete)}</p>}
                    </div>
                    {a.juristischePruefungNoetig && (
                      <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Offene Reparaturen */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Wrench className="h-4 w-4 text-orange-500" />
              Offene Reparaturen
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadRep ? <Skeleton className="h-20" /> : repData.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">Keine offenen Reparaturen — alles in Ordnung 🎉</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2">
                {repData.map(r => (
                  <div key={r.id} className="flex items-start gap-3 rounded-lg border border-orange-100 bg-orange-50/50 p-3">
                    <Wrench className="h-4 w-4 text-orange-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{r.titel}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.einheit ? `${r.einheit.objekt.bezeichnung} · ${r.einheit.bezeichnung}` : r.objekt?.bezeichnung ?? '—'}
                      </p>
                      {r.handwerker && <p className="text-xs text-slate-500">Handwerker: {r.handwerker}</p>}
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-orange-600 border-orange-300">
                          {r.status === 'offen' ? 'Offen' : 'In Bearbeitung'}
                        </Badge>
                        {r.kosten && <span className="text-xs text-slate-500">{euro(r.kosten)}</span>}
                        <span className="text-xs text-slate-400">{new Date(r.datum).toLocaleDateString('de-DE')}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
