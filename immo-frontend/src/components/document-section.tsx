'use client'

import { useState, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Upload, FileText, Image as ImageIcon, Trash2, Loader2,
  Download, Eye, RefreshCw, Pencil,
} from 'lucide-react'
import {
  dokumenteApi,
  type DokumentKategorie,
  type DokumentListParams,
} from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogTrigger,
} from '@/components/ui/dialog'

// ─── Lokalisierte Kategorienamen ─────────────────────────────────────────────
export const KATEGORIE_LABELS: Record<DokumentKategorie, string> = {
  rechnung:                 'Rechnung',
  mietvertrag:              'Mietvertrag',
  mietvertrag_anlage:       'Vertrags-Anlage',
  kuendigung:               'Kündigung',
  uebergabeprotokoll:       'Übergabeprotokoll',
  minol:                    'Minol-Abrechnung',
  zaehler_foto:             'Zähler-Foto',
  zaehlerstand:             'Zählerstand',
  betriebskostenabrechnung: 'Betriebskostenabr.',
  versicherung:             'Versicherung',
  grundsteuer:              'Grundsteuer',
  korrespondenz:            'Korrespondenz',
  ausweis:                  'Ausweis / ID',
  bankverbindung:           'Bankverbindung',
  sonstiges:                'Sonstiges',
}

const STATUS_LABELS: Record<string, { text: string; tone: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending:      { text: 'Wartet',     tone: 'secondary' },
  processing:   { text: 'Verarbeitet…', tone: 'secondary' },
  extracted:    { text: 'Extrahiert',  tone: 'default'   },
  needs_review: { text: 'Prüfen',     tone: 'outline'   },
  reviewed:     { text: 'Geprüft',    tone: 'default'   },
  failed:       { text: 'Fehler',     tone: 'destructive' },
  manual:       { text: 'Manuell',    tone: 'secondary' },
}

// Kategorien je Kontext
function categoriesFor(scope: DocumentScope): DokumentKategorie[] {
  if (scope === 'mieter') {
    return ['mietvertrag', 'mietvertrag_anlage', 'ausweis', 'bankverbindung', 'kuendigung', 'korrespondenz', 'sonstiges']
  }
  if (scope === 'mietvertrag') {
    return ['mietvertrag', 'mietvertrag_anlage', 'uebergabeprotokoll', 'kuendigung', 'korrespondenz', 'sonstiges']
  }
  if (scope === 'einheit') {
    return ['mietvertrag', 'uebergabeprotokoll', 'zaehler_foto', 'zaehlerstand', 'rechnung', 'korrespondenz', 'sonstiges']
  }
  if (scope === 'objekt') {
    return ['versicherung', 'grundsteuer', 'rechnung', 'betriebskostenabrechnung', 'korrespondenz', 'sonstiges']
  }
  return Object.keys(KATEGORIE_LABELS) as DokumentKategorie[]
}

export type DocumentScope = 'mieter' | 'mietvertrag' | 'einheit' | 'objekt' | 'global'

export interface DocumentSectionProps {
  scope: DocumentScope
  /** ID der zugehörigen Entität (Mieter, Mietvertrag, …) */
  entityId: string
  /** Optionaler Titel für die Section */
  title?: string
  /** Soll die Liste nur Dokumente dieser Entität zeigen? Standard: true */
  filterByEntity?: boolean
}

