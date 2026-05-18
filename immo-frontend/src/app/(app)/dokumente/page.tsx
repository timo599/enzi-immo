'use client'

import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { dokumenteApi, type DokumentKategorie, type DokumentListParams } from '@/lib/api'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  FileText, Image as ImageIcon, Search, Sparkles, Eye, Filter, Upload, Loader2,
} from 'lucide-react'
import { datum, euro } from '@/lib/format'
import { DocumentReviewDialog } from '@/components/document-review-dialog'
import { KATEGORIE_LABELS } from '@/components/document-section'
import { useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog'

interface Dokument {
  id: string
  dateiname: string
  titel?: string | null
  beschreibung?: string | null
  dokumentKategorie?: string
  mimeType: string
  fileSizeBytes: number
  extractionStatus: string
  reviewed: boolean
  erstelltAm: string
  extraktion?: {
    nettobetrag?: number
    bruttobetrag?: number
    lieferant?: string
    rechnungsdatum?: string
  }
}

const STATUS_BADGE: Record<string, { label: string; tone: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending:      { label: 'Wartend',      tone: 'secondary' },
  processing:   { label: 'Analysiert…',  tone: 'secondary' },
  extracted:    { label: 'Extrahiert',   tone: 'default' },
  needs_review: { label: 'Prüfen!',     tone: 'destructive' },
  reviewed:     { label: 'Geprüft',     tone: 'default' },
  failed:       { label: 'Fehler',       tone: 'destructive' },
  manual:       { label: 'Manuell',      tone: 'outline' },
}

export default function DokumentePage() {
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [tab, setTab] = useState<'alle' | 'pruefen' | 'fertig'>('alle')
  const [search, setSearch] = useState('')
  const [kategorie, setKategorie] = useState<DokumentKategorie | 'alle'>('alle')
  const [reviewDocId, setReviewDocId] = useState<string | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadKategorie, setUploadKategorie] = useState<DokumentKategorie>('rechnung')
  const [isDragging, setIsDragging] = useState(false)
  const dragCounter = useRef(0)

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation(); dragCounter.current++
    if (e.dataTransfer.items?.length) setIsDragging(true)
  }
  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation(); dragCounter.current--
    if (dragCounter.current === 0) setIsDragging(false)
  }
  function handleDragOver(e: React.DragEvent) { e.preventDefault(); e.stopPropagation() }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false); dragCounter.current = 0
    const f = e.dataTransfer.files?.[0]
    if (!f) return
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/tiff']
    if (!allowed.includes(f.type)) { toast.error('Nur PDF, JPG, PNG, TIFF erlaubt'); return }
    if (f.size > 25 * 1024 * 1024) { toast.error('Datei zu groß (max. 25 MB)'); return }
    setUploadFile(f)
    setUploadOpen(true)
  }

  // ── Server-Filter aufbauen ──────────────────────────────────────────────
  const params: DokumentListParams = useMemo(() => {
    const p: DokumentListParams = { page: 1, pageSize: 100 }
    if (kategorie !== 'alle') p.dokumentKategorie = kategorie
    return p
  }, [kategorie])

  const { data, isLoading } = useQuery({
    queryKey: ['dokumente', 'global', params],
    queryFn: async () => {
      const r = await dokumenteApi.list(params)
      return (r.data?.data ?? r.data ?? []) as Dokument[]
    },
    refetchInterval: (q) => {
      const items = (q.state.data as Dokument[] | undefined) ?? []
      const hasPending = items.some((d) => ['pending', 'processing'].includes(d.extractionStatus))
      return hasPending ? 4000 : false
    },
  })

  const items: Dokument[] = data ?? []

  // ── Client-seitige Filter ──────────────────────────────────────────────
  const filtered = useMemo(() => {
    return items.filter((d) => {
      if (tab === 'pruefen' && !['needs_review', 'extracted'].includes(d.extractionStatus)) return false
      if (tab === 'pruefen' && d.reviewed) return false
      if (tab === 'fertig' && !d.reviewed) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        const haystack = [d.titel, d.dateiname, d.beschreibung, d.extraktion?.lieferant]
          .filter(Boolean).join(' ').toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [items, tab, search])

  const counts = useMemo(() => ({
    alle: items.length,
    pruefen: items.filter((d) => ['needs_review', 'extracted'].includes(d.extractionStatus) && !d.reviewed).length,
    fertig: items.filter((d) => d.reviewed).length,
  }), [items])

  // ── Upload-Mutation ────────────────────────────────────────────────────
  const uploadMut = useMutation({
    mutationFn: async () => {
      if (!uploadFile) throw new Error('Bitte Datei wählen')
      const fd = new FormData()
      fd.append('file', uploadFile)
      return dokumenteApi.upload(fd, { dokumentKategorie: uploadKategorie })
    },
    onSuccess: () => {
      toast.success('Dokument hochgeladen — KI-Analyse läuft…')
      qc.invalidateQueries({ queryKey: ['dokumente', 'global'] })
      setUploadOpen(false)
      setUploadFile(null)
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.error?.message ?? 'Upload fehlgeschlagen'),
  })

  return (
    <div
      className={`relative ${isDragging ? 'rounded-lg ring-2 ring-primary/60 ring-offset-2' : ''}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-primary/5 rounded-lg pointer-events-none">
          <div className="bg-background border-2 border-dashed border-primary rounded-lg px-8 py-6 text-center shadow-xl">
            <Upload className="h-10 w-10 mx-auto text-primary mb-2" />
            <div className="font-medium">Datei hier ablegen</div>
            <div className="text-xs text-muted-foreground mt-1">PDF, JPG, PNG, TIFF · max. 25 MB</div>
          </div>
        </div>
      )}
      <PageHeader
        title="Dokumente"
        description="Alle Belege, Verträge und Unterlagen — KI-gestützte Datenextraktion · Datei einfach hierher ziehen"
        action={
          <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
            <DialogTrigger render={<Button />}>
              <Upload className="h-4 w-4 mr-1.5" />Hochladen
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Dokument hochladen</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div>
                  <Label>Datei (PDF, JPG, PNG, TIFF · max. 25 MB)</Label>
                  <Input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,image/jpeg,image/png,image/tiff"
                    onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                  />
                </div>
                <div>
                  <Label>Kategorie</Label>
                  <Select value={uploadKategorie} onValueChange={(v) => setUploadKategorie(v as DokumentKategorie)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(KATEGORIE_LABELS) as DokumentKategorie[]).map((k) => (
                        <SelectItem key={k} value={k}>{KATEGORIE_LABELS[k]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">
                  💡 Tipp: Belege wie Rechnungen kannst du auch direkt einer Einheit, Mieter oder Mietvertrag zuordnen — dort gibt es einen <strong>Dokumente</strong>-Tab.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setUploadOpen(false)} disabled={uploadMut.isPending}>
                  Abbrechen
                </Button>
                <Button onClick={() => uploadMut.mutate()} disabled={!uploadFile || uploadMut.isPending}>
                  {uploadMut.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                  Hochladen
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {/* ── Filter-Leiste ──────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Suche nach Titel, Dateiname, Lieferant…"
            className="pl-9"
          />
        </div>
        <Select value={kategorie} onValueChange={(v) => setKategorie(v as DokumentKategorie | 'alle')}>
          <SelectTrigger className="w-full sm:w-56">
            <Filter className="h-3.5 w-3.5 mr-1.5 inline" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle Kategorien</SelectItem>
            {(Object.keys(KATEGORIE_LABELS) as DokumentKategorie[]).map((k) => (
              <SelectItem key={k} value={k}>{KATEGORIE_LABELS[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="mb-4">
        <TabsList>
          <TabsTrigger value="alle">Alle ({counts.alle})</TabsTrigger>
          <TabsTrigger value="pruefen">
            Zu prüfen
            {counts.pruefen > 0 && <Badge variant="destructive" className="ml-1.5 h-4 px-1.5">{counts.pruefen}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="fertig">Geprüft ({counts.fertig})</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* ── Liste ──────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          {search || kategorie !== 'alle'
            ? 'Keine Treffer mit diesen Filtern'
            : tab === 'pruefen'
              ? 'Keine Belege zu prüfen — alles aktuell ✓'
              : 'Noch keine Dokumente. Klicke oben auf Hochladen.'}
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((d) => {
            const isImage = d.mimeType.startsWith('image/')
            const Icon = isImage ? ImageIcon : FileText
            const status = STATUS_BADGE[d.extractionStatus] ?? { label: d.extractionStatus, tone: 'secondary' as const }
            const kategorieLabel = d.dokumentKategorie ? KATEGORIE_LABELS[d.dokumentKategorie as DokumentKategorie] : ''
            const canReview = ['extracted', 'needs_review'].includes(d.extractionStatus) && !d.reviewed
            const isInvoice = d.dokumentKategorie === 'rechnung' || d.extraktion?.lieferant

            return (
              <Card
                key={d.id}
                className={canReview ? 'border-amber-300 hover:bg-amber-50/30' : ''}
              >
                <CardContent className="py-3">
                  <div className="flex items-center gap-3">
                    <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">
                          {d.titel || d.dateiname}
                        </span>
                        {kategorieLabel && (
                          <Badge variant="outline" className="text-xs">{kategorieLabel}</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span>{datum(d.erstelltAm)}</span>
                        <span>·</span>
                        <span>{(d.fileSizeBytes / 1024).toFixed(0)} KB</span>
                        {d.extraktion?.lieferant && (<>
                          <span>·</span>
                          <span className="font-medium text-foreground/70">{d.extraktion.lieferant}</span>
                        </>)}
                        {d.extraktion?.bruttobetrag != null && (<>
                          <span>·</span>
                          <span className="font-medium text-foreground/70">{euro(d.extraktion.bruttobetrag)}</span>
                        </>)}
                      </div>
                    </div>
                    <Badge variant={status.tone}>{status.label}</Badge>
                    {isInvoice ? (
                      <Button
                        size="sm"
                        variant={canReview ? 'default' : 'outline'}
                        onClick={() => setReviewDocId(d.id)}
                      >
                        <Sparkles className="h-3.5 w-3.5 mr-1" />
                        {canReview ? 'Prüfen' : 'Ansehen'}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          try {
                            const r = await dokumenteApi.get(d.id)
                            const url = r.data?.data?.downloadUrl
                            if (url) window.open(url, '_blank', 'noopener')
                          } catch {
                            toast.error('Download fehlgeschlagen')
                          }
                        }}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <DocumentReviewDialog
        dokumentId={reviewDocId}
        open={!!reviewDocId}
        onClose={() => setReviewDocId(null)}
      />
    </div>
  )
}
