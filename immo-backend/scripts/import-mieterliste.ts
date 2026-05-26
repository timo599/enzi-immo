/**
 * Import-Skript: Mieter + Mietverträge aus Excel-Mieterlisten
 * Ausführen: DATABASE_URL=... npx ts-node scripts/import-mieterliste.ts
 */

import { PrismaClient, Mietart } from '@prisma/client'
const prisma = new PrismaClient()

const TENANT = '2df9cc3f-6c2c-48f0-9c56-c8bb5c1b9e3b'

// ── IDs aus DB (gecheckt 26.05.2026) ─────────────────────────────────────────
const OBJEKTE = {
  H107:   'e0cb86ff-63c4-42ab-8253-183745a6f58d',
  WGW:    '6800bf1b-b595-482d-b67a-3524ac50fb1e',  // Wollgrasweg 37
  R152:   'efcf2993-14a4-451c-9830-f403c262646f',
  R154:   '5b9d32c3-b05a-40b5-b6ff-e601ca926cca',
  H182:   '34873991-da63-48c8-a3af-2621bf9148f4',
  H184:   '6f0e4219-f811-4801-b905-77ba40d79816',
  H184a:  'ff6c3330-0359-4665-8c82-4f9a33c154c7',
  H180:   'e6b0f007-9819-465d-8fe6-ff0a71e02ff6',  // NE
  F1:     '57a306aa-78bc-4e47-81cf-8851950d7a40',
  F3:     'c96b52d1-076a-49b2-b6c0-fc3358363ff7',
  F5:     'a5599abc-a906-47eb-98ce-15eef1701c88',
  Z33:    '2009aa0c-96d0-4dab-a83f-41ab6cd6e6e8',
  Z35:    'b668b8f1-e683-4508-b275-07cd6014c8db',
  Z351:   '258736e4-1c50-4793-93f8-7c85f0d7b5b1',
}

