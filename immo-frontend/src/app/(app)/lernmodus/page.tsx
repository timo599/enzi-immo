'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Brain, MessageSquare, CheckCircle2, Clock, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { lernmodusApi, einheitenApi } from '@/lib/api'
import { DropZone } from '@/components/drop-zone'
import { UploadQueue, type UploadResult } from '@/components/upload-queue'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type SessionStatus = 'extrahiert' | 'in_dialog' | 'abgeschlossen'

interface Frage {
  id:            string
  frageTyp:      string
  fragentext:    string
  vorschlagWert: string | null
  bestaetigt:    boolean
  antwortWert:   string | null
  einheitRef:    string | null
  einheitId:     string | null
  einheit?:      { id: string; bezeichnung: string } | null
}

interface Session {
  id:         string
  status:     SessionStatus
  erstelltAm: string
  fragen:     Frage[]
  dokument:   { originalName: string; extractionStatus: string }
}

function StatusBadge({ status }: { status: SessionStatus }) {
  if (status === 'abgeschlossen') return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Abgeschlossen</Badge>
  if (status === 'in_dialog')     return <Badge className="bg-blue-100 text-blue-700 border-blue-200">In Bearbeitung</Badge>
  return <Badge variant="outline" className="text-muted-foreground">Analyse läuft</Badge>
}

