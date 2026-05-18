import { PrismaClient } from '@prisma/client'
import { createHmac, randomBytes, scryptSync } from 'crypto'

const prisma = new PrismaClient()

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

async function main() {
  console.log('Seeding development data...')

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'nc-verwaltung' },
    update: {},
    create: { name: 'NCVerwaltung', slug: 'nc-verwaltung', plan: 'professional' },
  })

  const admin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'NCVerwaltung' } },
    update: { passwordHash: hashPassword('balou') },
    create: {
      tenantId: tenant.id,
      email: 'NCVerwaltung',
      passwordHash: hashPassword('balou'),
      vorname: 'NC',
      nachname: 'Verwaltung',
      rolle: 'admin',
    },
  })

  // Demo-Objekt + -Einheit nur anlegen wenn der Tenant komplett leer ist
  // (verhindert Demo-Daten-Rauschen bei bestehenden Tenants).
  const existingObjekte = await prisma.objekt.count({ where: { tenantId: tenant.id } })
  if (existingObjekte === 0) {
    const objekt = await prisma.objekt.create({
      data: {
        id: '00000000-0000-0000-0000-000000000001',
        tenantId: tenant.id,
        erstelltVon: admin.id,
        bezeichnung: 'Musterstraße 12',
        strasse: 'Musterstraße',
        hausnummer: '12',
        plz: '70173',
        stadt: 'Stuttgart',
        bundesland: 'Baden-Württemberg',
        baujahr: 1978,
        heizungsart: 'gas',
        wohnflaecheGesamtM2: 580.0,
      },
    })
    await prisma.einheit.create({
      data: {
        id: '00000000-0000-0000-0000-000000000002',
        tenantId: tenant.id,
        objektId: objekt.id,
        bezeichnung: 'Wohnung 1 – EG links',
        einheitenTyp: 'wohnung',
        wohnflaecheM2: 72.5,
        etage: 'EG',
      },
    })
    console.log(`Demo-Objekt + Einheit angelegt`)
  } else {
    console.log(`Tenant hat bereits ${existingObjekte} Objekte — Demo-Objekt übersprungen`)
  }

  // ─── Standard-Kostenarten (idempotent, nur wenn noch nicht vorhanden) ──────
  const STANDARD_KOSTENARTEN: Array<{
    kuerzel: string
    bezeichnung: string
    umlagefaehig: 'ja' | 'nein' | 'teilweise'
    schluesselStandard:
      | 'wohnflaeche'
      | 'mea'
      | 'verbrauch'
      | 'personenzahl'
      | 'einheiten'
      | 'individuell'
    heizkvRelevant?: boolean
  }> = [
    { kuerzel: 'HEIZ', bezeichnung: 'Heizung & Warmwasser', umlagefaehig: 'ja',   schluesselStandard: 'verbrauch',   heizkvRelevant: true  },
    { kuerzel: 'WAS',  bezeichnung: 'Wasser & Abwasser',    umlagefaehig: 'ja',   schluesselStandard: 'verbrauch'                          },
    { kuerzel: 'STR',  bezeichnung: 'Strom Allgemein',      umlagefaehig: 'ja',   schluesselStandard: 'wohnflaeche'                        },
    { kuerzel: 'MUEL', bezeichnung: 'Müllabfuhr',           umlagefaehig: 'ja',   schluesselStandard: 'einheiten'                          },
    { kuerzel: 'HAUS', bezeichnung: 'Hausmeister',          umlagefaehig: 'ja',   schluesselStandard: 'wohnflaeche'                        },
    { kuerzel: 'REIN', bezeichnung: 'Reinigung',            umlagefaehig: 'ja',   schluesselStandard: 'wohnflaeche'                        },
    { kuerzel: 'GART', bezeichnung: 'Gartenpflege',         umlagefaehig: 'ja',   schluesselStandard: 'wohnflaeche'                        },
    { kuerzel: 'AUFZ', bezeichnung: 'Aufzug',               umlagefaehig: 'ja',   schluesselStandard: 'wohnflaeche'                        },
    { kuerzel: 'GVER', bezeichnung: 'Gebäudeversicherung',  umlagefaehig: 'ja',   schluesselStandard: 'wohnflaeche'                        },
    { kuerzel: 'GST',  bezeichnung: 'Grundsteuer',          umlagefaehig: 'ja',   schluesselStandard: 'wohnflaeche'                        },
    { kuerzel: 'WART', bezeichnung: 'Wartung',              umlagefaehig: 'ja',   schluesselStandard: 'wohnflaeche'                        },
    { kuerzel: 'VERW', bezeichnung: 'Verwaltung',           umlagefaehig: 'nein', schluesselStandard: 'wohnflaeche'                        },
    { kuerzel: 'INST', bezeichnung: 'Instandhaltung',       umlagefaehig: 'nein', schluesselStandard: 'wohnflaeche'                        },
    { kuerzel: 'SCHO', bezeichnung: 'Schornsteinfeger',     umlagefaehig: 'ja',   schluesselStandard: 'einheiten'                          },
    { kuerzel: 'SONS', bezeichnung: 'Sonstige umlagefähige Kosten', umlagefaehig: 'ja', schluesselStandard: 'wohnflaeche'                  },
  ]

  for (const k of STANDARD_KOSTENARTEN) {
    await prisma.kostenart.upsert({
      where: { tenantId_kuerzel: { tenantId: tenant.id, kuerzel: k.kuerzel } },
      update: {},
      create: {
        tenantId:           tenant.id,
        kuerzel:            k.kuerzel,
        bezeichnung:        k.bezeichnung,
        umlagefaehig:       k.umlagefaehig,
        schluesselStandard: k.schluesselStandard,
        heizkvRelevant:     k.heizkvRelevant ?? false,
        systemVordefiniert: true,
        aktiv:              true,
      },
    })
  }

  console.log(`Seeded tenant: ${tenant.slug}`)
  console.log(`Admin user: NCVerwaltung / balou`)
  console.log(`Standard-Kostenarten: ${STANDARD_KOSTENARTEN.length}`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
