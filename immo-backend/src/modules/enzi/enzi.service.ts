import Anthropic from '@anthropic-ai/sdk'
import type { PrismaClient } from '@prisma/client'
import { ENZI_TOOLS, HELP_TEXTS } from './enzi.tools.js'
import { AppError } from '../../utils/errors.js'

const MODEL = process.env['ANTHROPIC_MODEL'] ?? 'claude-sonnet-4-5-20250929'

const SYSTEM_PROMPT = `Du bist **Enzi**, der freundliche KI-Assistent für die Immobilienverwaltung der NC Verwaltung.

Du sprichst Deutsch (Sie-Form ist nicht nötig, Du-Form ist OK). Halte Antworten knapp und konkret.

Deine Aufgaben:
1. **Hilfe geben**: Wenn der Nutzer nicht weiß wie etwas geht, nutze \`help_topic\` für vorgefertigte Erklärungen, oder gib eine eigene knappe Antwort.
2. **Daten finden**: Mit \`search_mieter\`, \`search_objekt\`, \`search_einheit\`, \`list_mietvertraege\` Daten aus dem System holen.
3. **Aktionen ausführen**: Notizen an Mieter oder Mietverträgen anlegen mit \`add_notiz_mieter\` / \`add_notiz_mietvertrag\`.

Workflow für eine Aktion (z.B. „Smart Getränke hat ab 2027 eine Mieterhöhung von 50 €"):
1. Verstehe die Absicht.
2. Finde die Entität (\`search_mieter\` oder \`search_objekt\` oder \`search_einheit\`).
3. Wenn mehrere Treffer: frag kurz nach (z.B. „Ich habe 2 Verträge gefunden — meinst du den von Florianstraße 1 oder Florianstraße 3?").
4. Bei eindeutigem Treffer: führe die Aktion aus und bestätige knapp („✓ Notiz angelegt am Mietvertrag Smart Getränke / Florianstraße 1.").

Sehr wichtig:
- **Niemals raten**: Ohne ID keine Aktion. Bei Mehrdeutigkeit nachfragen.
- **Datum konvertieren**: „ab 2027" → „01.01.2027" oder „Anfang 2027"; „ab 1. Juli" → bezieht sich aufs nächste passende Jahr.
- **Notizen kompakt formulieren**: Datum + Vorgang. Beispiel: „2027-01-01: Mieterhöhung +50 €".
- **Keine erfundenen Daten**: Wenn du etwas nicht findest, sage es klar.

Du hast Zugang zu Mandant: NC Verwaltung. Alle Aktionen laufen automatisch unter diesem Mandanten.`

interface ChatRequest {
  tenantId: string
  userId:   string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
}

export class EnziService {
  private readonly client: Anthropic

  constructor(private readonly prisma: PrismaClient) {
    this.client = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY']! })
  }

