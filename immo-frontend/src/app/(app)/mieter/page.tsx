'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { mieterApi, mietvertraegeApi, api } from '@/lib/api'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { Plus, User, Mail, Phone, Pencil, FileText, FolderOpen, Search, Building2, MessageSquare, Phone as PhoneIcon, Mail as MailIcon, MapPin, NotebookPen, Trash2 } from 'lucide-react'
import { DocumentSection } from '@/components/document-section'
import { euro, datum } from '@/lib/format'

interface Mieter {
  id: string; vorname?: string; nachname: string; firmenname?: string; email?: string
  telefon?: string; strasse?: string; hausnummer?: string; plz?: string; stadt?: string; iban?: string
  notizen?: string; anrede?: string
}

type KommKat = 'anruf' | 'brief' | 'email' | 'vor_ort' | 'sonstiges'

interface Kommunikation {
  id: string; datum: string; kategorie: KommKat; betreff?: string; text: string; erstelltAm: string
}

const KAT_LABEL: Record<KommKat, string> = {
  anruf: 'Anruf', brief: 'Brief', email: 'E-Mail', vor_ort: 'Vor Ort', sonstiges: 'Sonstiges',
}
const KAT_COLOR: Record<KommKat, string> = {
  anruf: 'bg-blue-100 text-blue-700', brief: 'bg-purple-100 text-purple-700',
  email: 'bg-green-100 text-green-700', vor_ort: 'bg-orange-100 text-orange-700',
  sonstiges: 'bg-slate-100 text-slate-600',
}
const KAT_ICON: Record<KommKat, React.ReactNode> = {
  anruf:    <PhoneIcon className="h-3 w-3" />,
  brief:    <NotebookPen className="h-3 w-3" />,
  email:    <MailIcon className="h-3 w-3" />,
  vor_ort:  <MapPin className="h-3 w-3" />,
  sonstiges:<MessageSquare className="h-3 w-3" />,
}

interface MietvertragMieter {
  mietvertrag: {
    id: string
    vertragsbeginn: string
    vertragsende?: string
    nettomiete: number
    nkVorauszahlung: number
    einheit: { id: string; bezeichnung: string; objekt?: { bezeichnung: string } }
  }
  rolle: string
  seit: string
  bis?: string
}

const defaultForm = {
  anrede: '', vorname: '', nachname: '', firmenname: '',
  email: '', telefon: '', iban: '',
  strasse: '', hausnummer: '', plz: '', stadt: '', notizen: '',
}

