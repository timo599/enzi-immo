'use client'

import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { einheitenApi, objekteApi, mieterApi, mietvertraegeApi, zaehlerApi, dokumenteApi } from '@/lib/api'
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
import { toast } from 'sonner'
import { euro, datum } from '@/lib/format'
import {
  Plus, Home, Pencil, Building, Warehouse, Car, Stethoscope, ShoppingBag,
  BriefcaseBusiness, Layers, Users, FileText, Upload, Sparkles, CalendarDays,
  Zap, Droplets, Flame, Thermometer, Trash2, ChevronDown, ChevronUp, FolderOpen,
} from 'lucide-react'
import { DocumentSection } from '@/components/document-section'
import type { DokumentKategorie } from '@/lib/api'

// ── Typen ─────────────────────────────────────────────────────
interface Einheit {
  id: string; bezeichnung: string; einheitenTyp: string
  wohnflaecheM2?: number; nutzflaecheM2?: number; etage?: string; aktiv: boolean
  objekt?: { id: string; bezeichnung: string }
}
interface Vertrag {
  id: string; mietart: string; vertragsbeginn: string; vertragsende?: string
  nettomiete: number; nkVorauszahlung: number; mietflaecheM2?: number
  mietvertragMieter?: { mieter: { id: string; vorname?: string; nachname: string } }[]
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
const TYPEN: Record<string, { label: string; flaecheLabel: string; badge: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  wohnung:    { label: 'Wohnung',     flaecheLabel: 'Wohnfläche m²',  badge: 'default' },
  loft:       { label: 'Loft',        flaecheLabel: 'Wohnfläche m²',  badge: 'default' },
  gewerbe:    { label: 'Gewerbe',     flaecheLabel: 'Nutzfläche m²',  badge: 'destructive' },
  buero:      { label: 'Büro',        flaecheLabel: 'Bürofläche m²',  badge: 'outline' },
  laden:      { label: 'Ladenfläche', flaecheLabel: 'Ladenfläche m²', badge: 'destructive' },
  praxis:     { label: 'Praxis',      flaecheLabel: 'Nutzfläche m²',  badge: 'outline' },
  lager:      { label: 'Lager',       flaecheLabel: 'Lagerfläche m²', badge: 'secondary' },
  stellplatz: { label: 'Stellplatz',  flaecheLabel: 'Fläche m²',      badge: 'secondary' },
  sonstiges:  { label: 'Sonstiges',   flaecheLabel: 'Fläche m²',      badge: 'secondary' },
}
const TYP_ICON: Record<string, React.ElementType> = {
  wohnung: Home, loft: Home, gewerbe: Building, buero: BriefcaseBusiness,
  laden: ShoppingBag, praxis: Stethoscope, lager: Warehouse, stellplatz: Car, sonstiges: Layers,
}
const VERBRAUCHSTYPEN: Record<string, { label: string; icon: React.ElementType; einheit: string }> = {
  strom_einheit: { label: 'Strom (Einheit)',   icon: Zap,         einheit: 'kWh' },
  strom_gemein:  { label: 'Strom (Allgemein)', icon: Zap,         einheit: 'kWh' },
  gas:           { label: 'Gas',               icon: Flame,       einheit: 'm³' },
  wasser_kalt:   { label: 'Wasser kalt',       icon: Droplets,    einheit: 'm³' },
  wasser_warm:   { label: 'Wasser warm',       icon: Thermometer, einheit: 'm³' },
  fernwaerme:    { label: 'Fernwärme',         icon: Thermometer, einheit: 'kWh' },
  oel:           { label: 'Heizöl',            icon: Flame,       einheit: 'Liter' },
}
const DOK_KATEGORIEN: Record<string, string> = {
  rechnung:    'Rechnung',
  mietvertrag: 'Mietvertrag',
  minol:       'Minol',
  zaehler_foto:'Zählerfoto',
  sonstiges:   'Sonstiges',
}

const defaultEinheitForm = { bezeichnung: '', einheitenTyp: 'wohnung', objektId: '', flaecheM2: '', etage: '' }
const defaultMieterForm  = { vorname: '', nachname: '', email: '', telefon: '', iban: '', strasse: '', hausnummer: '', plz: '', stadt: '' }
const defaultVertragForm = { vertragsbeginn: '', vertragsende: '', nettomiete: '', nkVorauszahlung: '', kaution: '', mietflaecheM2: '', mietart: 'wohnraum' }
const defaultZaehlerForm = { bezeichnung: '', zaehlernummer: '', verbrauchstyp: 'strom_einheit', einheit: 'kWh', notizen: '' }
const defaultStandForm   = { ablesedatum: new Date().toISOString().split('T')[0], stand: '' }

function mieterName(m?: { vorname?: string; nachname: string }) {
  if (!m) return '—'
  return [m.vorname, m.nachname].filter(Boolean).join(' ')
}

// ── Hauptkomponente ────────────────────────────────────────────
export default function EinheitenPage() {
  const qc = useQueryClient()
  const ocrFileRef    = useRef<HTMLInputElement>(null)
  const dokFileRef    = useRef<HTMLInputElement>(null)
  const autoFileRef   = useRef<HTMLInputElement>(null)
  const [autoUploading, setAutoUploading] = useState(false)

  // Detail-Sheet
  const [selectedEinheit, setSelectedEinheit] = useState<Einheit | null>(null)
  const [sheetTab, setSheetTab] = useState('mieter')

  // Neue Einheit Dialog
  const [einheitOpen, setEinheitOpen]       = useState(false)
  const [editingEinheit, setEditingEinheit] = useState<Einheit | null>(null)
  const [einheitForm, setEinheitForm]       = useState(defaultEinheitForm)

  // Mieter+Vertrag Dialog
  const [vertragOpen, setVertragOpen]         = useState(false)
  const [mieterForm, setMieterForm]           = useState(defaultMieterForm)
  const [vertragForm, setVertragForm]         = useState(defaultVertragForm)
  const [existingMieterId, setExistingMieterId] = useState('')
  const [mieterMode, setMieterMode]           = useState<'new' | 'existing'>('new')
  const [ocrLoading, setOcrLoading]           = useState(false)
  const [ocrDone, setOcrDone]                 = useState(false)

  // Zähler Dialog
  const [zaehlerOpen, setZaehlerOpen]         = useState(false)
  const [zaehlerForm, setZaehlerForm]         = useState(defaultZaehlerForm)
  const [editingZaehler, setEditingZaehler]   = useState<Zaehler | null>(null)
  const [standOpen, setStandOpen]             = useState(false)
  const [standForm, setStandForm]             = useState(defaultStandForm)
  const [standZaehlerId, setStandZaehlerId]   = useState('')
  const [expandedZaehler, setExpandedZaehler] = useState<string | null>(null)

  // Dokument Upload
  const [dokUploading, setDokUploading]       = useState(false)
  const [dokKategorie, setDokKategorie]       = useState<DokumentKategorie>('rechnung')

  const [filterObjektId, setFilterObjektId]   = useState('')

  // ── Queries ───────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['einheiten', filterObjektId],
    queryFn:  () => einheitenApi.list(filterObjektId ? { objektId: filterObjektId } : {}),
  })
  const { data: objData }  = useQuery({ queryKey: ['objekte'],  queryFn: () => objekteApi.list() })
  const { data: miData }   = useQuery({ queryKey: ['mieter'],   queryFn: () => mieterApi.list({ pageSize: 200 }) })
  const { data: vertragData } = useQuery({
    queryKey: ['mietvertraege', selectedEinheit?.id],
    queryFn:  () => mietvertraegeApi.list({ einheitId: selectedEinheit!.id, pageSize: 50 }),
    enabled:  !!selectedEinheit,
  })
  const { data: zaehlerData } = useQuery({
    queryKey: ['zaehler', selectedEinheit?.id],
    queryFn:  () => zaehlerApi.list({ einheitId: selectedEinheit!.id }),
    enabled:  !!selectedEinheit && sheetTab === 'zaehler',
  })
  const { data: dokData } = useQuery({
    queryKey: ['dokumente', selectedEinheit?.id],
    queryFn:  () => dokumenteApi.list({ einheitId: selectedEinheit!.id, pageSize: 50 }),
    enabled:  !!selectedEinheit && sheetTab === 'dokumente',
  })

  // ── Mutations ─────────────────────────────────────────────────
  const einheitMut = useMutation({
    mutationFn: (f: typeof defaultEinheitForm) => {
      const typ = f.einheitenTyp
      const flaeche = f.flaecheM2 ? parseFloat(f.flaecheM2) : undefined
      const isWohn  = typ === 'wohnung' || typ === 'loft'
      const body = {
        objektId: f.objektId, bezeichnung: f.bezeichnung, einheitenTyp: typ,
        ...(flaeche ? (isWohn ? { wohnflaecheM2: flaeche } : { nutzflaecheM2: flaeche }) : {}),
        ...(f.etage ? { etage: f.etage } : {}),
      }
      return editingEinheit ? einheitenApi.update(editingEinheit.id, body) : einheitenApi.create(body)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['einheiten'] }); toast.success('Gespeichert'); setEinheitOpen(false) },
    onError:   (err: any) => toast.error(err?.response?.data?.error?.message ?? 'Fehler'),
  })

  const vertragMut = useMutation({
    mutationFn: async () => {
      if (!selectedEinheit) return
      let mieterId = existingMieterId
      if (mieterMode === 'new') {
        const res = await mieterApi.create(mieterForm)
        mieterId = res.data?.data?.id
        if (!mieterId) throw new Error('Mieter konnte nicht angelegt werden')
      }
      return mietvertraegeApi.create({
        einheitId:       selectedEinheit.id,
        mietart:         vertragForm.mietart,
        vertragsbeginn:  vertragForm.vertragsbeginn,
        ...(vertragForm.vertragsende ? { vertragsende: vertragForm.vertragsende } : {}),
        nettomiete:      parseFloat(vertragForm.nettomiete) || 0,
        nkVorauszahlung: parseFloat(vertragForm.nkVorauszahlung) || 0,
        ...(vertragForm.kaution      ? { kaution: parseFloat(vertragForm.kaution) } : {}),
        ...(vertragForm.mietflaecheM2 ? { mietflaecheM2: parseFloat(vertragForm.mietflaecheM2) } : {}),
        mieter: mieterId ? [{ mieterId, rolle: 'hauptmieter', seit: vertragForm.vertragsbeginn }] : [],
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mietvertraege'] })
      qc.invalidateQueries({ queryKey: ['mieter'] })
      toast.success('Mieter & Vertrag angelegt')
      setVertragOpen(false); setOcrDone(false)
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? 'Fehler'),
  })

  // Mietvertrag-Upload: PDF → OCR → Mieter+Vertrag automatisch anlegen
  async function handleAutoUpload(file: File) {
    if (!selectedEinheit) return
    setAutoUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await einheitenApi.uploadMietvertrag(selectedEinheit.id, fd)
      const meta = res.data?.meta
      qc.invalidateQueries({ queryKey: ['vertraege', selectedEinheit.id] })
      qc.invalidateQueries({ queryKey: ['mieter'] })
      qc.invalidateQueries({ queryKey: ['mietvertraege'] })
      toast.success(meta?.mieterCreated
        ? 'Mieter neu angelegt und Vertrag erstellt'
        : 'Vertrag erstellt (Mieter war bereits vorhanden)')
      if (meta?.warnings?.length) {
        meta.warnings.forEach((w: string) => toast.warning(w))
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message ?? 'Upload/OCR fehlgeschlagen'
      toast.error(msg)
    } finally {
      setAutoUploading(false)
      if (autoFileRef.current) autoFileRef.current.value = ''
    }
  }

  const zaehlerMut = useMutation({
    mutationFn: (f: typeof defaultZaehlerForm) => {
      const body = { ...f, einheitId: selectedEinheit!.id }
      return editingZaehler ? zaehlerApi.update(editingZaehler.id, f) : zaehlerApi.create(body)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['zaehler', selectedEinheit?.id] })
      toast.success('Zähler gespeichert')
      setZaehlerOpen(false)
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? 'Fehler'),
  })

  const zaehlerDelMut = useMutation({
    mutationFn: (id: string) => zaehlerApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['zaehler', selectedEinheit?.id] }); toast.success('Zähler gelöscht') },
  })

  const standMut = useMutation({
    mutationFn: (f: typeof defaultStandForm) =>
      zaehlerApi.addStand(standZaehlerId, { ablesedatum: f.ablesedatum, stand: parseFloat(f.stand) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['zaehler', selectedEinheit?.id] })
      toast.success('Ablesung eingetragen')
      setStandOpen(false); setStandForm(defaultStandForm)
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? 'Fehler'),
  })

  // ── OCR Handler ───────────────────────────────────────────────
  async function handleOcr() {
    const file = ocrFileRef.current?.files?.[0]
    if (!file) { toast.error('Bitte Datei auswählen'); return }
    setOcrLoading(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await mietvertraegeApi.ocr(fd)
      const d = res.data?.data
      if (d?.mieter) {
        setMieterMode('new')
        setMieterForm({
          vorname:    d.mieter.vorname    ?? '', nachname:  d.mieter.nachname   ?? '',
          email:      d.mieter.email      ?? '', telefon:   d.mieter.telefon    ?? '',
          iban:       '',
          strasse:    d.mieter.strasse    ?? '', hausnummer: d.mieter.hausnummer ?? '',
          plz:        d.mieter.plz        ?? '', stadt:     d.mieter.stadt      ?? '',
        })
      }
      if (d?.vertrag) {
        setVertragForm({
          mietart:         d.vertrag.mietart        ?? 'wohnraum',
          vertragsbeginn:  d.vertrag.vertragsbeginn ?? '',
          vertragsende:    d.vertrag.vertragsende   ?? '',
          nettomiete:      d.vertrag.nettomiete     != null ? String(d.vertrag.nettomiete)      : '',
          nkVorauszahlung: d.vertrag.nkVorauszahlung != null ? String(d.vertrag.nkVorauszahlung) : '',
          kaution:         d.vertrag.kaution        != null ? String(d.vertrag.kaution)         : '',
          mietflaecheM2:   d.vertrag.mietflaecheM2 != null ? String(d.vertrag.mietflaecheM2)   : '',
        })
      }
      setOcrDone(true)
      toast.success('KI-Extraktion abgeschlossen – Felder prüfen')
    } catch { toast.error('KI-Extraktion fehlgeschlagen') }
    finally   { setOcrLoading(false) }
  }

  // ── Dokument Upload Handler ───────────────────────────────────
  async function handleDokUpload() {
    const file = dokFileRef.current?.files?.[0]
    if (!file || !selectedEinheit) { toast.error('Datei auswählen'); return }
    setDokUploading(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      await dokumenteApi.upload(fd, { einheitId: selectedEinheit.id, dokumentKategorie: dokKategorie })
      qc.invalidateQueries({ queryKey: ['dokumente', selectedEinheit.id] })
      toast.success('Dokument hochgeladen')
      if (dokFileRef.current) dokFileRef.current.value = ''
    } catch (err: any) { toast.error(err?.response?.data?.error?.message ?? 'Upload fehlgeschlagen') }
    finally { setDokUploading(false) }
  }

  // ── Helpers ───────────────────────────────────────────────────
  function openCreateEinheit() { setEditingEinheit(null); setEinheitForm(defaultEinheitForm); setEinheitOpen(true) }
  function openEditEinheit(e: Einheit) {
    setEditingEinheit(e)
    const fl = e.wohnflaecheM2 ?? e.nutzflaecheM2
    setEinheitForm({ bezeichnung: e.bezeichnung, einheitenTyp: e.einheitenTyp, objektId: e.objekt?.id ?? '', flaecheM2: fl ? String(fl) : '', etage: e.etage ?? '' })
    setEinheitOpen(true)
  }

  const einheiten: Einheit[] = data?.data?.data ?? []
  const objekte               = objData?.data?.data ?? []
  const mieter                = miData?.data?.data  ?? []
  const vertraege: Vertrag[]  = vertragData?.data?.data ?? []
  const zaehler:  Zaehler[]  = zaehlerData?.data?.data ?? []
  const dokumente: Dokument[] = dokData?.data?.data   ?? []
  const aktiverVertrag = vertraege.find(v => !v.vertragsende || new Date(v.vertragsende) >= new Date())

  // ── Render ────────────────────────────────────────────────────
  return (
    <>
      <PageHeader title="Einheiten" description="Alle Miet- und Nutzeinheiten" />

      {/* Filter + Add */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <Button variant="ghost" size="sm" onClick={() => setFilterObjektId('')} className={!filterObjektId ? 'bg-blue-50 text-blue-700' : ''}>Alle</Button>
        {objekte.map((o: any) => (
          <Button key={o.id} variant="ghost" size="sm" onClick={() => setFilterObjektId(o.id)}
            className={filterObjektId === o.id ? 'bg-blue-50 text-blue-700' : ''}>
            {o.bezeichnung}
          </Button>
        ))}
        <Button size="sm" className="ml-auto" onClick={openCreateEinheit}><Plus className="h-4 w-4 mr-1" />Neue Einheit</Button>
      </div>

      {/* Einheiten-Karten */}
      {isLoading
        ? <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
        : einheiten.length === 0
          ? <p className="text-slate-500 text-sm mt-8 text-center">Keine Einheiten vorhanden. Lege eine an!</p>
          : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {einheiten.map((e: Einheit) => {
                const typ  = TYPEN[e.einheitenTyp] ?? TYPEN.sonstiges
                const Icon = TYP_ICON[e.einheitenTyp] ?? Layers
                const fl   = e.wohnflaecheM2 ?? e.nutzflaecheM2
                return (
                  <Card key={e.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => { setSelectedEinheit(e); setSheetTab('mieter') }}>
                    <CardContent className="p-4 flex gap-3">
                      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                        <Icon className="h-5 w-5 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-sm truncate">{e.bezeichnung}</span>
                          <Badge variant={typ.badge} className="text-xs shrink-0">{typ.label}</Badge>
                        </div>
                        {e.objekt && <p className="text-xs text-slate-500 truncate">{e.objekt.bezeichnung}</p>}
                        <div className="flex gap-3 mt-1 text-xs text-slate-400">
                          {fl && <span>{typ.flaecheLabel}: {fl} m²</span>}
                          {e.etage && <span>Etage: {e.etage}</span>}
                        </div>
                        {!e.aktiv && <Badge variant="outline" className="text-xs mt-1 text-red-500 border-red-200">Inaktiv</Badge>}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )
      }

      {/* ── Detail-Sheet ─────────────────────────────────────────── */}
      <Sheet open={!!selectedEinheit} onOpenChange={(o) => !o && setSelectedEinheit(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selectedEinheit && (
            <>
              <SheetHeader className="mb-4">
                <div className="flex items-center justify-between">
                  <SheetTitle className="text-lg">{selectedEinheit.bezeichnung}</SheetTitle>
                  <Button size="sm" variant="outline" onClick={() => openEditEinheit(selectedEinheit)}>
                    <Pencil className="h-3 w-3 mr-1" />Bearbeiten
                  </Button>
                </div>
                {selectedEinheit.objekt && <p className="text-sm text-slate-500">{selectedEinheit.objekt.bezeichnung}</p>}
              </SheetHeader>

              <Tabs value={sheetTab} onValueChange={setSheetTab}>
                <TabsList className="w-full mb-4 grid grid-cols-4">
                  <TabsTrigger value="mieter"><Users className="h-3 w-3 mr-1" />Mieter</TabsTrigger>
                  <TabsTrigger value="zaehler"><Zap className="h-3 w-3 mr-1" />Zähler</TabsTrigger>
                  <TabsTrigger value="dokumente"><FolderOpen className="h-3 w-3 mr-1" />Dokumente</TabsTrigger>
                  <TabsTrigger value="info"><FileText className="h-3 w-3 mr-1" />Info</TabsTrigger>
                </TabsList>

                {/* ── TAB: Mieter & Verträge ─────────────────────── */}
                <TabsContent value="mieter">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-medium text-slate-700">Mietverträge</p>
                    <div className="flex gap-2">
                      <input
                        ref={autoFileRef}
                        type="file"
                        accept="application/pdf,image/png,image/jpeg"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (f) handleAutoUpload(f)
                        }}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={autoUploading}
                        onClick={() => autoFileRef.current?.click()}
                        title="PDF/Bild hochladen — Mieter & Vertrag werden per KI automatisch erstellt"
                      >
                        {autoUploading
                          ? <><Sparkles className="h-3 w-3 mr-1 animate-pulse" />Erkenne…</>
                          : <><Upload className="h-3 w-3 mr-1" />Vertrag hochladen</>}
                      </Button>
                      <Button size="sm" onClick={() => { setMieterForm(defaultMieterForm); setVertragForm(defaultVertragForm); setMieterMode('new'); setOcrDone(false); setVertragOpen(true) }}>
                        <Plus className="h-3 w-3 mr-1" />Mieter & Vertrag
                      </Button>
                    </div>
                  </div>
                  {autoUploading && (
                    <div className="mb-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 flex items-center gap-2">
                      <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                      KI liest den Vertrag aus, legt Mieter an und verknüpft ihn mit dieser Einheit…
                    </div>
                  )}
                  {vertraege.length === 0
                    ? <p className="text-sm text-slate-400 text-center py-6">Keine Mietverträge vorhanden</p>
                    : vertraege.map((v) => {
                        const mieterListe = v.mietvertragMieter?.map(mm => mieterName(mm.mieter)).join(', ') ?? '—'
                        const aktiv = !v.vertragsende || new Date(v.vertragsende) >= new Date()
                        return (
                          <div key={v.id} className={`rounded-lg border p-3 mb-2 ${aktiv ? 'border-green-200 bg-green-50' : 'border-slate-200 bg-slate-50'}`}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium text-sm">{mieterListe}</span>
                              {aktiv ? <Badge className="text-xs bg-green-100 text-green-800 border-green-200">Aktiv</Badge>
                                     : <Badge variant="secondary" className="text-xs">Beendet</Badge>}
                            </div>
                            <div className="text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5">
                              <span><CalendarDays className="h-3 w-3 inline mr-0.5" />{datum(v.vertragsbeginn)}{v.vertragsende ? ` – ${datum(v.vertragsende)}` : ' (unbefristet)'}</span>
                              <span>Netto: {euro(v.nettomiete)}</span>
                              <span>NK: {euro(v.nkVorauszahlung)}</span>
                              {v.mietflaecheM2 && <span>Fläche: {v.mietflaecheM2} m²</span>}
                            </div>
                          </div>
                        )
                      })
                  }
                </TabsContent>

                {/* ── TAB: Zähler ───────────────────────────────────── */}
                <TabsContent value="zaehler">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-medium text-slate-700">Stromzähler & Verbrauch</p>
                    <Button size="sm" onClick={() => { setEditingZaehler(null); setZaehlerForm(defaultZaehlerForm); setZaehlerOpen(true) }}>
                      <Plus className="h-3 w-3 mr-1" />Zähler anlegen
                    </Button>
                  </div>
                  {zaehler.length === 0
                    ? <p className="text-sm text-slate-400 text-center py-6">Keine Zähler erfasst</p>
                    : zaehler.map((z) => {
                        const typ  = VERBRAUCHSTYPEN[z.verbrauchstyp] ?? { label: z.verbrauchstyp, icon: Zap, einheit: z.einheit }
                        const Icon = typ.icon
                        const expanded = expandedZaehler === z.id
                        const letzterStand = z.staende?.[0]
                        return (
                          <div key={z.id} className="rounded-lg border border-slate-200 mb-2">
                            <div className="p-3 flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-yellow-50 flex items-center justify-center flex-shrink-0">
                                <Icon className="h-4 w-4 text-yellow-600" />
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
                                    {letzterStand.verbrauch != null && <span className="ml-1 text-blue-600">Δ {Number(letzterStand.verbrauch).toFixed(1)} {z.einheit}</span>}
                                  </p>
                                )}
                              </div>
                              <div className="flex gap-1 flex-shrink-0">
                                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setStandZaehlerId(z.id); setStandForm(defaultStandForm); setStandOpen(true) }}>
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

                {/* ── TAB: Dokumente ────────────────────────────────── */}
                <TabsContent value="dokumente">
                  <DocumentSection scope="einheit" entityId={selectedEinheit.id} />
                </TabsContent>

                {/* ── TAB: Info ─────────────────────────────────────── */}
                <TabsContent value="info">
                  <div className="space-y-3 text-sm">
                    <div className="grid grid-cols-2 gap-2">
                      <div><p className="text-xs text-slate-400">Typ</p><p className="font-medium">{TYPEN[selectedEinheit.einheitenTyp]?.label ?? selectedEinheit.einheitenTyp}</p></div>
                      <div><p className="text-xs text-slate-400">Etage</p><p className="font-medium">{selectedEinheit.etage ?? '—'}</p></div>
                      {selectedEinheit.wohnflaecheM2 && <div><p className="text-xs text-slate-400">Wohnfläche</p><p className="font-medium">{selectedEinheit.wohnflaecheM2} m²</p></div>}
                      {selectedEinheit.nutzflaecheM2 && <div><p className="text-xs text-slate-400">Nutzfläche</p><p className="font-medium">{selectedEinheit.nutzflaecheM2} m²</p></div>}
                    </div>
                    {aktiverVertrag && (
                      <div className="rounded-lg bg-green-50 border border-green-200 p-3">
                        <p className="text-xs text-green-700 font-medium mb-1">Aktiver Mietvertrag</p>
                        <p className="text-sm">{aktiverVertrag.mietvertragMieter?.map(mm => mieterName(mm.mieter)).join(', ')}</p>
                        <p className="text-xs text-slate-500 mt-1">Nettomiete: {euro(aktiverVertrag.nettomiete)} + NK {euro(aktiverVertrag.nkVorauszahlung)}</p>
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Einheit Dialog ───────────────────────────────────────── */}
      <Dialog open={einheitOpen} onOpenChange={setEinheitOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingEinheit ? 'Einheit bearbeiten' : 'Neue Einheit anlegen'}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label className="text-xs">Objekt</Label>
              <Select value={einheitForm.objektId} onValueChange={v => setEinheitForm(f => ({ ...f, objektId: v ?? f.objektId }))}>
                <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Objekt wählen" /></SelectTrigger>
                <SelectContent>{objekte.map((o: any) => <SelectItem key={o.id} value={o.id}>{o.bezeichnung}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Bezeichnung</Label>
              <Input className="h-9 mt-1" value={einheitForm.bezeichnung} onChange={e => setEinheitForm(f => ({ ...f, bezeichnung: e.target.value }))} placeholder="z.B. Wohnung EG links" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Typ</Label>
                <Select value={einheitForm.einheitenTyp} onValueChange={v => setEinheitForm(f => ({ ...f, einheitenTyp: v ?? f.einheitenTyp }))}>
                  <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(TYPEN).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Etage</Label>
                <Input className="h-9 mt-1" value={einheitForm.etage} onChange={e => setEinheitForm(f => ({ ...f, etage: e.target.value }))} placeholder="EG / 1. OG ..." />
              </div>
            </div>
            <div>
              <Label className="text-xs">{TYPEN[einheitForm.einheitenTyp]?.flaecheLabel ?? 'Fläche m²'}</Label>
              <Input className="h-9 mt-1" type="number" value={einheitForm.flaecheM2} onChange={e => setEinheitForm(f => ({ ...f, flaecheM2: e.target.value }))} placeholder="z.B. 68.5" />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setEinheitOpen(false)}>Abbrechen</Button>
            <Button onClick={() => einheitMut.mutate(einheitForm)} disabled={einheitMut.isPending || !einheitForm.bezeichnung || !einheitForm.objektId}>
              {einheitMut.isPending ? 'Speichern...' : 'Speichern'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Mieter & Vertrag Dialog ──────────────────────────────── */}
      <Dialog open={vertragOpen} onOpenChange={setVertragOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Mieter & Mietvertrag anlegen – {selectedEinheit?.bezeichnung}</DialogTitle></DialogHeader>

          {/* OCR Upload */}
          <div className="rounded-lg border border-dashed border-blue-200 bg-blue-50 p-3 mb-4">
            <p className="text-sm font-medium text-blue-800 mb-2 flex items-center gap-1"><Sparkles className="h-4 w-4" />KI-Extraktion aus Mietvertrag</p>
            <div className="flex gap-2 items-center flex-wrap">
              <input ref={ocrFileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="text-xs text-slate-600 flex-1 file:mr-2 file:py-1 file:px-3 file:rounded file:text-xs file:border-0 file:bg-white file:text-blue-700" />
              <Button size="sm" variant="outline" onClick={handleOcr} disabled={ocrLoading} className="shrink-0">
                {ocrLoading ? 'Analysiere...' : 'Analysieren'}
              </Button>
            </div>
            {ocrDone && <p className="text-xs text-green-700 mt-1 flex items-center gap-1">✓ Felder wurden automatisch ausgefüllt – bitte prüfen</p>}
          </div>

          {/* Mieter */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-3">
              <p className="text-sm font-semibold">Mieter</p>
              <div className="flex gap-1">
                <Button size="sm" variant={mieterMode === 'new' ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => setMieterMode('new')}>Neu anlegen</Button>
                <Button size="sm" variant={mieterMode === 'existing' ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => setMieterMode('existing')}>Bestehend</Button>
              </div>
            </div>
            {mieterMode === 'existing' ? (
              <Select value={existingMieterId} onValueChange={v => v && setExistingMieterId(v)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Mieter wählen" /></SelectTrigger>
                <SelectContent>{mieter.map((m: any) => <SelectItem key={m.id} value={m.id}>{mieterName(m)}</SelectItem>)}</SelectContent>
              </Select>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {([['vorname','Vorname'],['nachname','Nachname'],['email','E-Mail'],['telefon','Telefon'],['strasse','Straße'],['hausnummer','Hausnummer'],['plz','PLZ'],['stadt','Stadt'],['iban','IBAN']] as [keyof typeof defaultMieterForm, string][]).map(([k, l]) => (
                  <div key={k} className={k === 'iban' ? 'col-span-2' : ''}>
                    <Label className="text-xs">{l}</Label>
                    <Input className="h-8 mt-1 text-sm" value={mieterForm[k]} onChange={e => setMieterForm(f => ({ ...f, [k]: e.target.value }))} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Mietvertrag */}
          <div>
            <p className="text-sm font-semibold mb-3">Mietvertrag</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <Label className="text-xs">Mietart</Label>
                <Select value={vertragForm.mietart} onValueChange={v => setVertragForm(f => ({ ...f, mietart: v ?? f.mietart }))}>
                  <SelectTrigger className="h-8 mt-1 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="wohnraum">Wohnraum</SelectItem><SelectItem value="gewerbe">Gewerbe</SelectItem></SelectContent>
                </Select>
              </div>
              {([['vertragsbeginn','Vertragsbeginn','date'],['vertragsende','Vertragsende (leer = unbefristet)','date'],['nettomiete','Nettomiete €','number'],['nkVorauszahlung','NK-Vorauszahlung €','number'],['kaution','Kaution €','number'],['mietflaecheM2','Mietfläche m² (bei Teilfläche)','number']] as [keyof typeof defaultVertragForm, string, string][]).map(([k, l, t]) => (
                <div key={k} className={['vertragsende','mietflaecheM2'].includes(k) ? '' : ''}>
                  <Label className="text-xs">{l}</Label>
                  <Input className="h-8 mt-1 text-sm" type={t} value={vertragForm[k]} onChange={e => setVertragForm(f => ({ ...f, [k]: e.target.value }))} />
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setVertragOpen(false)}>Abbrechen</Button>
            <Button onClick={() => vertragMut.mutate()} disabled={vertragMut.isPending || !vertragForm.vertragsbeginn}>
              {vertragMut.isPending ? 'Speichern...' : 'Anlegen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Zähler Dialog ────────────────────────────────────────── */}
      <Dialog open={zaehlerOpen} onOpenChange={setZaehlerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingZaehler ? 'Zähler bearbeiten' : 'Neuen Zähler anlegen'}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label className="text-xs">Bezeichnung</Label>
              <Input className="h-9 mt-1" value={zaehlerForm.bezeichnung} onChange={e => setZaehlerForm(f => ({ ...f, bezeichnung: e.target.value }))} placeholder="z.B. Stromzähler EG links" />
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
              <Input className="h-9 mt-1" value={zaehlerForm.zaehlernummer} onChange={e => setZaehlerForm(f => ({ ...f, zaehlernummer: e.target.value }))} placeholder="z.B. 12345678" />
            </div>
            <div>
              <Label className="text-xs">Notizen</Label>
              <Input className="h-9 mt-1" value={zaehlerForm.notizen} onChange={e => setZaehlerForm(f => ({ ...f, notizen: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setZaehlerOpen(false)}>Abbrechen</Button>
            <Button onClick={() => zaehlerMut.mutate(zaehlerForm)} disabled={zaehlerMut.isPending || !zaehlerForm.bezeichnung}>
              {zaehlerMut.isPending ? 'Speichern...' : 'Speichern'}
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
    </>
  )
}
