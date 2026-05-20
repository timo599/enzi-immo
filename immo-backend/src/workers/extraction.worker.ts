/**
 * ImmoManager Pro – Extraction Worker
 *
 * Run with: npm run worker
 *
 * This process is SEPARATE from the HTTP server.
 * It shares the same Prisma client and lib layer.
 * In production: run as a separate Railway/Docker service.
 */

import { Worker, type Job } from 'bullmq'
import { PrismaClient } from '@prisma/client'
import { downloadFile }          from '../lib/storage/storage.service.js'
import { extractFromDocument, ExtractionParseError } from '../lib/extraction/claude.extraction.service.js'
import { extractMietvertragFromDocument }             from '../lib/extraction/mietvertrag.extraction.service.js'
import { extractNkAbrechnungFromDocument }            from '../lib/extraction/nk-abrechnung.extraction.service.js'
import { getRedisConnection, closeQueues } from '../lib/queue/queue.service.js'
import { EXTRACTION_QUEUE, EXTRACTION_DLQ, QUEUE_CONFIG, type ExtractionJobData, type ExtractionJobResult } from '../lib/queue/queue.types.js'
import { Queue } from 'bullmq'

// ─── Pino logger ──────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment
const pino = require('pino')
// eslint-disable-next-line @typescript-eslint/no-unsafe-call
const log = pino({
  name:  'extraction-worker',
  level: process.env['LOG_LEVEL'] ?? 'info',
  ...(process.env['NODE_ENV'] === 'development'
    ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
    : {}),
})

// ─── Prisma ───────────────────────────────────────────────────

const prisma = new PrismaClient()

// ─── DLQ for permanently failed jobs ──────────────────────────

const dlq = new Queue<ExtractionJobData>(EXTRACTION_DLQ, {
  connection: getRedisConnection(),
})

// ─── Worker process function ───────────────────────────────────

async function processExtractionJob(
  job: Job<ExtractionJobData, ExtractionJobResult>,
): Promise<ExtractionJobResult> {
  const { dokumentId, tenantId, s3Key, mimeType, zeitraumId } = job.data

  log.info({ dokumentId, jobId: job.id, attempt: job.attemptsMade + 1 }, 'Starting extraction')

  // 1. Update DB status → processing
  await prisma.dokument.update({
    where: { id: dokumentId },
    data:  { extractionStatus: 'processing' },
  })

  await job.updateProgress(10)

  // 2. Fetch document from S3
  let fileBuffer: Buffer
  try {
    fileBuffer = await downloadFile(s3Key)
    log.info({ dokumentId, bytes: fileBuffer.byteLength }, 'File downloaded from S3')
  } catch (err) {
    const msg = `S3 download failed: ${err instanceof Error ? err.message : String(err)}`
    log.error({ dokumentId, err: msg }, 'S3 download error')
    await prisma.dokument.update({
      where: { id: dokumentId },
      data:  { extractionStatus: 'failed', uploadFehler: msg },
    })
    throw new Error(msg)
  }

  await job.updateProgress(30)

  // 3. Call Claude API – Dokumenttyp-abhängiger Pfad
  let extraction
  const dokumentTyp = job.data.dokumentTyp ?? 'rechnung'
  try {
    const originalName = s3Key.split('/').pop() ?? 'document'
    if (dokumentTyp === 'mietvertrag') {
      extraction = await extractMietvertragFromDocument(fileBuffer, mimeType, originalName)
    } else if (dokumentTyp === 'lernmodus_nk') {
      extraction = await extractNkAbrechnungFromDocument(fileBuffer, mimeType, originalName)
    } else {
      extraction = await extractFromDocument(fileBuffer, mimeType, originalName)
    }
    log.info(
      { dokumentId, flags: extraction.flags, needsReview: extraction.needsReview },
      'Claude extraction complete',
    )
  } catch (err) {
    const isParseError = err instanceof ExtractionParseError
    const msg = err instanceof Error ? err.message : String(err)

    log.error({ dokumentId, isParseError, err: msg }, 'Extraction error')

    // If Claude returned something but we couldn't parse it, store raw response for debugging
    const rawResponse = isParseError ? (err as ExtractionParseError).rawResponse : null

    await prisma.dokument.update({
      where: { id: dokumentId },
      data: {
        extractionStatus: 'failed',
        uploadFehler: `Extraktion fehlgeschlagen: ${msg}`,
      },
    })

    if (rawResponse) {
      // Store the raw (unparseable) response for debugging
      await prisma.dokExtraktion.upsert({
        where:  { dokumentId },
        create: {
          dokumentId,
          rawResponse:     rawResponse,
          extractedFields: {},
          confidenceMap:   {},
          flags:           ['parse_error'],
          modelVersion:    extraction?.modelVersion ?? 'unknown',
          promptVersion:   extraction?.promptVersion ?? 'unknown',
          reviewed:        false,
        },
        update: {
          rawResponse: rawResponse,
          flags:       ['parse_error'],
          reviewed:    false,
        },
      })
    }

    throw new Error(msg)
  }

  await job.updateProgress(80)

  // 4. Persist extraction result to DB
  const finalStatus = extraction.needsReview ? 'needs_review' : 'extracted'

  await prisma.$transaction(async (tx) => {
    await tx.dokExtraktion.upsert({
      where:  { dokumentId },
      create: {
        dokumentId,
        rawResponse:     extraction.rawResponse,
        extractedFields: extraction.extractedFields as object,
        confidenceMap:   extraction.confidenceMap,
        flags:           extraction.flags,
        modelVersion:    extraction.modelVersion,
        promptVersion:   extraction.promptVersion,
        tokensInput:     extraction.tokensInput,
        tokensOutput:    extraction.tokensOutput,
        reviewed:        false,
      },
      update: {
        rawResponse:     extraction.rawResponse,
        extractedFields: extraction.extractedFields as object,
        confidenceMap:   extraction.confidenceMap,
        flags:           extraction.flags,
        modelVersion:    extraction.modelVersion,
        promptVersion:   extraction.promptVersion,
        tokensInput:     extraction.tokensInput,
        tokensOutput:    extraction.tokensOutput,
        reviewed:        false,
        reviewedVon:     null,
        reviewedAm:      null,
      },
    })

    await tx.dokument.update({
      where: { id: dokumentId },
      data:  { extractionStatus: finalStatus },
    })

    // Audit log
    await tx.auditLog.create({
      data: {
        tenantId,
        entityType: 'DokExtraktion',
        entityId:   dokumentId,
        action:     'AI_EXTRACT',
        newData:    {
          flags:        extraction.flags,
          needsReview:  extraction.needsReview,
          modelVersion: extraction.modelVersion,
          tokensIn:     extraction.tokensInput,
          tokensOut:    extraction.tokensOutput,
        },
      },
    })
  })

  await job.updateProgress(100)

  log.info(
    { dokumentId, finalStatus, tokensIn: extraction.tokensInput, tokensOut: extraction.tokensOutput },
    'Extraction job completed',
  )

  return { success: true, extraktionId: dokumentId }
}

