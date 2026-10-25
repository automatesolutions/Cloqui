import "server-only"
import { env } from "@/lib/env"

type Email = { to: string; subject: string; text: string; html: string }

/**
 * EMAIL_TRANSPORT=resend sends real email (needs RESEND_API_KEY).
 * EMAIL_TRANSPORT=mailpit drops it into the local Mailpit inbox, so nothing leaves the machine.
 */
export async function sendEmail(msg: Email): Promise<void> {
  if (env.EMAIL_TRANSPORT === "resend") {
    if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set")
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: env.EMAIL_FROM, ...msg }),
    })
    if (!res.ok) throw new Error(`Email failed with status ${res.status}`)
    return
  }
  const res = await fetch(`${env.MAILPIT_URL}/api/v1/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      From: { Email: "hello@cloqui.local", Name: "Cloqui" },
      To: [{ Email: msg.to }],
      Subject: msg.subject,
      Text: msg.text,
      HTML: msg.html,
    }),
  })
  if (!res.ok) throw new Error(`Local email failed with status ${res.status}`)
}

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  )

export function inviteEmail(p: {
  inviterName: string
  workspaceName: string
  url: string
}): Omit<Email, "to"> {
  const subject = `${p.inviterName} invited you to ${p.workspaceName} on Cloqui`
  const text = `${p.inviterName} invited you to ${p.workspaceName} on Cloqui.\n\nOpen the invite: ${p.url}\n\nThe link only works when you sign in with this email address. It expires in 14 days.`
  const html = `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;color:#131a28;max-width:480px">
<p><strong>${esc(p.inviterName)}</strong> invited you to <strong>${esc(p.workspaceName)}</strong> on Cloqui.</p>
<p><a href="${esc(p.url)}" style="display:inline-block;background:#0b7a60;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none">Open the invite</a></p>
<p style="color:#4f5b72;font-size:14px">The link only works when you sign in with this email address. It expires in 14 days.</p>
</div>`
  return { subject, text, html }
}