export function DocumentSection({
  scope,
  entityId,
  title = 'Dokumente',
  filterByEntity = true,
}: DocumentSectionProps) {
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadOpen, setUploadOpen]   = useState(false)
  const [editDoc, setEditDoc]         = useState<DokumentListItem | null>(null)
  const [kategorie, setKategorie]     = useState<DokumentKategorie>(categoriesFor(scope)[0] ?? 'sonstiges')
  const [titel, setTitel]             = useState('')
  const [beschreibung, setBeschreibung] = useState('')
  const [file, setFile]               = useState<File | null>(null)
  const [isDragging, setIsDragging]   = useState(false)
  const dragCounter = useRef(0)

  // ── Drag-and-Drop Handler ───────────────────────────────────────────────────
  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current++
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true)
    }
  }
  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current--
    if (dragCounter.current === 0) setIsDragging(false)
  }
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    dragCounter.current = 0
    const dropped = e.dataTransfer.files
    if (!dropped || dropped.length === 0) return
    const f = dropped[0]
    if (!f) return
    // Validate
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/tiff']
    if (!allowed.includes(f.type)) {
      toast.error('Nur PDF, JPG, PNG, TIFF erlaubt')
      return
    }
    if (f.size > 25 * 1024 * 1024) {
      toast.error('Datei zu groß (max. 25 MB)')
      return
    }
    setFile(f)
    setUploadOpen(true)
  }

  // ── Filter parameters ──────────────────────────────────────────────────────
  const listParams: DokumentListParams = useMemo(() => {
    if (!filterByEntity) return { page: 1, pageSize: 50 }
    if (scope === 'mieter')      return { mieterId: entityId, page: 1, pageSize: 50 }
    if (scope === 'mietvertrag') return { mietvertragId: entityId, page: 1, pageSize: 50 }
    if (scope === 'einheit')     return { einheitId: entityId, page: 1, pageSize: 50 }
    if (scope === 'objekt')      return { objektId: entityId, page: 1, pageSize: 50 }
    return { page: 1, pageSize: 50 }
  }, [scope, entityId, filterByEntity])

  // ── Query ──────────────────────────────────────────────────────────────────
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['dokumente', scope, entityId],
    queryFn:  async () => {
      const r = await dokumenteApi.list(listParams)
      return r.data?.data ?? r.data ?? []
    },
    refetchInterval: (q) => {
      const items = (q.state.data as DokumentListItem[] | undefined) ?? []
      const hasPending = items.some((d) => ['pending', 'processing'].includes(d.extractionStatus))
      return hasPending ? 4000 : false
    },
  })

  const items: DokumentListItem[] = (Array.isArray(data) ? data : []) as DokumentListItem[]

  // ── Upload mutation ────────────────────────────────────────────────────────
  const uploadMut = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Bitte Datei auswählen')
      const fd = new FormData()
      fd.append('file', file)
      const params: Record<string, string> = {
        dokumentKategorie: kategorie,
      }
      if (titel.trim()) params.titel = titel.trim()
      if (beschreibung.trim()) params.beschreibung = beschreibung.trim()
      if (scope === 'mieter')      params.mieterId = entityId
      if (scope === 'mietvertrag') params.mietvertragId = entityId
      if (scope === 'einheit')     params.einheitId = entityId
      if (scope === 'objekt')      params.objektId = entityId
      return dokumenteApi.upload(fd, params)
    },
    onSuccess: () => {
      toast.success('Dokument hochgeladen — KI-Analyse läuft...')
      setUploadOpen(false)
      setFile(null)
      setTitel('')
      setBeschreibung('')
      qc.invalidateQueries({ queryKey: ['dokumente', scope, entityId] })
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message ?? err.message ?? 'Upload fehlgeschlagen')
    },
  })

  // ── Update meta mutation ───────────────────────────────────────────────────
  const updateMut = useMutation({
    mutationFn: async (params: { id: string; body: any }) =>
      dokumenteApi.updateMeta(params.id, params.body),
    onSuccess: () => {
      toast.success('Aktualisiert')
      setEditDoc(null)
      qc.invalidateQueries({ queryKey: ['dokumente', scope, entityId] })
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.error?.message ?? 'Speichern fehlgeschlagen'),
  })

  // ── Delete mutation ────────────────────────────────────────────────────────
  const deleteMut = useMutation({
    mutationFn: async (id: string) => dokumenteApi.delete(id),
    onSuccess: () => {
      toast.success('Gelöscht')
      qc.invalidateQueries({ queryKey: ['dokumente', scope, entityId] })
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.error?.message ?? 'Löschen fehlgeschlagen'),
  })

  // ── Download (öffnet Pre-Signed URL) ──────────────────────────────────────
  async function handleDownload(id: string) {
    try {
      const r = await dokumenteApi.get(id)
      const url = r.data?.data?.downloadUrl ?? r.data?.downloadUrl
      if (!url) throw new Error('Keine Download-URL')
      window.open(url, '_blank', 'noopener')
    } catch (err: any) {
      toast.error('Download fehlgeschlagen')
    }
  }

  // ── UI ─────────────────────────────────────────────────────────────────────
  return (
    <div
      className={`space-y-3 relative ${isDragging ? 'rounded-lg ring-2 ring-primary/60 ring-offset-2 transition-all' : ''}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-primary/5 rounded-lg pointer-events-none">
          <div className="bg-background border-2 border-dashed border-primary rounded-lg px-6 py-4 text-center shadow-lg">
            <Upload className="h-8 w-8 mx-auto text-primary mb-2" />
            <div className="font-medium text-sm">Datei hier ablegen</div>
            <div className="text-xs text-muted-foreground">PDF, JPG, PNG, TIFF · max. 25 MB</div>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">
            {items.length === 0 ? 'Noch keine Dokumente' : `${items.length} Dokument${items.length === 1 ? '' : 'e'}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
            <DialogTrigger render={<Button size="sm" />}>
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              Hochladen
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
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </div>
                <div>
                  <Label>Kategorie</Label>
                  <Select
                    value={kategorie}
                    onValueChange={(v) => setKategorie(v as DokumentKategorie)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {categoriesFor(scope).map((k) => (
                        <SelectItem key={k} value={k}>{KATEGORIE_LABELS[k]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Titel (optional)</Label>
                  <Input
                    value={titel}
                    onChange={(e) => setTitel(e.target.value)}
                    placeholder="z.B. Mietvertrag Müller"
                  />
                </div>
                <div>
                  <Label>Beschreibung (optional)</Label>
                  <Input
                    value={beschreibung}
                    onChange={(e) => setBeschreibung(e.target.value)}
                    placeholder="z.B. Erstvertrag von 2023"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setUploadOpen(false)}
                  disabled={uploadMut.isPending}
                >Abbrechen</Button>
                <Button
                  onClick={() => uploadMut.mutate()}
                  disabled={!file || uploadMut.isPending}
                >
                  {uploadMut.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                  Hochladen
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Liste */}
      {isLoading ? (
        <div className="text-sm text-muted-foreground py-6 text-center">Lade…</div>
      ) : items.length === 0 ? (
        <div className="border border-dashed rounded-lg p-6 text-center text-sm text-muted-foreground">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
          Noch keine Dokumente. Klicke auf <strong>Hochladen</strong> oben.
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((doc) => {
            const isImage = doc.mimeType.startsWith('image/')
            const Icon = isImage ? ImageIcon : FileText
            const kategorieLabel = (doc.dokumentKategorie && KATEGORIE_LABELS[doc.dokumentKategorie as DokumentKategorie]) || ''
            const status = STATUS_LABELS[doc.extractionStatus] ?? { text: doc.extractionStatus, tone: 'secondary' as const }

            return (
              <li
                key={doc.id}
                className="flex items-center gap-3 p-3 border rounded-lg hover:bg-accent/40 transition"
              >
                <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {doc.titel || doc.dateiname}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    {kategorieLabel && <span>{kategorieLabel}</span>}
                    <span>·</span>
                    <span>{(doc.fileSizeBytes / 1024).toFixed(0)} KB</span>
                    <span>·</span>
                    <span>{new Date(doc.erstelltAm).toLocaleDateString('de-DE')}</span>
                  </div>
                  {doc.beschreibung && (
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      {doc.beschreibung}
                    </div>
                  )}
                </div>
                <Badge variant={status.tone}>{status.text}</Badge>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDownload(doc.id)}
                    title="Anzeigen"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditDoc(doc)}
                    title="Bearbeiten"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (confirm(`"${doc.titel || doc.dateiname}" wirklich löschen?`)) {
                        deleteMut.mutate(doc.id)
                      }
                    }}
                    title="Löschen"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* Edit-Dialog */}
      {editDoc && (
        <Dialog open={!!editDoc} onOpenChange={(o) => !o && setEditDoc(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Dokument bearbeiten</DialogTitle>
            </DialogHeader>
            <EditForm
              doc={editDoc}
              scope={scope}
              onSave={(body) => updateMut.mutate({ id: editDoc.id, body })}
              isPending={updateMut.isPending}
              onCancel={() => setEditDoc(null)}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

// ─── Edit-Form ──────────────────────────────────────────────────────────────
function EditForm({
  doc, scope, onSave, isPending, onCancel,
}: {
  doc: DokumentListItem
  scope: DocumentScope
  onSave: (body: any) => void
  isPending: boolean
  onCancel: () => void
}) {
  const [titel, setTitel]               = useState(doc.titel ?? '')
  const [beschreibung, setBeschreibung] = useState(doc.beschreibung ?? '')
  const [kategorie, setKategorie]       = useState<DokumentKategorie>(
    (doc.dokumentKategorie ?? 'sonstiges') as DokumentKategorie
  )

  return (
    <>
      <div className="space-y-3 py-2">
        <div>
          <Label>Titel</Label>
          <Input value={titel} onChange={(e) => setTitel(e.target.value)} />
        </div>
        <div>
          <Label>Beschreibung</Label>
          <Input value={beschreibung} onChange={(e) => setBeschreibung(e.target.value)} />
        </div>
        <div>
          <Label>Kategorie</Label>
          <Select value={kategorie} onValueChange={(v) => setKategorie(v as DokumentKategorie)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {categoriesFor(scope).map((k) => (
                <SelectItem key={k} value={k}>{KATEGORIE_LABELS[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={isPending}>Abbrechen</Button>
        <Button
          onClick={() =>
            onSave({
              titel: titel.trim() || null,
              beschreibung: beschreibung.trim() || null,
              dokumentKategorie: kategorie,
            })
          }
          disabled={isPending}
        >
          {isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
          Speichern
        </Button>
      </DialogFooter>
    </>
  )
}

// ─── Types ──────────────────────────────────────────────────────────────────
export interface DokumentListItem {
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
}
