'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { use } from 'react'
import { CheckCircle2, Clock, Circle, HardHat, MapPin, Phone, AlertCircle } from 'lucide-react'

type TodoStatus = 'offen'|'in_bearbeitung'|'erledigt'|'abgebrochen'

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
  niedrig: 'bg-slate-300', mittel: 'bg-blue-400', hoch: 'bg-orange-400', dringend: 'bg-red-500'
}

export default function BaustellePublicPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params)
  const qc = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['baustelle-public', code],
    queryFn: () => api.get(`/baustellen/zugang/${code}`).then(r => r.data.data),
    retry: false,
  })

  const statusMut = useMutation({
    mutationFn: ({ todoId, status }: { todoId: string; status: TodoStatus }) =>
      api.patch(`/baustellen/zugang/${code}/todo/${todoId}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['baustelle-public', code] }),
  })

  const baustelle: Baustelle | null = data ?? null
  const today = new Date().toISOString().slice(0, 10)

  if (isLoading) return (
    <div className="min-h-screen bg-orange-50 flex items-center justify-center">
      <div className="text-orange-600 text-sm">Lade Baustelle…</div>
    </div>
  )

  if (isError || !baustelle) return (
    <div className="min-h-screen bg-orange-50 flex flex-col items-center justify-center gap-3 p-6">
      <HardHat className="h-12 w-12 text-orange-300" />
      <p className="text-lg font-semibold text-orange-800">Ungültiger Zugangscode</p>
      <p className="text-sm text-orange-600">Bitte den Code erneut beim Bauleiter erfragen.</p>
    </div>
  )

  const offene = baustelle.todos.filter(t => t.status !== 'erledigt' && t.status !== 'abgebrochen')
  const erledigt = baustelle.todos.filter(t => t.status === 'erledigt')

  return (
    <div className="min-h-screen bg-orange-50">
      {/* Header */}
      <div className="bg-orange-600 text-white px-4 py-5 shadow-lg">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-2 mb-1">
            <HardHat className="h-5 w-5" />
            <span className="text-xs font-medium opacity-80 uppercase tracking-wide">Baustelle</span>
          </div>
          <h1 className="text-xl font-bold">{baustelle.name}</h1>
          {baustelle.objekt && (
            <p className="text-sm opacity-90 mt-0.5 flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {baustelle.objekt.strasse} {baustelle.objekt.hausnummer}, {baustelle.objekt.plz} {baustelle.objekt.stadt}
            </p>
          )}
          {baustelle.firma && <p className="text-xs opacity-70 mt-0.5">{baustelle.firma.name}</p>}
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-5">
        {/* Team */}
        {baustelle.zuweisungen.length > 0 && (
          <div className="bg-white rounded-xl p-3 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Team</p>
            <div className="space-y-1.5">
              {baustelle.zuweisungen.map((z, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium">{z.teamMitglied.name}</span>
                    <span className="text-xs text-slate-500 ml-2">{z.rolle}</span>
                  </div>
                  {z.teamMitglied.telefon && (
                    <a href={`tel:${z.teamMitglied.telefon}`} className="flex items-center gap-1 text-xs text-orange-600 hover:text-orange-700">
                      <Phone className="h-3.5 w-3.5" /> {z.teamMitglied.telefon}
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Offene Aufgaben */}
        <div>
          <p className="text-sm font-semibold text-slate-700 mb-2">
            Offene Aufgaben ({offene.length})
          </p>
          {offene.length === 0 ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
              <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-1" />
              <p className="text-sm text-green-700 font-medium">Alle Aufgaben erledigt! 🎉</p>
            </div>
          ) : (
            <div className="space-y-2">
              {offene.map(todo => {
                const isOverdue = todo.faelligAm && todo.faelligAm.slice(0, 10) < today
                return (
                  <div key={todo.id} className={`bg-white rounded-xl p-3.5 shadow-sm border ${isOverdue ? 'border-red-200' : 'border-transparent'}`}>
                    <div className="flex items-start gap-3">
                      {/* Tap zum Weiterschalten */}
                      <button
                        className="mt-0.5 shrink-0 active:scale-90 transition-transform"
                        onClick={() => statusMut.mutate({
                          todoId: todo.id,
                          status: todo.status === 'offen' ? 'in_bearbeitung' : 'erledigt'
                        })}
                      >
                        {todo.status === 'offen'
                          ? <Circle className="h-6 w-6 text-slate-300" />
                          : <Clock className="h-6 w-6 text-blue-400" />}
                      </button>
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${PRIO_DOT[todo.prioritaet] ?? 'bg-slate-300'}`} />
                          <p className="text-sm font-medium">{todo.titel}</p>
                        </div>
                        {todo.beschreibung && (
                          <p className="text-xs text-slate-500 mt-0.5">{todo.beschreibung}</p>
                        )}
                        <div className="flex flex-wrap gap-2 mt-1.5 text-xs text-slate-500">
                          {todo.faelligAm && (
                            <span className={isOverdue ? 'text-red-500 font-medium flex items-center gap-0.5' : ''}>
                              {isOverdue && <AlertCircle className="h-3 w-3" />}
                              📅 {new Date(todo.faelligAm).toLocaleDateString('de-DE')}
                            </span>
                          )}
                          {todo.zuweisungen.map(z => (
                            <span key={z.teamMitglied.name}>👤 {z.teamMitglied.name}</span>
                          ))}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1.5">
                          {todo.status === 'offen' ? '→ Tippen um zu starten' : '→ Tippen zum Abschließen'}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Erledigte Aufgaben */}
        {erledigt.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-slate-500 mb-2">Erledigt ({erledigt.length})</p>
            <div className="space-y-1.5">
              {erledigt.map(todo => (
                <div key={todo.id} className="bg-white/60 rounded-xl p-3 shadow-sm opacity-60">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    <p className="text-sm line-through text-slate-500">{todo.titel}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="text-center text-xs text-slate-400 pb-4">
          Enzi Immobilienverwaltung
        </div>
      </div>
    </div>
  )
}
