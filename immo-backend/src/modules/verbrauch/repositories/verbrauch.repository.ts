import type { PrismaClient, Prisma } from '@prisma/client'
import type { CreateVerbrauchInput, UpdateVerbrauchInput, ListVerbrauchQuery, CreateOelZukaufInput } from '../schemas/verbrauch.schema.js'
import { parsePagination } from '../../../utils/pagination.js'

export class VerbrauchRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findMany(tenantId: string, query: ListVerbrauchQuery) {
    const { skip, take, page, pageSize } = parsePagination(query)
    const where: Prisma.VerbrauchserfassungWhereInput = {
      tenantId,
      ...(query.zeitraumId    ? { zeitraumId: query.zeitraumId }       : {}),
      ...(query.objektId      ? { objektId: query.objektId }           : {}),
      ...(query.verbrauchstyp ? { verbrauchstyp: query.verbrauchstyp } : {}),
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.verbrauchserfassung.findMany({
        where, skip, take,
        orderBy: [{ objekt: { bezeichnung: 'asc' } }, { verbrauchstyp: 'asc' }],
        include: {
          objekt:      { select: { id: true, bezeichnung: true } },
          oelZukaeufe: { orderBy: { kaufdatum: 'asc' } },
        },
      }),
      this.prisma.verbrauchserfassung.count({ where }),
    ])
    return { items, total, page, pageSize }
  }

  async findById(id: string, tenantId: string) {
    return this.prisma.verbrauchserfassung.findFirst({
      where: { id, tenantId },
      include: {
        objekt:      { select: { id: true, bezeichnung: true, heizungsart: true } },
        oelZukaeufe: { orderBy: { kaufdatum: 'asc' } },
      },
    })
  }

  async findByObjektZeitraum(objektId: string, zeitraumId: string, tenantId: string) {
    return this.prisma.verbrauchserfassung.findMany({
      where: { objektId, zeitraumId, tenantId },
      include: { oelZukaeufe: { orderBy: { kaufdatum: 'asc' } } },
    })
  }

  async upsert(tenantId: string, userId: string, data: CreateVerbrauchInput) {
    return this.prisma.verbrauchserfassung.upsert({
      where: {
        objektId_zeitraumId_verbrauchstyp: {
          objektId:     data.objektId,
          zeitraumId:   data.zeitraumId,
          verbrauchstyp: data.verbrauchstyp,
        },
      },
      create: {
        tenantId,
        erstelltVon:         userId,
        objektId:            data.objektId,
        zeitraumId:          data.zeitraumId,
        verbrauchstyp:       data.verbrauchstyp,
        anfangsbestand:      data.anfangsbestand,
        anfangsbestandDatum: data.anfangsbestandDatum ? new Date(data.anfangsbestandDatum) : null,
        endbestand:          data.endbestand,
        endbestandDatum:     data.endbestandDatum ? new Date(data.endbestandDatum) : null,
        einheit:             data.einheit,
        notizen:             data.notizen,
      },
      update: {
        anfangsbestand:      data.anfangsbestand,
        anfangsbestandDatum: data.anfangsbestandDatum ? new Date(data.anfangsbestandDatum) : undefined,
        endbestand:          data.endbestand,
        endbestandDatum:     data.endbestandDatum ? new Date(data.endbestandDatum) : undefined,
        einheit:             data.einheit,
        notizen:             data.notizen,
      },
    })
  }

  async update(id: string, data: UpdateVerbrauchInput) {
    return this.prisma.verbrauchserfassung.update({
      where: { id },
      data: {
        anfangsbestand:      data.anfangsbestand,
        anfangsbestandDatum: data.anfangsbestandDatum ? new Date(data.anfangsbestandDatum) : undefined,
        endbestand:          data.endbestand,
        endbestandDatum:     data.endbestandDatum ? new Date(data.endbestandDatum) : undefined,
        notizen:             data.notizen,
      },
    })
  }

  // ── Öl-Zukäufe ────────────────────────────────────────────

  async addOelZukauf(verbrauchserfassungId: string, data: CreateOelZukaufInput) {
    return this.prisma.oelZukauf.create({
      data: {
        verbrauchserfassungId,
        kaufdatum:        new Date(data.kaufdatum),
        mengeLiter:       data.mengeLiter,
        preisJeLiter:     data.preisJeLiter,
        preisGesamt:      data.preisGesamt,
        kostenpositionId: data.kostenpositionId,
        notizen:          data.notizen,
      },
    })
  }

  /** Recalculate and persist Verbrauch after adding a Zukauf. */
  async recalculateOelVerbrauch(id: string): Promise<void> {
    const erfassung = await this.prisma.verbrauchserfassung.findUnique({
      where:   { id },
      include: { oelZukaeufe: true },
    })
    if (!erfassung) return

    const { anfangsbestand, endbestand, oelZukaeufe } = erfassung
    const sumZukaeufe = oelZukaeufe.reduce((s, z) => s + Number(z.mengeLiter), 0)

    let verbrauchBerechnet: number | null = null
    let vollstaendigkeitsstatus: 'vollstaendig' | 'kosten_ohne_verbrauch' | 'fehlt' = 'fehlt'
    let formelLog: object | null = null

    if (anfangsbestand !== null && endbestand !== null) {
      const anfang = Number(anfangsbestand)
      const ende   = Number(endbestand)
      verbrauchBerechnet = Math.round((anfang + sumZukaeufe - ende) * 1000) / 1000

      vollstaendigkeitsstatus = 'vollstaendig'
      formelLog = {
        formel:             `${anfang} L + ${sumZukaeufe} L (Zukäufe) − ${ende} L = ${verbrauchBerechnet} L`,
        anfangsbestand:     anfang,
        summeZukaeufe:      sumZukaeufe,
        endbestand:         ende,
        verbrauchBerechnet,
        isNegativ:          verbrauchBerechnet < 0,
      }
    } else if (oelZukaeufe.length > 0) {
      vollstaendigkeitsstatus = 'kosten_ohne_verbrauch'
    }

    await this.prisma.verbrauchserfassung.update({
      where: { id },
      data: {
        verbrauchBerechnet,
        vollstaendigkeitsstatus,
        formelLog: formelLog ?? undefined,
      },
    })
  }
}
