'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { authApi } from '@/lib/api'
import { setAuth } from '@/lib/auth'
import { toast } from 'sonner'
import axios from 'axios'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [wakingUp, setWakingUp] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await authApi.login(email, password)
      setAuth(res.data.data.accessToken, res.data.data.user)
      router.push('/dashboard')
    } catch (err) {
      // Netzwerkfehler = Server schläft → Retry mit Hinweis
      if (axios.isAxiosError(err) && !err.response) {
        setWakingUp(true)
        toast.info('Server wird gestartet, bitte warten…')
        // 35 Sek warten dann nochmals versuchen
        await new Promise(r => setTimeout(r, 35000))
        setWakingUp(false)
        try {
          const res2 = await authApi.login(email, password)
          setAuth(res2.data.data.accessToken, res2.data.data.user)
          router.push('/dashboard')
          return
        } catch { /* zeige Fehler unten */ }
      }
      const status = axios.isAxiosError(err) ? err.response?.status : null
      if (status === 401 || status === 400) {
        toast.error('Benutzername oder Passwort falsch.')
      } else {
        toast.error('Verbindungsfehler – bitte nochmals versuchen.')
      }
    } finally {
      setLoading(false)
      setWakingUp(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7] p-4">
      <div className="w-full max-w-[340px]">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-primary shadow-lg shadow-primary/25 mb-4">
            <Building2 className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground">Enzi&apos;s Immobilienverwaltung</h1>
          <p className="text-sm text-muted-foreground mt-1">Melden Sie sich an</p>
        </div>

        {/* Card */}
        <Card className="shadow-xl shadow-black/[0.08] border-border/60 rounded-2xl">
          <CardContent className="pt-6 pb-6 px-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-[13px] font-medium text-foreground">Benutzername</Label>
                <Input
                  id="email"
                  type="text"
                  placeholder="Benutzername"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  className="h-10 rounded-xl border-border bg-muted/50 text-[14px] focus:bg-white transition-colors"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-[13px] font-medium text-foreground">Passwort</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Passwort"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-10 rounded-xl border-border bg-muted/50 text-[14px] focus:bg-white transition-colors"
                />
              </div>
              <Button
                type="submit"
                className="w-full h-10 rounded-xl text-[14px] font-semibold mt-2 bg-primary hover:bg-primary/90 shadow-sm shadow-primary/30 transition-all"
                disabled={loading}
              >
                {wakingUp ? 'Server startet…' : loading ? 'Anmelden…' : 'Anmelden'}
              </Button>
              {wakingUp && (
                <p className="text-center text-xs text-muted-foreground animate-pulse">
                  Erster Start dauert ca. 30 Sekunden…
                </p>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
