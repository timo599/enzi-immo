'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { use } from 'react'
import { CheckCircle2, Clock, Circle, HardHat, MapPin, Phone, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'

type TodoStatus = 'offen' | 'in_bearbeitung' | 'erledigt' | 'abgebrochen'

interface Todo {
  id: string; titel: string; beschreibung?: string; status: TodoStatus
  prioritaet: string; faelligAm?: string
  zuweisungen: { teamMitglied: { name: string } }[]
}
interface Baustelle {
  id: string; name: string; beschreibung?: string; status: string
  firma?: { name: string }
  objekt?: { bezeichnung: string; strasse: string; hausnummer: string; plz: string; stadt: string }
  zuweisungen: { teamMitglied: { name: string; rolle: string; telefon?: string }; rolle: string }[]
  todos: Todo[]
}

const PRIO_DOT: Record<string, string> = {
  niedrig: 'bg-slate-300', mittel: 'bg-blue-400', hoch: 'bg-orange-400', dringend: 'bg-red-500',
}
const PRIO_LABEL: Record<string, string> = {
  niedrig: 'Niedrig', mittel: 'Mittel', hoch: 'Hoch', dringend: 'Dringend',
}

const STATUS_NEXT: Record<string, TodoStatus> = {
  offen: 'in_bearbeitung', in_bearbeitung: 'erledigt', erledigt: 'offen',
}
const STATUS_NEXT_LABEL: Record<string, string> = {
  offen: 'Starten', in_bearbeitung: 'Abschließen', erledigt: 'Wieder öffnen',
}

function TodoCard({ todo, isOverdue, today, onStatusChange, isPending }: {
  todo: Todo
  isOverdue: boolean
  today: string
  onStatusChange: () => void
  isPending: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const nextStatus = STATUS_NEXT[todo.status]
  const nextLabel  = STATUS_NEXT_LABEL[todo.status] ?? '→'

  return (
    <div className={`bg-white rounded-2xl shadow-sm overflow-hidden border-2 transition-all ${
      todo.status === 'erledigt' ? 'border-green-200 opacity-70' :
      isOverdue ? 'border-red-300' : 'border-transparent'
    }`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Großer Status-Button */}
          <button
            disabled={isPending || todo.status === 'abgebrochen'}
            onClick={onStatusChange}
            className={`shrink-0 mt-0.5 rounded-full p-1.5 transition-all active:scale-90 ${
              todo.status === 'erledigt'       ? 'bg-green-100' :
              todo.status === 'in_bearbeitung' ? 'bg-blue-100' :
              'bg-slate-100 hover:bg-slate-200'
            }`}
          >
            {todo.status === 'erledigt'
              ? <CheckCircle2 className="h-7 w-7 text-green-500" />
              : todo.status === 'in_bearbeitung'
              ? <Clock className="h-7 w-7 text-blue-500" />
              : <Circle className="h-7 w-7 text-slate-400" />
            }
          </button>

          <div className="flex-1 min-w-0">
            {/* Prio + Titel */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`w-2 h-2 rounded-full shrink-0 ${PRIO_DOT[todo.prioritaet] ?? 'bg-slate-300'}`} />
              <p className={`font-semibold text-base leading-snug ${todo.status === 'erledigt' ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                {todo.titel}
              </p>
            </div>

            {/* Status-Badge */}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                todo.status === 'erledigt'       ? 'bg-green-100 text-green-700' :
                todo.status === 'in_bearbeitung' ? 'bg-blue-100 text-blue-700' :
                isOverdue                        ? 'bg-red-100 text-red-700' :
                'bg-slate-100 text-slate-600'
              }`}>
                {todo.status === 'erledigt'       ? '✓ Erledigt' :
                 todo.status === 'in_bearbeitung' ? '⚙ In Bearbeitung' :
                 isOverdue                        ? '⚠ Überfällig' : '○ Offen'}
              </span>
              <span className="text-xs text-slate-400">{PRIO_LABEL[todo.prioritaet]}</span>
            </div>

            {/* Meta */}
            <div className="flex flex-wrap gap-3 mt-2 text-xs text-slate-500">
              {todo.faelligAm && (
                <span className={isOverdue ? 'text-red-600 font-medium flex items-center gap-0.5' : 'flex items-center gap-0.5'}>
                  {isOverdue && <AlertCircle className="h-3 w-3" />}
                  📅 {new Date(todo.faelligAm).toLocaleDateString('de-DE')}
                </span>
              )}
              {todo.zuweisungen.map(z => (
                <span key={z.teamMitglied.name} className="flex items-center gap-0.5">
                  👤 {z.teamMitglied.name}
                </span>
              ))}
            </div>

            {/* Beschreibung – ausklappbar */}
            {todo.beschreibung && (
              <button
                onClick={() => setExpanded(v => !v)}
                className="mt-2 text-xs text-slate-500 flex items-center gap-1 hover:text-slate-700"
              >
                {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {expanded ? 'Weniger anzeigen' : 'Details anzeigen'}
              </button>
            )}
            {expanded && todo.beschreibung && (
              <p className="mt-2 text-sm text-slate-600 leading-relaxed bg-slate-50 rounded-lg p-3">
                {todo.beschreibung}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Aktions-Button */}
      {todo.status !== 'abgebrochen' && (
        <button
          disabled={isPending}
          onClick={onStatusChange}
          className={`w-full py-3 text-sm font-semibold transition-colors ${
            todo.status === 'erledigt'
              ? 'bg-slate-50 text-slate-400 hover:bg-slate-100'
              : todo.status === 'in_bearbeitung'
              ? 'bg-blue-500 text-white hover:bg-blue-600 active:bg-blue-700'
              : isOverdue
              ? 'bg-red-500 text-white hover:bg-red-600 active:bg-red-700'
              : 'bg-orange-500 text-white hover:bg-orange-600 active:bg-orange-700'
          }`}
        >
          {isPending ? '…' : nextLabel}
        </button>
      )}
    </div>
  )
}

export default function BaustellePublicPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params)
  const qc = useQueryClient()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [doneCollapsed, setDoneCollapsed] = useState(false)

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['baustelle-public', code],
    queryFn: () => api.get(`/baustellen/zugang/${code}`).then(r => r.data.data),
    retry: 2,             // bis zu 2 Wiederholungen (Render cold-start)
    retryDelay: 3000,     // 3s warten zwischen Versuchen
    refetchInterval: 30_000, // alle 30s automatisch aktualisieren
  })

  const statusMut = useMutation({
    mutationFn: ({ todoId, status }: { todoId: string; status: TodoStatus }) =>
      api.patch(`/baustellen/zugang/${code}/todo/${todoId}`, { status }),
    onMutate: ({ todoId }) => setPendingId(todoId),
    onSettled: () => setPendingId(null),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['baustelle-public', code] }),
  })

  const baustelle: Baustelle | null = data ?? null
  const today = new Date().toISOString().slice(0, 10)

  if (isLoading || isFetching && !data) return (
    <div className="min-h-screen bg-orange-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-orange-200 border-t-orange-600" />
        <p className="text-orange-600 text-sm font-medium">Lade Baustelle…</p>
        <p className="text-xs text-orange-400">Server startet ggf. erst hoch…</p>
      </div>
    </div>
  )

  if (isError || !baustelle) {
    const httpStatus = (error as any)?.response?.status
    const isNotFound = httpStatus === 404
    return (
      <div className="min-h-screen bg-orange-50 flex flex-col items-center justify-center gap-4 p-6">
        <div className="w-16 h-16 rounded-2xl bg-orange-100 flex items-center justify-center">
          <HardHat className="h-8 w-8 text-orange-400" />
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-orange-900">
            {isNotFound ? 'Ungültiger Zugangscode' : 'Verbindungsfehler'}
          </p>
          <p className="text-sm text-orange-600 mt-1">
            {isNotFound
              ? 'Dieser Zugangscode ist nicht gültig oder die Baustelle ist abgeschlossen.'
              : 'Der Server ist nicht erreichbar. Bitte kurz warten und erneut versuchen.'}
          </p>
          {!isNotFound && (
            <p className="text-xs text-orange-400 mt-1">Code: {code.toUpperCase()}</p>
          )}
        </div>
        <button
          onClick={() => refetch()}
          className="mt-2 bg-orange-600 text-white text-sm font-semibold px-6 py-3 rounded-xl hover:bg-orange-700 active:scale-95 transition-all"
        >
          Erneut versuchen
        </button>
        {isNotFound && (
          <p className="text-xs text-orange-400 text-center max-w-xs">
            Tipp: Der Code muss genau so eingegeben werden wie vom Bauleiter mitgeteilt (z.B. A1B2C3).
          </p>
        )}
      </div>
    )
  }

  const offene   = baustelle.todos.filter(t => t.status !== 'erledigt' && t.status !== 'abgebrochen')
  const erledigt = baustelle.todos.filter(t => t.status === 'erledigt')
  const total    = baustelle.todos.length
  const donePct  = total === 0 ? 0 : Math.round((erledigt.length / total) * 100)

  // Sortierung: überfällig → dringend → hoch → mittel → niedrig
  const PRIO_ORD: Record<string, number> = { dringend: 0, hoch: 1, mittel: 2, niedrig: 3 }
  const sortedOffene = [...offene].sort((a, b) => {
    const aOver = a.faelligAm && a.faelligAm.slice(0, 10) < today ? 1 : 0
    const bOver = b.faelligAm && b.faelligAm.slice(0, 10) < today ? 1 : 0
    if (bOver - aOver !== 0) return bOver - aOver
    return (PRIO_ORD[a.prioritaet] ?? 2) - (PRIO_ORD[b.prioritaet] ?? 2)
  })

  return (
    <div className="min-h-screen bg-orange-50">
      {/* Header */}
      <div className="bg-gradient-to-b from-orange-700 to-orange-600 text-white px-4 pt-6 pb-8 shadow-lg">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-2 mb-2 opacity-80">
            <HardHat className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-widest">Baustelle</span>
          </div>
          <h1 className="text-2xl font-bold leading-tight">{baustelle.name}</h1>

          {baustelle.objekt && (
            <p className="text-sm opacity-90 mt-1.5 flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              {baustelle.objekt.strasse} {baustelle.objekt.hausnummer}, {baustelle.objekt.plz} {baustelle.objekt.stadt}
            </p>
          )}
          {baustelle.firma && <p className="text-xs opacity-70 mt-0.5">{baustelle.firma.name}</p>}

          {/* Fortschrittsbalken */}
          {total > 0 && (
            <div className="mt-4">
              <div className="flex justify-between text-xs opacity-90 mb-1.5 font-medium">
                <span>{erledigt.length} von {total} Aufgaben erledigt</span>
                <span>{donePct}%</span>
              </div>
              <div className="h-2.5 bg-white/25 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white rounded-full transition-all duration-700"
                  style={{ width: `${donePct}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 -mt-4 pb-8 space-y-4">

        {/* Team / Ansprechpartner */}
        {baustelle.zuweisungen.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Team</p>
            <div className="space-y-2">
              {baustelle.zuweisungen.map((z, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{z.teamMitglied.name}</p>
                    <p className="text-xs text-slate-500">{z.rolle}</p>
                  </div>
                  {z.teamMitglied.telefon && (
                    <a
                      href={`tel:${z.teamMitglied.telefon}`}
                      className="flex items-center gap-1.5 bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded-xl text-xs font-semibold hover:bg-green-100 transition-colors"
                    >
                      <Phone className="h-3.5 w-3.5" /> Anrufen
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Offene Aufgaben */}
        <div>
          <div className="flex items-center justify-between mb-3 px-1">
            <p className="text-sm font-bold text-slate-700">
              Offene Aufgaben
              <span className="ml-2 bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full">
                {offene.length}
              </span>
            </p>
          </div>

          {sortedOffene.length === 0 ? (
            <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-6 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-400 mx-auto mb-2" />
              <p className="text-base font-bold text-green-800">Alle Aufgaben erledigt!</p>
              <p className="text-sm text-green-600 mt-1">Gut gemacht! 🎉</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedOffene.map(todo => {
                const isOverdue = !!todo.faelligAm && todo.faelligAm.slice(0, 10) < today
                return (
                  <TodoCard
                    key={todo.id}
                    todo={todo}
                    isOverdue={isOverdue}
                    today={today}
                    isPending={pendingId === todo.id}
                    onStatusChange={() => statusMut.mutate({
                      todoId: todo.id,
                      status: STATUS_NEXT[todo.status] ?? 'offen',
                    })}
                  />
                )
              })}
            </div>
          )}
        </div>

        {/* Erledigte Aufgaben (ein-/ausklappbar) */}
        {erledigt.length > 0 && (
          <div>
            <button
              onClick={() => setDoneCollapsed(v => !v)}
              className="flex items-center gap-2 text-sm font-semibold text-slate-500 mb-3 px-1 hover:text-slate-700 transition-colors"
            >
              {doneCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              Erledigt ({erledigt.length})
            </button>
            {!doneCollapsed && (
              <div className="space-y-2">
                {erledigt.map(todo => (
                  <div key={todo.id} className="bg-white/60 rounded-xl px-4 py-3 flex items-center gap-3 opacity-60">
                    <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                    <p className="text-sm line-through text-slate-500">{todo.titel}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <p className="text-center text-xs text-slate-400 pt-2">
          Enzi Immobilienverwaltung · Auto-Aktualisierung alle 30s
        </p>
      </div>
    </div>
  )
}
