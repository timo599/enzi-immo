'use client'

import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { Printer, Download, Check, X } from 'lucide-react'
import { euro } from '@/lib/format'

// ── Typen ──────────────────────────────────────────────────────────────────────
interface Einheit {
  einheitId: string; bezeichnung: string; typ: string; etage: string | null
  m2: number | null; mietvertragId: string | null
  vertragsbeginn: string; vertragsende: string; laufzeitBis: string
  mieter: string; mieterId: string | null; mietart: string
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

// ── Helpers ────────────────────────────────────────────────────────────────────
const fetchMieterliste = () =>
  api.get<{ data: Firma[] }>('/exporte/mieterliste/view').then(r => r.data.data)

function datFmt(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** MwSt-Satz: 20% für Gewerbe, 0% für Wohnraum */
function mwstSatz(mietart: string) {
  return mietart === 'gewerbe' ? 0.20 : 0
}

// ── Inline-Edit-Zelle ──────────────────────────────────────────────────────────
function EditableCell({
  value, onSave, align = 'left', className = '',
}: { value: string; onSave: (v: string) => void; align?: 'left' | 'right'; className?: string }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState(value)
  const ref = useRef<HTMLInputElement>(null)

  if (editing) {
    return (
      <div className="flex items-center gap-0.5 min-w-[80px]">
        <input
          ref={ref}
          className="border border-primary rounded px-1 py-0.5 text-xs w-full focus:outline-none"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter')  { onSave(draft); setEditing(false) }
            if (e.key === 'Escape') { setDraft(value); setEditing(false) }
          }}
          autoFocus
        />
        <button onClick={() => { onSave(draft); setEditing(false) }} className="text-green-600 hover:text-green-700 shrink-0"><Check className="h-3 w-3" /></button>
        <button onClick={() => { setDraft(value); setEditing(false) }} className="text-slate-400 shrink-0"><X className="h-3 w-3" /></button>
      </div>
    )
  }

  return (
    <div
      className={`group cursor-pointer flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''} ${className}`}
      onClick={() => { setDraft(value); setEditing(true) }}
    >
      <span className="text-xs truncate group-hover:text-primary transition-colors">
        {value || <span className="text-muted-foreground italic opacity-50">—</span>}
      </span>
      <span className="opacity-0 group-hover:opacity-40 text-slate-400 text-[9px] shrink-0">✎</span>
    </div>
  )
}

// ── Spalten-Definition ─────────────────────────────────────────────────────────
// Excel-Layout: Etage | Mieter | Fläche qm | Beginn | LZ | Miete/qm | Miete | NK | MwSt | Gesamt
const COL_HEADERS = [
  { key: 'etage',    label: 'Etage',       right: false },
  { key: 'mieter',   label: 'Mieter',      right: false },
  { key: 'm2',       label: 'Fläche qm',   right: true  },
  { key: 'beginn',   label: 'Beginn',      right: false },
  { key: 'lz',       label: 'LZ',          right: false },
  { key: 'mietepm2', label: 'Miete/qm',    right: true  },
  { key: 'miete',    label: 'Miete',       right: true  },
  { key: 'nk',       label: 'NK',          right: true  },
  { key: 'mwst',     label: 'MwSt',        right: true  },
  { key: 'gesamt',   label: 'Gesamt',      right: true  },
  { key: 'notizen',  label: 'Notizen',     right: false },
]
const COLS_TEMPLATE = '1fr 1.6fr 70px 90px 88px 76px 90px 80px 76px 96px 1fr'