  async chat(req: ChatRequest): Promise<{ reply: string; toolCalls: Array<{ name: string; input: unknown; result: unknown }>; offline?: boolean }> {
    const allToolCalls: Array<{ name: string; input: unknown; result: unknown }> = []

    // Fallback: wenn kein API-Key oder API down → einfacher Help-Modus
    if (!process.env['ANTHROPIC_API_KEY']) {
      return this.offlineFallback(req.messages)
    }

    // Multi-turn-Loop für Tool-Use
    const apiMessages: Anthropic.MessageParam[] = req.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }))

    let resp: Anthropic.Message
    for (let iter = 0; iter < 8; iter++) {
      try {
        resp = await this.client.messages.create({
          model: MODEL,
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          tools: ENZI_TOOLS,
          messages: apiMessages,
        })
      } catch (err: unknown) {
        const e = err as { status?: number; message?: string }
        // Bei Auth/Credit-Problemen: Offline-Fallback statt 500
        if (e.status === 400 && e.message?.includes('credit balance is too low')) {
          const fallback = await this.offlineFallback(req.messages)
          return { ...fallback, offline: true }
        }
        if (e.status === 401 || e.status === 403) {
          throw new AppError('AI_UNAVAILABLE', 'KI-Zugang nicht konfiguriert (API-Key prüfen)', 503)
        }
        throw new AppError('AI_ERROR', `Enzi-Fehler: ${e.message ?? 'unbekannt'}`, 502)
      }

      // Wenn das Modell stop_reason "tool_use" hat → Tools ausführen
      if (resp.stop_reason === 'tool_use') {
        // Modell-Antwort mit Tool-Calls in History aufnehmen
        apiMessages.push({ role: 'assistant', content: resp.content })

        // Alle tool_use blocks ausführen
        const toolResults: Anthropic.ToolResultBlockParam[] = []
        for (const block of resp.content) {
          if (block.type === 'tool_use') {
            const result = await this.executeTool(req.tenantId, req.userId, block.name, block.input as Record<string, unknown>)
            allToolCalls.push({ name: block.name, input: block.input, result })
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(result),
            })
          }
        }
        apiMessages.push({ role: 'user', content: toolResults })
        continue
      }

      // Final-Antwort
      const reply = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
      return { reply, toolCalls: allToolCalls }
    }

    return { reply: 'Entschuldigung, ich konnte deine Anfrage nicht abschließen. Bitte präzisiere oder probiere es nochmal.', toolCalls: allToolCalls }
  }

  // ─── Offline-Fallback (wenn kein API-Zugang) ─────────────────────────────
  private async offlineFallback(messages: ChatRequest['messages']) {
    const last = messages[messages.length - 1]?.content?.toLowerCase() ?? ''
    let topic: keyof typeof HELP_TEXTS = 'uebersicht'
    if (/hochlad|upload|lade.+hoch|dokument.+hoch|datei.+hoch|pdf|beleg/.test(last)) topic = 'upload'
    else if (/mieter.*anleg|neuer mieter/.test(last))                  topic = 'mieter_anlegen'
    else if (/vertrag/.test(last))                                     topic = 'vertrag_anlegen'
    else if (/prüf|review|extrahier/.test(last))                       topic = 'dokument_pruefen'
    else if (/mieterhöh|erhöh|erhöhung/.test(last))                    topic = 'mieterhoehung'
    else if (/abrechnung|nebenkosten|nk-/.test(last))                  topic = 'abrechnung'

    return {
      reply: `${HELP_TEXTS[topic]}\n\n_Hinweis: Mein KI-Zugang ist gerade nicht verfügbar — ich gebe dir den passenden Hilfetext._`,
      toolCalls: [],
    }
  }

  // ─── Tool-Ausführung ──────────────────────────────────────────────────────

  private async executeTool(tenantId: string, _userId: string, name: string, input: Record<string, unknown>): Promise<unknown> {
    try {
      switch (name) {
        case 'search_mieter':
          return await this.searchMieter(tenantId, String(input['query'] ?? ''))

        case 'search_objekt':
          return await this.searchObjekt(tenantId, String(input['query'] ?? ''))

        case 'search_einheit':
          return await this.searchEinheit(tenantId, String(input['query'] ?? ''), input['objektId'] as string | undefined)

        case 'list_mietvertraege':
          return await this.listMietvertraege(tenantId, input['mieterId'] as string | undefined, input['einheitId'] as string | undefined)

        case 'add_notiz_mieter':
          return await this.addNotizMieter(tenantId, String(input['mieterId']), String(input['notiz']), (input['modus'] as string) ?? 'anhaengen')

        case 'add_notiz_mietvertrag':
          return await this.addNotizMietvertrag(tenantId, String(input['mietvertragId']), String(input['notiz']), (input['modus'] as string) ?? 'anhaengen')

        case 'count_entities':
          return await this.countEntities(tenantId)

        case 'help_topic': {
          const topic = String(input['topic'] ?? '')
          return { topic, text: HELP_TEXTS[topic] ?? `Kein Hilfetext für "${topic}" vorhanden.` }
        }

        default:
          return { error: `Unbekanntes Tool: ${name}` }
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Tool-Fehler' }
    }
  }

  private async searchMieter(tenantId: string, query: string) {
    const items = await this.prisma.mieter.findMany({
      where: {
        tenantId,
        deletedAt: null,
        OR: [
          { vorname:    { contains: query, mode: 'insensitive' } },
          { nachname:   { contains: query, mode: 'insensitive' } },
          { firmenname: { contains: query, mode: 'insensitive' } },
          { email:      { contains: query, mode: 'insensitive' } },
          { stadt:      { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 8,
      select: { id: true, vorname: true, nachname: true, firmenname: true, email: true, stadt: true, notizen: true },
    })
    return { count: items.length, items }
  }

  private async searchObjekt(tenantId: string, query: string) {
    const items = await this.prisma.objekt.findMany({
      where: {
        tenantId,
        OR: [
          { bezeichnung: { contains: query, mode: 'insensitive' } },
          { strasse:     { contains: query, mode: 'insensitive' } },
          { stadt:       { contains: query, mode: 'insensitive' } },
          { plz:         { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 8,
      select: { id: true, bezeichnung: true, strasse: true, hausnummer: true, plz: true, stadt: true },
    })
    return { count: items.length, items }
  }

  private async searchEinheit(tenantId: string, query: string, objektId?: string) {
    const items = await this.prisma.einheit.findMany({
      where: {
        objekt: { tenantId },
        ...(objektId ? { objektId } : {}),
        bezeichnung: { contains: query, mode: 'insensitive' },
      },
      take: 8,
      select: {
        id: true, bezeichnung: true, einheitenTyp: true, etage: true,
        objekt: { select: { id: true, bezeichnung: true } },
      },
    })
    return { count: items.length, items }
  }

  private async listMietvertraege(tenantId: string, mieterId?: string, einheitId?: string) {
    const items = await this.prisma.mietvertrag.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(einheitId ? { einheitId } : {}),
        ...(mieterId ? { mietvertragMieter: { some: { mieterId } } } : {}),
      },
      take: 12,
      select: {
        id: true, vertragsbeginn: true, vertragsende: true, nettomiete: true,
        einheit: { select: { id: true, bezeichnung: true, objekt: { select: { bezeichnung: true } } } },
        mietvertragMieter: { select: { mieter: { select: { id: true, vorname: true, nachname: true, firmenname: true } } } },
      },
    })
    return { count: items.length, items }
  }

  private async addNotizMieter(tenantId: string, mieterId: string, notiz: string, modus: string) {
    const m = await this.prisma.mieter.findFirst({ where: { id: mieterId, tenantId, deletedAt: null } })
    if (!m) return { error: `Mieter ${mieterId} nicht gefunden` }
    const stamp = new Date().toISOString().slice(0, 10)
    const neu = modus === 'ersetzen' ? notiz : [m.notizen ?? '', `[${stamp}] ${notiz}`].filter(Boolean).join('\n')
    await this.prisma.mieter.update({ where: { id: mieterId }, data: { notizen: neu, geaendertAm: new Date() } })
    return { success: true, mieterId, notiz: neu }
  }

  private async addNotizMietvertrag(tenantId: string, mietvertragId: string, notiz: string, modus: string) {
    const v = await this.prisma.mietvertrag.findFirst({ where: { id: mietvertragId, tenantId, deletedAt: null } })
    if (!v) return { error: `Mietvertrag ${mietvertragId} nicht gefunden` }
    const stamp = new Date().toISOString().slice(0, 10)
    const neu = modus === 'ersetzen' ? notiz : [v.notizen ?? '', `[${stamp}] ${notiz}`].filter(Boolean).join('\n')
    await this.prisma.mietvertrag.update({ where: { id: mietvertragId }, data: { notizen: neu, geaendertAm: new Date() } })
    return { success: true, mietvertragId, notiz: neu }
  }

  private async countEntities(tenantId: string) {
    const [objekte, einheiten, mieter, mietvertraege, dokumente] = await Promise.all([
      this.prisma.objekt.count({ where: { tenantId } }),
      this.prisma.einheit.count({ where: { objekt: { tenantId } } }),
      this.prisma.mieter.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.mietvertrag.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.dokument.count({ where: { tenantId } }),
    ])
    return { objekte, einheiten, mieter, mietvertraege, dokumente }
  }
}