const EINHEITEN: Record<string, string> = {
  // H 107
  H107_MOEBELHAUS:       '6a336c3e-f95c-4521-ab6a-0909626875dc',
  // Wollgrasweg
  WGW_UG_FRIESE:         '283f104b-a5e4-45cc-8eed-7e8d20fc8721',
  WGW_UG_ENZ:            '0fffce92-3cec-4f1e-8458-429748fe7c2e',
  WGW_UG_0711:           'b7f835f7-bd16-443f-a168-eefc22bf0172',
  WGW_UG_ARCHIV:         '78ed9537-2ef1-4d32-b22a-be7c0f876965',
  WGW_UG_BUERO_KORTE:    '2b467078-62f2-419d-ac03-d1b0b6ff710f',
  WGW_EG_FRIESE:         '7f3d5a43-9128-4380-9acb-56d76e514d97',
  WGW_EG_HORVATH:        '4edf557a-47ce-433a-9977-5125eab72d96',
  WGW_EG_WENGERT:        'a8ec517a-0058-416b-966c-44e7d2e56a46',
  WGW_EG_LEER:           '9ec2dbc4-1a3d-4e98-903d-547eadd6d9d6',
  WGW_EG_KORTE:          'f2147c93-06ae-49bd-a9a3-07f3f79bb0a1',
  WGW_EG_GIESE:          '62af6b7d-1cc7-4f1d-b01f-40db7d0828b3',
  WGW_EG_GIESE2:         '0d9ddb5e-f71b-4892-bfd6-e44be57e8930',
  WGW_1OG_UNIHOHENHEIM:  '768a16fa-4c62-4597-b438-1d8d6d569ec1',
  WGW_1OG_0711:          '41587802-ff29-4015-8fff-fec31d557b50',
  WGW_1OG_KORTE:         '08a638dd-099b-4a6a-91dd-d3472e52624f',
  WGW_2OG_NCLUB:         'e2f198c3-c057-40ed-a996-dc9353db3ac6',
  WGW_2OG_DIMAH480:      '3b11c903-121a-41e3-b118-54528c603694',
  WGW_3OG_DIMAH805:      '514317d7-4924-48a6-ba57-42357755d4f2',
  WGW_3OG_0711:          '01fb89fc-9164-4f04-a4c0-a37fad2083de',
  WGW_EGUG_KORTE:        'f8b9d7cb-72b8-4932-820d-9940a6c59acd',
  // R 152
  R152_EG:               '1cbfcb34-1b61-4722-95e9-f0eaaef6d826',
  R152_1OG_L:            '134899d0-d08c-4001-a66e-35d6450ec0d8',
  R152_1OG_R:            'cbf52562-5e4b-4d78-a3d5-347d5e78ddb8',
  R152_2OG_L:            '441bc56d-9b78-47ee-aa44-0a3ee4906988',
  R152_2OG_R:            '90f85e1c-13a7-4dc5-a3f9-decb3c5ff353',
  R152_3OG_L:            '01f9d1ce-e7eb-428d-a688-220636dc2a80',
  R152_3OG_R:            '14879e4c-db6e-4bbe-8e66-0adee81b6aa6',
  // R 154
  R154_EG:               '9ca39ad1-e7d5-475f-9738-171845b30b3d',
  R154_UG:               '26fa9a2f-bfac-4b23-86e2-4a8c1a4645a2',
  R154_1OG:              'f8dc64d0-eb8d-4b2e-baf1-5632bf64bced',
  R154_2OG:              '28a69bae-e179-447a-a2b6-6f02945af156',
  R154_3OG_L:            'fe8ee6ea-55da-4a46-8c9d-d637e597a540',
  R154_3OG_R:            '820be0f4-cd75-4983-bda2-13dc1c921946',
  // H 182
  H182_EG_STETTER:       '709f2f65-f0aa-4c95-afff-3aafc9e2f725',
  H182_EG_JANSCHEWSKI:   '0fd57eb5-e4c4-4439-ace6-4453897fb225',
  H182_1OG:              '4d4286b4-05af-4364-965e-25be57debe28',
  H182_2OG:              'ae5877fd-1156-4b7f-839c-f08faaac0505',
  H182_3OG_L:            'ff2e218a-ea79-47ca-9cc1-0a73fea10657',
  H182_3OG_R:            '51d00e4c-8608-4aa0-8a1c-0517dd8a09a0',
  H182_UG:               'eb5a87af-0604-478f-ae97-3b5f25cb2425',
  H182_LAGER_EG:         'eb5a87af-0604-478f-ae97-3b5f25cb2425',
  H182_LAGER_OG:         'cf25ddbd-59c1-42ca-aab7-0ec486a855a5',
  H182_LAGER_UG:         '1d8f7665-fa8d-44a3-8392-4b9dff6f07c1',
  // H 184
  H184_EG:               'fdd6c7eb-e7b5-4084-9f19-f90eaed21b3d',
  H184_1OG:              '1b4d3848-dd05-4529-b9c1-65c43724d27f',
  H184_2OG:              '1d9a3375-da49-46c8-b4e0-a310174ccb18',
  H184_3OG:              'bbee5df1-9962-481c-ae5c-c645d522630c',
  // H 184a
  H184A_1OG:             '0edc0d61-8768-4e0b-877a-e034ef98818d',
  H184A_2OG:             'd6240ed9-b6da-4fae-b3f6-42498de13c1e',
  H184A_3OG:             'a1939de3-1685-4f13-94c3-cffe4de2ad4a',
  // H 180 (NE)
  H180_EG:               '8f475f7d-c4b2-4f6e-90f6-abcae9c928d7',
  H180_1OG_L:            '8afef778-d504-4b44-bb40-3405c8e0d702',
  H180_1OG_R:            '70778182-7b61-4cc3-980c-300d1cae8792',
  H180_2OG_L:            '44273a6c-a2e0-48c3-ad7a-64e2a87cc398',
  H180_2OG_R:            '13db10b8-9f25-4ae7-bca6-d7078ab9ea78',
  H180_3OG_L:            'e61842d9-733e-47bf-bedd-c0ec07d610ff',
  H180_3OG_R:            '63420227-a8c4-42f3-949c-d30907e4d367',
  // F 1 (NE)
  F1_EG:                 'b2a130e0-230f-42a3-bc5d-609baae8663d',
  F1_1OG:                '622ef384-bce3-4ff5-a388-f0b0119fdb92',
  F1_2OG:                '6f383802-6015-4166-8dae-ed235945f1a4',
  F1_3OG:                '0a1bea26-3af8-44bc-81e0-57ff6b11075f',
  // F 3 (NE)
  F3_EG_L:               'f95f034b-6616-4757-a180-67381dec795f',
  F3_EG_R:               '4a722ff6-e773-43bb-9d40-d07eb0a0b324',
  F3_1OG_L:              'a0a4cd4d-95d9-420a-8237-f21c3ab0622e',
  F3_1OG_R:              '972e0a3b-228b-4737-bb70-bcb4018d7468',
  F3_2OG_L:              '8ec40a78-eba2-4f4a-9ea1-380a595a95e9',
  F3_2OG_R:              '7d12529d-4625-4c30-bcf9-96ab8cb06fd9',
  F3_3OG_L:              'e8fbd09f-21cb-452f-97ed-1890fcd33237',
  F3_3OG_R:              'fa70cec1-eafb-46c6-b953-1226bbc80a3d',
  // Z 33 (NC)
  Z33_WHG1:              'd5c02b70-776b-4302-9c71-4df595bf0293',  // Strobel 83qm
  Z33_WHG2:              'b49ad3ff-6095-445e-a887-0d6fe8b5056b',  // Mehovic 75qm → 74.6
  Z33_WHG3:              'a2fe3f33-08a2-4105-ab24-536260016474',  // Schmid 74qm → 73.6
  Z33_EG1OG:             '7e3df9ef-e886-40d4-b256-ecc435ec42c7',  // Wengert Cat. 240qm
  Z33_UG:                'f3be8f4a-2664-4b41-973c-f08ab3df3080',  // ATF Lager
  Z33_MAIN:              '80840e12-ba9a-4393-a537-3ebe24c30e03',  // CCT 2212 qm
  // Z 35 (NC)
  Z35_UG_W:              '11797921-8240-4ae6-854e-cb191ebb313f',  // TDL 82qm
  Z35_UG_S:              '39820292-c127-42ea-b7f4-3ab2cd63c7d6',  // Intamsys 108qm
  Z35_UG_H:              '721e87c9-ec54-4041-96e7-4cb613eca36c',  // Neidlinger 127qm
  Z35_EG:                '8ddea344-1728-4b67-8a81-7e5680df2647',  // Reutter 415qm
  Z35_1OG_R:             'ecc4566c-c457-412c-9dcb-732cf02a9305',  // Müller Martini 220qm
  Z35_1OG_L:             'e6a0b9f0-5414-4761-9ff3-7d8140759ddb',  // Intamsys 210qm
  Z35_1OG_K:             '6eb8cc10-35ce-492f-827e-7ed839e7f2d4',  // Kleinbüro 10qm → Rerko
  Z35_2OG_L:             '919af9e2-704d-47b7-92b6-0f7c098cd274',  // DnA Auto 175qm
  Z35_2OG_R:             'c326cfb8-a19e-45a9-8cd6-bdad55395320',  // 264qm (rechts KB)
  Z35_2OG_K:             'e16b3c9c-4f7d-4f3d-b2d1-cd9e929645c5',  // 2.OG Kleinbüro
  Z35_3OG_L:             '7bd6df68-748e-4a15-b374-2911da849bf9',  // MO 200qm
  Z35_3OG_R:             '68701c4c-5e2a-4ae7-a36f-7c52c84b2188',  // SenKonzept 216qm
  Z35_3OG_K:             '232c425f-7264-4cce-897b-317780882fa0',  // 3.OG Kleinbüro → Scheider
  Z35_4OG:               '7f33c07b-b766-49a1-9c9b-3b5a18c0f157',  // 258qm (leer)
  // Z 35/1 (NC)
  Z351_2OG:              'ce4fa969-5acd-4a2c-80d5-6d02f7ca1257',  // ATF 417qm
  Z351_1OG:              '78341d1d-2f84-4577-bd07-b0bf1ce41ee6',  // Centax 750qm
  Z351_EG:               'c7a53f57-ae55-465d-abdf-edd636d02867',  // YESSS 738qm
  Z351_EG_L:             '7b4c2777-84b8-4dac-9b6b-dfd0caea5ec9',  // Fröhlich 59qm
  Z351_TG:               '17c8899c-5879-40b7-a2f7-bd664301b761',  // TG Stellplätze
}

