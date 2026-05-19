'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Sparkles, Check, X, RefreshCw, Pencil } from 'lucide-react'
import { dokumenteApi, kostenartenApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { euro, datum } from '@/lib/format'

interface Props {
  dokumentId: string | null
  open: boolean
  onClose: () => void
}

interface Extraktion {
  rechnungsdatum?: string
  rechnungsnummer?: string
  lieferantName?: string
  lieferantAdresse?: string
  nettobetrag?: number
  bruttobetrag?: number
  mwstSatz?: number
  periodeVon?: string
  periodeBis?: string
  erkannteKostenart?: string
  flags?: string[]
  confidenceMap?: Record<string, number>
  reviewed?: boolean
  reviewNotizen?: string | null
}

interface Kostenart {
  id: string
  kuerzel: string
  bezeichnung: string
  umlagefaehig: 'ja' | 'nein' | 'teilweise'
}

export function DocumentReviewDialog({ dokumentId, open, onClose }: Props) {
  const qc = useQueryClient()
  const [editMode, setEditMode] = useState(false)
  const [draft, setDraft] = useState<Extraktion>({})
  const [kostenartId, setKostenartId] = useState('')
  const [reviewNotizen, setReviewNotizen] = useState('')

  // ── Daten laden ──────────────────────────────────────────────────────────
  const { data: dokRes, isLoading: dokLoading } = useQuery({
    queryKey: ['dokument', dokumentId],
    queryFn: async () => {
      const r = await dokumenteApi.get(dokumentId!)
      return r.data?.data ?? r.data
    },
    enabled: !!dokumentId && open,
  })

  const { data: extRes } = useQuery({
    queryKey: ['extraktion', dokumentId],
    queryFn: async () => {
      const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1'}/dokumente/${dokumentId}/extraktion`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('immo_token')}` },
      })
      if (!r.ok) return null
      const j = await r.json()
      return (j.data ?? j) as Extraktion
    },
    enabled: !!dokumentId && open,
  })

  const { data: kostenartenRes } = useQuery({
    queryKey: ['kostenarten'],
    queryFn: () => kostenartenApi.list(),
  })

  const extraktion: Extraktion | null = (extRes as Extraktion) ?? null
  const kostenarten: Kostenart[] = kostenartenRes?.data?.data ?? []

  useEffect(() => {
    if (extraktion) {
      setDraft({
        rechnungsdatum:    extraktion.rechnungsdatum,
        rechnungsnummer:   extraktion.rechnungsnummer,
        lieferantName:     extraktion.lieferantName,
        lieferantAdresse:  extraktion.lieferantAdresse,
        nettobetrag:       extraktion.nettobetrag,
        bruttobetrag:      extraktion.bruttobetrag,
        mwstSatz:          extraktion.mwstSatz,
        periodeVon:        extraktion.periodeVon,
        periodeBis:        extraktion.periodeBis,
      })
      setReviewNotizen(extraktion.reviewNotizen ?? '')
    }
  }, [extraktion])

  // ── Mutations ────────────────────────────────────────────────────────────
  const patchMut = useMutation({
    mutationFn: (body: Partial<Extraktion>) => dokumenteApi.patchReview(dokumentId!, body),
    onSuccess: () => {
      toast.success('Korrekturen gespeichert')
      setEditMode(false)
      qc.invalidateQueries({ queryKey: ['extraktion', dokumentId] })
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.error?.message ?? 'Speichern fehlgeschlagen'),
  })

  const confirmMut = useMutation({
    mutationFn: () => dokumenteApi.confirmReview(dokumentId!, {
      kostenartId,
      reviewNotizen: reviewNotizen || undefined,
    }),
    onSuccess: () => {
      toast.success('Beleg bestätigt')
      qc.invalidateQueries({ queryKey: ['dokumente'] })
      qc.invalidateQueries({ queryKey: ['extraktion', dokumentId] })
      onClose()
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.error?.message ?? 'Bestätigung fehlgeschlagen'),
  })

  const rejectMut = useMutation({
    mutationFn: (begruendung: string) => dokumenteApi.rejectReview(dokumentId!, { begruendung }),
    onSuccess: () => {
      toast.success('Beleg abgelehnt')
      qc.invalidateQueries({ queryKey: ['dokumente'] })
      onClose()
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.error?.message ?? 'Ablehnung fehlgeschlagen'),
  })

  const retryMut = useMutation({
    mutationFn: () => dokumenteApi.retryExtraction(dokumentId!),
    onSuccess: () => {
      toast.success('Extraktion läuft erneut...')
      qc.invalidateQueries({ queryKey: ['dokument', dokumentId] })
      qc.invalidateQueries({ queryKey: ['extraktion', dokumentId] })
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.error?.message ?? 'Retry fehlgeschlagen'),
  })

  function handleSavePatch() {
    const body: Partial<Extraktion> = {}
    if (draft.rechnungsdatum !== extraktion?.rechnungsdatum) body.rechnungsdatum = draft.rechnungsdatum
    if (draft.rechnungsnummer !== extraktion?.rechnungsnummer) body.rechnungsnummer = draft.rechnungsnummer
    if (draft.lieferantName !== extraktion?.lieferantName) body.lieferantName = draft.lieferantName
    if (draft.nettobetrag !== extraktion?.nettobetrag) body.nettobetrag = draft.nettobetrag ? Number(draft.nettobetrag) : undefined
    if (draft.bruttobetrag !== extraktion?.bruttobetrag) body.bruttobetrag = draft.bruttobetrag ? Number(draft.bruttobetrag) : undefined
    if (draft.mwstSatz !== extraktion?.mwstSatz) body.mwstSatz = draft.mwstSatz ? Number(draft.mwstSatz) : undefined
    if (draft.periodeVon !== extraktion?.periodeVon) body.periodeVon = draft.periodeVon
    if (draft.periodeBis !== extraktion?.periodeBis) body.periodeBis = draft.periodeBis
    if (Object.keys(body).length === 0) {
      setEditMode(false)
      return
    }
    patchMut.mutate(body)
  }

  function handleReject() {
    const begruendung = prompt('Bitte gib eine Ablehnungsbegründung an:')
    if (begruendung && begruendung.trim()) {
      rejectMut.mutate(begruendung.trim())
    }
  }

  const dok = dokRes
  const isProcessing = dok?.extractionStatus === 'pending' || dok?.extractionStatus === 'processing'
  const hasFailed = dok?.extractionStatus === 'failed'
  const isReviewed = extraktion?.reviewed === true

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            Beleg prüfen
          </DialogTitle>
          {dok && (
            <div className="text-sm text-muted-foreground">
              {dok.titel || dok.originalName}
              {' · '}
              <Badge variant="outline" className="ml-1">{dok.extractionStatus}</Badge>
            </div>
          )}
        </DialogHeader>

        {dokLoading ? (
          <div className="py-8 text-center"><Loader2 className="h-5 w-5 mx-auto animate-spin" /></div>
        ) : isProcessing ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 mx-auto animate-spin mb-2" />
            KI extrahiert die Daten gerade…
          </div>
        ) : hasFailed ? (
          <div className="py-6 text-center space-y-3">
            <p className="text-sm text-destructive">Extraktion fehlgeschlagen</p>
            <p className="text-xs text-muted-foreground">{dok?.uploadFehler}</p>
            <Button onClick={() => retryMut.mutate()} disabled={retryMut.isPending}>
              <RefreshCw className="h-4 w-4 mr-1.5" />
              Erneut versuchen
            </Button>
          </div>
        ) : !extraktion ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Noch keine Extraktion vorhanden
          </div>
        ) : (
          <>
            {/* ── Felder anzeigen oder editieren ───────────────────────── */}
            <div className="grid grid-cols-2 gap-3 py-2">
              <FieldRow
                label="Lieferant"
                value={editMode ? draft.lieferantName ?? '' : extraktion.lieferantName}
                editMode={editMode}
                onChange={(v) => setDraft((d) => ({ ...d, lieferantName: v }))}
                confidence={extraktion.confidenceMap?.lieferantName}
              />
              <FieldRow
                label="Rechnungsnummer"
                value={editMode ? draft.rechnungsnummer ?? '' : extraktion.rechnungsnummer}
                editMode={editMode}
                onChange={(v) => setDraft((d) => ({ ...d, rechnungsnummer: v }))}
                confidence={extraktion.confidenceMap?.rechnungsnummer}
              />
              <FieldRow
                label="Rechnungsdatum"
                value={editMode ? draft.rechnungsdatum ?? '' : (extraktion.rechnungsdatum ? datum(extraktion.rechnungsdatum) : undefined)}
                editMode={editMode}
                type="date"
                onChange={(v) => setDraft((d) => ({ ...d, rechnungsdatum: v }))}
                confidence={extraktion.confidenceMap?.rechnungsdatum}
              />
              <FieldRow
                label="MwSt-Satz (%)"
                value={editMode ? String(draft.mwstSatz ?? '') : (extraktion.mwstSatz != null ? `${extraktion.mwstSatz}%` : undefined)}
                editMode={editMode}
                type="number"
                onChange={(v) => setDraft((d) => ({ ...d, mwstSatz: v ? Number(v) : undefined }))}
                confidence={extraktion.confidenceMap?.mwstSatz}
              />
              <FieldRow
                label="Nettobetrag"
                value={editMode ? String(draft.nettobetrag ?? '') : (extraktion.nettobetrag != null ? euro(extraktion.nettobetrag) : undefined)}
                editMode={editMode}
                type="number"
                onChange={(v) => setDraft((d) => ({ ...d, nettobetrag: v ? Number(v) : undefined }))}
                confidence={extraktion.confidenceMap?.nettobetrag}
              />
              <FieldRow
                label="Bruttobetrag"
                value={editMode ? String(draft.bruttobetrag ?? '') : (extraktion.bruttobetrag != null ? euro(extraktion.bruttobetrag) : undefined)}
                editMode={editMode}
                type="number"
                onChange={(v) => setDraft((d) => ({ ...d, bruttobetrag: v ? Number(v) : undefined }))}
                confidence={extraktion.confidenceMap?.bruttobetrag}
              />
              <FieldRow
                label="Periode von"
                value={editMode ? draft.periodeVon ?? '' : (extraktion.periodeVon ? datum(extraktion.periodeVon) : undefined)}
                editMode={editMode}
                type="date"
                onChange={(v) => setDraft((d) => ({ ...d, periodeVon: v }))}
              />
              <FieldRow
                label="Periode bis"
                value={editMode ? draft.periodeBis ?? '' : (extraktion.periodeBis ? datum(extraktion.periodeBis) : undefined)}
                editMode={editMode}
                type="date"
                onChange={(v) => setDraft((d) => ({ ...d, periodeBis: v }))}
              />
            </div>

            {/* ── Flags ──────────────────────────────────────────────── */}
            {extraktion.flags && extraktion.flags.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs">
                <strong>Hinweise:</strong> {extraktion.flags.join(', ')}
              </div>
            )}

            {/* ── Kostenart-Picker (Pflicht für confirm) ─────────────── */}
            {!isReviewed && (
              <div className="border-t pt-3 space-y-2">
                <Label className="text-sm">Kostenart * <span className="text-xs text-muted-foreground font-normal">(Pflicht)</span></Label>
                <Select value={kostenartId} onValueChange={(v) => setKostenartId(v ?? '')}>
                  <SelectTrigger>
                    <SelectValue placeholder="Kostenart auswählen…" />
                  </SelectTrigger>
                  <SelectContent>
                    {kostenarten.map((ka) => (
                      <SelectItem key={ka.id} value={ka.id}>
                        {ka.bezeichnung} {ka.umlagefaehig === 'nein' ? '(nicht umlagefähig)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {extraktion.erkannteKostenart && (
                  <p className="text-xs text-muted-foreground">
                    KI-Vorschlag: <strong>{extraktion.erkannteKostenart}</strong>
                  </p>
                )}

                <Label className="text-sm">Notizen (optional)</Label>
                <Input
                  value={reviewNotizen}
                  onChange={(e) => setReviewNotizen(e.target.value)}
                  placeholder="z.B. Skonto wurde gewährt"
                />
              </div>
            )}

            {isReviewed && (
              <div className="border-t pt-3 text-sm text-emerald-600 flex items-center gap-2">
                <Check className="h-4 w-4" />
                Bereits bestätigt
                {extraktion.reviewNotizen && <span className="text-muted-foreground">· {extraktion.reviewNotizen}</span>}
              </div>
            )}
          </>
        )}

        <DialogFooter className="gap-2">
          {extraktion && !isReviewed && !isProcessing && !hasFailed && (
            <>
              {editMode ? (
                <>
                  <Button variant="outline" onClick={() => setEditMode(false)} disabled={patchMut.isPending}>
                    Abbrechen
                  </Button>
                  <Button onClick={handleSavePatch} disabled={patchMut.isPending}>
                    {patchMut.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                    Korrekturen speichern
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" onClick={() => setEditMode(true)}>
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />
                    Bearbeiten
                  </Button>
                  <Button variant="outline" onClick={handleReject} disabled={rejectMut.isPending}>
                    <X className="h-3.5 w-3.5 mr-1.5" />
                    Ablehnen
                  </Button>
                  <Button
                    onClick={() => confirmMut.mutate()}
                    disabled={!kostenartId || confirmMut.isPending}
                  >
                    {confirmMut.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                    <Check className="h-3.5 w-3.5 mr-1.5" />
                    Bestätigen
                  </Button>
                </>
              )}
            </>
          )}
          {(isReviewed || isProcessing || hasFailed) && (
            <Button variant="outline" onClick={onClose}>Schließen</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FieldRow({
  label, value, editMode, onChange, type = 'text', confidence,
}: {
  label: string
  value: string | number | undefined
  editMode: boolean
  onChange: (v: string) => void
  type?: string
  confidence?: number
}) {
  const lowConf = confidence != null && confidence < 0.7
  return (
    <div className="space-y-1">
      <Label className="text-xs flex items-center gap-1.5">
        {label}
        {lowConf && <Badge variant="outline" className="text-[10px] py-0">unsicher</Badge>}
      </Label>
      {editMode ? (
        <Input
          type={type}
          value={value as string ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 text-sm"
        />
      ) : (
        <p className={`text-sm ${value ? '' : 'text-muted-foreground italic'} ${lowConf ? 'text-amber-700' : ''}`}>
          {value || '—'}
        </p>
      )}
    </div>
  )
}