// ── Tabelle pro Firma ──────────────────────────────────────────────────────────
function FirmaTabelle({ firma, onNotizenSave }: { firma: Firma; onNotizenSave: (mvId: string, v: string) => void }) {
  // Firma-Summen incl. MwSt berechnen
  let firmaMwst = 0
  let firmaGesamt = 0
  firma.objekte.forEach(obj => {
    obj.einheiten.forEach(e => {
      const satz   = mwstSatz(e.mietart)
      const mwst   = (e.kaltmiete + e.nkVorauszahlung) * satz
      firmaMwst   += mwst
      firmaGesamt += e.kaltmiete + e.nkVorauszahlung + mwst
    })
  })

  return (
    <div className="mieterliste-table">
      {firma.objekte.map((objekt, oi) => {
        let objMwst = 0
        let objGesamt = 0
        objekt.einheiten.forEach(e => {
          const satz  = mwstSatz(e.mietart)
          const mwst  = (e.kaltmiete + e.nkVorauszahlung) * satz
          objMwst   += mwst
          objGesamt += e.kaltmiete + e.nkVorauszahlung + mwst
        })

        return (
          <div key={objekt.objektId} className={`mb-6 ${oi > 0 ? 'mt-8' : ''}`}>
            {/* Objekt-Header */}
            <div className="objekt-header flex items-baseline gap-3 mb-0 py-1.5 px-2 bg-blue-700 text-white rounded-t print:rounded-none">
              <span className="font-semibold text-sm">{objekt.bezeichnung}</span>
              <span className="text-blue-200 text-xs">{objekt.adresse}</span>
            </div>

            {/* Spalten-Header */}
            <div
              className="col-headers grid text-[10px] font-semibold uppercase text-slate-500 bg-blue-50 border-b border-blue-200 px-1"
              style={{ gridTemplateColumns: COLS_TEMPLATE }}
            >
              {COL_HEADERS.map(h => (
                <div key={h.key} className={`py-1.5 px-1 ${h.right ? 'text-right' : ''}`}>{h.label}</div>
              ))}
            </div>

            {/* Einheiten-Zeilen */}
            {objekt.einheiten.map((e, idx) => {
              const satz   = mwstSatz(e.mietart)
              const mwst   = (e.kaltmiete + e.nkVorauszahlung) * satz
              const gesamt = e.kaltmiete + e.nkVorauszahlung + mwst

              return (
                <div
                  key={e.einheitId}
                  className={`einheit-row grid text-xs border-b border-slate-100 px-1 items-center
                    ${e.istLeer ? 'bg-slate-50 text-slate-400' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}
                    hover:bg-blue-50/30 transition-colors`}
                  style={{ gridTemplateColumns: COLS_TEMPLATE }}
                >
                  <div className="py-1.5 px-1 font-medium truncate text-xs">{e.bezeichnung}</div>
                  <div className="py-1.5 px-1 truncate">
                    <EditableCell
                      value={e.mieter === '—' ? '' : e.mieter}
                      onSave={() => toast.info('Mieter-Änderung: bald verfügbar')}
                    />
                  </div>
                  <div className="py-1.5 px-1 text-right">{e.m2 != null ? e.m2.toFixed(0) : '—'}</div>
                  <div className="py-1.5 px-1">{e.vertragsbeginn ? datFmt(e.vertragsbeginn) : '—'}</div>
                  <div className="py-1.5 px-1 text-xs">
                    {e.vertragsende ? datFmt(e.vertragsende) : e.mietvertragId ? 'unbefr.' : '—'}
                  </div>
                  <div className="py-1.5 px-1 text-right">
                    {e.mieteProM2 !== '—' ? `${e.mieteProM2}` : '—'}
                  </div>
                  <div className="py-1.5 px-1 text-right font-medium">
                    {e.kaltmiete > 0 ? euro(e.kaltmiete) : '—'}
                  </div>
                  <div className="py-1.5 px-1 text-right">
                    {e.nkVorauszahlung > 0 ? euro(e.nkVorauszahlung) : '—'}
                  </div>
                  <div className="py-1.5 px-1 text-right text-slate-500">
                    {mwst > 0 ? euro(mwst) : <span className="text-slate-300">0%</span>}
                  </div>
                  <div className="py-1.5 px-1 text-right font-semibold text-blue-900">
                    {gesamt > 0 ? euro(gesamt) : '—'}
                  </div>
                  <div className="py-1.5 px-1">
                    {e.mietvertragId ? (
                      <EditableCell
                        value={e.notizen}
                        onSave={v => onNotizenSave(e.mietvertragId!, v)}
                      />
                    ) : <span className="text-muted-foreground text-xs">—</span>}
                  </div>
                </div>
              )
            })}

            {/* Objekt-Summe */}
            <div
              className="grid text-xs font-semibold bg-blue-100 border-t-2 border-blue-300 px-1"
              style={{ gridTemplateColumns: COLS_TEMPLATE }}
            >
              <div className="py-1.5 px-1 text-blue-800">Σ {objekt.bezeichnung}</div>
              <div />
              <div className="py-1.5 px-1 text-right text-blue-700">
                {objekt.sumFlaeche > 0 ? `${objekt.sumFlaeche.toFixed(0)}` : ''}
              </div>
              <div /><div /><div />
              <div className="py-1.5 px-1 text-right text-blue-800">{euro(objekt.sumKalt)}</div>
              <div className="py-1.5 px-1 text-right text-blue-700">{euro(objekt.sumNk)}</div>
              <div className="py-1.5 px-1 text-right text-blue-600">{objMwst > 0 ? euro(objMwst) : '—'}</div>
              <div className="py-1.5 px-1 text-right text-blue-900 font-bold">{euro(objGesamt)}</div>
              <div />
            </div>
          </div>
        )
      })}

      {/* Firma-Gesamt */}
      <div
        className="grid text-sm font-bold bg-blue-700 text-white rounded-b px-1 mt-2 print:rounded-none"
        style={{ gridTemplateColumns: COLS_TEMPLATE }}
      >
        <div className="py-2 px-1">Gesamt {firma.firmaName}</div>
        <div />
        <div className="py-2 px-1 text-right">
          {firma.sumFlaeche > 0 ? `${firma.sumFlaeche.toFixed(0)}` : ''}
        </div>
        <div /><div /><div />
        <div className="py-2 px-1 text-right">{euro(firma.sumKalt)}</div>
        <div className="py-2 px-1 text-right">{euro(firma.sumNk)}</div>
        <div className="py-2 px-1 text-right">{firmaMwst > 0 ? euro(firmaMwst) : '—'}</div>
        <div className="py-2 px-1 text-right">{euro(firmaGesamt)}</div>
        <div />
      </div>

      <div className="text-right text-xs text-slate-500 mt-1 pr-2">
        p.a. Gesamt: <strong className="text-slate-700">{euro(firmaGesamt * 12)}</strong>
      </div>
    </div>
  )
}

