'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { mieterApi, mietvertraegeApi } from '@/lib/api'
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
import { toast } from 'sonner'
import { Plus, User, Mail, Phone, Pencil, FileText, FolderOpen, Search, Building2 } from 'lucide-react'
import { DocumentSection } from '@/components/document-section'
import { euro, datum } from '@/lib/format'

interface Mieter {
  id: string; vorname?: string; nachname: string; firmenname?: string; email?: string
  telefon?: string; strasse?: string; hausnummer?: string; plz?: string; stadt?: string; iban?: string
  notizen?: string; anrede?: string
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
    queryFn: () => mieterApi.list(),
  })

  // Mietverträge des ausgewählten Mieters
  const { data: vertragData } = useQuery({
    queryKey: ['mieter-vertraege', selected?.id],
    queryFn: () => mietvertraegeApi.list({ mieterId: selected!.id }),
    enabled: !!selected,
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
                <TabsList className="w-full grid grid-cols-3">
                  <TabsTrigger value="info"><User className="h-3.5 w-3.5 mr-1.5" />Stammdaten</TabsTrigger>
                  <TabsTrigger value="vertraege"><FileText className="h-3.5 w-3.5 mr-1.5" />Verträge</TabsTrigger>
                  <TabsTrigger value="dokumente"><FolderOpen className="h-3.5 w-3.5 mr-1.5" />Dokumente</TabsTrigger>
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

                <TabsContent value="dokumente" className="mt-4">
                  <DocumentSection scope="mieter" entityId={selected.id} />
                </TabsContent>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>

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
