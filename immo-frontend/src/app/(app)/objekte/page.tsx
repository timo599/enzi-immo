'use client'

import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { objekteApi, firmenApi, zaehlerApi, dokumenteApi, minolApi } from '@/lib/api'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { DokumentKategorie } from '@/lib/api'
import { toast } from 'sonner'
import { datum } from '@/lib/format'
import {
  Plus, Building2, MapPin, Pencil, Briefcase, Zap, Flame, Droplets, Thermometer,
  FolderOpen, FileText, Upload, Sparkles, ChevronDown, ChevronUp, Trash2, Home,
} from 'lucide-react'

// ── Typen ─────────────────────────────────────────────────────
interface Firma  { id: string; name: string }
interface Objekt {
  id: string; bezeichnung: string; strasse: string; hausnummer: string
  plz: string; stadt: string; heizungsart: string; wohnflaecheGesamtM2: number
  aktiv: boolean; firmaId?: string; firma?: { id: string; name: string }
  _count?: { einheiten: number }
}
interface Zaehler {
  id: string; bezeichnung: string; zaehlernummer?: string; verbrauchstyp: string
  einheit: string; aktiv: boolean
  staende?: { id: string; ablesedatum: string; stand: number; verbrauch?: number }[]
}
interface Dokument {
  id: string; originalName: string; dokumentKategorie: string
  hochgeladenAm: string; mimeType: string
}

// ── Konstanten ─────────────────────────────────────────────────
const HEIZUNG: Record<string, string> = {
  oel: 'Öl', gas: 'Gas', fernwaerme: 'Fernwärme', strom: 'Strom',
  waermepumpe: 'Wärmepumpe', pellets: 'Pellets', sonstiges: 'Sonstiges',
}
const VERBRAUCHSTYPEN: Record<string, { label: string; icon: React.ElementType; einheit: string }> = {
  strom_gemein:  { label: 'Strom (Allgemein)', icon: Zap,         einheit: 'kWh' },
  strom_einheit: { label: 'Strom (Einheit)',   icon: Zap,         einheit: 'kWh' },
  gas:           { label: 'Gas',               icon: Flame,       einheit: 'm³' },
  wasser_kalt:   { label: 'Wasser kalt',       icon: Droplets,    einheit: 'm³' },
  wasser_warm:   { label: 'Wasser warm',       icon: Thermometer, einheit: 'm³' },
  fernwaerme:    { label: 'Fernwärme',         icon: Thermometer, einheit: 'kWh' },
  oel:           { label: 'Heizöl',            icon: Flame,       einheit: 'Liter' },
}
const DOK_KATEGORIEN: Record<string, string> = {
  rechnung: 'Rechnung', mietvertrag: 'Mietvertrag', minol: 'Minol',
  zaehler_foto: 'Zählerfoto', sonstiges: 'Sonstiges',
}

const defaultForm       = { firmaId: '', bezeichnung: '', strasse: '', hausnummer: '', plz: '', stadt: '', bundesland: '', baujahr: '', heizungsart: 'gas', wohnflaecheGesamtM2: '' }
const defaultZaehlerForm = { bezeichnung: '', zaehlernummer: '', verbrauchstyp: 'strom_gemein', einheit: 'kWh', notizen: '' }
const defaultStandForm   = { ablesedatum: new Date().toISOString().split('T')[0], stand: '' }

