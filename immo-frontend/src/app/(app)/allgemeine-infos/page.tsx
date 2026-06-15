'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { allgemeineInfosApi } from '@/lib/api'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Pencil, Check, X, Plus, Info } from 'lucide-react'

interface InfoSektion {
  id: string
  schluessel: string
  titel: string
  inhalt: string
  reihenfolge: number
  geaendert_am: string
  geaendert_von?: string
}

export default function AllgemeineInfosPage() {
  const qc = useQueryClient()
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editInhalt, setEditInhalt] = useState('')
  const [editTitel, setEditTitel]   = useState('')
  const [newOpen, setNewOpen]       = useState(false)
  const [newTitel, setNewTitel]     = useState('')
  const [newInhalt, setNewInhalt]   = useState('')
  const [newKey, setNewKey]         = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['allgemeine-infos'],
    queryFn:  () => allgemeineInfosApi.list().then(r => r.data?.data ?? []),
  })

  const sektionen: InfoSektion[] = data ?? []

  const saveMut = useMutation({
    mutationFn: ({ schluessel, inhalt, titel }: { schluessel: string; inhalt: string; titel?: string }) =>
      allgemeineInfosApi.update(schluessel, inhalt, titel),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['allgemeine-infos'] })
      setEditingKey(null)
      setNewOpen(false)
      setNewTitel(''); setNewInhalt(''); setNewKey('')
      toast.success('Gespeichert')
    },
    onError: () => toast.error('Speichern fehlgeschlagen'),
  })

  function startEdit(s: InfoSektion) {
    setEditingKey(s.schluessel)
    setEditInhalt(s.inhalt)
    setEditTitel(s.titel)
  }

  function cancelEdit() {
    setEditingKey(null)
    setEditInhalt('')
    setEditTitel('')
  }

  function generateKey(titel: string) {
    return titel.toLowerCase()
      .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss')
      .replace(/[^a-z0-9]+/g,'_').slice(0, 40)
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 max-w-4xl mx-auto">
      <PageHeader
        title="Allgemeine Infos"
        description="Interne Notizen, Kontakte, Abläufe — für alle sichtbar und bearbeitbar"
        action={
          <Button size="sm" onClick={() => { setNewOpen(true); setNewTitel(''); setNewInhalt('') }}>
            <Plus className="h-4 w-4 mr-1" /> Neue Sektion
          </Button>
        }
      />

      {/* Neue Sektion anlegen */}
      {newOpen && (
        <div className="rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 p-4 space-y-3">
          <p className="text-sm font-semibold text-primary">Neue Sektion anlegen</p>
          <Input
            placeholder="Titel der Sektion"
            value={newTitel}
            onChange={e => { setNewTitel(e.target.value); setNewKey(generateKey(e.target.value)) }}
            className="h-9"
          />
          <Textarea
            placeholder="Inhalt (Freitext — Notizen, Kontakte, Anleitungen…)"
            value={newInhalt}
            onChange={e => setNewInhalt(e.target.value)}
            rows={4}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={!newTitel || saveMut.isPending}
              onClick={() => saveMut.mutate({ schluessel: newKey || generateKey(newTitel), inhalt: newInhalt, titel: newTitel })}
            >
              <Check className="h-3.5 w-3.5 mr-1" />
              {saveMut.isPending ? 'Speichere…' : 'Anlegen'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setNewOpen(false)}>
              <X className="h-3.5 w-3.5 mr-1" /> Abbrechen
            </Button>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      )}

      {/* Sektionen */}
      <div className="space-y-4">
        {sektionen.map(s => (
          <div key={s.schluessel} className="rounded-xl border bg-card shadow-sm overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-muted/40 border-b">
              {editingKey === s.schluessel ? (
                <Input
                  value={editTitel}
                  onChange={e => setEditTitel(e.target.value)}
                  className="h-7 text-sm font-semibold max-w-xs"
                />
              ) : (
                <h3 className="font-semibold text-sm">{s.titel}</h3>
              )}
              <div className="flex items-center gap-2">
                {s.geaendert_von && (
                  <span className="text-xs text-muted-foreground hidden sm:inline">
                    zuletzt: {s.geaendert_von} · {new Date(s.geaendert_am).toLocaleDateString('de-DE')}
                  </span>
                )}
                {editingKey === s.schluessel ? (
                  <>
                    <Button
                      size="sm" variant="default" className="h-7 text-xs"
                      disabled={saveMut.isPending}
                      onClick={() => saveMut.mutate({ schluessel: s.schluessel, inhalt: editInhalt, titel: editTitel })}
                    >
                      <Check className="h-3 w-3 mr-1" />{saveMut.isPending ? '…' : 'Speichern'}
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={cancelEdit}>
                      <X className="h-3 w-3" />
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => startEdit(s)}>
                    <Pencil className="h-3 w-3 mr-1" /> Bearbeiten
                  </Button>
                )}
              </div>
            </div>

            {/* Inhalt */}
            <div className="p-4">
              {editingKey === s.schluessel ? (
                <Textarea
                  value={editInhalt}
                  onChange={e => setEditInhalt(e.target.value)}
                  rows={Math.max(5, (editInhalt.match(/\n/g) ?? []).length + 3)}
                  className="font-mono text-sm resize-y"
                  placeholder="Hier Text eintragen…"
                  autoFocus
                />
              ) : s.inhalt ? (
                <pre className="text-sm whitespace-pre-wrap font-sans text-slate-700 leading-relaxed">
                  {s.inhalt}
                </pre>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
                  <Info className="h-4 w-4" />
                  <span>Noch kein Inhalt — auf „Bearbeiten" klicken um etwas einzutragen</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {!isLoading && sektionen.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Info className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">Noch keine Sektionen. Oben eine anlegen!</p>
        </div>
      )}
    </div>
  )
}
