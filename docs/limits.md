# Limits

What Cloqui allows, and where the free tiers run out. Free-tier numbers are as of October 2026;
check each provider's pricing page before relying on them.

## In the app

| What                   | Limit                                 | Where it's set                                 |
| ---------------------- | ------------------------------------- | ---------------------------------------------- |
| Video upload size      | 2 GB                                  | `MAX_UPLOAD_BYTES` in `src/server/videos.ts`   |
| Chat attachment size   | 100 MB                                | `chat_attachments` check in the chat migration |
| Playback link lifetime | 5 minutes (30 s to 1 h)               | `SIGNED_URL_TTL_SECONDS`                       |
| Message retention      | 7 to 3,650 days, or forever (default) | Workspace → Settings → Security                |
| Video retention        | 7 to 3,650 days, or forever (default) | Workspace → Settings → Security                |

### Rate limits (per person)

Token buckets in Postgres (`src/server/rate-limit.ts`). "Burst" is how many you can do at once;
"per hour" is how fast it refills.

| Action               | Burst | Per hour |
| -------------------- | ----- | -------- |
| Invites              | 30    | 30       |
| Access requests      | 5     | 10       |
| New workspaces       | 5     | 5        |
| Uploads              | 50    | 50       |
| Chat messages        | 30    | 1,200    |
| Task changes         | 60    | 1,200    |
| Video passcode tries | 5     | 12       |
| Authenticator codes  | 10    | 30       |

Supabase Auth adds its own limits on sign-in and email sending.

## Free tiers: what runs out first

For a small team (around 10 people), these are the ones to watch, roughly in order:

1. **Video storage (R2, 10 GB).** About 10 to 20 hours of screen recordings, depending on
   resolution. Retention settings help. Past 10 GB, R2 charges per GB stored (no egress fees).
2. **Email (Resend, 100 a day).** Invites and notification emails. A busy day of invites can hit it.
3. **Live minutes (LiveKit Cloud free plan).** Long daily calls with many people use it up fastest.
4. **Database (Supabase, 500 MB).** Chat history and tasks are small; this lasts a long time.
5. **Supabase pausing.** Free projects pause after a week with no traffic. Opening the app wakes
   it, but the first load is slow. Supabase Pro removes this (paid: ask first).
6. **Cloud Run.** Scales to zero, so idle costs nothing. Video processing uses the most CPU.

## Known gaps

- Transcription is off until it's configured (`TRANSCRIPTION_ENABLED`). Coming later.
- Recording live rooms needs LiveKit Egress. Coming later.
- Uploads aren't resumable: a failed upload starts again. Coming later.
- Handing a workspace to a new owner. Coming later.
- Admins can't sign a specific member out of their devices. Removing them from the workspace
  cuts their access at once, which covers the urgent case.
- Workspace export is a JSON file of what the admin can see, without video files.