// ── Hauptkomponente ────────────────────────────────────────────
export default function ObjektePage() {
  const qc = useQueryClient()

  // Objekt create/edit dialog
  const [open, setOpen]       = useState(false)
  const [editing, setEditing] = useState<Objekt | null>(null)
  const [form, setForm]       = useState(defaultForm)
  const [filterFirmaId, setFilterFirmaId] = useState('')

  // Detail-Sheet
  const [selectedObjekt, setSelectedObjekt] = useState<Objekt | null>(null)
  const [sheetTab, setSheetTab]             = useState('zaehler')

  // Allgemeinzähler
  const [zaehlerOpen, setZaehlerOpen]         = useState(false)
  const [zaehlerForm, setZaehlerForm]         = useState(defaultZaehlerForm)
  const [standOpen, setStandOpen]             = useState(false)
  const [standForm, setStandForm]             = useState(defaultStandForm)
  const [standZaehlerId, setStandZaehlerId]   = useState('')
  const [expandedZaehler, setExpandedZaehler] = useState<string | null>(null)

  // Dokument upload
  const dokFileRef              = useRef<HTMLInputElement>(null)
  const [dokUploading, setDokUploading] = useState(false)
  const [dokKategorie, setDokKategorie] = useState<DokumentKategorie>('rechnung')

  // Minol OCR
  const minolFileRef              = useRef<HTMLInputElement>(null)
  const [minolLoading, setMinolLoading] = useState(false)
  const [minolResult, setMinolResult]   = useState<any>(null)

  // ── Queries ───────────────────────────────────────────────────
  const { data, isLoading } = useQuery({ queryKey: ['objekte', filterFirmaId], queryFn: () => objekteApi.list(filterFirmaId ? { firmaId: filterFirmaId } : {}) })
  const { data: firmenData }    = useQuery({ queryKey: ['firmen'],   queryFn: () => firmenApi.list() })
  const { data: zaehlerData }   = useQuery({
    queryKey: ['zaehler-obj', selectedObjekt?.id],
    queryFn:  () => zaehlerApi.list({ objektId: selectedObjekt!.id }),
    enabled:  !!selectedObjekt && sheetTab === 'zaehler',
  })
  const { data: dokData } = useQuery({
    queryKey: ['dokumente-obj', selectedObjekt?.id],
    queryFn:  () => dokumenteApi.list({ objektId: selectedObjekt!.id, pageSize: 50 }),
    enabled:  !!selectedObjekt && (sheetTab === 'dokumente' || sheetTab === 'minol'),
  })

  // ── Mutations ─────────────────────────────────────────────────
  const saveMut = useMutation({
    mutationFn: (f: typeof defaultForm) => {
      const body = { ...f, firmaId: f.firmaId || undefined, wohnflaecheGesamtM2: f.wohnflaecheGesamtM2 ? parseFloat(f.wohnflaecheGesamtM2) : 0, baujahr: f.baujahr ? parseInt(f.baujahr) : undefined }
      return editing ? objekteApi.update(editing.id, body) : objekteApi.create(body)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['objekte'] }); toast.success(editing ? 'Objekt aktualisiert' : 'Objekt angelegt'); setOpen(false) },
    onError:   (err: any) => toast.error(err?.response?.data?.error?.message ?? 'Fehler'),
  })

  const zaehlerMut = useMutation({
    mutationFn: (f: typeof defaultZaehlerForm) => zaehlerApi.create({ ...f, objektId: selectedObjekt!.id }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['zaehler-obj', selectedObjekt?.id] }); toast.success('Zähler angelegt'); setZaehlerOpen(false) },
    onError:   (err: any) => toast.error(err?.response?.data?.error?.message ?? 'Fehler'),
  })

  const zaehlerDelMut = useMutation({
    mutationFn: (id: string) => zaehlerApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['zaehler-obj', selectedObjekt?.id] }); toast.success('Zähler gelöscht') },
  })

  const standMut = useMutation({
    mutationFn: (f: typeof defaultStandForm) => zaehlerApi.addStand(standZaehlerId, { ablesedatum: f.ablesedatum, stand: parseFloat(f.stand) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['zaehler-obj', selectedObjekt?.id] }); toast.success('Ablesung eingetragen'); setStandOpen(false); setStandForm(defaultStandForm) },
    onError:   (err: any) => toast.error(err?.response?.data?.error?.message ?? 'Fehler'),
  })

  // ── Handlers ──────────────────────────────────────────────────
  async function handleDokUpload() {
    const file = dokFileRef.current?.files?.[0]
    if (!file || !selectedObjekt) { toast.error('Datei auswählen'); return }
    setDokUploading(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      await dokumenteApi.upload(fd, { objektId: selectedObjekt.id, dokumentKategorie: dokKategorie })
      qc.invalidateQueries({ queryKey: ['dokumente-obj', selectedObjekt.id] })
      toast.success('Dokument hochgeladen')
      if (dokFileRef.current) dokFileRef.current.value = ''
    } catch (err: any) { toast.error(err?.response?.data?.error?.message ?? 'Upload fehlgeschlagen') }
    finally { setDokUploading(false) }
  }

  async function handleMinolOcr() {
    const file = minolFileRef.current?.files?.[0]
    if (!file) { toast.error('Bitte Datei auswählen'); return }
    setMinolLoading(true); setMinolResult(null)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await minolApi.ocr(fd)
      setMinolResult(res.data?.data)
      toast.success('Minol-Bericht analysiert – Ergebnis unten')
    } catch { toast.error('KI-Extraktion fehlgeschlagen') }
    finally { setMinolLoading(false) }
  }

  function openCreate() { setEditing(null); setForm(defaultForm); setOpen(true) }
  function openEdit(o: Objekt, e: React.MouseEvent) {
    e.stopPropagation()
    setEditing(o)
    setForm({ firmaId: o.firmaId ?? '', bezeichnung: o.bezeichnung, strasse: o.strasse, hausnummer: o.hausnummer, plz: o.plz, stadt: o.stadt, bundesland: '', baujahr: '', heizungsart: o.heizungsart, wohnflaecheGesamtM2: String(o.wohnflaecheGesamtM2 || '') })
    setOpen(true)
  }
  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })) }

  const objekte: Objekt[]  = data?.data?.data    ?? []
  const firmen: Firma[]    = firmenData?.data?.data ?? []
  const zaehler: Zaehler[] = zaehlerData?.data?.data ?? []
  const dokumente: Dokument[] = dokData?.data?.data  ?? []

  const grouped = objekte.reduce<Record<string, { firma: string; items: Objekt[] }>>((acc, o) => {
    const key = o.firmaId ?? '__none__'
    if (!acc[key]) acc[key] = { firma: o.firma?.name ?? 'Ohne Firma', items: [] }
    acc[key].items.push(o); return acc
  }, {})

  return (
    <div>
      <PageHeader
        title="Objekte"
        description="Verwaltete Immobilien und Liegenschaften"
        action={<Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" />Neues Objekt</Button>}
      />

      {/* Firma-Filter */}
      {firmen.length > 0 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          <Button size="sm" variant={!filterFirmaId ? 'default' : 'outline'} onClick={() => setFilterFirmaId('')}>Alle</Button>
          {firmen.map(f => (
            <Button key={f.id} size="sm" variant={filterFirmaId === f.id ? 'default' : 'outline'} onClick={() => setFilterFirmaId(filterFirmaId === f.id ? '' : f.id)}>
              <Briefcase className="h-3 w-3 mr-1" />{f.name}
            </Button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : objekte.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-slate-400">
          <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
          Noch keine Objekte. Legen Sie Ihr erstes Objekt an.
        </CardContent></Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([key, { firma, items }]) => (
            <div key={key}>
              <div className="flex items-center gap-2 mb-3">
                <Briefcase className="h-4 w-4 text-slate-400" />
                <span className="text-sm font-semibold text-slate-600">{firma}</span>
                <span className="text-xs text-slate-400">({items.length})</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {items.map(o => (
                  <Card key={o.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => { setSelectedObjekt(o); setSheetTab('zaehler'); setMinolResult(null) }}>
                    <CardContent className="pt-5">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Building2 className="h-5 w-5 text-blue-500 shrink-0" />
                          <span className="font-semibold truncate">{o.bezeichnung}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Badge variant={o.aktiv ? 'default' : 'secondary'}>{o.aktiv ? 'Aktiv' : 'Inaktiv'}</Badge>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => openEdit(o, e)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <p className="text-sm text-slate-500 flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />{o.strasse} {o.hausnummer}, {o.plz} {o.stadt}
                      </p>
                      <div className="mt-3 flex gap-4 text-xs text-slate-400">
                        <span>{HEIZUNG[o.heizungsart] ?? o.heizungsart}</span>
                        {Number(o.wohnflaecheGesamtM2) > 0 && <span>{Number(o.wohnflaecheGesamtM2)} m²</span>}
                        {o._count && <span><Home className="h-3 w-3 inline mr-0.5" />{o._count.einheiten} Einheiten</span>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Objekt-Detail-Sheet ───────────────────────────────────── */}
      <Sheet open={!!selectedObjekt} onOpenChange={o => !o && setSelectedObjekt(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selectedObjekt && (
            <>
              <SheetHeader className="mb-4">
                <div className="flex items-center justify-between">
                  <SheetTitle className="text-base">{selectedObjekt.bezeichnung}</SheetTitle>
                  <Button size="sm" variant="outline" onClick={(e) => { openEdit(selectedObjekt, e); setSelectedObjekt(null) }}>
                    <Pencil className="h-3 w-3 mr-1" />Bearbeiten
                  </Button>
                </div>
                <p className="text-sm text-slate-500">{selectedObjekt.strasse} {selectedObjekt.hausnummer}, {selectedObjekt.plz} {selectedObjekt.stadt}</p>
              </SheetHeader>

              <Tabs value={sheetTab} onValueChange={setSheetTab}>
                <TabsList className="w-full grid grid-cols-3 mb-4">
                  <TabsTrigger value="zaehler"><Zap className="h-3 w-3 mr-1" />Zähler</TabsTrigger>
                  <TabsTrigger value="dokumente"><FolderOpen className="h-3 w-3 mr-1" />Dokumente</TabsTrigger>
                  <TabsTrigger value="minol"><Sparkles className="h-3 w-3 mr-1" />Minol</TabsTrigger>
                </TabsList>

                {/* ── TAB: Allgemeinzähler ────────────────────────── */}
                <TabsContent value="zaehler">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-medium text-slate-700">Allgemeinzähler</p>
                    <Button size="sm" onClick={() => { setZaehlerForm(defaultZaehlerForm); setZaehlerOpen(true) }}>
                      <Plus className="h-3 w-3 mr-1" />Zähler anlegen
                    </Button>
                  </div>
                  {zaehler.length === 0
                    ? <p className="text-sm text-slate-400 text-center py-6">Keine Zähler erfasst</p>
                    : zaehler.map(z => {
                        const typ  = VERBRAUCHSTYPEN[z.verbrauchstyp] ?? { label: z.verbrauchstyp, icon: Zap, einheit: z.einheit }
                        const Icon = typ.icon
                        const expanded = expandedZaehler === z.id
                        const letzterStand = z.staende?.[0]
                        return (
                          <div key={z.id} className="rounded-lg border border-slate-200 mb-2">
                            <div className="p-3 flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                                <Icon className="h-4 w-4 text-blue-600" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm">{z.bezeichnung}</span>
                                  <Badge variant="outline" className="text-xs">{typ.label}</Badge>
                                </div>
                                {z.zaehlernummer && <p className="text-xs text-slate-400">Nr. {z.zaehlernummer}</p>}
                                {letzterStand && (
                                  <p className="text-xs text-slate-500 mt-0.5">
                                    Letzter Stand: <span className="font-medium">{Number(letzterStand.stand).toFixed(1)} {z.einheit}</span> ({datum(letzterStand.ablesedatum)})
                                    {letzterStand.verbrauch != null && <span className="ml-1 text-blue-600">Δ {Number(letzterStand.verbrauch).toFixed(1)}</span>}
                                  </p>
                                )}
                              </div>
                              <div className="flex gap-1 flex-shrink-0">
                                <Button size="sm" variant="ghost" className="h-7 px-2" title="Ablesung eintragen" onClick={() => { setStandZaehlerId(z.id); setStandForm(defaultStandForm); setStandOpen(true) }}>
                                  <Plus className="h-3 w-3" />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setExpandedZaehler(expanded ? null : z.id)}>
                                  {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 px-2 text-red-400 hover:text-red-600" onClick={() => zaehlerDelMut.mutate(z.id)}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                            {expanded && z.staende && z.staende.length > 0 && (
                              <div className="border-t px-3 pb-3 pt-2">
                                <p className="text-xs font-medium text-slate-500 mb-2">Ablesungen</p>
                                <div className="space-y-1">
                                  {z.staende.map(s => (
                                    <div key={s.id} className="flex items-center justify-between text-xs text-slate-600">
                                      <span>{datum(s.ablesedatum)}</span>
                                      <span className="font-medium">{Number(s.stand).toFixed(1)} {z.einheit}</span>
                                      {s.verbrauch != null && <span className="text-blue-600">Δ {Number(s.verbrauch).toFixed(1)}</span>}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })
                  }
                </TabsContent>

                {/* ── TAB: Dokumente ──────────────────────────────── */}
                <TabsContent value="dokumente">
                  <div className="mb-4 rounded-lg border border-dashed border-slate-300 p-4">
                    <p className="text-sm font-medium text-slate-700 mb-2">Dokument hochladen</p>
                    <div className="flex flex-col gap-2">
                      <div>
                        <Label className="text-xs">Kategorie</Label>
                        <Select value={dokKategorie} onValueChange={v => v && setDokKategorie(v)}>
                          <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(DOK_KATEGORIEN).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <input ref={dokFileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.tiff" className="text-xs text-slate-600 file:mr-2 file:py-1 file:px-3 file:rounded file:text-xs file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                      <Button size="sm" onClick={handleDokUpload} disabled={dokUploading}>
                        <Upload className="h-3 w-3 mr-1" />{dokUploading ? 'Hochladen...' : 'Hochladen'}
                      </Button>
                    </div>
                  </div>
                  {dokumente.filter(d => d.dokumentKategorie !== 'minol').length === 0
                    ? <p className="text-sm text-slate-400 text-center py-4">Keine Dokumente vorhanden</p>
                    : dokumente.filter(d => d.dokumentKategorie !== 'minol').map(d => (
                        <div key={d.id} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 mb-2">
                          <FileText className="h-4 w-4 text-slate-400 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{d.originalName}</p>
                            <p className="text-xs text-slate-400">{DOK_KATEGORIEN[d.dokumentKategorie] ?? d.dokumentKategorie} · {datum(d.hochgeladenAm)}</p>
                          </div>
                        </div>
                      ))
                  }
                </TabsContent>

                {/* ── TAB: Minol OCR ─────────────────────────────── */}
                <TabsContent value="minol">
                  <div className="rounded-lg border border-dashed border-purple-200 bg-purple-50 p-4 mb-4">
                    <p className="text-sm font-semibold text-purple-800 mb-1 flex items-center gap-1">
                      <Sparkles className="h-4 w-4" />KI-Analyse: Minol / Wärmemessdienst
                    </p>
                    <p className="text-xs text-purple-600 mb-3">PDF oder Bild hochladen – die KI extrahiert die Verbrauchsdaten pro Einheit automatisch.</p>
                    <div className="flex flex-col gap-2">
                      <input ref={minolFileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="text-xs text-slate-600 file:mr-2 file:py-1 file:px-3 file:rounded file:text-xs file:border-0 file:bg-white file:text-purple-700" />
                      <Button size="sm" onClick={handleMinolOcr} disabled={minolLoading} className="bg-purple-600 hover:bg-purple-700">
                        <Sparkles className="h-3 w-3 mr-1" />{minolLoading ? 'Analysiere...' : 'Analysieren'}
                      </Button>
                    </div>
                  </div>

                  {minolResult && (
                    <div className="space-y-3">
                      {/* Objekt-Info */}
                      {minolResult.objekt && (
                        <div className="rounded-lg bg-slate-50 border p-3">
                          <p className="text-xs font-semibold text-slate-600 mb-1">Objekt</p>
                          <p className="text-sm">{minolResult.objekt.strasse} {minolResult.objekt.hausnummer}, {minolResult.objekt.plz} {minolResult.objekt.stadt}</p>
                          {minolResult.objekt.abrechnungszeitraum_von && (
                            <p className="text-xs text-slate-400 mt-0.5">Zeitraum: {minolResult.objekt.abrechnungszeitraum_von} – {minolResult.objekt.abrechnungszeitraum_bis}</p>
                          )}
                        </div>
                      )}
                      {/* Einheiten-Tabelle */}
                      {minolResult.einheiten?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-slate-600 mb-2">Verbrauch pro Einheit</p>
                          <div className="rounded-lg border overflow-hidden">
                            <table className="w-full text-xs">
                              <thead className="bg-slate-100">
                                <tr>
                                  <th className="text-left px-3 py-2 font-medium text-slate-600">Einheit / Mieter</th>
                                  <th className="text-right px-3 py-2 font-medium text-slate-600">Heizung</th>
                                  <th className="text-right px-3 py-2 font-medium text-slate-600">Warmwasser</th>
                                  <th className="text-right px-3 py-2 font-medium text-slate-600">Anteil</th>
                                  <th className="text-right px-3 py-2 font-medium text-slate-600">Kosten</th>
                                </tr>
                              </thead>
                              <tbody>
                                {minolResult.einheiten.map((e: any, i: number) => (
                                  <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                                    <td className="px-3 py-2">
                                      <p className="font-medium">{e.bezeichnung || e.lage || `Einheit ${i + 1}`}</p>
                                      {e.mieter && <p className="text-slate-400">{e.mieter}</p>}
                                    </td>
                                    <td className="px-3 py-2 text-right">{e.verbrauch_heizung_einheit != null ? e.verbrauch_heizung_einheit : '—'}</td>
                                    <td className="px-3 py-2 text-right">{e.verbrauch_warmwasser_einheit != null ? e.verbrauch_warmwasser_einheit : '—'}</td>
                                    <td className="px-3 py-2 text-right">{e.einheit_prozent != null ? `${e.einheit_prozent}%` : '—'}</td>
                                    <td className="px-3 py-2 text-right font-medium">{e.kosten_gesamt != null ? `${Number(e.kosten_gesamt).toFixed(2)} €` : '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                      {/* Gesamt */}
                      {minolResult.gesamt && (
                        <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-xs">
                          <p className="font-semibold text-blue-800 mb-1">Gesamt-Verbrauch</p>
                          {minolResult.gesamt.verbrauch_heizung_gesamt != null && <p>Heizung: {minolResult.gesamt.verbrauch_heizung_gesamt}</p>}
                          {minolResult.gesamt.verbrauch_warmwasser_gesamt != null && <p>Warmwasser: {minolResult.gesamt.verbrauch_warmwasser_gesamt}</p>}
                          {minolResult.gesamt.kosten_gesamt != null && <p className="font-medium text-blue-900">Gesamtkosten: {Number(minolResult.gesamt.kosten_gesamt).toFixed(2)} €</p>}
                          {minolResult.gesamt.messdienst && <p className="text-slate-500 mt-1">Messdienst: {minolResult.gesamt.messdienst}</p>}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Hochgeladene Minol-Dokumente */}
                  {dokumente.filter(d => d.dokumentKategorie === 'minol').length > 0 && (
                    <div className="mt-4">
                      <p className="text-xs font-semibold text-slate-600 mb-2">Gespeicherte Minol-Dokumente</p>
                      {dokumente.filter(d => d.dokumentKategorie === 'minol').map(d => (
                        <div key={d.id} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 mb-2">
                          <FileText className="h-4 w-4 text-purple-400 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{d.originalName}</p>
                            <p className="text-xs text-slate-400">{datum(d.hochgeladenAm)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Zähler anlegen Dialog ─────────────────────────────────── */}
      <Dialog open={zaehlerOpen} onOpenChange={setZaehlerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Allgemeinzähler anlegen</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label className="text-xs">Bezeichnung</Label>
              <Input className="h-9 mt-1" value={zaehlerForm.bezeichnung} onChange={e => setZaehlerForm(f => ({ ...f, bezeichnung: e.target.value }))} placeholder="z.B. Hauszähler Strom, Wasserzähler Keller" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Zählertyp</Label>
                <Select value={zaehlerForm.verbrauchstyp} onValueChange={v => {
                  if (!v) return
                  const def = VERBRAUCHSTYPEN[v]
                  setZaehlerForm(f => ({ ...f, verbrauchstyp: v, einheit: def?.einheit ?? 'kWh' }))
                }}>
                  <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(VERBRAUCHSTYPEN).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Einheit</Label>
                <Input className="h-9 mt-1" value={zaehlerForm.einheit} onChange={e => setZaehlerForm(f => ({ ...f, einheit: e.target.value }))} placeholder="kWh" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Zählernummer (optional)</Label>
              <Input className="h-9 mt-1" value={zaehlerForm.zaehlernummer} onChange={e => setZaehlerForm(f => ({ ...f, zaehlernummer: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setZaehlerOpen(false)}>Abbrechen</Button>
            <Button onClick={() => zaehlerMut.mutate(zaehlerForm)} disabled={zaehlerMut.isPending || !zaehlerForm.bezeichnung}>
              {zaehlerMut.isPending ? 'Speichern...' : 'Anlegen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Ablesung Dialog ──────────────────────────────────────── */}
      <Dialog open={standOpen} onOpenChange={setStandOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Ablesung eintragen</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label className="text-xs">Ablesedatum</Label>
              <Input className="h-9 mt-1" type="date" value={standForm.ablesedatum} onChange={e => setStandForm(f => ({ ...f, ablesedatum: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Zählerstand</Label>
              <Input className="h-9 mt-1" type="number" step="0.001" value={standForm.stand} onChange={e => setStandForm(f => ({ ...f, stand: e.target.value }))} placeholder="z.B. 12345.678" />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setStandOpen(false)}>Abbrechen</Button>
            <Button onClick={() => standMut.mutate(standForm)} disabled={standMut.isPending || !standForm.stand}>
              {standMut.isPending ? 'Eintragen...' : 'Eintragen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Objekt create/edit Dialog ────────────────────────────── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? 'Objekt bearbeiten' : 'Neues Objekt'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label>Firma / Eigentümer</Label>
              <Select value={form.firmaId} onValueChange={v => set('firmaId', v ?? '')}>
                <SelectTrigger><SelectValue placeholder="— ohne Firma —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— ohne Firma —</SelectItem>
                  {firmen.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Bezeichnung *</Label>
              <Input value={form.bezeichnung} onChange={e => set('bezeichnung', e.target.value)} placeholder="Musterstraße 1" />
            </div>
            <div className="space-y-1"><Label>Straße *</Label><Input value={form.strasse} onChange={e => set('strasse', e.target.value)} /></div>
            <div className="space-y-1"><Label>Hausnummer *</Label><Input value={form.hausnummer} onChange={e => set('hausnummer', e.target.value)} /></div>
            <div className="space-y-1"><Label>PLZ *</Label><Input value={form.plz} onChange={e => set('plz', e.target.value)} placeholder="70173" /></div>
            <div className="space-y-1"><Label>Stadt *</Label><Input value={form.stadt} onChange={e => set('stadt', e.target.value)} /></div>
            <div className="space-y-1">
              <Label>Heizungsart</Label>
              <Select value={form.heizungsart} onValueChange={v => set('heizungsart', v ?? form.heizungsart)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(HEIZUNG).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Gesamtfläche m²</Label><Input type="number" value={form.wohnflaecheGesamtM2} onChange={e => set('wohnflaecheGesamtM2', e.target.value)} placeholder="0" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Abbrechen</Button>
            <Button onClick={() => saveMut.mutate(form)} disabled={!form.bezeichnung || saveMut.isPending}>
              {saveMut.isPending ? 'Speichern…' : 'Speichern'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
