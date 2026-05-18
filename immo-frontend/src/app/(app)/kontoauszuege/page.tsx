'use client'

import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { kontoauszugApi } from '@/lib/api'
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
import { Upload, CreditCard, CheckCircle, HelpCircle, X } from 'lucide-react'

interface Kontoauszug {
  id: string; dateiname: string; format: string; kontonummer?: string
  buchungszeilen?: number; erstelltAm: string
}

interface Buchungszeile {
  id: string; datum: string; betrag: number; verwendungszweck?: string
  auftraggeberName?: string; matchingStatus: string; buchungstyp?: string
}

export default function KontoauszuegePage() {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [selected, setSelected] = useState<Kontoauszug | null>(null)
  const [format, setFormat] = useState('mt940')

  const { data, isLoading } = useQuery({ queryKey: ['kontoauszuege'], queryFn: () => kontoauszugApi.list() })

  const { data: buchData } = useQuery({
    queryKey: ['buchungszeilen', selected?.id],
    queryFn: () => kontoauszugApi.buchungen(selected!.id),
    enabled: !!selected,
  })

  const importMut = useMutation({
    mutationFn: () => {
      const file = fileRef.current?.files?.[0]
      if (!file) throw new Error('Keine Datei')
      const fd = new FormData()
      fd.append('file', file)
      return kontoauszugApi.import(fd, { format })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['kontoauszuege'] }); toast.success('Import erfolgreich'); setImportOpen(false) },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? 'Import fehlgeschlagen'),
  })

  const auszuege: Kontoauszug[] = data?.data?.data ?? []
  const buchungen: Buchungszeile[] = buchData?.data?.data ?? []

  const matchingBadge: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    auto_matched: 'default', manually_matched: 'default', unmatched: 'destructive', ignored: 'secondary', ambiguous: 'outline',
  }

  return (
    <div>
      <PageHeader
        title="Kontoauszüge"
        description="MT940 / CSV-Import mit automatischem Matching"
        action={<Button onClick={() => setImportOpen(true)}><Upload className="h-4 w-4 mr-1" />Importieren</Button>}
      />

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : auszuege.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-slate-400">
          Noch keine Kontoauszüge. Importieren Sie MT940- oder CSV-Dateien.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {auszuege.map((a) => (
            <Card key={a.id} className="cursor-pointer hover:shadow-sm" onClick={() => { setSelected(a); setDetailOpen(true) }}>
              <CardContent className="py-3 flex items-center gap-3">
                <CreditCard className="h-8 w-8 text-slate-300 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{a.dateiname}</p>
                  <p className="text-xs text-slate-400">{datum(a.erstelltAm)} · {a.kontonummer}</p>
                </div>
                <Badge variant="outline">{a.format?.toUpperCase()}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Import Dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Kontoauszug importieren</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Format</Label>
              <Select value={format} onValueChange={(v) => setFormat(v ?? 'mt940')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mt940">MT940 (Swift .sta)</SelectItem>
                  <SelectItem value="sparkasse">Sparkasse CSV</SelectItem>
                  <SelectItem value="volksbank">Volksbank CSV</SelectItem>
                  <SelectItem value="ing">ING CSV</SelectItem>
                  <SelectItem value="dkb">DKB CSV</SelectItem>
                </SelectContent>
              </Select></div>
            <div className="space-y-1"><Label>Datei</Label>
              <Input type="file" accept=".sta,.csv,.txt" ref={fileRef} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>Abbrechen</Button>
            <Button onClick={() => importMut.mutate()} disabled={importMut.isPending}>{importMut.isPending ? 'Importieren…' : 'Importieren'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selected?.dateiname}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 mt-2">
            {buchungen.length === 0
              ? <p className="text-sm text-slate-400 py-4 text-center">Keine Buchungszeilen</p>
              : buchungen.map((b) => (
                <div key={b.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{b.auftraggeberName ?? b.verwendungszweck ?? '—'}</p>
                    <p className="text-xs text-slate-400">{datum(b.datum)} · {b.buchungstyp}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`font-semibold text-sm ${b.betrag >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {euro(b.betrag)}
                    </p>
                    <Badge variant={matchingBadge[b.matchingStatus] ?? 'outline'} className="text-xs">
                      {b.matchingStatus === 'auto_matched' ? <CheckCircle className="h-3 w-3" /> :
                       b.matchingStatus === 'unmatched' ? <HelpCircle className="h-3 w-3" /> :
                       b.matchingStatus === 'ignored' ? <X className="h-3 w-3" /> : null}
                    </Badge>
                  </div>
                </div>
              ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
