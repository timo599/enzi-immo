'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { Building2, LogOut, FileText, Wrench, Home, TrendingUp, Key } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const BASE = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1'

function portalApi(token: string) {
  return axios.create({
    baseURL: BASE,
    headers: { Authorization: `Bearer ${token}` },
  })
}

interface Dokument { id: string; originalName: string; mimeType: string; hochgeladenAm: string; dokumentKategorie: string }
interface Reparatur { id: string; titel: string; status: string; einheit: { bezeichnung: string } | null; erstelltAm: string }
interface Mieter {
  vorname: string | null
  nachname: string
  email: string | null
  mietvertragMieter: Array<{
    mietvertrag: {
      nettomiete: number
      nkVorauszahlung: number
      vertragsbeginn: string
      vertragsende: string | null
      einheit: { bezeichnung: string; objekt: { bezeichnung: string; strasse: string | null; hausnummer: string | null; plz: string | null; stadt: string | null } }
    }
  }>
}

function PortalApp({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [tab, setTab] = useState<'home' | 'dokumente' | 'reparaturen'>('home')
  const pa = portalApi(token)

  const { data: mieter } = useQuery<Mieter>({
    queryKey: ['portal-me'],
    queryFn: () => pa.get('/portal/me').then(r => r.data.data),
  })
  const { data: doks } = useQuery<Dokument[]>({
    queryKey: ['portal-doks'],
    queryFn: () => pa.get('/portal/dokumente').then(r => r.data.data),
    enabled: tab === 'dokumente',
  })
  const { data: reps } = useQuery<Reparatur[]>({
    queryKey: ['portal-reps'],
    queryFn: () => pa.get('/portal/reparaturen').then(r => r.data.data),
    enabled: tab === 'reparaturen',
  })

  const mv = mieter?.mietvertragMieter?.[0]?.mietvertrag

  const statusColor: Record<string, string> = {
    offen:         'bg-red-100 text-red-700',
    in_bearbeitung:'bg-yellow-100 text-yellow-700',
    erledigt:      'bg-green-100 text-green-700',
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary shadow-sm">
            <Building2 className="h-4 w-4 text-white" />
          </div>
          <span className="font-semibold text-sm">Mieter-Portal</span>
        </div>
        <button onClick={onLogout} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <LogOut className="h-4 w-4" /> Abmelden
        </button>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto p-4 pb-24 space-y-4">
        {tab === 'home' && (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Hallo, {mieter ? `${mieter.vorname ?? ''} ${mieter.nachname}`.trim() : '…'}</CardTitle>
              </CardHeader>
              <CardContent>
                {mv ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Einheit</span>
                      <span className="font-medium">{mv.einheit.bezeichnung}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Objekt</span>
                      <span>{mv.einheit.objekt.bezeichnung}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Adresse</span>
                      <span className="text-right">
                        {[mv.einheit.objekt.strasse, mv.einheit.objekt.hausnummer].filter(Boolean).join(' ')}
                        {mv.einheit.objekt.plz && `, ${mv.einheit.objekt.plz} ${mv.einheit.objekt.stadt ?? ''}`}
                      </span>
                    </div>
                    <div className="border-t pt-2 mt-2 flex justify-between">
                      <span className="text-muted-foreground">Nettomiete</span>
                      <span className="font-semibold">€ {Number(mv.nettomiete).toLocaleString('de-AT', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">NK-Vorauszahlung</span>
                      <span>€ {Number(mv.nkVorauszahlung).toLocaleString('de-AT', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Warmmiete</span>
                      <span className="font-semibold text-primary">€ {(Number(mv.nettomiete) + Number(mv.nkVorauszahlung)).toLocaleString('de-AT', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Vertrag seit</span>
                      <span>{new Date(mv.vertragsbeginn).toLocaleDateString('de-AT')}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Kein aktiver Mietvertrag gefunden</p>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {tab === 'dokumente' && (
          <div className="space-y-3">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Meine Dokumente</h2>
            {!doks || doks.length === 0 ? (
              <p className="text-sm text-center py-8 text-muted-foreground">Keine Dokumente vorhanden</p>
            ) : doks.map(d => (
              <Card key={d.id}>
                <CardContent className="p-3 flex items-center gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{d.originalName}</p>
                    <p className="text-xs text-muted-foreground">{new Date(d.hochgeladenAm).toLocaleDateString('de-AT')}</p>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">{d.dokumentKategorie}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {tab === 'reparaturen' && (
          <div className="space-y-3">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Reparaturen</h2>
            {!reps || reps.length === 0 ? (
              <p className="text-sm text-center py-8 text-muted-foreground">Keine Reparaturen vorhanden</p>
            ) : reps.map(r => (
              <Card key={r.id}>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{r.titel}</p>
                      <p className="text-xs text-muted-foreground">{r.einheit?.bezeichnung}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[r.status] ?? 'bg-muted text-muted-foreground'}`}>
                      {r.status === 'offen' ? 'Offen' : r.status === 'in_bearbeitung' ? 'In Bearbeitung' : 'Erledigt'}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-border flex items-center justify-around h-16 px-2 safe-area-pb">
        {([
          { id: 'home',        label: 'Übersicht',   Icon: Home },
          { id: 'dokumente',   label: 'Dokumente',   Icon: FileText },
          { id: 'reparaturen', label: 'Reparaturen', Icon: Wrench },
        ] as const).map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl transition-all ${tab === id ? 'text-primary' : 'text-muted-foreground'}`}
          >
            <Icon className={`h-5 w-5 shrink-0 ${tab === id ? 'stroke-[2.5]' : ''}`} />
            <span className="text-[10px] font-medium">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

export default function MieterPortalPage() {
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem('portal_token')
  })
  const [email, setEmail]       = useState('')
  const [passwort, setPasswort] = useState('')

  const login = useMutation({
    mutationFn: () => axios.post(`${BASE}/portal/login`, { email, passwort }).then(r => r.data),
    onSuccess: (data) => {
      localStorage.setItem('portal_token', data.token)
      setToken(data.token)
    },
    onError: () => setPasswort(''),
  })

  function logout() {
    localStorage.removeItem('portal_token')
    setToken(null)
  }

  if (token) return <PortalApp token={token} onLogout={logout} />

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 justify-center mb-8">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary shadow-sm">
            <Building2 className="h-5 w-5 text-white" />
          </div>
          <span className="font-semibold text-lg">Mieter-Portal</span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Key className="h-4 w-4" /> Anmelden
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>E-Mail</Label>
              <Input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="ihre@email.at"
                className="text-base"
              />
            </div>
            <div>
              <Label>Passwort</Label>
              <Input
                type="password"
                value={passwort}
                onChange={e => setPasswort(e.target.value)}
                placeholder="••••••"
                className="text-base"
                onKeyDown={e => e.key === 'Enter' && email && passwort && login.mutate()}
              />
            </div>
            {login.isError && (
              <p className="text-sm text-destructive">Ungültige Zugangsdaten</p>
            )}
            <Button
              className="w-full"
              disabled={!email || !passwort || login.isPending}
              onClick={() => login.mutate()}
            >
              {login.isPending ? 'Wird angemeldet…' : 'Anmelden'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
