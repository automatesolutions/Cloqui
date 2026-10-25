// Cloqui media worker: turns uploaded recordings into MP4 + thumbnail (+ captions when enabled).
// Runs as a Cloud Run Job in production, and with `pnpm worker` locally.
//   node --experimental-strip-types media/worker.ts          poll forever
//   node --experimental-strip-types media/worker.ts --once   drain the queue, then exit
// Self-contained on purpose: no app imports, so it builds into a small ffmpeg image.

import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import postgres from "postgres"

const require = createRequire(import.meta.url)
if (existsSync(".env.local")) require("dotenv").config({ path: ".env.local", quiet: true })

const need = (k: string) => {
  const v = process.env[k]
  if (!v) throw new Error(`Missing ${k}`)
  return v
}

// Production images install ffmpeg with apt and set FFMPEG_PATH; dev falls back to ffmpeg-static.
const FFMPEG = process.env.FFMPEG_PATH || (require("ffmpeg-static") as string)
const FFPROBE = process.env.FFPROBE_PATH || (require("ffprobe-static") as { path: string }).path
const BUCKET = process.env.S3_BUCKET || "cloqui-media"
const MAX_ATTEMPTS = 3

const sql = postgres(need("DATABASE_URL"), { prepare: false, max: 2 })
const s3 = new S3Client({
  endpoint: need("S3_ENDPOINT"),
  region: process.env.S3_REGION || "auto",
  forcePathStyle: true,
  credentials: {
    accessKeyId: need("S3_ACCESS_KEY_ID"),
    secretAccessKey: need("S3_SECRET_ACCESS_KEY"),
  },
})

type Job = { id: number; video_id: string; attempts: number; kind: "process" | "thumbnail" }
type Video = {
  id: string
  workspace_id: string
  original_key: string
  thumbnail_key: string | null
  trim_start_ms: number | null
  trim_end_ms: number | null
}

function run(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] })
    let out = ""
    let err = ""
    p.stdout.on("data", (d) => (out += d))
    p.stderr.on("data", (d) => (err += d))
    p.on("error", reject)
    p.on("close", (code) =>
      code === 0 ? resolve(out) : reject(new Error(`${bin} exited ${code}: ${err.slice(-400)}`))
    )
  })
}

async function probe(file: string) {
  const json = JSON.parse(
    await run(FFPROBE, [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      file,
    ])
  ) as {
    format?: { duration?: string }
    streams?: { codec_type: string; width?: number; height?: number }[]
  }
  const v = json.streams?.find((s) => s.codec_type === "video")
  return {
    durationMs: json.format?.duration ? Math.round(Number(json.format.duration) * 1000) : null,
    width: v?.width ?? null,
    height: v?.height ?? null,
  }
}

async function claim(): Promise<Job | null> {
  const rows = await sql<Job[]>`
    update public.media_jobs set status = 'running', attempts = attempts + 1, updated_at = now()
    where id = (
      select id from public.media_jobs
      where status = 'queued' and run_after <= now()
      order by id
      for update skip locked
      limit 1
    )
    returning id, video_id, attempts, kind`
  return rows[0] ?? null
}