export default function MieterPage() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Mieter | null>(null)
  const [form, setForm] = useState(defaultForm)
  const [selected, setSelected] = useState<Mieter | null>(null)
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['mieter'],
    queryFn: () => mieterApi.list({ pageSize: 200 }),
  })

  // Mietverträge des ausgewählten Mieters
  const { data: vertragData } = useQuery({
    queryKey: ['mieter-vertraege', selected?.id],
    queryFn: () => mietvertraegeApi.list({ mieterId: selected!.id }),
    enabled: !!selected,
  })

  // Kommunikations-Log
  const [kommForm, setKommForm] = useState({ datum: new Date().toISOString().slice(0, 10), kategorie: 'anruf' as KommKat, betreff: '', text: '' })
  const [kommOpen, setKommOpen] = useState(false)

  const { data: kommData, refetch: refetchKomm } = useQuery({
    queryKey: ['kommunikation', selected?.id],
    queryFn: () => api.get<{ data: Kommunikation[] }>(`/kommunikation?mieterId=${selected!.id}`).then(r => r.data.data),
    enabled: !!selected,
  })

  const createKomm = useMutation({
    mutationFn: (body: typeof kommForm) =>
      api.post('/kommunikation', { ...body, mieterId: selected!.id }),
    onSuccess: () => { refetchKomm(); toast.success('Eintrag gespeichert'); setKommOpen(false); setKommForm({ datum: new Date().toISOString().slice(0, 10), kategorie: 'anruf', betreff: '', text: '' }) },
    onError: () => toast.error('Fehler beim Speichern'),
  })

  const deleteKomm = useMutation({
    mutationFn: (id: string) => api.delete(`/kommunikation/${id}`),
    onSuccess: () => { refetchKomm(); toast.success('Eintrag gelöscht') },
  })

  const saveMut = useMutation({
    mutationFn: (body: typeof defaultForm) => {
      // Leere Strings entfernen — Backend erwartet entweder Wert oder weglassen
      const cleaned: Record<string, string> = {}
      for (const [k, v] of Object.entries(body)) {
        if (v != null && String(v).trim() !== '') cleaned[k] = String(v).trim()
      }
      return editing ? mieterApi.update(editing.id, cleaned) : mieterApi.create(cleaned)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mieter'] })
      toast.success(editing ? 'Mieter aktualisiert' : 'Mieter angelegt')
      setOpen(false)
    },
    onError: () => toast.error('Fehler beim Speichern'),
  })

  function openCreate() { setEditing(null); setForm(defaultForm); setOpen(true) }
  function openEdit(m: Mieter) {
    setEditing(m)
    setForm({
      anrede: m.anrede ?? '',
      vorname: m.vorname ?? '',
      nachname: m.nachname,
      firmenname: m.firmenname ?? '',
      email: m.email ?? '',
      telefon: m.telefon ?? '',
      iban: m.iban ?? '',
      strasse: m.strasse ?? '',
      hausnummer: m.hausnummer ?? '',
      plz: m.plz ?? '',
      stadt: m.stadt ?? '',
      notizen: m.notizen ?? '',
    })
    setOpen(true)
  }
  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })) }

  const allMieter: Mieter[] = data?.data?.data ?? []
  const filtered = allMieter.filter((m) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return [m.vorname, m.nachname, m.firmenname, m.email, m.stadt]
      .filter(Boolean).some((s) => s!.toLowerCase().includes(q))
  })

  const vertraege: MietvertragMieter[] = (vertragData?.data?.data ?? [])
    .flatMap((v: any) => (v.mietvertragMieter ?? []).map((mvm: any) => ({ ...mvm, mietvertrag: v })))

  return (
    <div>
      <PageHeader
        title="Mieter"
        description="Alle Mieterpersonen und Kontaktdaten"
        action={<Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" />Neuer Mieter</Button>}
      />

      <div className="mb-4 relative max-w-md">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Suche nach Name, Stadt, E-Mail…"
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="border border-dashed rounded-lg p-8 text-center text-muted-foreground">
          {search ? 'Keine Treffer' : 'Noch keine Mieter angelegt'}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((m) => (
            <Card
              key={m.id}
              className="cursor-pointer hover:shadow-md transition"
              onClick={() => setSelected(m)}
            >
              <CardContent className="pt-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <User className="h-4 w-4 text-slate-400 shrink-0" />
                    <span className="font-medium truncate">
                      {m.firmenname || [m.vorname, m.nachname].filter(Boolean).join(' ')}
                    </span>
                  </div>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEdit(m) }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {m.email   && <p className="text-xs text-slate-400 flex items-center gap-1 mt-1 truncate"><Mail   className="h-3 w-3 shrink-0" />{m.email}</p>}
                {m.telefon && <p className="text-xs text-slate-400 flex items-center gap-1"><Phone  className="h-3 w-3 shrink-0" />{m.telefon}</p>}
                {(m.plz || m.stadt) && <p className="text-xs text-slate-400 mt-1">{[m.plz, m.stadt].filter(Boolean).join(' ')}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Detail-Sheet ────────────────────────────────────────────── */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  {selected.firmenname || [selected.vorname, selected.nachname].filter(Boolean).join(' ')}
                </SheetTitle>
              </SheetHeader>

              <Tabs defaultValue="info" className="mt-4">
                <TabsList className="w-full grid grid-cols-4">
                  <TabsTrigger value="info"><User className="h-3.5 w-3.5 mr-1" />Info</TabsTrigger>
                  <TabsTrigger value="vertraege"><FileText className="h-3.5 w-3.5 mr-1" />Verträge</TabsTrigger>
                  <TabsTrigger value="kommunikation"><MessageSquare className="h-3.5 w-3.5 mr-1" />Log</TabsTrigger>
                  <TabsTrigger value="dokumente"><FolderOpen className="h-3.5 w-3.5 mr-1" />Dok.</TabsTrigger>
                </TabsList>

                <TabsContent value="info" className="mt-4 space-y-3 text-sm">
                  <div className="grid grid-cols-2 gap-3">
                    {selected.email && <Field label="E-Mail" value={selected.email} />}
                    {selected.telefon && <Field label="Telefon" value={selected.telefon} />}
                    {selected.iban && <Field label="IBAN" value={selected.iban} mono />}
                    {selected.strasse && <Field label="Adresse" value={`${selected.strasse} ${selected.hausnummer ?? ''}, ${selected.plz ?? ''} ${selected.stadt ?? ''}`.trim()} />}
                  </div>
                  {selected.notizen && <Field label="Notizen" value={selected.notizen} />}
                  <div className="pt-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(selected)}>
                      <Pencil className="h-3.5 w-3.5 mr-1.5" />Bearbeiten
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="vertraege" className="mt-4">
                  {vertraege.length === 0 ? (
                    <div className="border border-dashed rounded-lg p-6 text-center text-sm text-muted-foreground">
                      Keine Mietverträge vorhanden
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {vertraege.map((mv) => (
                        <li key={mv.mietvertrag.id} className="border rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium text-sm">
                              {mv.mietvertrag.einheit?.objekt?.bezeichnung} · {mv.mietvertrag.einheit?.bezeichnung}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {datum(mv.mietvertrag.vertragsbeginn)}
                            {mv.mietvertrag.vertragsende ? ` – ${datum(mv.mietvertrag.vertragsende)}` : ' – läuft'}
                          </div>
                          <div className="text-xs mt-1">
                            Nettomiete: <strong>{euro(mv.mietvertrag.nettomiete)}</strong> · NK: {euro(mv.mietvertrag.nkVorauszahlung)}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </TabsContent>

                {/* ── Kommunikations-Log ───────────────────────── */}
                <TabsContent value="kommunikation" className="mt-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-medium text-slate-700">Kommunikationsverlauf</p>
                    <Button size="sm" onClick={() => setKommOpen(true)}>
                      <Plus className="h-3.5 w-3.5 mr-1" />Eintrag
                    </Button>
                  </div>

                  {!kommData || kommData.length === 0 ? (
                    <div className="border border-dashed rounded-lg p-6 text-center text-sm text-muted-foreground">
                      Noch keine Einträge. Jetzt ersten Kontakt dokumentieren.
                    </div>
                  ) : (
                    <div className="relative">
                      {/* Timeline-Linie */}
                      <div className="absolute left-4 top-0 bottom-0 w-px bg-slate-200" />
                      <div className="space-y-4 pl-10">
                        {kommData.map((k) => (
                          <div key={k.id} className="relative">
                            {/* Punkt auf der Linie */}
                            <div className={`absolute -left-6 top-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${KAT_COLOR[k.kategorie]}`}>
                              {KAT_ICON[k.kategorie]}
                            </div>
                            <div className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm hover:shadow transition-shadow group">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${KAT_COLOR[k.kategorie]}`}>
                                    {KAT_ICON[k.kategorie]}
                                    {KAT_LABEL[k.kategorie]}
                                  </span>
                                  <span className="text-xs text-slate-400">
                                    {new Date(k.datum).toLocaleDateString('de-DE')}
                                  </span>
                                  {k.betreff && <span className="text-xs font-medium text-slate-700">{k.betreff}</span>}
                                </div>
                                <button
                                  onClick={() => deleteKomm.mutate(k.id)}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 hover:text-red-500"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                              <p className="mt-1.5 text-sm text-slate-600 whitespace-pre-wrap">{k.text}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="dokumente" className="mt-4">
                  <DocumentSection scope="mieter" entityId={selected.id} />
                </TabsContent>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Kommunikation-Dialog ────────────────────────────────────── */}
      <Dialog open={kommOpen} onOpenChange={setKommOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Kommunikation dokumentieren</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Datum</Label>
                <Input type="date" value={kommForm.datum} onChange={e => setKommForm(f => ({ ...f, datum: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Art</Label>
                <Select value={kommForm.kategorie} onValueChange={v => setKommForm(f => ({ ...f, kategorie: v as KommKat }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(KAT_LABEL) as [KommKat, string][]).map(([k, l]) => (
                      <SelectItem key={k} value={k}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Betreff (optional)</Label>
              <Input value={kommForm.betreff} onChange={e => setKommForm(f => ({ ...f, betreff: e.target.value }))} placeholder="z.B. Heizungsausfall gemeldet" />
            </div>
            <div className="space-y-1">
              <Label>Notiz *</Label>
              <Textarea
                value={kommForm.text}
                onChange={e => setKommForm(f => ({ ...f, text: e.target.value }))}
                placeholder="Was wurde besprochen? Welche Vereinbarung wurde getroffen?"
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKommOpen(false)}>Abbrechen</Button>
            <Button onClick={() => createKomm.mutate(kommForm)} disabled={!kommForm.text || createKomm.isPending}>
              {createKomm.isPending ? 'Speichern…' : 'Speichern'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit-Dialog ─────────────────────────────────────────────── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? 'Mieter bearbeiten' : 'Neuer Mieter'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Anrede</Label>
              <Select value={form.anrede || undefined} onValueChange={(v) => set('anrede', v ?? '')}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="herr">Herr</SelectItem>
                  <SelectItem value="frau">Frau</SelectItem>
                  <SelectItem value="divers">Divers</SelectItem>
                  <SelectItem value="firma">Firma</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Firma (optional)</Label><Input value={form.firmenname} onChange={(e) => set('firmenname', e.target.value)} /></div>
            <div className="space-y-1"><Label>Vorname</Label><Input value={form.vorname} onChange={(e) => set('vorname', e.target.value)} /></div>
            <div className="space-y-1"><Label>Nachname *</Label><Input value={form.nachname} onChange={(e) => set('nachname', e.target.value)} required /></div>
            <div className="col-span-2 space-y-1"><Label>E-Mail</Label><Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></div>
            <div className="space-y-1"><Label>Telefon</Label><Input value={form.telefon} onChange={(e) => set('telefon', e.target.value)} /></div>
            <div className="space-y-1"><Label>IBAN</Label><Input value={form.iban} onChange={(e) => set('iban', e.target.value)} className="font-mono" /></div>
            <div className="space-y-1"><Label>Straße</Label><Input value={form.strasse} onChange={(e) => set('strasse', e.target.value)} /></div>
            <div className="space-y-1"><Label>Hausnummer</Label><Input value={form.hausnummer} onChange={(e) => set('hausnummer', e.target.value)} /></div>
            <div className="space-y-1"><Label>PLZ</Label><Input value={form.plz} onChange={(e) => set('plz', e.target.value)} /></div>
            <div className="space-y-1"><Label>Stadt</Label><Input value={form.stadt} onChange={(e) => set('stadt', e.target.value)} /></div>
            <div className="col-span-2 space-y-1"><Label>Notizen</Label><Input value={form.notizen} onChange={(e) => set('notizen', e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Abbrechen</Button>
            <Button onClick={() => saveMut.mutate(form)} disabled={saveMut.isPending}>
              {saveMut.isPending ? 'Speichern…' : 'Speichern'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-sm ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  )
}
