/**
 * Soll/Ist-Service
 * Berechnet für jeden Mietvertrag + jeden Monat im Zeitraum
 * ob Miete und NK-Vorauszahlung eingegangen sind.
 *
 * INVARIANTE: mahnung_hinweis ist NUR ein Hinweis.
 * Das System versendet KEINE Mahnungen.
 */

import type { PrismaClient } from '@prisma/client'
import { eachMonthOfInterval, startOfMonth, addDays, endOfMonth } from 'date-fns'
import { KontoauszugRepository } from '../repositories/kontoauszug.repository.js'

export interface SollIstMonat {
  periodeMonat: Date
  sollMiete: number
  istMiete: number
  differenzMiete: number
  sollNk: number
  istNk: number
  differenzNk: number
  /** true wenn Differenz-Miete < 0 AND heute > Fälligkeit + 14 Tage */
  mahnungHinweis: boolean
}

export interface SollIstVertrag {
  mietvertragId: string
  einheitBezeichnung: string
  objektId: string
  mieterName: string
  monate: SollIstMonat[]
  gesamtDifferenzMiete: number
  gesamtDifferenzNk: number
}

export class SollIstService {
  private readonly repo: KontoauszugRepository

  constructor(private readonly prisma: PrismaClient) {
    this.repo = new KontoauszugRepository(prisma)
  }

  async berechne(params: {
    tenantId: string
    von: Date
    bis: Date
    objektId?: string
    mietvertragId?: string
  }): Promise<SollIstVertrag[]> {
    const vertraege = await this.repo.getSollIstDaten(params)
    const heute = new Date()

    return vertraege.map((v) => {
      // Alle Monate im Zeitraum generieren
      const monate = eachMonthOfInterval({ start: params.von, end: params.bis })

      const monatsDaten = monate.map((monat): SollIstMonat => {
        const monatsAnfang = startOfMonth(monat)
        const monatsEnde = endOfMonth(monat)

        // Fälligkeitstag: 1. des Monats (Standard deutsches Mietrecht)
        const faelligAm = new Date(monat.getFullYear(), monat.getMonth(), 1)
        const mahnungFrist = addDays(faelligAm, 14)

        // Ist-Werte: bestätigte Buchungen dieses Monats
        const buchungenDiesesMonat = v.matchingErgebnisse.filter((me) => {
          const datum = me.buchungszeile.buchungsdatum
          return datum >= monatsAnfang && datum <= monatsEnde
        })

        // Miete-Buchungen
        const istMiete = buchungenDiesesMonat
          .filter((me) =>
            me.buchungstyp === 'miete' || me.buchungstyp === 'miete_und_nk'
          )
          .reduce((sum, me) => {
            const betrag = Number(me.buchungszeile.betrag)
            // Bei miete_und_nk: Nettomiete-Anteil schätzen
            if (me.buchungstyp === 'miete_und_nk') {
              return sum + Number(v.nettomiete)
            }
            return sum + betrag
          }, 0)

        // NK-Buchungen
        const istNk = buchungenDiesesMonat
          .filter((me) =>
            me.buchungstyp === 'nk_vorauszahlung' || me.buchungstyp === 'miete_und_nk'
          )
          .reduce((sum, me) => {
            if (me.buchungstyp === 'miete_und_nk') {
              return sum + Number(v.nkVorauszahlung)
            }
            return sum + Number(me.buchungszeile.betrag)
          }, 0)

        const sollMiete = Number(v.nettomiete)
        const sollNk = Number(v.nkVorauszahlung)
        const differenzMiete = istMiete - sollMiete
        const differenzNk = istNk - sollNk

        // Mahnung-Hinweis: Rückstand UND Frist überschritten
        const mahnungHinweis =
          differenzMiete < 0 &&
          heute > mahnungFrist

        return {
          periodeMonat: monatsAnfang,
          sollMiete,
          istMiete: Math.round(istMiete * 100) / 100,
          differenzMiete: Math.round(differenzMiete * 100) / 100,
          sollNk,
          istNk: Math.round(istNk * 100) / 100,
          differenzNk: Math.round(differenzNk * 100) / 100,
          mahnungHinweis,
        }
      })

      const mieterName = v.mietvertragMieter[0]
        ? [
            v.mietvertragMieter[0].mieter.vorname,
            v.mietvertragMieter[0].mieter.nachname,
          ]
            .filter(Boolean)
            .join(' ')
        : 'Unbekannt'

      return {
        mietvertragId: v.id,
        einheitBezeichnung: v.einheit.bezeichnung,
        objektId: v.einheit.objektId,
        mieterName,
        monate: monatsDaten,
        gesamtDifferenzMiete: monatsDaten.reduce((s, m) => s + m.differenzMiete, 0),
        gesamtDifferenzNk: monatsDaten.reduce((s, m) => s + m.differenzNk, 0),
      }
    })
  }
}