// ─── Worker instance ───────────────────────────────────────────

const worker = new Worker<ExtractionJobData, ExtractionJobResult>(
  EXTRACTION_QUEUE,
  processExtractionJob,
  {
    connection:  getRedisConnection(),
    concurrency: QUEUE_CONFIG.concurrency,
  },
)

// ─── Worker event handlers ─────────────────────────────────────

worker.on('completed', (job) => {
  log.info({ jobId: job.id, dokumentId: job.data.dokumentId }, 'Job completed')
})

worker.on('failed', async (job, err) => {
  if (!job) return
  const { dokumentId, tenantId } = job.data
  log.error({ jobId: job.id, dokumentId, attempt: job.attemptsMade, err: err.message }, 'Job failed')

  // If this was the final attempt, move to DLQ and mark doc as failed
  const maxAttempts = QUEUE_CONFIG.defaultJobOptions.attempts
  if (job.attemptsMade >= maxAttempts) {
    log.error({ dokumentId }, `Final attempt failed – moving to DLQ`)

    try {
      await dlq.add('dead-letter', job.data, {
        jobId: `dlq-${dokumentId}`,
      })
      await prisma.dokument.update({
        where: { id: dokumentId },
        data: {
          extractionStatus: 'failed',
          uploadFehler:     `Alle ${maxAttempts} Versuche fehlgeschlagen: ${err.message}`,
        },
      })
    } catch (dlqErr) {
      log.error({ err: dlqErr }, 'Failed to move job to DLQ')
    }
  }
})

worker.on('stalled', (jobId) => {
  log.warn({ jobId }, 'Job stalled – will be retried')
})

// ─── Graceful shutdown ─────────────────────────────────────────

async function shutdown() {
  log.info('Shutting down extraction worker...')
  await worker.close()
  await dlq.close()
  await closeQueues()
  await prisma.$disconnect()
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT',  shutdown)

log.info(
  { concurrency: QUEUE_CONFIG.concurrency, queue: EXTRACTION_QUEUE },
  'Extraction worker started',
)
