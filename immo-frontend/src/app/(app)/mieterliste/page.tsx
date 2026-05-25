'use client'

import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { Printer, Download, Pencil, Check, X } from 'lucide-react'
import { euro } from '@/lib/format'

// ── Typen ──────────────────────────────────────────────────────────────────────
interface Einheit {
  einheitId: string; bezeichnung: string; typ: string; etage: string | null
  m2: number | null; mietvertragId: string | null
  vertragsbeginn: string; vertragsende: string; laufzeitBis: string
  mieter: string; mieterId: string | null
  kaltmiete: number; nkVorauszahlung: number; warmmiete: number
  mieteProM2: string; letzteErhoehung: string; erhoehungsTyp: string
  notizen: string; istLeer: boolean
}
interface Objekt {
  objektId: string; bezeichnung: string; adresse: string
  einheiten: Einheit[]
  sumFlaeche: number; sumKalt: number; sumNk: number; sumWarm: number
}
interface Firma {
  firmaId: string; firmaName: string
  objekte: Objekt[]
  sumFlaeche: number; sumKalt: number; sumNk: number; sumWarm: number
}

// ── API ────────────────────────────────────────────────────────────────────────
const fetchMieterliste = () =>
  api.get<{ data: Firma[] }>('/exporte/mieterliste/view').then(r => r.data.data)

const patchNotiz = ({ id, notizen }: { id: string; notizen: string }) =>
  api.patch(`/exporte/mieterliste/notiz/${id}`, { notizen })