// ── Gesamt-Übersicht ───────────────────────────────────────────────────────────
function GesamtTabelle({ firmen }: { firmen: Firma[] }) {
  const totKalt    = firmen.reduce((s, f) => s + f.sumKalt, 0)
  const totNk      = firmen.reduce((s, f) => s + f.sumNk, 0)
  const totFlaeche = firmen.reduce((s, f) => s + f.sumFlaeche, 0)

  const totMwst = firmen.reduce((s, f) =>
    s + f.objekte.reduce((s2, o) =>
      s2 + o.einheiten.reduce((s3, e) => s3 + (e.kaltmiete + e.nkVorauszahlung) * mwstSatz(e.mietart), 0), 0), 0)

  const totGesamt = totKalt + totNk + totMwst

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Gesamtfläche',    value: `${totFlaeche.toFixed(0)} m²` },
          { label: 'Kaltmiete/Mo.',   value: euro(totKalt) },
          { label: 'NK/Mo.',          value: euro(totNk) },
          { label: 'Gesamt/Mo.',      value: euro(totGesamt) },
        ].map(c => (
          <div key={c.label} className="bg-blue-50 border border-blue-100 rounded-lg p-3">
            <p className="text-xs text-slate-500">{c.label}</p>
            <p className="text-lg font-bold text-blue-900">{c.value}</p>
          </div>
        ))}
      </div>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-blue-700 text-white text-xs">
            {['Firma','Fläche qm','Miete','NK','MwSt','Gesamt/Mo.','p.a.'].map(h => (
              <th key={h} className="text-right first:text-left px-3 py-2">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {firmen.map((f, i) => {
            const mwst   = f.objekte.reduce((s, o) => s + o.einheiten.reduce((s2, e) =>
              s2 + (e.kaltmiete + e.nkVorauszahlung) * mwstSatz(e.mietart), 0), 0)
            const gesamt = f.sumKalt + f.sumNk + mwst
            return (
              <tr key={f.firmaId} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                <td className="px-3 py-2 font-medium">{f.firmaName}</td>
                <td className="px-3 py-2 text-right">{f.sumFlaeche > 0 ? f.sumFlaeche.toFixed(0) : '—'}</td>
                <td className="px-3 py-2 text-right">{euro(f.sumKalt)}</td>
                <td className="px-3 py-2 text-right">{euro(f.sumNk)}</td>
                <td className="px-3 py-2 text-right text-slate-600">{mwst > 0 ? euro(mwst) : '—'}</td>
                <td className="px-3 py-2 text-right font-semibold">{euro(gesamt)}</td>
                <td className="px-3 py-2 text-right text-slate-600">{euro(gesamt * 12)}</td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="bg-blue-700 text-white font-bold text-sm">
            <td className="px-3 py-2">Gesamt</td>
            <td className="px-3 py-2 text-right">{totFlaeche.toFixed(0)}</td>
            <td className="px-3 py-2 text-right">{euro(totKalt)}</td>
            <td className="px-3 py-2 text-right">{euro(totNk)}</td>
            <td className="px-3 py-2 text-right">{totMwst > 0 ? euro(totMwst) : '—'}</td>
            <td className="px-3 py-2 text-right">{euro(totGesamt)}</td>
            <td className="px-3 py-2 text-right">{euro(totGesamt * 12)}</td>
          </tr>
        </tfoot>
      </table>
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
    mutationFn: ({ id, notizen }: { id: string; notizen: string }) =>
      api.patch(`/exporte/mieterliste/notiz/${id}`, { notizen }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mieterliste-view'] })
      toast.success('Notiz gespeichert')
    },
    onError: () => toast.error('Fehler beim Speichern'),
  })

  const tabs = firmen ? ['Gesamt', ...firmen.map(f => f.firmaName)] : ['Gesamt']

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .mieterliste-print-area, .mieterliste-print-area * { visibility: visible; }
          .mieterliste-print-area { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          .einheit-row:nth-child(even) { background-color: #f8fafc !important; }
          .objekt-header { background-color: #1d4ed8 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div>
        <PageHeader
          title="Mieterliste"
          description="Alle Objekte nach Firmen — Mieter, Konditionen & Kennzahlen"
          action={
            <div className="flex gap-2 no-print">
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="h-4 w-4 mr-1" /> Drucken
              </Button>
              <Button variant="outline" size="sm" onClick={() => window.open('/api/v1/exporte/mieterliste', '_blank')}>
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

              <TabsContent value="Gesamt">
                <GesamtTabelle firmen={firmen} />
              </TabsContent>

              {firmen.map(firma => (
                <TabsContent key={firma.firmaId} value={firma.firmaName}>
                  <div className="overflow-x-auto">
                    <div className="min-w-[900px]">
                      <FirmaTabelle
                        firma={firma}
                        onNotizenSave={(mvId, v) => saveMut.mutate({ id: mvId, notizen: v })}
                      />
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
