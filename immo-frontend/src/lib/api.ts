import axios from 'axios'

// API geht über Next.js-Reverse-Proxy (siehe next.config.ts) — dadurch
// funktioniert das Tool sowohl lokal, im LAN als auch über Cloudflare-Tunnel
// ohne CORS-Probleme und mit derselben Origin.
const BASE = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1'

export const api = axios.create({ baseURL: BASE })

// Token aus localStorage anhängen (nur im Browser)
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = window.localStorage.getItem('immo_token')
    if (token) config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 401 → Logout, 429 → Toast
let logoutInProgress = false
api.interceptors.response.use(
  (r) => r,
  (err) => {
    const status = err?.response?.status
    if (status === 401 && typeof window !== 'undefined' && !logoutInProgress) {
      logoutInProgress = true
      window.localStorage.removeItem('immo_token')
      window.localStorage.removeItem('immo_user')
      // nur redirecten wenn nicht schon auf Login-Seite
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login?expired=1'
      }
    }
    return Promise.reject(err)
  }
)

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ data: { accessToken: string; user: { id: string; email: string; vorname?: string; nachname?: string; rolle: string } } }>('/auth/login', { email, password }),
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export const dashboardApi = {
  kpis:     (objektId?: string) => api.get('/dashboard/kpis',     { params: { objektId } }),
  cashflow: (monate = 6, objektId?: string) => api.get('/dashboard/cashflow', { params: { monate, objektId } }),
  ampel:    () => api.get('/dashboard/ampel'),
}

// ── Firmen ────────────────────────────────────────────────────────────────────
export const firmenApi = {
  list:   (params?: Record<string, unknown>) => api.get('/firmen', { params }),
  get:    (id: string) => api.get(`/firmen/${id}`),
  create: (body: unknown) => api.post('/firmen', body),
  update: (id: string, body: unknown) => api.patch(`/firmen/${id}`, body),
  delete: (id: string) => api.delete(`/firmen/${id}`),
}

// ── Objekte ───────────────────────────────────────────────────────────────────
export const objekteApi = {
  list:   (params?: Record<string, unknown>) => api.get('/objekte', { params }),
  get:    (id: string) => api.get(`/objekte/${id}`),
  create: (body: unknown) => api.post('/objekte', body),
  update: (id: string, body: unknown) => api.patch(`/objekte/${id}`, body),
  delete: (id: string) => api.delete(`/objekte/${id}`),
}