// ── Formatierung ───────────────────────────────────────────────────────────────
function datFmt(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ── Inline-Notiz-Editor ────────────────────────────────────────────────────────
function NotizenCell({ mvId, value, onSave }: { mvId: string | null; value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState(value)
  const ref = useRef<HTMLInputElement>(null)

  if (!mvId) return <span className="text-muted-foreground text-xs">—</span>

  if (editing) {
    return (
      <div className="flex items-center gap-1 min-w-[120px]">
        <input
          ref={ref}
          className="border rounded px-1.5 py-0.5 text-xs w-full focus:outline-none focus:ring-1 focus:ring-primary"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { onSave(draft); setEditing(false) }
            if (e.key === 'Escape') { setDraft(value); setEditing(false) }
          }}
          autoFocus
        />
        <button onClick={() => { onSave(draft); setEditing(false) }} className="text-green-600 hover:text-green-700"><Check className="h-3.5 w-3.5" /></button>
        <button onClick={() => { setDraft(value); setEditing(false) }} className="text-slate-400 hover:text-slate-600"><X className="h-3.5 w-3.5" /></button>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1 group cursor-pointer" onClick={() => { setDraft(value); setEditing(true) }}>
      <span className="text-xs text-slate-600 truncate max-w-[140px]">{value || <span className="text-muted-foreground italic">Notiz…</span>}</span>
      <Pencil className="h-3 w-3 text-slate-300 group-hover:text-slate-500 shrink-0 opacity-0 group-hover:opacity-100" />
    </div>
  )
}

// ── Haupt-Tabelle pro Firma ────────────────────────────────────────────────────
function FirmaTabelle({ firma, onNotizenSave }: { firma: Firma; onNotizenSave: (mvId: string, v: string) => void }) {
  return (
    <div className="mieterliste-table">
      {firma.objekte.map((objekt, oi) => (
        <div key={objekt.objektId} className={`mb-6 ${oi > 0 ? 'mt-8' : ''}`}>
          {/* Objekt-Header */}
          <div className="objekt-header flex items-baseline gap-3 mb-1 py-1.5 px-2 bg-blue-700 text-white rounded-t print:rounded-none">
            <span className="font-semibold text-sm">{objekt.bezeichnung}</span>
            <span className="text-blue-200 text-xs">{objekt.adresse}</span>
          </div>

          {/* Spalten-Header */}
          <div className="col-headers grid text-[10px] font-semibold uppercase text-slate-500 bg-blue-50 border-b border-blue-200 px-1"
               style={{ gridTemplateColumns: COLS_TEMPLATE }}>
            {COL_HEADERS.map(h => (
              <div key={h.key} className={`py-1.5 px-1 ${h.right ? 'text-right' : ''}`}>{h.label}</div>
            ))}
          </div>

          {/* Einheiten-Zeilen */}
          {objekt.einheiten.map((e, idx) => (
            <div
              key={e.einheitId}
              className={`einheit-row grid text-xs border-b border-slate-100 px-1 items-center
                ${e.istLeer ? 'bg-slate-50 text-slate-400' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}
                hover:bg-blue-50/40 transition-colors`}
              style={{ gridTemplateColumns: COLS_TEMPLATE }}
            >
              <div className="py-1.5 px-1 font-medium truncate">{e.bezeichnung}</div>
              <div className="py-1.5 px-1 truncate">{e.mieter}</div>
              <div className="py-1.5 px-1 text-right">{e.m2 ?? '—'}</div>
              <div className="py-1.5 px-1 text-right">{e.mieteProM2 !== '—' ? `${e.mieteProM2} €` : '—'}</div>
              <div className="py-1.5 px-1">{e.vertragsbeginn ? datFmt(e.vertragsbeginn) : '—'}</div>
              <div className="py-1.5 px-1">{e.laufzeitBis}</div>
              <div className="py-1.5 px-1">{e.letzteErhoehung}</div>
              <div className="py-1.5 px-1">
                {e.erhoehungsTyp !== '—' ? (
                  <Badge variant="outline" className="text-[9px] px-1 py-0">{e.erhoehungsTyp}</Badge>
                ) : '—'}
              </div>
              <div className="py-1.5 px-1 text-right font-medium">{e.kaltmiete > 0 ? euro(e.kaltmiete) : '—'}</div>
              <div className="py-1.5 px-1 text-right">{e.nkVorauszahlung > 0 ? euro(e.nkVorauszahlung) : '—'}</div>
              <div className="py-1.5 px-1 text-right font-semibold">{e.warmmiete > 0 ? euro(e.warmmiete) : '—'}</div>
              <div className="py-1.5 px-1">
                <NotizenCell mvId={e.mietvertragId} value={e.notizen} onSave={v => onNotizenSave(e.mietvertragId!, v)} />
              </div>
            </div>
          ))}

          {/* Objekt-Summe */}
          <div className="grid text-xs font-semibold bg-blue-100 border-t-2 border-blue-300 px-1"
               style={{ gridTemplateColumns: COLS_TEMPLATE }}>
            <div className="py-1.5 px-1 text-blue-800">Σ {objekt.bezeichnung}</div>
            <div />
            <div className="py-1.5 px-1 text-right text-blue-700">{objekt.sumFlaeche > 0 ? `${objekt.sumFlaeche.toFixed(0)} m²` : ''}</div>
            <div /><div /><div /><div /><div />
            <div className="py-1.5 px-1 text-right text-blue-800">{euro(objekt.sumKalt)}</div>
            <div className="py-1.5 px-1 text-right text-blue-700">{euro(objekt.sumNk)}</div>
            <div className="py-1.5 px-1 text-right text-blue-900">{euro(objekt.sumWarm)}</div>
            <div />
          </div>
        </div>
      ))}

      {/* Firma-Gesamt */}
      <div className="grid text-sm font-bold bg-blue-700 text-white rounded-b px-1 mt-2 print:rounded-none"
           style={{ gridTemplateColumns: COLS_TEMPLATE }}>
        <div className="py-2 px-1">Gesamt {firma.firmaName}</div>
        <div />
        <div className="py-2 px-1 text-right">{firma.sumFlaeche > 0 ? `${firma.sumFlaeche.toFixed(0)} m²` : ''}</div>
        <div /><div /><div /><div /><div />
        <div className="py-2 px-1 text-right">{euro(firma.sumKalt)}</div>
        <div className="py-2 px-1 text-right">{euro(firma.sumNk)}</div>
        <div className="py-2 px-1 text-right">{euro(firma.sumWarm)}</div>
        <div />
      </div>

      {/* p.a. Zeile */}
      <div className="text-right text-xs text-slate-500 mt-1 pr-2">
        p.a. Warmmiete: <strong className="text-slate-700">{euro(firma.sumWarm * 12)}</strong>
      </div>
    </div>
  )
}

// ── Spalten-Definition ─────────────────────────────────────────────────────────
const COL_HEADERS = [
  { key: 'einheit',     label: 'Einheit',        right: false },
  { key: 'mieter',      label: 'Mieter',          right: false },
  { key: 'm2',          label: 'm²',              right: true  },
  { key: 'mietepm2',    label: '€/m²',            right: true  },
  { key: 'beginn',      label: 'MV seit',         right: false },
  { key: 'laufzeit',    label: 'bis',             right: false },
  { key: 'letzteErh',   label: 'Letzte Erhöhung', right: false },
  { key: 'erhTyp',      label: 'Art',             right: false },
  { key: 'kalt',        label: 'Kaltmiete',       right: true  },
  { key: 'nk',          label: 'NK-Voraus.',      right: true  },
  { key: 'warm',        label: 'Warmmiete',       right: true  },
  { key: 'notizen',     label: 'Notizen',         right: false },
]
const COLS_TEMPLATE = '1fr 1.4fr 52px 60px 88px 88px 96px 72px 88px 80px 88px 1fr'

// ── Gesamt-Übersicht ───────────────────────────────────────────────────────────
function GesamtTabelle({ firmen }: { firmen: Firma[] }) {
  const totKalt  = firmen.reduce((s, f) => s + f.sumKalt, 0)
  const totNk    = firmen.reduce((s, f) => s + f.sumNk, 0)
  const totWarm  = firmen.reduce((s, f) => s + f.sumWarm, 0)
  const totFlaeche = firmen.reduce((s, f) => s + f.sumFlaeche, 0)

  return (
    <div className="space-y-4">
      {/* Übersichtskarte */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Gesamtfläche',   value: `${totFlaeche.toFixed(0)} m²` },
          { label: 'Kaltmiete/Mo.',  value: euro(totKalt) },
          { label: 'NK/Mo.',         value: euro(totNk) },
          { label: 'Warmmiete/Mo.',  value: euro(totWarm) },
        ].map(c => (
          <div key={c.label} className="bg-blue-50 border border-blue-100 rounded-lg p-3">
            <p className="text-xs text-slate-500">{c.label}</p>
            <p className="text-lg font-bold text-blue-900">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Pro Firma */}
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-blue-700 text-white text-xs">
            {['Firma','Fläche m²','Kaltmiete/Mo.','NK/Mo.','Warmmiete/Mo.','p.a.'].map(h => (
              <th key={h} className="text-right first:text-left px-3 py-2">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {firmen.map((f, i) => (
            <tr key={f.firmaId} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
              <td className="px-3 py-2 font-medium">{f.firmaName}</td>
              <td className="px-3 py-2 text-right">{f.sumFlaeche > 0 ? `${f.sumFlaeche.toFixed(0)}` : '—'}</td>
              <td className="px-3 py-2 text-right">{euro(f.sumKalt)}</td>
              <td className="px-3 py-2 text-right">{euro(f.sumNk)}</td>
              <td className="px-3 py-2 text-right font-semibold">{euro(f.sumWarm)}</td>
              <td className="px-3 py-2 text-right text-slate-600">{euro(f.sumWarm * 12)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-blue-700 text-white font-bold text-sm">
            <td className="px-3 py-2">Gesamt</td>
            <td className="px-3 py-2 text-right">{totFlaeche.toFixed(0)}</td>
            <td className="px-3 py-2 text-right">{euro(totKalt)}</td>
            <td className="px-3 py-2 text-right">{euro(totNk)}</td>
            <td className="px-3 py-2 text-right">{euro(totWarm)}</td>
            <td className="px-3 py-2 text-right">{euro(totWarm * 12)}</td>
          </tr>
        </tfoot>
      </table>

      {/* Alle Firmen untereinander für Druck */}
      <div className="mt-6 space-y-8 print-all-firmen hidden print:block">
        {firmen.map(f => (
          <div key={f.firmaId}>
            <h2 className="text-base font-bold text-blue-900 mb-2 border-b border-blue-300 pb-1">{f.firmaName}</h2>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Haupt-Seite ────────────────────────────────────────────────────────────────
export default function MieterlistePage() {
  const qc = useQueryClient()

  const { data: firmen, isLoading } = useQuery({
    queryKey: ['mieterliste-view'],
    queryFn:  fetchMieterliste,
    staleTime: 30_000,
  })

  const saveMut = useMutation({
    mutationFn: patchNotiz,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mieterliste-view'] })
      toast.success('Notiz gespeichert')
    },
    onError: () => toast.error('Fehler beim Speichern'),
  })

  function handleNotizSave(mvId: string, notizen: string) {
    saveMut.mutate({ id: mvId, notizen })
  }

  function handlePrint() {
    window.print()
  }

  function handleExcelDownload() {
    window.open('/api/v1/exporte/mieterliste', '_blank')
  }

  const tabs = firmen ? ['Gesamt', ...firmen.map(f => f.firmaName)] : ['Gesamt']

  return (
    <>
      {/* Print-Styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .mieterliste-print-area, .mieterliste-print-area * { visibility: visible; }
          .mieterliste-print-area { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          .mieterliste-table { page-break-inside: avoid; }
          .objekt-header { background-color: #1d4ed8 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div>
        <PageHeader
          title="Mieterliste"
          description="Alle Objekte nach Firmen — Mieter, Konditionen & Notizen"
          action={
            <div className="flex gap-2 no-print">
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-1" /> Drucken
              </Button>
              <Button variant="outline" size="sm" onClick={handleExcelDownload}>
                <Download className="h-4 w-4 mr-1" /> Excel
              </Button>
            </div>
          }
        />

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
        ) : !firmen || firmen.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            Noch keine Daten — legen Sie zuerst Objekte und Mietverträge an.
          </div>
        ) : (
          <div className="mieterliste-print-area">
            <Tabs defaultValue="Gesamt">
              <TabsList className="no-print mb-4 flex-wrap h-auto gap-1 bg-transparent p-0">
                {tabs.map(t => (
                  <TabsTrigger
                    key={t}
                    value={t}
                    className="data-[state=active]:bg-blue-700 data-[state=active]:text-white rounded-lg border border-slate-200 text-xs px-3 py-1.5"
                  >
                    {t}
                  </TabsTrigger>
                ))}
              </TabsList>

              {/* Gesamt-Tab */}
              <TabsContent value="Gesamt">
                <GesamtTabelle firmen={firmen} />
              </TabsContent>

              {/* Firma-Tabs */}
              {firmen.map(firma => (
                <TabsContent key={firma.firmaId} value={firma.firmaName}>
                  <div className="overflow-x-auto">
                    <div className="min-w-[900px]">
                      <FirmaTabelle firma={firma} onNotizenSave={handleNotizSave} />
                    </div>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </div>
        )}
      </div>
    </>
  )
}