function FrageCard({
  frage,
  einheiten,
  onBestaetigen,
  onUeberspringen,
}: {
  frage:           Frage
  einheiten:       { id: string; bezeichnung: string }[]
  onBestaetigen:   (antwort: string, einheitId?: string | null) => void
  onUeberspringen: () => void
}) {
  const [antwort,   setAntwort]   = useState(frage.vorschlagWert ?? '')
  const [einheitId, setEinheitId] = useState(frage.einheitId ?? '')

  if (frage.bestaetigt) {
    return (
      <div className="flex items-start gap-3 rounded-lg bg-emerald-50 border border-emerald-200 p-3">
        <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
        <div className="text-sm min-w-0">
          <p className="font-medium text-emerald-800">{frage.fragentext}</p>
          <p className="text-emerald-600 mt-0.5 text-xs">
            ✓ {frage.antwortWert ? `Bestätigt: ${frage.antwortWert}` : 'Übersprungen'}
          </p>
        </div>
      </div>
    )
  }

  const isZahl = frage.frageTyp === 'personen_einheit' || frage.frageTyp === 'wohnflaeche'

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3 shadow-sm">
      <p className="text-sm font-medium leading-relaxed">{frage.fragentext}</p>

      {isZahl && (
        <div className="flex gap-2 flex-wrap">
          <Input
            value={antwort}
            onChange={(e) => setAntwort(e.target.value)}
            type="number"
            placeholder={frage.frageTyp === 'personen_einheit' ? 'Personenanzahl' : 'Wohnfläche m²'}
            className="w-36 h-8 text-sm"
          />
          {einheiten.length > 0 && (
            <Select value={einheitId} onValueChange={(v) => setEinheitId(v ?? '')}>
              <SelectTrigger className="h-8 text-sm flex-1 min-w-[160px]">
                <SelectValue placeholder="Einheit zuordnen…" />
              </SelectTrigger>
              <SelectContent>
                {einheiten.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.bezeichnung}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => onBestaetigen(antwort, einheitId || null)}
          disabled={isZahl && !antwort}
          className="h-7 text-xs px-3"
        >
          Bestätigen
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onUeberspringen}
          className="h-7 text-xs px-3 text-muted-foreground"
        >
          Überspringen
        </Button>
      </div>
    </div>
  )
}

export default function LernmodusPage() {
  const qc = useQueryClient()
  const [uploadFiles,    setUploadFiles]    = useState<File[] | null>(null)
  const [activeSession,  setActiveSession]  = useState<string | null>(null)

  const { data: sessionenRes, isLoading } = useQuery({
    queryKey: ['lernmodus-sessionen'],
    queryFn:  () => lernmodusApi.sessionen(),
  })
  const sessionen: Session[] = (sessionenRes as any)?.data?.data ?? []

  const { data: einheitenRes } = useQuery({
    queryKey: ['einheiten-all'],
    queryFn:  () => einheitenApi.list(),
  })
  const einheiten: { id: string; bezeichnung: string }[] = (einheitenRes as any)?.data?.data ?? []

  const { data: sessionDetail } = useQuery({
    queryKey:       ['lernmodus-session', activeSession],
    queryFn:        () => lernmodusApi.session(activeSession!),
    enabled:        !!activeSession,
    refetchInterval: (q) => {
      const s = (q.state.data as any)?.data?.data as Session | undefined
      if (!s) return 3000
      if (s.dokument?.extractionStatus === 'pending' || s.dokument?.extractionStatus === 'processing') return 3000
      return false
    },
  })
  const session: Session | null = (sessionDetail as any)?.data?.data ?? null

  const startenMut = useMutation({
    mutationFn: (id: string) => lernmodusApi.starten(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['lernmodus-session', activeSession] }),
    onError:    () => toast.error('Fragen konnten nicht generiert werden'),
  })

  const beantwortenMut = useMutation({
    mutationFn: ({ frageId, body }: { frageId: string; body: Parameters<typeof lernmodusApi.beantworten>[1] }) =>
      lernmodusApi.beantworten(frageId, body),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['lernmodus-session', activeSession] }),
    onError:    () => toast.error('Antwort konnte nicht gespeichert werden'),
  })

  const abschliessenMut = useMutation({
    mutationFn: (id: string) => lernmodusApi.abschliessen(id),
    onSuccess:  (res) => {
      const d = (res as any)?.data?.data
      toast.success(
        `Abgeschlossen! ${d?.aktualisierteEinheiten ?? 0} Einheiten + ${d?.neueKostenartRegeln ?? 0} Kostenart-Regeln gespeichert`
      )
      qc.invalidateQueries({ queryKey: ['lernmodus-sessionen'] })
      qc.invalidateQueries({ queryKey: ['lernmodus-session', activeSession] })
    },
    onError: () => toast.error('Abschließen fehlgeschlagen'),
  })

  const bestaetigtCount = session?.fragen.filter((f) => f.bestaetigt).length ?? 0
  const gesamtCount     = session?.fragen.length ?? 0
  const offenCount      = session?.fragen.filter((f) => !f.bestaetigt).length ?? 0

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Brain className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-[20px] font-semibold">Lernmodus</h1>
          <p className="text-sm text-muted-foreground">
            Lade alte Nebenkostenabrechnungen hoch — ich lerne daraus und stelle Rückfragen
          </p>
        </div>
      </div>

      {/* Upload-Bereich */}
      {!uploadFiles ? (
        <DropZone
          accept={['application/pdf', 'image/jpeg', 'image/png']}
          label="Alte Nebenkostenabrechnung hochladen (PDF oder Bild)"
          onFiles={setUploadFiles}
          className="min-h-[160px]"
        />
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Hochladen…</CardTitle>
          </CardHeader>
          <CardContent>
            <UploadQueue
              files={uploadFiles}
              uploadFn={async (file, onProgress) => {
                const fd = new FormData()
                fd.append('file', file)
                onProgress(10)
                const res = await lernmodusApi.upload(fd)
                onProgress(100)
                const sessionId = (res as any).data.data.sessionId as string
                setActiveSession(sessionId)
                return { id: sessionId }
              }}
              onComplete={(_results: UploadResult[]) => {
                setUploadFiles(null)
                qc.invalidateQueries({ queryKey: ['lernmodus-sessionen'] })
              }}
              onClose={() => setUploadFiles(null)}
            />
          </CardContent>
        </Card>
      )}

      {/* Sessionen-Liste */}
      <div className="space-y-2">
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Lade Sessionen…</p>
        ) : sessionen.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Noch keine Lernmodus-Sessionen. Lade eine alte Nebenkostenabrechnung hoch.
            </CardContent>
          </Card>
        ) : (
          sessionen.map((s) => (
            <Card
              key={s.id}
              className="cursor-pointer hover:shadow-md transition-all hover:border-primary/30"
              onClick={() => setActiveSession(s.id)}
            >
              <CardContent className="py-3 px-4 flex items-center gap-3">
                <Brain className="h-4 w-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{s.dokument?.originalName}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(s.erstelltAm).toLocaleDateString('de-DE')}
                    {' · '}
                    {s.fragen?.filter((f: Frage) => f.bestaetigt).length ?? 0}/{s.fragen?.length ?? 0} Fragen beantwortet
                  </p>
                </div>
                <StatusBadge status={s.status} />
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Session-Dialog */}
      <Dialog open={!!activeSession} onOpenChange={(o) => !o && setActiveSession(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              {session?.dokument?.originalName ?? 'Lernmodus'}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {!session ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Lade…</div>

            ) : session.dokument?.extractionStatus === 'pending' ||
               session.dokument?.extractionStatus === 'processing' ? (
              <div className="py-10 text-center space-y-3">
                <Clock className="h-9 w-9 mx-auto text-primary animate-pulse" />
                <div>
                  <p className="font-medium text-sm">KI analysiert die Abrechnung…</p>
                  <p className="text-xs text-muted-foreground mt-1">Das dauert ca. 15–30 Sekunden</p>
                </div>
              </div>

            ) : session.status === 'extrahiert' ? (
              <div className="py-8 text-center space-y-4">
                <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-500" />
                <div>
                  <p className="font-semibold">Abrechnung analysiert ✓</p>
                  <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                    Ich habe die Abrechnung ausgelesen. Klicke auf &quot;Fragen starten&quot; und ich stelle dir gezielte Rückfragen zu den Daten.
                  </p>
                </div>
                <Button
                  onClick={() => startenMut.mutate(session.id)}
                  disabled={startenMut.isPending}
                  className="gap-2"
                >
                  <MessageSquare className="h-4 w-4" />
                  Fragen starten
                </Button>
              </div>

            ) : session.status === 'abgeschlossen' ? (
              <div className="py-8 text-center space-y-2">
                <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-500" />
                <p className="font-semibold">Lernmodus abgeschlossen ✓</p>
                <p className="text-sm text-muted-foreground">
                  {bestaetigtCount} bestätigte Antworten fließen in zukünftige Berechnungen ein.
                </p>
              </div>

            ) : (
              // in_dialog
              <>
                {/* Fortschritt */}
                <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                  <span>{bestaetigtCount} von {gesamtCount} Fragen beantwortet</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: gesamtCount ? `${(bestaetigtCount / gesamtCount) * 100}%` : '0%' }}
                      />
                    </div>
                    <span>{offenCount} offen</span>
                  </div>
                </div>

                {/* Fragen */}
                <div className="space-y-3">
                  {session.fragen.map((frage) => (
                    <FrageCard
                      key={frage.id}
                      frage={frage}
                      einheiten={einheiten}
                      onBestaetigen={(antwort, einheitId) =>
                        beantwortenMut.mutate({ frageId: frage.id, body: { antwortWert: antwort, einheitId } })
                      }
                      onUeberspringen={() =>
                        beantwortenMut.mutate({ frageId: frage.id, body: { antwortWert: '', ueberspringen: true } })
                      }
                    />
                  ))}
                </div>

                {/* Abschließen */}
                {bestaetigtCount > 0 && (
                  <Button
                    className="w-full"
                    onClick={() => abschliessenMut.mutate(session.id)}
                    disabled={abschliessenMut.isPending}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Wissen speichern und abschließen ({bestaetigtCount} Antworten)
                  </Button>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
