import { Queue, QueueEvents } from 'bullmq'
import IORedis from 'ioredis'
import type { ExtractionJobData, ExtractionJobResult } from './queue.types.js'
import { EXTRACTION_QUEUE, QUEUE_CONFIG } from './queue.types.js'

// ─── Singleton Redis connection ─────────────────────────────────

let _redis: IORedis | null = null

export function getRedisConnection(): IORedis {
  if (!_redis) {
    const url = process.env['REDIS_URL'] ?? 'redis://localhost:6379'
    _redis = new IORedis(url, {
      maxRetriesPerRequest: null, // required by BullMQ
      enableReadyCheck: false,
      lazyConnect: true,
    })
    _redis.on('error', (err) => {
      console.error('[Redis] connection error:', err.message)
    })
  }
  return _redis
}

// ─── Queue instance (producer side) ───────────────────────────

let _extractionQueue: Queue<ExtractionJobData, ExtractionJobResult> | null = null

export function getExtractionQueue(): Queue<ExtractionJobData, ExtractionJobResult> {
  if (!_extractionQueue) {
    _extractionQueue = new Queue<ExtractionJobData, ExtractionJobResult>(EXTRACTION_QUEUE, {
      connection: getRedisConnection(),
      defaultJobOptions: QUEUE_CONFIG.defaultJobOptions,
    })
  }
  return _extractionQueue
}

/** Enqueue a new extraction job. Returns the BullMQ job ID. */
export async function enqueueExtraction(data: ExtractionJobData): Promise<string> {
  const queue = getExtractionQueue()
  const job = await queue.add('extract', data, {
    jobId: `extract-${data.dokumentId}`, // idempotent – no duplicate jobs for same doc
    ...QUEUE_CONFIG.defaultJobOptions,
  })
  return job.id ?? data.dokumentId
}

/** Get current status of a job by its ID */
export async function getJobStatus(jobId: string) {
  const queue = getExtractionQueue()
  const job = await queue.getJob(jobId)
  if (!job) return null

  const state  = await job.getState()
  const logs   = await queue.getJobLogs(jobId)

  return {
    id:          job.id,
    state,
    progress:    job.progress,
    attemptsMade: job.attemptsMade,
    failedReason: job.failedReason ?? null,
    logs:         logs.logs,
    timestamp:    job.timestamp,
    processedOn:  job.processedOn ?? null,
    finishedOn:   job.finishedOn  ?? null,
    data:         job.data,
    returnvalue:  (job.returnvalue as ExtractionJobResult | null) ?? null,
  }
}

/** Gracefully close queue connections */
export async function closeQueues(): Promise<void> {
  if (_extractionQueue) {
    await _extractionQueue.close()
    _extractionQueue = null
  }
  if (_redis) {
    await _redis.quit()
    _redis = null
  }
}