// ── Einheiten ─────────────────────────────────────────────────────────────────
export const einheitenApi = {
  list:   (params?: Record<string, unknown>) => api.get('/einheiten', { params }),
  get:    (id: string) => api.get(`/einheiten/${id}`),
  create: (body: unknown) => api.post('/einheiten', body),
  update: (id: string, body: unknown) => api.patch(`/einheiten/${id}`, body),
  // Mietvertrag per OCR hochladen → Mieter + Vertrag automatisch anlegen
  uploadMietvertrag: (id: string, formData: FormData) =>
    api.post(`/einheiten/${id}/mietvertrag-upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120_000,
    }),
}

// ── Mieter ────────────────────────────────────────────────────────────────────
export const mieterApi = {
  list:   (params?: Record<string, unknown>) => api.get('/mieter', { params }),
  get:    (id: string) => api.get(`/mieter/${id}`),
  create: (body: unknown) => api.post('/mieter', body),
  update: (id: string, body: unknown) => api.patch(`/mieter/${id}`, body),
}

// ── Mietverträge ──────────────────────────────────────────────────────────────
export const mietvertraegeApi = {
  list:   (params?: Record<string, unknown>) => api.get('/mietvertraege', { params }),
  get:    (id: string) => api.get(`/mietvertraege/${id}`),
  create: (body: unknown) => api.post('/mietvertraege', body),
  update: (id: string, body: unknown) => api.patch(`/mietvertraege/${id}`, body),
  ocr:    (formData: FormData) => api.post('/mietvertraege/ocr', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
}

// ── Dokumente ─────────────────────────────────────────────────────────────────
export type DokumentKategorie =
  | 'rechnung'
  | 'mietvertrag'
  | 'mietvertrag_anlage'
  | 'kuendigung'
  | 'uebergabeprotokoll'
  | 'minol'
  | 'zaehler_foto'
  | 'zaehlerstand'
  | 'betriebskostenabrechnung'
  | 'versicherung'
  | 'grundsteuer'
  | 'korrespondenz'
  | 'ausweis'
  | 'bankverbindung'
  | 'sonstiges'

export type DokumentUploadParams = {
  zeitraumId?: string
  einheitId?: string
  objektId?: string
  mieterId?: string
  mietvertragId?: string
  dokumentKategorie?: DokumentKategorie
  titel?: string
  beschreibung?: string
}

export type DokumentListParams = {
  zeitraumId?: string
  einheitId?: string
  objektId?: string
  mieterId?: string
  mietvertragId?: string
  dokumentKategorie?: DokumentKategorie
  extractionStatus?: string
  page?: number
  pageSize?: number
}

export const dokumenteApi = {
  list:   (params?: DokumentListParams) => api.get('/dokumente', { params }),
  get:    (id: string) => api.get(`/dokumente/${id}`),
  upload: (formData: FormData, params?: DokumentUploadParams) =>
    api.post('/dokumente/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      params,
    }),
  updateMeta: (id: string, body: Partial<{
    titel: string | null
    beschreibung: string | null
    dokumentKategorie: DokumentKategorie
    einheitId: string | null
    objektId: string | null
    mieterId: string | null
    mietvertragId: string | null
  }>) => api.patch(`/dokumente/${id}/meta`, body),
  delete: (id: string) => api.delete(`/dokumente/${id}`),
  patchReview: (id: string, body: unknown) => api.patch(`/dokumente/${id}/review`, body),
  confirmReview: (id: string, body: { kostenartId: string; reviewNotizen?: string; rechnungsdatumFehltBegruendung?: string }) =>
    api.post(`/dokumente/${id}/review/confirm`, body),
  rejectReview: (id: string, body: { begruendung: string }) =>
    api.post(`/dokumente/${id}/review/reject`, body),
  manualReview: (id: string, body: { begruendung: string }) =>
    api.post(`/dokumente/${id}/review/manual`, body),
  retryExtraction: (id: string) => api.post(`/dokumente/${id}/retry-extraction`),
  mietvertragApply: (id: string, body: { einheitId: string; dryRun?: boolean }) =>
    api.post(`/dokumente/${id}/mietvertrag-apply`, body),
  // Legacy aliases — kept for compatibility
  review: (id: string, body: unknown) => api.patch(`/dokumente/${id}/review`, body),
  confirm:(id: string) => api.post(`/dokumente/${id}/confirm`),
}

// ── Kostenarten (für Review-Confirm) ──────────────────────────────────────────
export const kostenartenApi = {
  list: () => api.get('/kostenarten'),
}

// ── Enzi (KI-Assistent) ───────────────────────────────────────────────────────
export type EnziMessage = { role: 'user' | 'assistant'; content: string }
export const enziApi = {
  chat: (messages: EnziMessage[]) =>
    api.post<{ data: { reply: string; toolCalls: Array<{ name: string; input: any; result: any }>; offline?: boolean } }>(
      '/enzi/chat',
      { messages },
    ),
}

// ── Abrechnungen ──────────────────────────────────────────────────────────────
export const abrechnungApi = {
  zeitraeume: {
    list:   (params?: Record<string, unknown>) => api.get('/abrechnungszeitraeume', { params }),
    create: (body: unknown) => api.post('/abrechnungszeitraeume', body),
  },
  list:      (params?: Record<string, unknown>) => api.get('/abrechnungen', { params }),
  berechne:  (body: unknown) => api.post('/abrechnungen/berechne', body),
  freigeben: (id: string) => api.post(`/abrechnungen/${id}/freigeben`),
  vollstaendigkeit: (zeitraumId: string) => api.get(`/abrechnungszeitraeume/${zeitraumId}/vollstaendigkeit`),
}

// ── Kontoauszüge ──────────────────────────────────────────────────────────────
export const kontoauszugApi = {
  list:       (params?: Record<string, unknown>) => api.get('/kontoauszuege', { params }),
  get:        (id: string) => api.get(`/kontoauszuege/${id}`),
  import:     (formData: FormData, params: Record<string, string>) =>
    api.post('/kontoauszuege/import', formData, { headers: { 'Content-Type': 'multipart/form-data' }, params }),
  buchungen:  (id: string) => api.get(`/kontoauszuege/${id}/buchungen`),
  zuordnen:   (id: string, body: unknown) => api.patch(`/buchungszeilen/${id}/zuordnen`, body),
  sollIst:    (params?: Record<string, unknown>) => api.get('/soll-ist', { params }),
  offenePosten: (params?: Record<string, unknown>) => api.get('/offene-posten', { params }),
}

// ── Mieterhöhungen ────────────────────────────────────────────────────────────
export const mieterhoehungApi = {
  list:     (params?: Record<string, unknown>) => api.get('/mieterhoehungen', { params }),
  berechne: (mietvertragId: string) => api.post('/mieterhoehungen/berechne', { mietvertragId }),
  update:   (id: string, body: unknown) => api.patch(`/mieterhoehungen/${id}`, body),
}

// ── Exporte ───────────────────────────────────────────────────────────────────
export const exportApi = {
  nkPdf: (abrechnungId: string) => api.post(`/exporte/nk-abrechnungen/${abrechnungId}/pdf`),
}

// ── Zähler ────────────────────────────────────────────────────────────────────
export const zaehlerApi = {
  list:         (params?: Record<string, unknown>) => api.get('/zaehler', { params }),
  get:          (id: string) => api.get(`/zaehler/${id}`),
  create:       (body: unknown) => api.post('/zaehler', body),
  update:       (id: string, body: unknown) => api.patch(`/zaehler/${id}`, body),
  delete:       (id: string) => api.delete(`/zaehler/${id}`),
  addStand:     (id: string, body: unknown) => api.post(`/zaehler/${id}/staende`, body),
  deleteStand:  (standId: string) => api.delete(`/zaehler/staende/${standId}`),
}

// ── Minol-OCR ────────────────────────────────────────────────────────────────
export const minolApi = {
  ocr: (formData: FormData) =>
    api.post('/dokumente/minol-ocr', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
}

// ── Lernmodus ─────────────────────────────────────────────────────────────────
export const lernmodusApi = {
  upload:      (formData: FormData) =>
    api.post('/lernmodus/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  sessionen:   () => api.get('/lernmodus/sessionen'),
  session:     (id: string) => api.get(`/lernmodus/sessionen/${id}`),
  starten:     (id: string) => api.post(`/lernmodus/sessionen/${id}/starten`),
  beantworten: (frageId: string, body: { antwortWert: string; einheitId?: string | null; ueberspringen?: boolean }) =>
    api.patch(`/lernmodus/fragen/${frageId}/beantworten`, body),
  abschliessen:(id: string) => api.post(`/lernmodus/sessionen/${id}/abschliessen`),
}
