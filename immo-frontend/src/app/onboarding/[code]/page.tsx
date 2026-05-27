'use client'

import { useState, useEffect } from 'react'
import { useParams }           from 'next/navigation'
import { useQuery, useMutation } from '@tanstack/react-query'
import axios from 'axios'
import {
  GraduationCap, CheckCircle2, Circle, Clock, ChevronDown, ChevronRight,
  ArrowRight, AlertTriangle, Info, RefreshCw, User, Mail, BookOpen,
  Globe, Sparkles,
} from 'lucide-react'
import { Button }   from '@/components/ui/button'
import { Input }    from '@/components/ui/input'

// ── Public API (no auth header) ───────────────────────────────

const BASE = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1'
const pubApi = axios.create({ baseURL: BASE })

// ── Types ─────────────────────────────────────────────────────

type FortschrittStatus = 'offen' | 'in_bearbeitung' | 'erledigt'

interface Schritt {
  id: string; typ: string; titel: string; inhalt?: string
  bedingungen?: { wenn: string; dann: string }[]
}

interface Modul {
  id: string; titel: string; beschreibung?: string; inhalt?: string
  schritte: Schritt[]; reihenfolge: number; pflicht: boolean
}

interface Programm {
  id: string; titel: string; beschreibung?: string; typ: string
  zugangscode: string; gueltigBis?: string
  module: Modul[]
}

// ── Progress state (client-side, per email) ───────────────────

type ProgressMap = Record<string, FortschrittStatus>

// ── Helpers ───────────────────────────────────────────────────

function statusIcon(s: FortschrittStatus) {
  if (s === 'erledigt')       return <CheckCircle2 className="w-5 h-5 text-green-500" />
  if (s === 'in_bearbeitung') return <Clock className="w-5 h-5 text-amber-500" />
  return <Circle className="w-5 h-5 text-slate-300" />
}

function progressPct(module: Modul[], progress: ProgressMap): number {
  if (!module.length) return 0
  const done = module.filter(m => progress[m.id] === 'erledigt').length
  return Math.round((done / module.length) * 100)
}

// ── Schritt Card ──────────────────────────────────────────────