// ── Mieter-Definitionen ───────────────────────────────────────────────────────
// { key, nachname, vorname?, strasse?, ort? }
const MIETER_DEF = [
  // EN Verwaltung
  { key: 'harlekin',       nachname: 'Harlekin GmbH' },
  { key: 'friese',         nachname: 'Friese Umzüge' },
  { key: 'winery',         nachname: 'Enzmann Winery KG' },
  { key: '0711audio',      nachname: '0711 Audio GmbH' },
  { key: 'warchivbw',      nachname: 'Wirtschaftsarchiv Baden-Württemberg' },
  { key: 'korte',          nachname: 'Korte' },
  { key: 'schwaninger',    nachname: 'Schwaninger' },
  { key: 'horvath',        nachname: 'Horvath' },
  { key: 'wengert',        nachname: 'Wengert' },
  { key: 'maler_giese',    nachname: 'Maler Giese GmbH' },
  { key: 'giese',          nachname: 'Giese' },
  { key: 'unihohenheim',   nachname: 'Universität Hohenheim' },
  { key: 'nclub',          nachname: 'N-Club' },
  { key: 'dimah',          nachname: 'DIMAH GmbH' },
  { key: 'smartgetraenke', nachname: 'Smart Getränke' },
  { key: 'metzger',        nachname: 'Metzger' },
  { key: 'klimajova',      nachname: 'Klimajova' },
  { key: 'gutsche',        nachname: 'Gutsche', vorname: 'Thomas' },
  { key: 'balasko',        nachname: 'Balasko/Klezli' },
  { key: 'hosak',          nachname: 'Hosak' },
  { key: 'papp',           nachname: 'Papp' },
  { key: 'eberle',         nachname: 'Eberle' },
  { key: 'hafner',         nachname: 'Hafner' },
  { key: 'blersch',        nachname: 'Blersch' },
  { key: 'enzmann',        nachname: 'Enzmann' },
  { key: 'eileen',         nachname: 'Eileen (Mieterin)' },
  { key: 'kienast',        nachname: 'Kienast/Racic' },
  { key: 'stetter',        nachname: 'Stetter' },
  { key: 'janschewski',    nachname: 'Janschewski' },
  { key: 'tettenborn',     nachname: 'Tettenborn' },
  { key: 'kolditz',        nachname: 'Kolditz' },
  { key: 'wolf',           nachname: 'Wolf' },
  { key: 'enoumi',         nachname: 'Enoumi' },
  { key: 'gerhard',        nachname: 'Gerhard' },
  { key: 'iffland',        nachname: 'Iffland' },
  { key: 'teige',          nachname: 'Teige' },
  { key: 'krumhausen',     nachname: 'Krumhausen' },
  { key: 'hahnfuchs',      nachname: 'Hahn & Fuchs' },
  { key: 'martens',        nachname: 'Martens' },
  { key: 'ramani',         nachname: 'Ramani Lager UG' },
  { key: 'dacosta',        nachname: 'Da Costa' },
  { key: 'buhl',           nachname: 'Buhl' },
  // NE Invest
  { key: 'brunetti',       nachname: 'Brunetti (Restaurant)' },
  { key: 'brunetti_wohn',  nachname: 'Brunetti', vorname: '(Wohnen)' },
  { key: 'gregusova',      nachname: 'Gregusova' },
  { key: 'uhlig',          nachname: 'Uhlig' },
  { key: 'refki',          nachname: 'Refki' },
  { key: 'rauch',          nachname: 'Rauch' },
  { key: 'sigl',           nachname: 'Sigl/Ladner' },
  { key: 'weiss',          nachname: 'Weiss' },
  { key: 'pacyna',         nachname: 'Pacyna' },
  { key: 'schlicht',       nachname: 'Schlicht/Cuhlmann' },
  { key: 'houston',        nachname: 'WG Houston/Treby' },
  { key: 'witkowiak',      nachname: 'Witkowiak' },
  { key: 'schwyrz',        nachname: 'Schwyrz' },
  { key: 'bayer',          nachname: 'Bayer' },
  { key: 'szloboda',       nachname: 'Szloboda' },
  { key: 'budink',         nachname: 'Budink' },
  { key: 'reiff',          nachname: 'Reiff/Amer' },
  { key: 'durso',          nachname: "D'Urso" },
  { key: 'tutic',          nachname: 'Tutic' },
  { key: 'brachmann',      nachname: 'Brachmann' },
  { key: 'singert',        nachname: 'Singert' },
  { key: 'foerster',       nachname: 'Förster' },
  // NC Verwaltung
  { key: 'cct',            nachname: 'CCT GmbH' },
  { key: 'atf',            nachname: 'ATF GmbH' },
  { key: 'wengert_cat',    nachname: 'Wengert Cat.' },
  { key: 'strobel',        nachname: 'Strobel' },
  { key: 'mehovic',        nachname: 'Mehovic' },
  { key: 'schmid_nc',      nachname: 'Schmid' },
  { key: 'tdl',            nachname: 'TDL GmbH' },
  { key: 'intamsys',       nachname: 'Intamsys' },
  { key: 'neidlinger',     nachname: 'Neidlinger' },
  { key: 'reutter',        nachname: 'Reutter' },
  { key: 'muellermartini', nachname: 'Müller Martini' },
  { key: 'dna_auto',       nachname: 'DnA Auto' },
  { key: 'salini',         nachname: 'Salini' },
  { key: 'asm',            nachname: 'ASM' },
  { key: 'eyegents',       nachname: 'Eye Gents Böhm' },
  { key: 'werboro',        nachname: 'WERBORO' },
  { key: 'wengert_z35',    nachname: 'Wengert (Z35)' },
  { key: 'gbma',           nachname: 'GBMA' },
  { key: 'mo',             nachname: 'MO' },
  { key: 'senkonzept',     nachname: 'SenKonzept' },
  { key: 'scheider',       nachname: 'Scheider' },
  { key: 'rerko',          nachname: 'Rerko', vorname: 'Milan' },
  { key: 'centax',         nachname: 'Centax GmbH' },
  { key: 'yesss',          nachname: 'YESSS Elektro' },
  { key: 'froelich',       nachname: 'Fröhlich' },
  { key: 'aws',            nachname: 'AWS' },
  { key: 'lk',             nachname: 'L+K' },
  { key: 'schnuepke',      nachname: 'Schnüpke' },
  { key: 'seibold',        nachname: 'Seibold' },
  { key: 'kelm',           nachname: 'Kelm' },
  { key: 'leonhardt',      nachname: 'Leonhardt' },
]

