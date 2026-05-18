import type { PrismaClient, MatchingStatus, Buchungstyp, Prisma } from '@prisma/client'
import type { NormalizedTransaction } from '../../../lib/kontoauszug/parser/parser.typen.js'
import type { AbgleichErgebnis, AbgleichVertrag } from '../../../lib/kontoauszug/abgleich/abgleich.typen.js'

// Lokale Aliase für Lesbarkeit
type MatchResult = AbgleichErgebnis
type MatchingVertrag = AbgleichVertrag

export class KontoauszugRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // ─── Kontoauszug anlegen ────────────────────────────────────────────────

  async createKontoauszug(data: {
    tenantId: string
    bankkontoId: string | null
    dateiname: string
    s3Key: string
    zeitraumVon: Date
    zeitraumBis: Date
    importFormat: string
    importiertVon: string
  }) {
    return this.prisma.kontoauszug.create({ data: { ...data, importStatus: 'pending' } })
  }

  // ─── Buchungszeilen + Matching-Ergebnisse in einer Transaktion speichern ─

  async saveBuchungenWithMatching(params: {
    tenantId: string
    kontoauszugId: string
    transactions: NormalizedTransaction[]
    matchResults: MatchResult[]
  }) {
    const { tenantId, kontoauszugId, transactions, matchResults } = params

    return this.prisma.$transaction(async (tx) => {
      // 1. Buchungszeilen anlegen
      const buchungen = await Promise.all(
        transactions.map((t, idx) => {
          const mr = matchResults[idx]
          const auto = mr?.autoAbgleich ?? false
          return tx.buchungszeile.create({
            data: {
              tenantId,
              kontoauszugId,
              buchungsdatum: t.datum,
              wertstellungsdatum: t.wertstellungsdatum,
              betrag: t.betrag,
              waehrung: t.waehrung,
              auftraggeberName: t.auftraggeberName,
              auftraggeberIban: t.auftraggeberIban,
              verwendungszweck: t.verwendungszweck,
              buchungstext: t.buchungstext,
              matchingStatus: auto
                ? ('auto_matched' as MatchingStatus)
                : mr && mr.kandidaten.length > 1
                  ? ('ambiguous' as MatchingStatus)
                  : ('unmatched' as MatchingStatus),
              matchingConfidence: mr?.besterKandidat?.konfidenz ?? null,
            },
          })
        })
      )

      // 2. Matching-Ergebnisse für alle Kandidaten speichern
      const matchingInserts: Prisma.MatchingErgebnisCreateManyInput[] = []
      for (let i = 0; i < matchResults.length; i++) {
        const mr = matchResults[i]
        const buchung = buchungen[i]
        if (!buchung || !mr) continue

        for (const kandidat of mr.kandidaten) {
          matchingInserts.push({
            buchungszeileId: buchung.id,
            mietvertragId: kandidat.mietvertragId,
            buchungstyp: kandidat.buchungstyp,
            confidence: kandidat.konfidenz,
            matchingGrund: kandidat.abgleichGrund,
            prioritaet: kandidat.prioritaet,
            bestaetigt: mr.autoAbgleich && kandidat === mr.besterKandidat,
          })
        }
      }

      if (matchingInserts.length > 0) {
        await tx.matchingErgebnis.createMany({ data: matchingInserts })
      }

      // 3. Statistiken am Kontoauszug aktualisieren
      const buchungenMatched = matchResults.filter((mr) => mr.autoAbgleich).length
      await tx.kontoauszug.update({
        where: { id: kontoauszugId },
        data: {
          buchungenGesamt: transactions.length,
          buchungenMatched,
          importStatus: 'completed',
        },
      })

      return buchungen
    })
  }

  // ─── Bankkonto-Ownership prüfen ──────────────────────────────────────────

  async findBankkonto(bankkontoId: string, tenantId: string) {
    return this.prisma.bankkonto.findFirst({
      where: { id: bankkontoId, tenantId },
    })
  }

  // ─── Zeitraum-Überschneidungscheck ───────────────────────────────────────

  async findUeberschneidung(
    bankkontoId: string,
    zeitraumVon: Date,
    zeitraumBis: Date
  ) {
    return this.prisma.kontoauszug.findFirst({
      where: {
        bankkontoId,
        zeitraumVon: { lte: zeitraumBis },
        zeitraumBis: { gte: zeitraumVon },
      },
      select: { id: true, dateiname: true, zeitraumVon: true, zeitraumBis: true },
    })
  }

  // ─── Kontoauszugs-Liste ──────────────────────────────────────────────────

  async findMany(params: {
    tenantId: string
    bankkontoId?: string
    page: number
    pageSize: number
  }) {
    const where: Prisma.KontoauszugWhereInput = {
      tenantId: params.tenantId,
      ...(params.bankkontoId && { bankkontoId: params.bankkontoId }),
    }

    const [items, total] = await Promise.all([
      this.prisma.kontoauszug.findMany({
        where,
        orderBy: { importiertAm: 'desc' },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        include: { bankkonto: { select: { bezeichnung: true, iban: true } } },
      }),
      this.prisma.kontoauszug.count({ where }),
    ])

    return { items, total }
  }

  // ─── Einzelner Kontoauszug ───────────────────────────────────────────────

  async findById(id: string, tenantId: string) {
    return this.prisma.kontoauszug.findFirst({
      where: { id, tenantId },
      include: {
        bankkonto: { select: { bezeichnung: true, iban: true } },
      },
    })
  }

  // ─── Buchungszeilen eines Kontoauszugs ───────────────────────────────────

  async findBuchungen(params: {
    kontoauszugId: string
    tenantId: string
    matchingStatus?: MatchingStatus
    page: number
    pageSize: number
  }) {
    const where: Prisma.BuchungszeileWhereInput = {
      kontoauszugId: params.kontoauszugId,
      tenantId: params.tenantId,
      ...(params.matchingStatus && { matchingStatus: params.matchingStatus }),
    }

    const [items, total] = await Promise.all([
      this.prisma.buchungszeile.findMany({
        where,
        orderBy: { buchungsdatum: 'desc' },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        include: {
          matchingErgebnisse: {
            include: {
              mietvertrag: {
                include: {
                  einheit: { select: { bezeichnung: true, objektId: true } },
                  mietvertragMieter: {
                    include: { mieter: { select: { vorname: true, nachname: true } } },
                    where: { bis: null },
                    take: 1,
                  },
                },
              },
            },
            orderBy: { prioritaet: 'asc' },
          },
        },
      }),
      this.prisma.buchungszeile.count({ where }),
    ])

    return { items, total }
  }

  // ─── Einzelne Buchungszeile ──────────────────────────────────────────────

  async findBuchungszeileById(id: string, tenantId: string) {
    return this.prisma.buchungszeile.findFirst({
      where: { id, tenantId },
      include: { matchingErgebnisse: true },
    })
  }

  // ─── Manuelle Zuordnung ──────────────────────────────────────────────────

  async manuelleZuordnung(params: {
    buchungszeileId: string
    tenantId: string
    mietvertragId: string
    buchungstyp: Buchungstyp
    begruendung: string | undefined
    userId: string
  }) {
    return this.prisma.$transaction(async (tx) => {
      // Altes auto_match-Ergebnis ablehnen
      await tx.matchingErgebnis.updateMany({
        where: { buchungszeileId: params.buchungszeileId, bestaetigt: true },
        data: { bestaetigt: false, abgelehnt: true },
      })

      // Neues Ergebnis anlegen oder bestehendes aktivieren
      await tx.matchingErgebnis.upsert({
        where: {
          // Finde existing row falls vorhanden
          id: 'non-existent',
        },
        create: {
          buchungszeileId: params.buchungszeileId,
          mietvertragId: params.mietvertragId,
          buchungstyp: params.buchungstyp,
          confidence: 1.0,
          matchingGrund: 'manuell',
          prioritaet: 0,
          bestaetigt: true,
          bestaetigtVon: params.userId,
          bestaetigtAm: new Date(),
        },
        update: {},
      }).catch(async () => {
        // Fallback: direkt anlegen
        await tx.matchingErgebnis.create({
          data: {
            buchungszeileId: params.buchungszeileId,
            mietvertragId: params.mietvertragId,
            buchungstyp: params.buchungstyp,
            confidence: 1.0,
            matchingGrund: 'manuell',
            prioritaet: 0,
            bestaetigt: true,
            bestaetigtVon: params.userId,
            bestaetigtAm: new Date(),
          },
        })
      })

      // Buchungszeile-Status aktualisieren
      return tx.buchungszeile.update({
        where: { id: params.buchungszeileId },
        data: {
          matchingStatus: 'manually_matched',
          matchingConfidence: 1.0,
          manuellZugeordnet: true,
          zugeordnetVon: params.userId,
          zugeordnetAm: new Date(),
        },
      })
    })
  }

  // ─── Ignorieren ──────────────────────────────────────────────────────────

  async ignoriereZeile(
    buchungszeileId: string,
    tenantId: string,
    begruendung: string
  ) {
    return this.prisma.buchungszeile.update({
      where: { id: buchungszeileId },
      data: {
        ignoriert: true,
        ignoriertBegruendung: begruendung,
        matchingStatus: 'ignored',
      },
    })
  }

  // ─── Aktive Mietverträge für Matching laden ───────────────────────────────

  async loadAktiveVertraegeForMatching(tenantId: string): Promise<MatchingVertrag[]> {
    const vertraege = await this.prisma.mietvertrag.findMany({
      where: {
        tenantId,
        deletedAt: null,
        OR: [
          { vertragsende: null },
          { vertragsende: { gte: new Date() } },
        ],
      },
      include: {
        einheit: { select: { bezeichnung: true, objektId: true } },
        mietvertragMieter: {
          where: { bis: null },
          include: {
            mieter: {
              select: { vorname: true, nachname: true, iban: true },
            },
          },
        },
      },
    })

    return vertraege.map((v) => ({
      id: v.id,
      tenantId: v.tenantId,
      einheitBezeichnung: v.einheit.bezeichnung,
      nettomiete: Number(v.nettomiete),
      nkVorauszahlung: Number(v.nkVorauszahlung),
      vertragsbeginn: v.vertragsbeginn,
      vertragsende: v.vertragsende,
      mieterNamen: v.mietvertragMieter.map((mm) =>
        [mm.mieter.vorname, mm.mieter.nachname].filter(Boolean).join(' ')
      ),
      mieterIban: v.mietvertragMieter[0]?.mieter.iban ?? null,
    }))
  }

  // ─── Soll/Ist-Berechnung ─────────────────────────────────────────────────

  async getSollIstDaten(params: {
    tenantId: string
    von: Date
    bis: Date
    objektId?: string
    mietvertragId?: string
  }) {
    const vertraegeWhere: Prisma.MietvertragWhereInput = {
      tenantId: params.tenantId,
      deletedAt: null,
      vertragsbeginn: { lte: params.bis },
      OR: [
        { vertragsende: null },
        { vertragsende: { gte: params.von } },
      ],
      ...(params.mietvertragId && { id: params.mietvertragId }),
      ...(params.objektId && { einheit: { objektId: params.objektId } }),
    }

    return this.prisma.mietvertrag.findMany({
      where: vertraegeWhere,
      include: {
        einheit: { select: { bezeichnung: true, objektId: true } },
        mietvertragMieter: {
          where: { bis: null },
          include: { mieter: { select: { vorname: true, nachname: true } } },
          take: 1,
        },
        matchingErgebnisse: {
          where: {
            bestaetigt: true,
            buchungszeile: {
              buchungsdatum: { gte: params.von, lte: params.bis },
              ignoriert: false,
            },
          },
          include: {
            buchungszeile: { select: { buchungsdatum: true, betrag: true } },
          },
        },
      },
    })
  }

  // ─── Offene Posten ────────────────────────────────────────────────────────

  async getOffenePosten(params: {
    tenantId: string
    nurMitRueckstand: boolean
    objektId?: string
    page: number
    pageSize: number
  }) {
    const where: Prisma.OffenerPostenWhereInput = {
      tenantId: params.tenantId,
      ...(params.nurMitRueckstand && { status: 'offen' }),
      ...(params.objektId && {
        mietvertrag: { einheit: { objektId: params.objektId } },
      }),
    }

    const [items, total] = await Promise.all([
      this.prisma.offenerPosten.findMany({
        where,
        orderBy: [{ mahnungHinweis: 'desc' }, { faelligAm: 'asc' }],
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        include: {
          mietvertrag: {
            include: {
              einheit: { select: { bezeichnung: true, objektId: true } },
              mietvertragMieter: {
                where: { bis: null },
                include: { mieter: { select: { vorname: true, nachname: true } } },
                take: 1,
              },
            },
          },
        },
      }),
      this.prisma.offenerPosten.count({ where }),
    ])

    return { items, total }
  }

  // ─── Offene Posten upsert (für Soll/Ist-Sync) ───────────────────────────

  async upsertOffenerPosten(data: {
    tenantId: string
    mietvertragId: string
    periodeMonat: Date
    postenTyp: string
    sollBetrag: number
    istBetrag: number
    faelligAm: Date
    mahnungHinweis: boolean
    nkAbrechnungId?: string
  }) {
    return this.prisma.offenerPosten.upsert({
      where: {
        // Composite key: mietvertragId + periodeMonat + postenTyp
        // Prisma braucht @unique-Constraint dafür — da nicht im Schema, nutzen wir findFirst + update
        id: 'non-existent',
      },
      create: { ...data, status: data.istBetrag >= data.sollBetrag ? 'bezahlt' : 'offen' },
      update: {},
    }).catch(async () => {
      const existing = await this.prisma.offenerPosten.findFirst({
        where: {
          tenantId: data.tenantId,
          mietvertragId: data.mietvertragId,
          periodeMonat: data.periodeMonat,
          postenTyp: data.postenTyp,
        },
      })

      if (existing) {
        return this.prisma.offenerPosten.update({
          where: { id: existing.id },
          data: {
            istBetrag: data.istBetrag,
            mahnungHinweis: data.mahnungHinweis,
            status: data.istBetrag >= data.sollBetrag ? 'bezahlt' : 'offen',
          },
        })
      }

      return this.prisma.offenerPosten.create({
        data: {
          ...data,
          status: data.istBetrag >= data.sollBetrag ? 'bezahlt' : 'offen',
        },
      })
    })
  }
}
