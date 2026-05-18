'use client'

import { useQuery } from '@tanstack/react-query'
import { dashboardApi } from '@/lib/api'
import { euro, prozent, datum } from '@/lib/format'
import { PageHeader } from '@/components/page-header'
import { StatCard } from '@/components/stat-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Building2, Home, Users, AlertTriangle, FileText, Euro } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'

export default function DashboardPage() {
  const { data: kpisRes, isLoading: kpisLoading } = useQuery({
    queryKey: ['dashboard-kpis'],
    queryFn: () => dashboardApi.kpis(),
  })
  const { data: cashflowRes, isLoading: cfLoading } = useQuery({
    queryKey: ['dashboard-cashflow'],
    queryFn: () => dashboardApi.cashflow(6),
  })
  const { data: ampelRes } = useQuery({
    queryKey: ['dashboard-ampel'],
    queryFn: () => dashboardApi.ampel(),
  })

  const kpis = kpisRes?.data?.data
  const cashflow: { monat: string; soll: number; ist: number }[] = cashflowRes?.data?.data ?? []
  const ampel: {
    id: string; einheit: string; mieter: string; aktuelleMiete: number
    neueMiete: number | null; naechstmoeglichesDatum: string
    ampelFarbe: 'rot' | 'gelb' | 'gruen'; juristischePruefungNoetig: boolean
  }[] = ampelRes?.data?.data ?? []

  const ampelFarbe = {
    rot:   'destructive' as const,
    gelb:  'outline' as const,
    gruen: 'secondary' as const,
  }

  return (
    <div>
      <PageHeader title="Dashboard" description="Überblick über Ihr Immobilienportfolio" />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {kpisLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-5"><Skeleton className="h-16" /></CardContent></Card>
          ))
        ) : (
          <>
            <StatCard
              title="Einheiten gesamt"
              value={kpis?.einheiten.gesamt ?? 0}
              sub={`${kpis?.einheiten.vermietet ?? 0} vermietet`}
              icon={<Building2 className="h-8 w-8" />}
            />
            <StatCard
              title="Leerstandsquote"
              value={prozent(kpis?.einheiten.leerstandsquotePct ?? 0)}
              sub={`${kpis?.einheiten.leer ?? 0} leer`}
              color={kpis?.einheiten.leer > 0 ? 'yellow' : 'green'}
              icon={<Home className="h-8 w-8" />}
            />
            <StatCard
              title="Aktive Verträge"
              value={kpis?.mietvertraege.aktiv ?? 0}
              icon={<Users className="h-8 w-8" />}
            />
            <StatCard
              title="Offene Posten"
              value={euro(kpis?.offenePosten.offen ?? 0)}
              sub={`${kpis?.offenePosten.anzahl ?? 0} Posten`}
              color={kpis?.offenePosten.offen > 0 ? 'red' : 'green'}
              icon={<Euro className="h-8 w-8" />}
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cashflow Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Cashflow (letzte 6 Monate)</CardTitle>
          </CardHeader>
          <CardContent>
            {cfLoading ? (
              <Skeleton className="h-48" />
            ) : cashflow.length === 0 ? (
              <p className="text-sm text-slate-400 py-8 text-center">Noch keine Daten</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={cashflow} margin={{ left: 0, right: 0 }}>
                  <XAxis dataKey="monat" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v / 1000}k`} />
                  <Tooltip formatter={(v) => euro(Number(v))} />
                  <Legend />
                  <Bar dataKey="soll" name="Soll" fill="#94a3b8" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="ist"  name="Ist"  fill="#3b82f6" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Mieterhöhungs-Ampel */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              Mieterhöhungen fällig
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ampel.length === 0 ? (
              <p className="text-sm text-slate-400">Keine fälligen Erhöhungen</p>
            ) : (
              <div className="space-y-3">
                {ampel.slice(0, 5).map((e) => (
                  <div key={e.id} className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{e.einheit}</p>
                      <p className="text-xs text-slate-400 truncate">{e.mieter}</p>
                      <p className="text-xs text-slate-400">{datum(e.naechstmoeglichesDatum)}</p>
                    </div>
                    <Badge variant={ampelFarbe[e.ampelFarbe]} className="shrink-0 text-xs">
                      {euro(e.aktuelleMiete)}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Unreviewed Belege */}
      {kpis?.belege?.unreviewed > 0 && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          <FileText className="h-4 w-4 shrink-0" />
          <span>
            <strong>{kpis.belege.unreviewed} Belege</strong> warten auf Prüfung.{' '}
            <a href="/dokumente" className="underline font-medium">Jetzt prüfen →</a>
          </span>
        </div>
      )}
    </div>
  )
}