// ── Mietvertrags-Definitionen ─────────────────────────────────────────────────
// { einheitKey, mieterKey, mietart, beginn, netto, nk, lz?, indexKlausel?, notizen? }
const MV_DEF: Array<{
  einheitKey: string
  mieterKey: string
  mietart: Mietart
  beginn: string
  netto: number
  nk: number
  lz?: string
  notizen?: string
}> = [
  // ── EN: H 107 ───────────────────────────────────────────────────────────
  { einheitKey: 'H107_MOEBELHAUS', mieterKey: 'harlekin', mietart: 'gewerbe',
    beginn: '2010-10-01', netto: 48942.20, nk: 6500, lz: '10 J', notizen: '6000 qm + 64 TG, ab 01.04.2024 8,16 €/qm' },

  // ── EN: Wollgrasweg ─────────────────────────────────────────────────────
  { einheitKey: 'WGW_UG_FRIESE',      mieterKey: 'friese',       mietart: 'gewerbe', beginn: '2020-08-01', netto: 1791, nk: 278.60 },
  { einheitKey: 'WGW_UG_ENZ',         mieterKey: 'winery',       mietart: 'gewerbe', beginn: '2020-08-01', netto: 0, nk: 0, notizen: '212 qm – Miete intern' },
  { einheitKey: 'WGW_UG_0711',        mieterKey: '0711audio',    mietart: 'gewerbe', beginn: '2020-08-01', netto: 765, nk: 256.20 },
  { einheitKey: 'WGW_UG_ARCHIV',      mieterKey: 'warchivbw',    mietart: 'gewerbe', beginn: '2019-01-01', netto: 3520, nk: 1400, lz: '5 J', notizen: '2x 500 qm, o.MwSt.' },
  { einheitKey: 'WGW_UG_BUERO_KORTE', mieterKey: 'korte',        mietart: 'gewerbe', beginn: '2016-06-01', netto: 350, nk: 80, notizen: '41 qm, 2 Stlp. à 75 € inkl.' },
  { einheitKey: 'WGW_EG_FRIESE',      mieterKey: 'friese',       mietart: 'gewerbe', beginn: '2010-12-01', netto: 1620, nk: 765, notizen: '2 Stlp.' },
  { einheitKey: 'WGW_EG_HORVATH',     mieterKey: 'horvath',      mietart: 'gewerbe', beginn: '2017-09-01', netto: 525, nk: 105 },
  { einheitKey: 'WGW_EG_WENGERT',     mieterKey: 'wengert',      mietart: 'gewerbe', beginn: '2017-10-01', netto: 205, nk: 40 },
  { einheitKey: 'WGW_EG_KORTE',       mieterKey: 'korte',        mietart: 'gewerbe', beginn: '2017-09-01', netto: 1095, nk: 240, notizen: '2 Stlp. inkl.' },
  { einheitKey: 'WGW_EG_GIESE',       mieterKey: 'maler_giese',  mietart: 'gewerbe', beginn: '2020-01-01', netto: 3252, nk: 551.50, notizen: '6 Stlp. inkl. je 35 €' },
  { einheitKey: 'WGW_EG_GIESE2',      mieterKey: 'giese',        mietart: 'gewerbe', beginn: '2019-10-01', netto: 144, nk: 41, notizen: 'ab 27 +10%' },
  { einheitKey: 'WGW_1OG_UNIHOHENHEIM', mieterKey: 'unihohenheim', mietart: 'gewerbe', beginn: '2021-08-01', netto: 7783, nk: 1880 },
  { einheitKey: 'WGW_1OG_0711',       mieterKey: '0711audio',    mietart: 'gewerbe', beginn: '2022-01-01', netto: 800, nk: 250 },
  { einheitKey: 'WGW_1OG_KORTE',      mieterKey: 'korte',        mietart: 'gewerbe', beginn: '2020-06-01', netto: 777, nk: 420 },
  { einheitKey: 'WGW_2OG_NCLUB',      mieterKey: 'nclub',        mietart: 'gewerbe', beginn: '2017-08-01', netto: 1442, nk: 0 },
  { einheitKey: 'WGW_2OG_DIMAH480',   mieterKey: 'dimah',        mietart: 'gewerbe', beginn: '2021-03-01', netto: 2880, nk: 480 },
  { einheitKey: 'WGW_3OG_DIMAH805',   mieterKey: 'dimah',        mietart: 'gewerbe', beginn: '2019-09-01', netto: 3600, nk: 760 },
  { einheitKey: 'WGW_3OG_0711',       mieterKey: '0711audio',    mietart: 'gewerbe', beginn: '2019-11-01', netto: 2400, nk: 600 },
  { einheitKey: 'WGW_EGUG_KORTE',     mieterKey: 'korte',        mietart: 'gewerbe', beginn: '2019-05-01', netto: 255.50, nk: 101.50, notizen: 'EG+UG 24+19 qm, 1 Stlp. inkl.' },

  // ── EN: R 152 ───────────────────────────────────────────────────────────
  { einheitKey: 'R152_EG',   mieterKey: 'smartgetraenke', mietart: 'gewerbe', beginn: '2020-03-01', netto: 1200, nk: 300, notizen: 'Außenlager +120 € (seit 03/24)' },
  { einheitKey: 'R152_1OG_L', mieterKey: 'metzger',     mietart: 'gewerbe', beginn: '2020-04-01', netto: 1050, nk: 115 },
  { einheitKey: 'R152_1OG_R', mieterKey: 'klimajova',   mietart: 'gewerbe', beginn: '2021-11-01', netto: 775, nk: 125, notizen: 'Staffel' },
  { einheitKey: 'R152_2OG_L', mieterKey: 'gutsche',     mietart: 'wohnen',  beginn: '2022-06-01', netto: 554, nk: 146, notizen: 'inkl. NK, abzgl. 40 €' },
  { einheitKey: 'R152_2OG_R', mieterKey: 'balasko',     mietart: 'wohnen',  beginn: '2020-06-01', netto: 747.50, nk: 130, notizen: 'abzgl. 120 € R154 / 84 € R152' },
  { einheitKey: 'R152_3OG_L', mieterKey: 'hosak',       mietart: 'wohnen',  beginn: '2021-09-01', netto: 1100, nk: 120 },
  { einheitKey: 'R152_3OG_R', mieterKey: 'papp',        mietart: 'wohnen',  beginn: '2021-03-01', netto: 805, nk: 130 },

  // ── EN: R 154 ───────────────────────────────────────────────────────────
  { einheitKey: 'R154_EG',   mieterKey: 'eberle',   mietart: 'gewerbe', beginn: '2020-08-01', netto: 2660, nk: 500 },
  { einheitKey: 'R154_UG',   mieterKey: 'hafner',   mietart: 'gewerbe', beginn: '2021-04-01', netto: 1440, nk: 338.40 },
  { einheitKey: 'R154_1OG',  mieterKey: 'blersch',  mietart: 'gewerbe', beginn: '2020-06-01', netto: 1895, nk: 649.99 },
  { einheitKey: 'R154_2OG',  mieterKey: 'enzmann',  mietart: 'gewerbe', beginn: '2009-08-01', netto: 530, nk: 495 },
  { einheitKey: 'R154_3OG_L', mieterKey: 'eileen',  mietart: 'wohnen',  beginn: '2022-06-01', netto: 1500, nk: 400 },
  { einheitKey: 'R154_3OG_R', mieterKey: 'kienast', mietart: 'wohnen',  beginn: '2000-01-01', netto: 1250, nk: 300 },

  // ── EN: H 182 ───────────────────────────────────────────────────────────
  { einheitKey: 'H182_EG_JANSCHEWSKI', mieterKey: 'janschewski', mietart: 'gewerbe', beginn: '2011-02-01', netto: 995, nk: 249, notizen: 'Stlp. 30 €' },
  { einheitKey: 'H182_1OG',    mieterKey: 'tettenborn', mietart: 'gewerbe', beginn: '2019-11-01', netto: 1322.50, nk: 300 },
  { einheitKey: 'H182_2OG',    mieterKey: 'kolditz',    mietart: 'gewerbe', beginn: '2019-11-01', netto: 906, nk: 210 },
  { einheitKey: 'H182_3OG_L',  mieterKey: 'wolf',       mietart: 'wohnen',  beginn: '2022-02-01', netto: 850, nk: 150 },
  { einheitKey: 'H182_3OG_R',  mieterKey: 'enoumi',     mietart: 'wohnen',  beginn: '2020-08-01', netto: 600, nk: 100 },
  { einheitKey: 'H182_UG',     mieterKey: 'gerhard',    mietart: 'gewerbe', beginn: '2022-03-01', netto: 90, nk: 0 },

  // ── EN: H 184 ───────────────────────────────────────────────────────────
  { einheitKey: 'H184_EG',  mieterKey: 'iffland',    mietart: 'gewerbe', beginn: '1997-11-01', netto: 2147.42, nk: 300, notizen: 'ab 01/23, Plus Rate Fenster 395,14 €' },
  { einheitKey: 'H184_1OG', mieterKey: 'teige',      mietart: 'wohnen',  beginn: '2019-11-01', netto: 807, nk: 150 },
  { einheitKey: 'H184_2OG', mieterKey: 'krumhausen', mietart: 'wohnen',  beginn: '2020-06-01', netto: 862.50, nk: 200, notizen: 'Stlp. 50 €' },
  { einheitKey: 'H184_3OG', mieterKey: 'hahnfuchs',  mietart: 'wohnen',  beginn: '2022-04-01', netto: 1050, nk: 250 },

  // ── EN: H 184a ──────────────────────────────────────────────────────────
  { einheitKey: 'H184A_1OG', mieterKey: 'martens',  mietart: 'wohnen',  beginn: '2020-05-01', netto: 1000, nk: 190, notizen: 'Ramani Lager UG 252,10 € ab 2010' },
  { einheitKey: 'H184A_2OG', mieterKey: 'dacosta',  mietart: 'wohnen',  beginn: '2019-11-01', netto: 435, nk: 86 },
  { einheitKey: 'H184A_3OG', mieterKey: 'buhl',     mietart: 'wohnen',  beginn: '2019-11-01', netto: 553, nk: 0, notizen: 'inkl. NK' },

  // ── NE: H 180 ───────────────────────────────────────────────────────────
  { einheitKey: 'H180_EG',   mieterKey: 'brunetti',      mietart: 'gewerbe', beginn: '2021-02-01', netto: 1538, nk: 239 },
  { einheitKey: 'H180_1OG_L', mieterKey: 'brunetti_wohn', mietart: 'wohnen', beginn: '2021-11-01', netto: 790, nk: 145 },
  { einheitKey: 'H180_1OG_R', mieterKey: 'gregusova',    mietart: 'wohnen',  beginn: '2021-11-01', netto: 608, nk: 125 },
  { einheitKey: 'H180_2OG_L', mieterKey: 'uhlig',        mietart: 'wohnen',  beginn: '2020-01-01', netto: 900, nk: 130 },
  { einheitKey: 'H180_2OG_R', mieterKey: 'refki',        mietart: 'wohnen',  beginn: '2021-11-01', netto: 450, nk: 110 },
  { einheitKey: 'H180_3OG_L', mieterKey: 'sigl',         mietart: 'wohnen',  beginn: '2022-01-01', netto: 630, nk: 110 },
  { einheitKey: 'H180_3OG_R', mieterKey: 'rauch',        mietart: 'wohnen',  beginn: '2022-02-01', netto: 980, nk: 165 },

  // ── NE: F 1 ─────────────────────────────────────────────────────────────
  { einheitKey: 'F1_EG',  mieterKey: 'weiss',   mietart: 'wohnen', beginn: '2021-10-01', netto: 800, nk: 120 },
  { einheitKey: 'F1_1OG', mieterKey: 'pacyna',  mietart: 'wohnen', beginn: '2022-01-01', netto: 790, nk: 125 },
  { einheitKey: 'F1_2OG', mieterKey: 'schlicht',mietart: 'wohnen', beginn: '2022-01-01', netto: 759, nk: 125 },
  { einheitKey: 'F1_3OG', mieterKey: 'houston', mietart: 'wohnen', beginn: '2020-06-01', netto: 770, nk: 120 },

  // ── NE: F 3 ─────────────────────────────────────────────────────────────
  { einheitKey: 'F3_EG_L',  mieterKey: 'witkowiak', mietart: 'wohnen', beginn: '2022-07-01', netto: 600, nk: 85 },
  { einheitKey: 'F3_EG_R',  mieterKey: 'schwyrz',   mietart: 'wohnen', beginn: '2020-06-01', netto: 609.50, nk: 90.50 },
  { einheitKey: 'F3_1OG_L', mieterKey: 'bayer',     mietart: 'wohnen', beginn: '2020-04-01', netto: 790, nk: 95 },
  { einheitKey: 'F3_1OG_R', mieterKey: 'szloboda',  mietart: 'wohnen', beginn: '2020-06-01', netto: 632.50, nk: 95 },
  { einheitKey: 'F3_2OG_L', mieterKey: 'budink',    mietart: 'wohnen', beginn: '2020-04-01', netto: 600, nk: 95 },
  { einheitKey: 'F3_2OG_R', mieterKey: 'reiff',     mietart: 'wohnen', beginn: '2020-01-01', netto: 690, nk: 95 },
  { einheitKey: 'F3_3OG_L', mieterKey: 'durso',     mietart: 'wohnen', beginn: '2021-11-01', netto: 483, nk: 90 },
  { einheitKey: 'F3_3OG_R', mieterKey: 'tutic',     mietart: 'wohnen', beginn: '2021-11-01', netto: 483, nk: 90 },

  // ── NE: F 5 (Stellplätze) ───────────────────────────────────────────────
  // F5 hat keine Einheiten in der DB → überspringen

  // ── NC: Z 33 ────────────────────────────────────────────────────────────
  { einheitKey: 'Z33_MAIN',   mieterKey: 'cct',         mietart: 'gewerbe', beginn: '2018-01-01', netto: 18000, nk: 9000, lz: 'bis 30.06.2023', notizen: '2878 qm = 2212+666' },
  { einheitKey: 'Z33_UG',     mieterKey: 'atf',         mietart: 'gewerbe', beginn: '2023-09-01', netto: 3155, nk: 615, notizen: '615 qm: 410+100+105' },
  { einheitKey: 'Z33_EG1OG',  mieterKey: 'wengert_cat', mietart: 'gewerbe', beginn: '2019-10-01', netto: 2225, nk: 1100, notizen: 'ab 10/24' },
  { einheitKey: 'Z33_WHG1',   mieterKey: 'strobel',     mietart: 'wohnen',  beginn: '2023-11-01', netto: 581, nk: 570 },
  { einheitKey: 'Z33_WHG2',   mieterKey: 'mehovic',     mietart: 'wohnen',  beginn: '2018-08-01', netto: 675, nk: 190 },
  { einheitKey: 'Z33_WHG3',   mieterKey: 'schmid_nc',   mietart: 'wohnen',  beginn: '2023-11-01', netto: 333, nk: 270 },

  // ── NC: Z 35 ────────────────────────────────────────────────────────────
  { einheitKey: 'Z35_UG_W',  mieterKey: 'tdl',           mietart: 'gewerbe', beginn: '2022-01-01', netto: 490, nk: 163 },
  { einheitKey: 'Z35_UG_S',  mieterKey: 'intamsys',      mietart: 'gewerbe', beginn: '2021-08-01', netto: 594, nk: 220, lz: 'bis 31.07.2024' },
  { einheitKey: 'Z35_UG_H',  mieterKey: 'neidlinger',    mietart: 'gewerbe', beginn: '2025-11-01', netto: 762, nk: 127 },
  { einheitKey: 'Z35_EG',    mieterKey: 'reutter',       mietart: 'gewerbe', beginn: '2022-03-01', netto: 2150, nk: 650, lz: 'bis 29.02.2024' },
  { einheitKey: 'Z35_1OG_R', mieterKey: 'muellermartini',mietart: 'gewerbe', beginn: '2018-06-01', netto: 1831.36, nk: 700, lz: 'bis 31.05.2028' },
  { einheitKey: 'Z35_1OG_L', mieterKey: 'intamsys',      mietart: 'gewerbe', beginn: '2022-08-01', netto: 1835, nk: 400, lz: 'bis 31.07.2024', notizen: 'NK 1650' },
  { einheitKey: 'Z35_1OG_K', mieterKey: 'rerko',         mietart: 'gewerbe', beginn: '2025-09-01', netto: 70, nk: 45, notizen: '10 m²' },
  { einheitKey: 'Z35_2OG_L', mieterKey: 'dna_auto',      mietart: 'gewerbe', beginn: '2024-06-01', netto: 1150, nk: 437.50, notizen: 'Staffel 06/25' },
  { einheitKey: 'Z35_2OG_K', mieterKey: 'salini',        mietart: 'gewerbe', beginn: '2026-07-01', netto: 690, nk: 225 },
  { einheitKey: 'Z35_3OG_K', mieterKey: 'asm',           mietart: 'gewerbe', beginn: '2022-08-01', netto: 288.50, nk: 77.50, notizen: '37 m²' },
  // { einheitKey: 'Z35_3OG_?', mieterKey: 'eyegents',   mietart: 'gewerbe', ... } // bis 09/23
  { einheitKey: 'Z35_3OG_R', mieterKey: 'senkonzept',    mietart: 'gewerbe', beginn: '2023-07-01', netto: 1803, nk: 475.20, lz: 'bis 30.06.2028', notizen: 'ab 01.07.25: 1911 €' },
  { einheitKey: 'Z35_3OG_L', mieterKey: 'mo',            mietart: 'gewerbe', beginn: '2024-12-18', netto: 1875, nk: 175 },

  // ── NC: Z 35/1 ──────────────────────────────────────────────────────────
  { einheitKey: 'Z351_2OG',  mieterKey: 'atf',    mietart: 'gewerbe', beginn: '2026-03-01', netto: 3342.50, nk: 700, notizen: '417 m²' },
  { einheitKey: 'Z351_1OG',  mieterKey: 'centax', mietart: 'gewerbe', beginn: '2026-01-01', netto: 4750, nk: 1500, notizen: 'Index-Klausel' },
  { einheitKey: 'Z351_EG',   mieterKey: 'yesss',  mietart: 'gewerbe', beginn: '2026-01-01', netto: 5250, nk: 1400, notizen: 'Index-Klausel' },
  { einheitKey: 'Z351_EG_L', mieterKey: 'froelich',mietart: 'gewerbe', beginn: '2018-10-01', netto: 206.50, nk: 59 },
]

