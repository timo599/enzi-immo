'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, Calculator, Info } from 'lucide-react'
import { toast } from 'sonner'

interface VpiResult {
  basisMonat: string
  basisWert: number
  aktuellerMonat: string
  aktuellerWert: number
  veraenderungProzent: number
  berechtigt: boolean
  schwellenwert: number
  aktuelleNettomiete: number
  neueMiete: number
  differenz: number
}

const AKTUELLE_MONATE = [
  '2025-12','2025-11','2025-10','2025-09','2025-08','2025-07',
  '2025-06','2025-05','2025-04','2025-03','2025-02','2025-01',
  '2024-12','2024-11','2024-10','2024-09','2024-08','2024-07',
  '2024-06','2024-05','2024-04','2024-03','2024-02','2024-01',
]

function fmt(n: number) {
  return n.toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtPct(n: number) {
  return n.toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function VpiPage() {
  const [basisMonat, setBasisMonat] = useState('2023-01')
  const [aktuellerMonat, setAktuellerMonat] = useState('2025-12')
  const [nettomiete, setNettomiete] = useState('')
  const [schwellenwert, setSchwellenwert] = useState('5')
  const [result, setResult] = useState<VpiResult | null>(null)

  const berechne = useMutation({
    mutationFn: () => api.post<{ data: VpiResult }>('/vpi/berechnung', {
      basisMonat,
      aktuellerMonat,
      aktuelleNettomiete: parseFloat(nettomiete),
      schwellenwert:      parseFloat(schwellenwert),
    }).then(r => r.data.data),
    onSuccess: (data) => setResult(data),
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Fehler bei der Berechnung'),
  })

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 max-w-3xl mx-auto">
      <PageHeader
        title="VPI-Rechner"
        description="Indexbasierte Mieterhöhung berechnen (Verbraucherpreisindex Österreich, Basis 2020=100)"
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calculator className="h-4 w-4 text-primary" />
            Eingaben
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Basis-Monat (Vertragsabschluss)</Label>
              <Input
                type="month"
                value={basisMonat}
                onChange={e => setBasisMonat(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Monat, auf den die Indexklausel verweist
              </p>
            </div>
            <div>
              <Label>Aktueller Monat (Vergleich)</Label>
              <Input
                type="month"
                value={aktuellerMonat}
                onChange={e => setAktuellerMonat(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Aktuelle Nettomiete (€)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={nettomiete}
                onChange={e => setNettomiete(e.target.value)}
                placeholder="z.B. 850.00"
              />
            </div>
            <div>
              <Label>Schwellenwert (%)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={schwellenwert}
                onChange={e => setSchwellenwert(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Mindestveränderung für Berechtigung (üblicherweise 5 %)
              </p>
            </div>
          </div>
          <Button
            className="w-full sm:w-auto"
            disabled={!nettomiete || !basisMonat || !aktuellerMonat || berechne.isPending}
            onClick={() => berechne.mutate()}
          >
            <TrendingUp className="h-4 w-4 mr-2" />
            {berechne.isPending ? 'Berechne…' : 'Berechnen'}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Ergebnis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">VPI {result.basisMonat}</p>
                <p className="text-lg font-semibold">{result.basisWert}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">VPI {result.aktuellerMonat}</p>
                <p className="text-lg font-semibold">{result.aktuellerWert}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Veränderung</p>
                <p className={`text-lg font-semibold ${result.veraenderungProzent >= 0 ? 'text-orange-600' : 'text-green-600'}`}>
                  {result.veraenderungProzent >= 0 ? '+' : ''}{fmtPct(result.veraenderungProzent)} %
                </p>
              </div>
            </div>

            <div className="border rounded-xl overflow-hidden">
              <div className="bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground">Ergebnis der Berechnung</div>
              <div className="divide-y">
                <div className="flex justify-between px-4 py-3">
                  <span className="text-sm">Aktuelle Nettomiete</span>
                  <span className="text-sm font-medium">€ {fmt(result.aktuelleNettomiete)}</span>
                </div>
                <div className="flex justify-between px-4 py-3">
                  <span className="text-sm">Neue Nettomiete</span>
                  <span className="text-sm font-semibold text-primary">€ {fmt(result.neueMiete)}</span>
                </div>
                <div className="flex justify-between px-4 py-3">
                  <span className="text-sm">Erhöhungsbetrag</span>
                  <span className={`text-sm font-medium ${result.differenz > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                    {result.differenz > 0 ? '+' : ''}€ {fmt(result.differenz)}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm">Erhöhung berechtigt?</span>
                  <Badge variant={result.berechtigt ? 'default' : 'secondary'}>
                    {result.berechtigt ? `✓ Ja (Schwelle ${result.schwellenwert}% überschritten)` : `✗ Nein (unter ${result.schwellenwert}%)` }
                  </Badge>
                </div>
              </div>
            </div>

            {result.berechtigt && (
              <div className="mt-4 rounded-lg bg-blue-50 border border-blue-200 p-3 flex gap-2">
                <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                <p className="text-xs text-blue-700">
                  Der VPI ist um {fmtPct(result.veraenderungProzent)} % gestiegen. Eine Anpassung der Nettomiete
                  auf <strong>€ {fmt(result.neueMiete)}</strong> wäre zulässig. Bitte prüfe die Indexklausel
                  im Mietvertrag und halte die gesetzliche Vorankündigungsfrist ein.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs text-muted-foreground font-medium">Hinweis</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Die VPI-Werte basieren auf Statistik Austria (Basis 2020=100). Aktualisierungen erfolgen monatlich.
            Diese Berechnung ersetzt keine rechtliche Beratung. Indexklauseln in Mietverträgen können
            abweichende Regelungen enthalten.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
