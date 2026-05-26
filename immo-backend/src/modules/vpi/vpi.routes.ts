import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

/**
 * VPI-Tabelle (Österreich, Basis 2020=100)
 * Quelle: Statistik Austria — regelmäßig zu aktualisieren
 */
const VPI_TABELLE: Record<string, number> = {
  '2020-01': 99.3,  '2020-02': 99.7,  '2020-03': 100.2, '2020-04': 99.2,
  '2020-05': 99.0,  '2020-06': 99.4,  '2020-07': 99.8,  '2020-08': 100.0,
  '2020-09': 100.5, '2020-10': 100.5, '2020-11': 100.5, '2020-12': 101.0,
  '2021-01': 101.0, '2021-02': 101.4, '2021-03': 102.1, '2021-04': 102.5,
  '2021-05': 102.9, '2021-06': 103.5, '2021-07': 104.0, '2021-08': 104.3,
  '2021-09': 104.8, '2021-10': 105.4, '2021-11': 105.9, '2021-12': 107.0,
  '2022-01': 107.6, '2022-02': 108.5, '2022-03': 111.0, '2022-04': 112.5,
  '2022-05': 113.5, '2022-06': 114.8, '2022-07': 114.9, '2022-08': 115.4,
  '2022-09': 116.3, '2022-10': 117.4, '2022-11': 118.0, '2022-12': 119.1,
  '2023-01': 120.5, '2023-02': 121.3, '2023-03': 122.4, '2023-04': 122.8,
  '2023-05': 123.0, '2023-06': 122.9, '2023-07': 123.1, '2023-08': 123.5,
  '2023-09': 124.0, '2023-10': 124.3, '2023-11': 124.1, '2023-12': 124.5,
  '2024-01': 125.0, '2024-02': 125.5, '2024-03': 125.8, '2024-04': 126.0,
  '2024-05': 126.2, '2024-06': 126.3, '2024-07': 126.5, '2024-08': 126.6,
  '2024-09': 126.8, '2024-10': 127.0, '2024-11': 127.1, '2024-12': 127.3,
  '2025-01': 127.5, '2025-02': 127.8, '2025-03': 128.0, '2025-04': 128.2,
  '2025-05': 128.4, '2025-06': 128.5, '2025-07': 128.7, '2025-08': 128.9,
  '2025-09': 129.0, '2025-10': 129.2, '2025-11': 129.3, '2025-12': 129.5,
}

export const vpiRoutes: FastifyPluginAsync = async (fastify) => {
  const auth = { preHandler: [fastify.authenticate] }

  /** GET /vpi/tabelle — verfügbare Monate + Werte */
  fastify.get('/tabelle', auth, async (_req, reply) => {
    const entries = Object.entries(VPI_TABELLE).map(([monat, wert]) => ({ monat, wert }))
    return reply.send({ data: entries })
  })

  /**
   * POST /vpi/berechnung
   * body: { basisMonat, aktuellerMonat, aktuelleNettomiete }
   * Berechnet neue Miete nach VPI-Indexierung (österreichisches Recht)
   */
  fastify.post('/berechnung', auth, async (req: any, reply) => {
    const Body = z.object({
      basisMonat:        z.string().regex(/^\d{4}-\d{2}$/),
      aktuellerMonat:    z.string().regex(/^\d{4}-\d{2}$/),
      aktuelleNettomiete: z.number().positive(),
      schwellenwert:     z.number().min(0).max(100).default(5),
    })
    const { basisMonat, aktuellerMonat, aktuelleNettomiete, schwellenwert } = Body.parse(req.body)

    const basisWert = VPI_TABELLE[basisMonat]
    const aktuellerWert = VPI_TABELLE[aktuellerMonat]

    if (!basisWert) return reply.status(422).send({ error: `Kein VPI-Wert für ${basisMonat}` })
    if (!aktuellerWert) return reply.status(422).send({ error: `Kein VPI-Wert für ${aktuellerMonat}` })

    const veraenderungProzent = ((aktuellerWert - basisWert) / basisWert) * 100
    const berechtigt = Math.abs(veraenderungProzent) >= schwellenwert

    const neueMiete = aktuelleNettomiete * (aktuellerWert / basisWert)
    const differenz = neueMiete - aktuelleNettomiete

    return reply.send({
      data: {
        basisMonat,
        basisWert,
        aktuellerMonat,
        aktuellerWert,
        veraenderungProzent: Math.round(veraenderungProzent * 100) / 100,
        berechtigt,
        schwellenwert,
        aktuelleNettomiete,
        neueMiete:  Math.round(neueMiete * 100) / 100,
        differenz:  Math.round(differenz * 100) / 100,
      },
    })
  })
}