async function main() {
  console.log('🚀 Import Mieterliste...')

  // ── Mieter anlegen ───────────────────────────────────────────────────────
  console.log('\n📋 Lege Mieter an...')
  const mieterMap: Record<string, string> = {}

  for (const m of MIETER_DEF) {
    const created = await prisma.mieter.create({
      data: {
        tenantId:  TENANT,
        nachname:  m.nachname,
        vorname:   (m as any).vorname ?? null,
        strasse:   null,
        notizen:   null,
      },
    })
    mieterMap[m.key] = created.id
    console.log(`  ✓ ${m.nachname} → ${created.id}`)
  }

  // ── Mietverträge anlegen ─────────────────────────────────────────────────
  console.log('\n📄 Lege Mietverträge an...')
  let created = 0, skipped = 0

  for (const mv of MV_DEF) {
    const einheitId = EINHEITEN[mv.einheitKey]
    const mieterId  = mieterMap[mv.mieterKey]
    if (!einheitId) { console.warn(`  ⚠ Einheit nicht gefunden: ${mv.einheitKey}`); skipped++; continue }
    if (!mieterId)  { console.warn(`  ⚠ Mieter nicht gefunden: ${mv.mieterKey}`);  skipped++; continue }

    // Check ob schon ein aktiver Vertrag existiert
    const existing = await prisma.mietvertrag.findFirst({
      where: { einheitId, deletedAt: null },
    })
    if (existing) {
      console.log(`  ⏭ ${mv.einheitKey}: Vertrag existiert bereits`)
      // Update Mieter in MietvertragMieter
      await prisma.mietvertragMieter.upsert({
        where: { mietvertragId_mieterId: { mietvertragId: existing.id, mieterId } },
        create: { mietvertragId: existing.id, mieterId, rolle: 'hauptmieter', seit: new Date(mv.beginn) },
        update: {},
      })
      skipped++
      continue
    }

    const vertrag = await prisma.mietvertrag.create({
      data: {
        tenantId:       TENANT,
        einheitId,
        mietart:        mv.mietart,
        vertragsbeginn: new Date(mv.beginn),
        nettomiete:     mv.netto,
        nkVorauszahlung: mv.nk,
        notizen:        mv.lz ? `LZ: ${mv.lz}${mv.notizen ? ' | ' + mv.notizen : ''}` : (mv.notizen ?? null),
      },
    })
    await prisma.mietvertragMieter.create({
      data: {
        mietvertragId: vertrag.id,
        mieterId,
        rolle: 'hauptmieter',
        seit:  new Date(mv.beginn),
      },
    })
    console.log(`  ✓ ${mv.einheitKey} → ${mv.mieterKey}: ${mv.netto} €`)
    created++
  }

  console.log(`\n✅ Import abgeschlossen: ${created} Verträge angelegt, ${skipped} übersprungen`)
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