function SchrittRow({ s, idx }: { s: Schritt; idx: number }) {
  const [open, setOpen] = useState(false)
  const icon = s.typ === 'info' ? <Info className="w-4 h-4 text-blue-400" />
    : s.typ === 'entscheidung' ? <AlertTriangle className="w-4 h-4 text-amber-400" />
    : <CheckCircle2 className="w-4 h-4 text-green-400" />

  return (
    <div className="border border-slate-100 rounded-lg bg-white overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
      >
        <span className="w-5 h-5 rounded-full bg-slate-100 text-xs font-bold flex items-center justify-center text-slate-400 flex-shrink-0">
          {idx + 1}
        </span>
        {icon}
        <span className="flex-1 text-sm font-medium text-slate-700">{s.titel}</span>
        {(s.inhalt || s.bedingungen?.length) ? (
          open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />
        ) : null}
      </button>
      {open && (s.inhalt || s.bedingungen?.length) && (
        <div className="px-4 pb-3 space-y-2">
          {s.inhalt && <p className="text-sm text-slate-600 leading-relaxed">{s.inhalt}</p>}
          {s.bedingungen?.map((b, bi) => (
            <div key={bi} className="flex items-start gap-1.5 bg-amber-50 border border-amber-100 rounded p-2 text-xs">
              <span className="text-amber-600 font-medium flex-shrink-0">Wenn</span>
              <span className="text-amber-800 flex-1">{b.wenn}</span>
              <ArrowRight className="w-3 h-3 text-amber-400 flex-shrink-0 mt-0.5" />
              <span className="text-amber-600 font-medium flex-shrink-0">Dann</span>
              <span className="text-amber-800 flex-1">{b.dann}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Module Card ───────────────────────────────────────────────

function ModulCard({
  modul, idx, status, onStatus,
}: {
  modul: Modul
  idx: number
  status: FortschrittStatus
  onStatus: (s: FortschrittStatus) => void
}) {
  const [open, setOpen] = useState(false)

  const nextStatus: FortschrittStatus =
    status === 'offen' ? 'in_bearbeitung' :
    status === 'in_bearbeitung' ? 'erledigt' : 'erledigt'

  const actionLabel =
    status === 'offen' ? 'Starten' :
    status === 'in_bearbeitung' ? 'Als erledigt markieren' : 'Erledigt ✓'

  const actionColor =
    status === 'erledigt' ? 'bg-green-100 text-green-700 cursor-default' :
    status === 'in_bearbeitung' ? 'bg-amber-500 hover:bg-amber-600 text-white' :
    'bg-violet-600 hover:bg-violet-700 text-white'

  return (
    <div className={`rounded-2xl border-2 overflow-hidden transition-all ${
      status === 'erledigt' ? 'border-green-200 bg-green-50/30' :
      status === 'in_bearbeitung' ? 'border-amber-200 bg-amber-50/20' :
      'border-slate-200 bg-white'
    }`}>
      {/* Header */}
      <div className="px-5 py-4 flex items-start gap-4">
        <div className="flex-shrink-0 mt-0.5">
          {statusIcon(status)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Modul {idx + 1}</span>
            {modul.pflicht && <span className="text-xs text-red-400 font-medium">Pflicht</span>}
          </div>
          <h3 className={`font-semibold text-base leading-snug ${
            status === 'erledigt' ? 'line-through text-slate-400' : 'text-slate-800'
          }`}>{modul.titel}</h3>
          {modul.beschreibung && (
            <p className="text-sm text-slate-500 mt-1">{modul.beschreibung}</p>
          )}
        </div>

        <button
          onClick={() => status !== 'erledigt' && onStatus(nextStatus)}
          className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${actionColor}`}
        >
          {actionLabel}
        </button>
      </div>

      {/* Expand */}
      {(modul.inhalt || modul.schritte?.length > 0) && (
        <>
          <button
            onClick={() => setOpen(v => !v)}
            className="w-full flex items-center gap-2 px-5 py-2.5 text-xs text-slate-500 hover:bg-slate-50 border-t transition-colors"
          >
            {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            {open ? 'Weniger anzeigen' : `Details${modul.schritte?.length ? ` · ${modul.schritte.length} Schritte` : ''}`}
          </button>

          {open && (
            <div className="px-5 pb-5 space-y-3 border-t bg-slate-50/50">
              {modul.inhalt && (
                <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap pt-4">{modul.inhalt}</p>
              )}
              {modul.schritte?.length > 0 && (
                <div className={modul.inhalt ? '' : 'pt-4'}>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Schritt für Schritt</p>
                  <div className="space-y-1.5">
                    {modul.schritte.map((s, si) => <SchrittRow key={s.id} s={s} idx={si} />)}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Identity Gate ─────────────────────────────────────────────

function IdentityGate({ onSubmit }: { onSubmit: (name: string, email: string) => void }) {
  const [name,  setName]  = useState('')
  const [email, setEmail] = useState('')

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 to-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-violet-600 flex items-center justify-center mx-auto">
            <GraduationCap className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Willkommen!</h1>
          <p className="text-sm text-slate-500">
            Bitte gib deinen Namen und deine E-Mail-Adresse ein, um fortzufahren. Dein Fortschritt wird gespeichert.
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Dein Name</label>
            <div className="relative">
              <User className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <Input className="pl-9" placeholder="Max Mustermann" value={name} onChange={e => setName(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">E-Mail-Adresse</label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <Input className="pl-9" type="email" placeholder="deine@email.de" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
          </div>
        </div>

        <Button
          className="w-full bg-violet-600 hover:bg-violet-700 text-white"
          disabled={!name.trim() || !email.includes('@')}
          onClick={() => onSubmit(name.trim(), email.trim())}
        >
          Programm starten
        </Button>

        <p className="text-center text-xs text-slate-400">
          Deine Angaben werden nur zur Fortschrittsverfolgung gespeichert.
        </p>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────

export default function OnboardingPublicPage() {
  const { code } = useParams() as { code: string }

  const [myName,    setMyName]    = useState('')
  const [myEmail,   setMyEmail]   = useState('')
  const [identified, setIdentified] = useState(false)
  const [progress,   setProgress]   = useState<ProgressMap>({})

  // Restore from sessionStorage
  useEffect(() => {
    const stored = sessionStorage.getItem(`onboarding_${code}`)
    if (stored) {
      try {
        const { name, email, progress: p } = JSON.parse(stored)
        setMyName(name); setMyEmail(email); setProgress(p ?? {}); setIdentified(true)
      } catch {}
    }
  }, [code])

  function persist(name: string, email: string, prog: ProgressMap) {
    sessionStorage.setItem(`onboarding_${code}`, JSON.stringify({ name, email, progress: prog }))
  }

  // ── Query ──
  const { data: programm, isLoading, isError, error, refetch } = useQuery<Programm>({
    queryKey: ['onboarding-public', code],
    queryFn: () => pubApi.get(`/einarbeitung/extern/${code}`).then(r => r.data),
    retry: 2,
    retryDelay: 3000,
  })

  // ── Mutation: persist fortschritt ──
  const fortschrittMut = useMutation({
    mutationFn: ({ modulId, status }: { modulId: string; status: FortschrittStatus }) =>
      pubApi.patch(`/einarbeitung/extern/${code}/module/${modulId}`, {
        status, externEmail: myEmail, externName: myName,
      }),
  })

  function handleIdentify(name: string, email: string) {
    setMyName(name); setMyEmail(email); setIdentified(true)
    persist(name, email, progress)
  }

  function handleStatus(modulId: string, status: FortschrittStatus) {
    const newProg = { ...progress, [modulId]: status }
    setProgress(newProg)
    persist(myName, myEmail, newProg)
    fortschrittMut.mutate({ modulId, status })
  }

  // ── Loading ──
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-50 to-slate-100 flex items-center justify-center">
        <div className="text-center space-y-3">
          <GraduationCap className="w-10 h-10 text-violet-400 mx-auto animate-pulse" />
          <p className="text-slate-500">Programm wird geladen…</p>
        </div>
      </div>
    )
  }

  // ── Error ──
  if (isError) {
    const is404 = (error as any)?.response?.status === 404
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-50 to-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-8 text-center space-y-4">
          <GraduationCap className="w-10 h-10 text-slate-300 mx-auto" />
          <h2 className="font-bold text-slate-800">
            {is404 ? 'Ungültiger Zugangscode' : 'Verbindungsfehler'}
          </h2>
          <p className="text-sm text-slate-500">
            {is404
              ? 'Dieses Programm wurde nicht gefunden oder ist nicht mehr aktiv.'
              : 'Das Programm konnte nicht geladen werden. Bitte versuche es erneut.'}
          </p>
          {!is404 && (
            <Button onClick={() => refetch()} variant="outline" size="sm">
              <RefreshCw className="w-4 h-4 mr-2" /> Erneut versuchen
            </Button>
          )}
        </div>
      </div>
    )
  }

  if (!programm) return null

  // ── Identity gate ──
  if (!identified) {
    return <IdentityGate onSubmit={handleIdentify} />
  }

  const pct = progressPct(programm.module, progress)
  const doneCount = programm.module.filter(m => progress[m.id] === 'erledigt').length
  const allDone = doneCount === programm.module.length && programm.module.length > 0

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-slate-50 to-white">
      {/* Top bar */}
      <div className="bg-violet-700 text-white">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <GraduationCap className="w-6 h-6 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-base leading-tight truncate">{programm.titel}</p>
            <p className="text-xs text-violet-200 mt-0.5">
              {doneCount} von {programm.module.length} Modulen abgeschlossen · {pct}%
            </p>
          </div>
          <div className="flex-shrink-0 text-right">
            <p className="text-xs text-violet-200">Eingeloggt als</p>
            <p className="text-sm font-medium">{myName}</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-violet-800">
          <div
            className="h-full bg-white/60 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Beschreibung */}
        {programm.beschreibung && (
          <div className="bg-white border border-violet-100 rounded-2xl p-5">
            <p className="text-sm text-slate-600 leading-relaxed">{programm.beschreibung}</p>
          </div>
        )}

        {/* Abgeschlossen Banner */}
        {allDone && (
          <div className="bg-green-50 border-2 border-green-300 rounded-2xl p-6 text-center space-y-2">
            <Sparkles className="w-8 h-8 text-green-500 mx-auto" />
            <h2 className="font-bold text-green-800 text-lg">Herzlichen Glückwunsch!</h2>
            <p className="text-sm text-green-700">Du hast alle Module abgeschlossen. 🎉</p>
          </div>
        )}

        {/* Module */}
        <div className="space-y-4">
          {programm.module.map((m, i) => (
            <ModulCard
              key={m.id}
              modul={m}
              idx={i}
              status={progress[m.id] ?? 'offen'}
              onStatus={s => handleStatus(m.id, s)}
            />
          ))}
        </div>

        <p className="text-center text-xs text-slate-400 pb-4">
          <Globe className="w-3.5 h-3.5 inline mr-1" />
          Fortschritt wird für {myEmail} gespeichert · Powered by BENIQUE
        </p>
      </div>
    </div>
  )
}
