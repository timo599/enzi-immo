import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  type PutObjectCommandInput,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { Readable } from 'stream'

// ─── Config ────────────────────────────────────────────────────

interface StorageConfig {
  endpoint:       string
  bucket:         string
  region:         string
  accessKey:      string
  secretKey:      string
  forcePathStyle: boolean
}

function loadConfig(): StorageConfig {
  return {
    endpoint:       process.env['S3_ENDPOINT']          ?? 'http://localhost:9000',
    bucket:         process.env['S3_BUCKET']            ?? 'immo-documents',
    region:         process.env['S3_REGION']            ?? 'eu-central-1',
    accessKey:      process.env['S3_ACCESS_KEY']        ?? 'minioadmin',
    secretKey:      process.env['S3_SECRET_KEY']        ?? 'minioadmin',
    forcePathStyle: process.env['S3_FORCE_PATH_STYLE']  === 'true',
  }
}

// ─── Singleton client ──────────────────────────────────────────

let _client: S3Client | null = null

function getClient(): S3Client {
  if (!_client) {
    const cfg = loadConfig()
    _client = new S3Client({
      endpoint:        cfg.endpoint,
      region:          cfg.region,
      forcePathStyle:  cfg.forcePathStyle,
      credentials: {
        accessKeyId:     cfg.accessKey,
        secretAccessKey: cfg.secretKey,
      },
    })
  }
  return _client
}

function getBucket(): string {
  return loadConfig().bucket
}

// ─── Storage key helpers ───────────────────────────────────────

/**
 * Build a deterministic S3 key.
 * Pattern: {tenantId}/{zeitraumId}/{uuid}_{sanitized_filename}
 */
export function buildS3Key(tenantId: string, zeitraumId: string | undefined, uuid: string, originalName: string): string {
  const safe = originalName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
  return `${tenantId}/${zeitraumId ?? 'unbekannt'}/${uuid}_${safe}`
}

// ─── Upload ────────────────────────────────────────────────────

export interface UploadParams {
  key:         string
  body:        Buffer
  mimeType:    string
  metadata?:   Record<string, string>
}

export async function uploadFile({ key, body, mimeType, metadata }: UploadParams): Promise<void> {
  const cmd: PutObjectCommandInput = {
    Bucket:      getBucket(),
    Key:         key,
    Body:        body,
    ContentType: mimeType,
    Metadata:    metadata,
  }
  // Server-side encryption only when explicitly enabled (AWS S3, not MinIO local)
  if (process.env.S3_USE_SSE === 'true') {
    cmd.ServerSideEncryption = 'AES256'
  }
  await getClient().send(new PutObjectCommand(cmd))
}

// ─── Download ──────────────────────────────────────────────────

export async function downloadFile(key: string): Promise<Buffer> {
  const response = await getClient().send(
    new GetObjectCommand({ Bucket: getBucket(), Key: key }),
  )
  if (!response.Body) throw new Error(`Empty body for key: ${key}`)

  const chunks: Uint8Array[] = []
  for await (const chunk of response.Body as Readable) {
    chunks.push(chunk as Uint8Array)
  }
  return Buffer.concat(chunks)
}

// ─── Pre-signed URL (time-limited download link) ───────────────

export async function getPresignedDownloadUrl(key: string, expiresInSeconds = 900): Promise<string> {
  const cmd = new GetObjectCommand({ Bucket: getBucket(), Key: key })
  return getSignedUrl(getClient(), cmd, { expiresIn: expiresInSeconds })
}

// ─── Delete ────────────────────────────────────────────────────

export async function deleteFile(key: string): Promise<void> {
  await getClient().send(
    new DeleteObjectCommand({ Bucket: getBucket(), Key: key }),
  )
}

// ─── Existence check ───────────────────────────────────────────

export async function fileExists(key: string): Promise<boolean> {
  try {
    await getClient().send(new HeadObjectCommand({ Bucket: getBucket(), Key: key }))
    return true
  } catch {
    return false
  }
}