async function processVideo(job: Job) {
  const [video] = await sql<Video[]>`
    select id, workspace_id, original_key, thumbnail_key, trim_start_ms, trim_end_ms
    from public.videos where id = ${job.video_id} and deleted_at is null`
  if (!video) return // Deleted while queued: nothing to do.

  const dir = await mkdtemp(join(tmpdir(), "cloqui-"))
  try {
    const input = join(dir, "input")
    const output = join(dir, "playback.mp4")
    const thumb = join(dir, "thumb.jpg")
    const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: video.original_key }))
    await writeFile(input, await obj.Body!.transformToByteArray())

    const trim: string[] = []
    if (video.trim_start_ms) trim.push("-ss", (video.trim_start_ms / 1000).toFixed(3))
    if (video.trim_end_ms) trim.push("-to", (video.trim_end_ms / 1000).toFixed(3))

    // H.264 + AAC with faststart plays everywhere, including Safari and iOS.
    await run(FFMPEG, [
      "-y",
      "-i",
      input,
      ...trim,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p",
      "-vf",
      "scale=trunc(iw/2)*2:trunc(ih/2)*2",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      output,
    ])
    const meta = await probe(output)
    const at = meta.durationMs && meta.durationMs > 2000 ? "1" : "0"
    await run(FFMPEG, [
      "-y",
      "-ss",
      at,
      "-i",
      output,
      "-frames:v",
      "1",
      "-vf",
      "scale=960:-2",
      "-q:v",
      "4",
      thumb,
    ])

    const prefix = `ws/${video.workspace_id}/videos/${video.id}/`
    const playbackKey = `${prefix}playback.mp4`
    const autoThumbKey = `${prefix}thumb.jpg`
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: playbackKey,
        Body: await readFile(output),
        ContentType: "video/mp4",
      })
    )
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: autoThumbKey,
        Body: await readFile(thumb),
        ContentType: "image/jpeg",
      })
    )

    let captionsKey: string | null = null
    if (process.env.TRANSCRIPTION_ENABLED === "true")
      captionsKey = await transcribe(output, dir, prefix)

    // Keep a custom thumbnail if the owner picked one.
    const keepCustom = video.thumbnail_key?.endsWith("thumb-custom.jpg")
    await sql`
      update public.videos set
        status = 'ready',
        playback_key = ${playbackKey},
        thumbnail_key = ${keepCustom ? video.thumbnail_key : autoThumbKey},
        captions_key = coalesce(${captionsKey}, captions_key),
        duration_ms = ${meta.durationMs},
        width = ${meta.width},
        height = ${meta.height},
        processing_error = null
      where id = ${video.id}`
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/** Cut the frame the owner picked (thumbnail_at_ms) and use it as the thumbnail. */
async function processThumbnail(job: Job) {
  const [v] = await sql<
    {
      workspace_id: string
      original_key: string
      playback_key: string | null
      thumbnail_at_ms: number | null
    }[]
  >`
    select workspace_id, original_key, playback_key, thumbnail_at_ms
    from public.videos where id = ${job.video_id} and deleted_at is null`
  if (!v) return
  const dir = await mkdtemp(join(tmpdir(), "cloqui-"))
  try {
    const input = join(dir, "input")
    const thumb = join(dir, "thumb.jpg")
    const obj = await s3.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: v.playback_key ?? v.original_key })
    )
    await writeFile(input, await obj.Body!.transformToByteArray())
    const at = ((v.thumbnail_at_ms ?? 0) / 1000).toFixed(3)
    await run(FFMPEG, [
      "-y",
      "-ss",
      at,
      "-i",
      input,
      "-frames:v",
      "1",
      "-vf",
      "scale=960:-2",
      "-q:v",
      "4",
      thumb,
    ])
    const key = `ws/${v.workspace_id}/videos/${job.video_id}/thumb-custom.jpg`
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: await readFile(thumb),
        ContentType: "image/jpeg",
      })
    )
    await sql`update public.videos set thumbnail_key = ${key} where id = ${job.video_id}`
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/** Optional: whisper.cpp captions. Needs WHISPER_CPP_BIN and WHISPER_MODEL. Off by default. */
async function transcribe(mp4: string, dir: string, prefix: string): Promise<string | null> {
  const bin = process.env.WHISPER_CPP_BIN
  const model = process.env.WHISPER_MODEL
  if (!bin || !model) {
    console.warn(
      "TRANSCRIPTION_ENABLED is true but WHISPER_CPP_BIN / WHISPER_MODEL are not set. Skipping."
    )
    return null
  }
  const wav = join(dir, "audio.wav")
  await run(FFMPEG, ["-y", "-i", mp4, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav])
  await run(bin, ["-m", model, "-f", wav, "-ovtt", "-of", join(dir, "captions")])
  const key = `${prefix}captions.vtt`
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: await readFile(join(dir, "captions.vtt")),
      ContentType: "text/vtt",
    })
  )
  return key
}

async function handle(job: Job) {
  try {
    if (job.kind === "thumbnail") await processThumbnail(job)
    else await processVideo(job)
    await sql`update public.media_jobs set status = 'done', updated_at = now() where id = ${job.id}`
    console.log(`job ${job.id}: video ${job.video_id} ready`)
  } catch (e) {
    const msg = (e as Error).message.slice(0, 1000)
    const final = job.attempts >= MAX_ATTEMPTS
    await sql`
      update public.media_jobs set
        status = ${final ? "failed" : "queued"},
        last_error = ${msg},
        run_after = now() + ${`${job.attempts} minutes`}::interval,
        updated_at = now()
      where id = ${job.id}`
    if (final && job.kind === "process") {
      await sql`update public.videos set status = 'failed', processing_error = ${"We couldn't process this video."} where id = ${job.video_id}`
    }
    console.error(`job ${job.id} attempt ${job.attempts} failed: ${msg}`)
  }
}

async function main() {
  const once = process.argv.includes("--once")
  for (;;) {
    const job = await claim()
    if (job) {
      await handle(job)
      continue
    }
    if (once) break
    await new Promise((r) => setTimeout(r, 3000))
  }
  await sql.end()
}

main().catch(async (e) => {
  console.error(e)
  await sql.end({ timeout: 1 })
  process.exit(1)
})
