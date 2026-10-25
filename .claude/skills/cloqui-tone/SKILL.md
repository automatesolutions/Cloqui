---
name: cloqui-tone
description: Cloqui copy rules (headlines, buttons, empty states, errors, privacy and sharing language). Use when the user runs /cloqui-tone, when writing any Cloqui UI text, landing copy, emails or docs, and whenever Jonel corrects Cloqui wording, to record the correction here.
user-invocable: true
---

# /cloqui-tone

Layers, in order: **`/my-tone`** (Jonel's voice, banned words, STE, Google and Apple style rules) → **this file** (Cloqui specifics). When they disagree, `/my-tone` wins, except for the Cloqui terms in section 3.

Status: v0.1, 2026-10-25.

## 1. What the competitors do well (studied 2026-10-25)

| Product          | Headline / CTA (verbatim)                                                                                                     | Take                                                                                                | Avoid                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Loom             | "One video is worth a thousand words" · "Get Loom for free"                                                                   | A short, concrete headline. CTA says the product's name and the price.                              | Subhead uses "supercharge" and "AI-powered" (banned buzz).                                      |
| Slack            | "All your people and AI agents working together" · "Slack connects your team."                                                | Two clipped parallel sentences. Says who it is for.                                                 | "Reimagine what's possible" (vague). "Get started" (says nothing).                              |
| Discord          | "Group chat that's all fun & games" · "Open Discord in your browser"                                                          | The secondary CTA is specific about _where_ it opens. Talks like friends talk.                      | Mixed lowercase/ALL CAPS headings. Too playful for workplaces.                                  |
| ClickUp          | "One Workspace built to think and work"                                                                                       | Names the category in the headline.                                                                 | "Software to replace all software", "400% more done", "It's FREE." (shouting, made-up numbers). |
| Signal (privacy) | "Speak Freely" · "Privacy isn't an optional mode — it's just the way that Signal works." · "No ads. No trackers. No kidding." | Privacy as the **default, not a setting**. Short negative lists that build trust. CTA "Get Signal". | —                                                                                               |

### Rules drawn from this

1. **Headline = what it does, in under 8 words.** Concrete nouns, no metaphors that need decoding.
2. **Privacy is how Cloqui works, not a feature.** Say it flatly, once per screen at most. Don't repeat "secure" in every line.
3. **Short "no" lists build trust**, if each item is true and built: "No public links. No ads. No tracking." Check each claim against the code before it ships.
4. **CTAs name the action and, if it matters, the cost or place:** "Start free", "Record a video", "Open in browser". Never "Get started", "Learn more", "Submit".
5. **No invented numbers** ("400% more done", "trusted by millions") until there are real, sourced numbers.
6. **Calm, not playful.** Friendly like a good colleague. No jokes, no "fun & games", no exclamation marks in the product.

## 2. Cloqui rules

- **One idea per screen.** The title says it; the body supports it in one or two sentences.
- **Sentences:** at most 12 words in UI, 20 in landing body text. US English, sentence case, contractions OK.
- **Buttons** are verbs + object, 1–3 words: "Record", "Share video", "Invite people", "Remove access", "Request access", "Start free". Pairs are specific: "Remove access" / "Keep access", not "Yes" / "No".
- **Name people, not roles**, whenever you know the name: "Maria can view this" beats "1 viewer".
- **Who can see it, in plain counts:** "Only you", "You and 3 others", "Design team", "Everyone in Acme".
- **Consequences before confirmation:** say what will happen and when. "Remove Maria's access? She will stop seeing this right away." "Delete this video? It can't be recovered after 30 days."
- **Errors:** what happened + what to do, no blame, no codes in the main line. "That link has expired. Ask Jonel for a new one." Technical detail goes in a collapsible "Details".
- **Empty states:** why it's empty + one action. "No videos yet. Record your first one, and only the people you choose can watch it."
- **Access denied never scares:** "You don't have access to this" (not "Forbidden", "Unauthorized", "Error 403").
- **Recording and live state is always explicit:** "You are recording", "Live", "Paused". Never only an icon.
- **Honesty:** "encrypted in transit and at rest". Never "end-to-end encrypted", "military-grade", "bank-level", "100% secure", "unhackable". Unbuilt features say "Coming later" and are never advertised.

## 3. Cloqui terms (use exactly these)

| Say                             | Don't say                                                       |
| ------------------------------- | --------------------------------------------------------------- |
| Cloqui                          | CLOQUI, cloqui (except in code and URLs)                        |
| workspace                       | org, team space, server                                         |
| channel, direct message, huddle | room (for chat), DM in UI headings (DM is OK in compact labels) |
| live room                       | meeting, stream, broadcast                                      |
| video                           | loom, clip, recording (as a noun for a saved item)              |
| invite, invited people          | share link, anyone with the link                                |
| Who can see this                | Permissions, Sharing settings, ACL                              |
| Owner, Editor, Viewer, Guest    | Admin (for items), Member (for items)                           |
| Remove access                   | Revoke (in UI; "revoke" is fine in docs and code)               |
| Request access                  | Ask for permission                                              |
| people                          | users, members (members is OK in admin screens)                 |

## 4. Banned in Cloqui (on top of `/my-tone`)

supercharge, AI-powered (unless describing a real AI feature, then say what it does), reimagine, "all-in-one", "next-gen", "world-class", "blazing fast", "Get started", "Learn more", "Oops", "Whoops", "Uh-oh", "Something went wrong" (alone, with no next step), "Public", "Anyone with the link".

## 5. Approved lines (seed copy)

- Pitch: "Record it, share it, discuss it, and track it. Only with the people you invite."
- Landing hero: "Video, chat, and tasks behind a closed door." · Sub: "Record your screen, talk it through, and track the work. Only people you invite can see any of it." · CTAs: "Start free" / "See how sharing works"
- Trust line: "No public links. No ads. No selling your data."
- Record start: "Record" · Countdown: "Starting in 3" · Indicator: "You are recording"
- Share panel title: "Who can see this"
- Access denied: "You don't have access to this" · "Only people Jonel invited can open it." · "Request access"
- Request sent: "Request sent. Jonel will get a notification."

## Corrections log

<!-- YYYY-MM-DD · "before" → "after" · rule. Also update /my-tone if the rule is about Jonel's voice in general. -->
