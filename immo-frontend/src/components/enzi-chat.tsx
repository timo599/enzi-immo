'use client'

import { useState, useRef, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Sparkles, Send, X, Loader2, ChevronDown, Wifi, WifiOff } from 'lucide-react'
import { enziApi, type EnziMessage } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'

interface ChatMessage extends EnziMessage {
  id: string
  toolCalls?: Array<{ name: string; result: any }>
  offline?: boolean
}

const STARTER_MESSAGES = [
  'Wie viele Objekte und Mieter haben wir?',
  'Wer wohnt in der Wollgrasweg 37?',
  'Wie lade ich ein Dokument hoch?',
  'Notiere bei Smart Getränke, dass die Miete ab 2027 um 50 € steigt',
]

export function EnziChat() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  const chatMut = useMutation({
    mutationFn: async (newMessages: ChatMessage[]) => {
      const r = await enziApi.chat(newMessages.map((m) => ({ role: m.role, content: m.content })))
      return r.data?.data
    },
    onSuccess: (data, _vars, _ctx) => {
      if (!data) return
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.reply,
        toolCalls: data.toolCalls,
        offline: data.offline,
      }])
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error?.message ?? 'Enzi konnte nicht antworten'
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `⚠️ ${msg}`,
      }])
    },
  })

  function send(text: string) {
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text.trim() }
    if (!userMsg.content) return
    const newMsgs = [...messages, userMsg]
    setMessages(newMsgs)
    setInput('')
    chatMut.mutate(newMsgs)
  }

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, chatMut.isPending])

  return (
    <>
      {/* Schwebender Knopf */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg hover:scale-105 transition-transform flex items-center justify-center"
        title="Enzi · KI-Assistent"
      >
        <Sparkles className="h-6 w-6" />
        {messages.length === 0 && (
          <span className="absolute -top-1 -right-1 h-4 w-4 bg-emerald-500 rounded-full ring-2 ring-white animate-pulse" />
        )}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-md p-0 flex flex-col"
        >
          <SheetHeader className="px-4 py-3 border-b bg-gradient-to-r from-amber-50 to-orange-50">
            <SheetTitle className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-base">Enzi</div>
                <div className="text-xs text-muted-foreground font-normal">Dein KI-Assistent für die Immobilienverwaltung</div>
              </div>
            </SheetTitle>
          </SheetHeader>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <div className="text-center py-8 space-y-4">
                <div className="text-sm text-muted-foreground">
                  Hi! Ich bin Enzi 👋 — frag mich was oder gib mir Aufgaben.
                </div>
                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Beispiele</div>
                  {STARTER_MESSAGES.map((q) => (
                    <button
                      key={q}
                      onClick={() => send(q)}
                      className="block w-full text-left text-sm px-3 py-2 rounded-lg border bg-background hover:bg-accent/50 transition"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m) => (
                <Message key={m.id} msg={m} />
              ))
            )}
            {chatMut.isPending && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Enzi denkt nach…
              </div>
            )}
          </div>

          {/* Eingabe */}
          <div className="border-t p-3 bg-background">
            <form
              onSubmit={(e) => { e.preventDefault(); send(input) }}
              className="flex gap-2"
            >
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Frag Enzi etwas…"
                disabled={chatMut.isPending}
                autoFocus
              />
              <Button type="submit" disabled={!input.trim() || chatMut.isPending} size="icon">
                <Send className="h-4 w-4" />
              </Button>
            </form>
            {messages.length > 0 && (
              <button
                onClick={() => setMessages([])}
                className="mt-2 text-xs text-muted-foreground hover:text-foreground"
              >
                Verlauf löschen
              </button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

function Message({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm ${
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground'
        }`}
      >
        {msg.offline && (
          <div className="flex items-center gap-1 text-xs text-amber-700 mb-1">
            <WifiOff className="h-3 w-3" />
            Offline-Hilfe
          </div>
        )}
        <div className="whitespace-pre-wrap break-words leading-relaxed">
          {/* Sehr leichtes Markdown: nur **bold** */}
          {msg.content.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
            part.startsWith('**') && part.endsWith('**')
              ? <strong key={i}>{part.slice(2, -2)}</strong>
              : <span key={i}>{part}</span>
          )}
        </div>
        {msg.toolCalls && msg.toolCalls.length > 0 && (
          <details className="mt-2 text-xs opacity-70">
            <summary className="cursor-pointer">{msg.toolCalls.length} Aktion(en)</summary>
            <ul className="mt-1 space-y-0.5">
              {msg.toolCalls.map((t, i) => (
                <li key={i}>· {t.name}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  )
}
