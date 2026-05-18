/**
 * Abgleich-Service
 * Orchestriert: DB-Daten laden → Abgleich-Engine aufrufen → Ergebnisse persistieren.
 * Die reine Abgleich-Logik liegt in lib/kontoauszug/abgleich/abgleich.engine.ts
 */

import type { PrismaClient } from '@prisma/client'
import type { NormalizedTransaction } from '../../../lib/kontoauszug/parser/parser.typen.js'
import { abgleichTransaktionen } from '../../../lib/kontoauszug/abgleich/abgleich.engine.js'
import { KontoauszugRepository } from '../repositories/kontoauszug.repository.js'
import type { AbgleichErgebnis } from '../../../lib/kontoauszug/abgleich/abgleich.typen.js'

export class AbgleichService {
  private readonly repo: KontoauszugRepository

  constructor(private readonly prisma: PrismaClient) {
    this.repo = new KontoauszugRepository(prisma)
  }

  /**
   * Führt den Abgleich für einen frisch importierten Kontoauszug durch.
   * Läuft synchron – schnell genug ohne Queue.
   * @returns Statistik: Anzahl automatisch abgeglichener und nicht zugeordneter Buchungen
   */
  async abgleichDurchfuehren(params: {
    tenantId: string
    kontoauszugId: string
    transaktionen: NormalizedTransaction[]
  }): Promise<{ buchungenGesamt: number; automatischAbgeglichen: number; nichtZugeordnet: number }> {
    const { tenantId, transaktionen } = params

    // 1. Aktive Verträge aus DB laden
    const vertraege = await this.repo.loadAktiveVertraegeForMatching(tenantId)

    // 2. Abgleich-Engine aufrufen (pure function, kein DB-Zugriff)
    const ergebnisse: AbgleichErgebnis[] = abgleichTransaktionen(transaktionen, vertraege)

    // 3. Buchungszeilen + Abgleich-Ergebnisse in DB speichern
    await this.repo.saveBuchungenWithMatching({
      tenantId,
      kontoauszugId: params.kontoauszugId,
      transactions: transaktionen,
      matchResults: ergebnisse,
    })

    const automatischAbgeglichen = ergebnisse.filter((e) => e.autoAbgleich).length
    const nichtZugeordnet = ergebnisse.filter(
      (e) => !e.autoAbgleich && e.besterKandidat === null
    ).length

    return {
      buchungenGesamt: transaktionen.length,
      automatischAbgeglichen,
      nichtZugeordnet,
    }
  }
}
