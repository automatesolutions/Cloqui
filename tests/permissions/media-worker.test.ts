import { afterAll, describe, expect, it } from "vitest"
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { sql } from "drizzle-orm"
import { systemDb } from "@/server/db"
import { headObject, putObject } from "@/server/media/storage"
import { completeUpload, createVideoUpload, issuePlayback, setTrim } from "@/server/videos"
import { createWorkspace } from "@/server/workspaces"
import { cleanupUsers, makeUser, runId } from "./helpers"

const require = createRequire(import.meta.url)
const ffmpeg = require("ffmpeg-static") as string
const dir = mkdtempSync(join(tmpdir(), "cloqui-test-"))

afterAll(async () => {
  rmSync(dir, { recursive: true, force: true })
  await systemDb.execute(sql`delete from public.workspaces where slug = ${"media-" + runId}`)
  await cleanupUsers()
})

function runWorker() {
  execFileSync(
    process.execPath,
    ["--experimental-strip-types", "--no-warnings", "media/worker.ts", "--once"],
    {
      stdio: "pipe",
      timeout: 90_000,
    }
  )
}

describe("media worker", () => {
  it(
    "turns a WebM recording into a trimmed MP4 with a thumbnail",
    { timeout: 120_000 },
    async () => {
      const owner = await makeUser("media-owner")
      await createWorkspace(owner, "Media", `media-${runId}`)

      // A 3-second test recording, like MediaRecorder would produce.
      const file = join(dir, "rec.webm")
      execFileSync(
        ffmpeg,
        [
          "-y",
          "-f",
          "lavfi",
          "-i",
          "testsrc=size=320x240:rate=15",
          "-f",
          "lavfi",
          "-i",
          "sine=frequency=440",
          "-t",
          "3",
          "-c:v",
          "libvpx",
          "-b:v",
          "200k",
          "-c:a",
          "libopus",
          file,
        ],
        { stdio: "pipe" }
      )
      const bytes = readFileSync(file)

      const up = await createVideoUpload(owner, `media-${runId}`, {
        title: "Test",
        mimeType: "video/webm;codecs=vp8,opus",
        sizeBytes: bytes.length,
      })
      const [row] = await systemDb.execute<{ key: string }>(
        sql`select original_key as key from public.videos where id = ${up.videoId}`
      )
      await putObject(row.key, bytes, "video/webm")
      await completeUpload(owner, up.videoId)

      // Before processing, the original still plays.
      expect((await issuePlayback(owner, up.videoId)).type).toBe("video/webm")

      await setTrim(owner, up.videoId, 500, 2500)
      runWorker()

      const [v] = await systemDb.execute<{
        status: string
        playback_key: string
        thumbnail_key: string
        duration_ms: number
        width: number
      }>(
        sql`select status, playback_key, thumbnail_key, duration_ms, width from public.videos where id = ${up.videoId}`
      )
      expect(v.status).toBe("ready")
      expect(v.width).toBe(320)
      expect(v.duration_ms).toBeGreaterThan(1500)
      expect(v.duration_ms).toBeLessThan(2600)
      expect(await headObject(v.playback_key)).not.toBeNull()
      expect(await headObject(v.thumbnail_key)).not.toBeNull()
      const p = await issuePlayback(owner, up.videoId)
      expect(p.type).toBe("video/mp4")
      expect(p.poster).toMatch(/X-Amz-Signature=/)
    }
  )
})
