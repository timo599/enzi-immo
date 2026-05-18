// ─── BullMQ job type definitions ──────────────────────────────

export const EXTRACTION_QUEUE = 'extraction-jobs'
export const EXTRACTION_DLQ   = 'extraction-dlq'

export interface ExtractionJobData {
  dokumentId: string
  tenantId:   string
  s3Key:      string
  mimeType:   string
  zeitraumId: string | undefined
  attempt:    number
}

export interface ExtractionJobResult {
  success:      boolean
  extraktionId: string | null
  error?:       string
}

export const QUEUE_CONFIG = {
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type:  'exponential' as const,
      delay: 2_000, // 2s → 4s → 8s
    },
    removeOnComplete: { count: 100 },
    removeOnFail:     { count: 50  },
  },
  // Max parallel Claude API calls – respect rate limits
  concurrency: parseInt(process.env['EXTRACTION_CONCURRENCY'] ?? '3', 10),
}
