import "server-only"
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { env } from "@/lib/env"

// The only module that talks to the private bucket (Cloudflare R2 in production).
// Nothing in the bucket is public. Every read is a short-lived signed URL issued after an access check.

const globalForS3 = globalThis as unknown as { cloquiS3?: S3Client }
export const s3 =
  globalForS3.cloquiS3 ??
  new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: true,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
  })
if (process.env.NODE_ENV !== "production") globalForS3.cloquiS3 = s3

const Bucket = env.S3_BUCKET

export const videoKeys = (workspaceId: string, videoId: string) => ({
  prefix: `ws/${workspaceId}/videos/${videoId}/`,
  original: (ext: string) => `ws/${workspaceId}/videos/${videoId}/original.${ext}`,
  playback: `ws/${workspaceId}/videos/${videoId}/playback.mp4`,
  thumbnail: `ws/${workspaceId}/videos/${videoId}/thumb.jpg`,
  customThumbnail: `ws/${workspaceId}/videos/${videoId}/thumb-custom.jpg`,
  captions: `ws/${workspaceId}/videos/${videoId}/captions.vtt`,
})

/** A one-time upload URL. The browser PUTs the file straight to the bucket. */
export function presignUpload(key: string, contentType: string, expiresIn = 900) {
  return getSignedUrl(s3, new PutObjectCommand({ Bucket, Key: key, ContentType: contentType }), {
    expiresIn,
  })
}

/** A short-lived read URL. `inline` keeps browsers from offering a download prompt. */
export function presignRead(key: string, opts: { ttl?: number; filename?: string } = {}) {
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket,
      Key: key,
      ResponseContentDisposition: opts.filename
        ? `attachment; filename="${opts.filename}"`
        : "inline",
      ResponseCacheControl: "private, max-age=0, no-store",
    }),
    { expiresIn: opts.ttl ?? env.SIGNED_URL_TTL_SECONDS }
  )
}

export async function headObject(key: string) {
  try {
    const res = await s3.send(new HeadObjectCommand({ Bucket, Key: key }))
    return { size: res.ContentLength ?? 0, contentType: res.ContentType }
  } catch {
    return null
  }
}

export async function putObject(key: string, body: Buffer | Uint8Array, contentType: string) {
  await s3.send(new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType }))
}

export async function getObjectBytes(key: string): Promise<Uint8Array> {
  const res = await s3.send(new GetObjectCommand({ Bucket, Key: key }))
  return res.Body!.transformToByteArray()
}

export async function deleteObjects(keys: string[]) {
  const Objects = keys.filter(Boolean).map((Key) => ({ Key }))
  if (Objects.length) await s3.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects } }))
}
