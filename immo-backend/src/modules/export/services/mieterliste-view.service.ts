/**
 * Mieterliste – strukturierte JSON-Antwort für die Web-Ansicht.
 * Gibt Daten nach Firma → Objekt → Einheit gegliedert zurück.
 */
import type { PrismaClient } from '@prisma/client'

function num(v: unknown): number { return Number(v ?? 0) }
function fmt(d: Date | string | null | undefined): string {
  if (!d) return ''
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export interface MieterlisteEinheit {
  einheitId:         string
  bezeichnung:       string
  typ:               string
  etage:             string | null
  m2:                number | null
  mietvertragId:     string | null
  vertragsbeginn:    string
  vertragsende:      string
  laufzeitBis:       string          // formatted
  mieter:            string
  mieterId:          string | null
  kaltmiete:         number
  nkVorauszahlung:   number
  warmmiete:         number
  mieteProM2:        string
  letzteErhoehung:   string
  erhoehungsTyp:     string
  notizen:           string
  istLeer:           boolean
}

export interface MieterlisteObjekt {
  objektId:     string
  bezeichnung:  string
  adresse:      string
  einheiten:    MieterlisteEinheit[]
  sumFlaeche:   number
  sumKalt:      number
  sumNk:        number
  sumWarm:      number
}

export interface MieterlisteFirma {
  firmaId:     string
  firmaName:   string
  objekte:     MieterlisteObjekt[]
  sumFlaeche:  number
  sumKalt:     number
  sumNk:       number
  sumWarm:     number
}

export async function getMieterlisteView(
  prisma: PrismaClient,
  tenantId: string,
): Promise<MieterlisteFirma[]> {
  // 1. Alle Einheiten mit optionalem aktiven MV laden
  const einheiten = await prisma.einheit.findMany({
    where: { tenantId, deletedAt: null },
    include: {
      objekt: { include: { firma: true } },
      mietvertraege: {
        where: { deletedAt: null },
        include: {
          mietvertragMieter: {
            where: { bis: null },
            include: { mieter: true },
            orderBy: { seit: 'desc' },
            take: 1,
          },
          mieterhoehungen: {
            orderBy: { letzteErhoehungDatum: 'desc' },
            take: 1,
          },
        },
        orderBy: { vertragsbeginn: 'desc' },
      },
    },
    orderBy: [
      { objekt: { firma: { name: 'asc' } } },
      { objekt: { bezeichnung: 'asc' } },
      { bezeichnung: 'asc' },
    ],
  })

  // 2. Aktiven MV ermitteln (laufend oder letzter)
  function aktiverMV(mvs: typeof einheiten[0]['mietvertraege']) {
    const heute = new Date()
    const aktiv = mvs.find(mv =>
      new Date(mv.vertragsbeginn) <= heute &&
      (!mv.vertragsende || new Date(mv.vertragsende) >= heute)
    )
    return aktiv ?? mvs[0] ?? null
  }

  // 3. Firma → Objekt → Einheit Struktur aufbauen
  const firmenMap = new Map<string, MieterlisteFirma>()

  for (const einheit of einheiten) {
    const objekt = einheit.objekt
    const firma  = objekt.firma
    if (!firma) continue

    const mv = aktiverMV(einheit.mietvertraege)
    const hauptmieter = mv?.mietvertragMieter[0]?.mieter
    const mieterName  = hauptmieter
      ? [hauptmieter.vorname, hauptmieter.nachname].filter(Boolean).join(' ')
      : '—'

    const kalt   = mv ? num(mv.nettomiete) : 0
    const nk     = mv ? num(mv.nkVorauszahlung) : 0
    const warm   = kalt + nk
    const m2     = einheit.wohnflaecheM2 ? num(einheit.wohnflaecheM2) : null
    const mieteProM2 = m2 && m2 > 0 && kalt > 0
      ? (kalt / m2).toFixed(2)
      : '—'

    const erh = mv?.mieterhoehungen[0]
    const letzteErhoehung = erh?.letzteErhoehungDatum ? fmt(erh.letzteErhoehungDatum) : '—'
    const erhoehungsTyp   = erh?.erhoehungstyp ?? '—'

    const row: MieterlisteEinheit = {
      einheitId:       einheit.id,
      bezeichnung:     einheit.bezeichnung,
      typ:             einheit.einheitenTyp ?? '',
      etage:           einheit.etage ?? null,
      m2,
      mietvertragId:   mv?.id ?? null,
      vertragsbeginn:  mv ? mv.vertragsbeginn.toISOString() : '',
      vertragsende:    mv?.vertragsende ? mv.vertragsende.toISOString() : '',
      laufzeitBis:     mv?.vertragsende ? fmt(mv.vertragsende) : (mv ? 'unbefristet' : '—'),
      mieter:          mieterName,
      mieterId:        hauptmieter?.id ?? null,
      kaltmiete:       kalt,
      nkVorauszahlung: nk,
      warmmiete:       warm,
      mieteProM2,
      letzteErhoehung,
      erhoehungsTyp,
      notizen:         mv?.notizen ?? '',
      istLeer:         !mv || mieterName === '—',
    }

    // Firma sicherstellen
    if (!firmenMap.has(firma.id)) {
      firmenMap.set(firma.id, {
        firmaId: firma.id, firmaName: firma.name,
        objekte: [], sumFlaeche: 0, sumKalt: 0, sumNk: 0, sumWarm: 0,
      })
    }
    const firmaEntry = firmenMap.get(firma.id)!

    // Objekt sicherstellen
    let objektEntry = firmaEntry.objekte.find(o => o.objektId === objekt.id)
    if (!objektEntry) {
      const adr = [objekt.strasse, objekt.hausnummer, objekt.plz, objekt.stadt]
        .filter(Boolean).join(' ')
      objektEntry = {
        objektId: objekt.id, bezeichnung: objekt.bezeichnung, adresse: adr,
        einheiten: [], sumFlaeche: 0, sumKalt: 0, sumNk: 0, sumWarm: 0,
      }
      firmaEntry.objekte.push(objektEntry)
    }

    objektEntry.einheiten.push(row)

    // Summen aktualisieren
    if (m2) objektEntry.sumFlaeche += m2
    objektEntry.sumKalt  += kalt
    objektEntry.sumNk    += nk
    objektEntry.sumWarm  += warm
  }

  // 4. Firma-Summen berechnen
  for (const firma of firmenMap.values()) {
    for (const obj of firma.objekte) {
      firma.sumFlaeche += obj.sumFlaeche
      firma.sumKalt    += obj.sumKalt
      firma.sumNk      += obj.sumNk
      firma.sumWarm    += obj.sumWarm
    }
  }

  return Array.from(firmenMap.values())
    .sort((a, b) => a.firmaName.localeCompare(b.firmaName, 'de'))
}
