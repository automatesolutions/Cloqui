---
name: cloqui-design
description: Cloqui design system ("Private and Safe"): exact colours, type, spacing, radii, shadows, motion, components and privacy cues. Use when the user runs /cloqui-design and before building, restyling or reviewing any Cloqui screen or component.
user-invocable: true
---

# /cloqui-design

Cloqui should feel like a private office with the door closed: calm, quiet, trustworthy. This file is the source of truth. If code and this file disagree, fix the code, or change this file first and say so.

Status: **v1.0, approved by Jonel 2026-10-25.** Visual preview: `docs/design/preview.html`.

Apply with: `/cloqui-tone` for every string, `/hig` for every numeric minimum (44 px targets, 4.5:1 contrast). Where this file is stricter than `/hig`, this file wins.

## 1. Colour

Dark is the default theme. Light follows the system setting, and people can switch. All values are final hex codes, used through CSS variables (`--c-*`), never hard-coded in components.

### Dark (default)

| Token            | Hex              | Use                                                                    |
| ---------------- | ---------------- | ---------------------------------------------------------------------- |
| `bg`             | `#0E1420`        | App background (ink)                                                   |
| `surface`        | `#151C2B`        | Cards, sidebar, panels                                                 |
| `raised`         | `#1C2538`        | Popovers, menus, hovered rows, dialogs                                 |
| `border`         | `#26314A`        | Dividers and card edges (decorative only)                              |
| `border-strong`  | `#3A4866`        | Selected cards, table headers                                          |
| `input-border`   | `#5B6B8E`        | Inputs, checkboxes, toggles (3.19:1 on surface)                        |
| `text`           | `#E8EDF5`        | Primary text (15.7:1 on bg)                                            |
| `text-secondary` | `#9AA7BD`        | Secondary text (7.6:1 on bg)                                           |
| `text-muted`     | `#8290A6`        | Timestamps, hints (4.7:1 on raised, 5.3:1 on surface; never body text) |
| `accent`         | `#2DD4A8`        | Primary buttons, focus ring, "secure/active" states (9.7:1 on bg)      |
| `accent-hover`   | `#5CE0BD`        | Primary button hover                                                   |
| `on-accent`      | `#04241B`        | Text and icons on accent (8.7:1)                                       |
| `accent-soft`    | `#2DD4A8` at 12% | Selected nav item, private badge fill                                  |
| `attention`      | `#F2B54A`        | Needs attention: expiring, pending request (10.1:1 on bg)              |
| `attention-soft` | `#F2B54A` at 12% | Attention banner fill                                                  |
| `danger`         | `#F27C7C`        | Destructive actions only, plus the live/recording dot (7.0:1 on bg)    |
| `danger-soft`    | `#F27C7C` at 12% | Destructive confirm fill                                               |

### Light

| Token            | Hex                     | Use                                                 |
| ---------------- | ----------------------- | --------------------------------------------------- |
| `bg`             | `#F6F7FA`               | App background (warm off-white)                     |
| `surface`        | `#FFFFFF`               | Cards, sidebar, panels                              |
| `raised`         | `#FFFFFF` + shadow `md` | Popovers, menus, dialogs                            |
| `border`         | `#DDE2EB`               | Dividers (decorative only)                          |
| `border-strong`  | `#C5CCD9`               | Selected cards                                      |
| `input-border`   | `#838EA3`               | Inputs (3.3:1 on white)                             |
| `text`           | `#131A28`               | Primary text (16.3:1 on bg)                         |
| `text-secondary` | `#4F5B72`               | Secondary text (6.4:1 on bg)                        |
| `text-muted`     | `#626D80`               | Hints (4.9:1 on bg, 5.2:1 on white)                 |
| `accent`         | `#0B7A60`               | Primary buttons, links, focus ring (5.3:1 on white) |
| `accent-hover`   | `#09664F`               |                                                     |
| `on-accent`      | `#FFFFFF`               | (5.3:1)                                             |
| `accent-soft`    | `#0B7A60` at 10%        |                                                     |
| `attention`      | `#935400`               | (6.0:1 on white)                                    |
| `danger`         | `#C03538`               | (5.5:1 on white)                                    |

### Colour rules

- One accent. Teal means "safe, active, yours". Don't use it for decoration.
- Amber means "look at this soon". Red means "this deletes or removes". Nothing else is red, except the small live/recording dot.
- Colour is never the only signal. Every state also has an icon or a word ("Live", "Expires in 2 days").
- No gradients on UI surfaces. On the landing page, one very soft radial glow of `accent` at ≤8% opacity behind the hero is allowed.
- Every new colour pair gets a contrast check (`docs/design/contrast.md`) before it ships.

## 2. Typography

Fonts are from Fontshare under the **ITF Free Font License v2.0**: commercial use and self-hosting are allowed. Subsetting, format conversion and redistribution are **not** allowed, so:

- Serve the shipped `.woff2` files unchanged from `/public/fonts` (via `next/font/local`, which does not subset local files).
- Keep the font files out of any public repo. The repo stays private, or a fetch script downloads them at build time.
- Never offer them as a selectable font to Cloqui users.

| Role                             | Family                                            | Weights       |
| -------------------------------- | ------------------------------------------------- | ------------- |
| Headings, display, logo wordmark | **Cabinet Grotesk** (variable)                    | 500, 700      |
| Body, UI, buttons                | **Switzer** (variable + italic)                   | 400, 500, 600 |
| Code, IDs, keys                  | `ui-monospace, "Cascadia Code", Menlo, monospace` | 400           |

`font-display: swap`. Fallback stack: `ui-sans-serif, system-ui, "Segoe UI", sans-serif`. Use `font-variant-numeric: tabular-nums` for timestamps, durations, counts and tables.

### Type scale (rem; 1 rem = 16 px)

| Token      | Size / line                            | Font, weight    | Tracking | Use                                           |
| ---------- | -------------------------------------- | --------------- | -------- | --------------------------------------------- |
| `display`  | 3.5 / 3.75 (56/60) · mobile 2.5 / 2.75 | Cabinet 700     | -0.02em  | Landing hero only                             |
| `title-1`  | 2.125 / 2.5 (34/40) · mobile 1.75      | Cabinet 700     | -0.015em | Page titles                                   |
| `title-2`  | 1.75 / 2.125 (28/34)                   | Cabinet 700     | -0.01em  | Section titles, dialogs on landing            |
| `title-3`  | 1.375 / 1.75 (22/28)                   | Cabinet 500     | -0.005em | Card titles, drawer titles                    |
| `headline` | 1.0625 / 1.375 (17/22)                 | Switzer 600     | 0        | List item titles, labels that lead            |
| `body`     | 1 / 1.5 (16/24)                        | Switzer 400     | 0        | App body text                                 |
| `body-lg`  | 1.0625 / 1.625 (17/26)                 | Switzer 400     | 0        | Landing and long-form reading                 |
| `callout`  | 0.9375 / 1.375 (15/22)                 | Switzer 400/500 | 0        | Buttons, inputs, sidebar items, chat messages |
| `footnote` | 0.8125 / 1.125 (13/18)                 | Switzer 400/500 | 0.005em  | Metadata, helper text                         |
| `caption`  | 0.75 / 1 (12/16)                       | Switzer 500     | 0.01em   | Badges, timestamps. Smallest size allowed.    |

Rules: no text below 12 px. Body text max width `70ch`. Sentence case everywhere. No all-caps except the `LIVE` and `REC` badges (with `0.06em` tracking). Thin weights (<400) are not used.

## 3. Spacing

4 px base. Tokens: `0.5`=2, `1`=4, `2`=8, `3`=12, `4`=16, `5`=20, `6`=24, `8`=32, `10`=40, `12`=48, `16`=64, `20`=80, `24`=96 (px).

- Page side margins: 16 px phone, 24 px tablet, 32 px desktop. Respect `env(safe-area-inset-*)`.
- Gap inside a control group: 8. Between related blocks: 16. Between sections in the app: 32. Between landing sections: 96 (64 on mobile).
- Card padding: 16 (compact lists), 20 (default), 24 (feature cards, dialogs).
- App shell: sidebar 264 px (collapsible to 72), top bar 56 px, thread/detail drawer 420 px. Mobile: bottom tab bar 56 px + safe area, 4 tabs (Home, Chat, Tasks, Library), recording through a centre action.

## 4. Radius

| Token    | px   | Use                                                              |
| -------- | ---- | ---------------------------------------------------------------- |
| `r-sm`   | 8    | Badges, chips, small icon buttons, checkboxes (6 for checkboxes) |
| `r-md`   | 10   | Buttons, inputs, selects, menu items                             |
| `r-lg`   | 12   | Cards, video thumbnails, message cards                           |
| `r-xl`   | 14   | Dialogs, drawers, popovers, the camera bubble frame              |
| `r-full` | 9999 | Avatars, presence dots, pills, the camera bubble itself          |

Nested corners: inner radius = outer radius − padding (minimum 4).

## 5. Elevation

Dark theme separates layers with surface colour first and shadows second. Light theme uses shadows.

| Token       | Dark                                                                 | Light                                                           |
| ----------- | -------------------------------------------------------------------- | --------------------------------------------------------------- |
| `shadow-sm` | `0 1px 2px rgb(0 0 0 / .30)`                                         | `0 1px 2px rgb(19 26 40 / .06)`                                 |
| `shadow-md` | `0 4px 16px rgb(0 0 0 / .35), inset 0 1px 0 rgb(255 255 255 / .04)`  | `0 4px 16px rgb(19 26 40 / .08), 0 1px 3px rgb(19 26 40 / .06)` |
| `shadow-lg` | `0 16px 48px rgb(0 0 0 / .45), inset 0 1px 0 rgb(255 255 255 / .05)` | `0 16px 48px rgb(19 26 40 / .12)`                               |

Cards: `border` + `shadow-sm`. Menus and popovers: `raised` + `shadow-md`. Dialogs: `raised` + `shadow-lg` over a scrim of `bg` at 72% with a 4 px backdrop blur.

## 6. Motion

Calm and purposeful. Things settle into place; they never bounce or flash.

| Token      | Value                            | Use                                    |
| ---------- | -------------------------------- | -------------------------------------- |
| `dur-fast` | 150 ms                           | Hover, press, colour changes, tooltips |
| `dur-base` | 200 ms                           | Menus, popovers, toasts, tabs          |
| `dur-slow` | 250 ms                           | Drawers, dialogs, page fades           |
| `ease-out` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | Entering                               |
| `ease-in`  | `cubic-bezier(0.4, 0, 1, 1)`     | Leaving (use `dur-fast`)               |

- Enter: fade + max 8 px slide (drawers slide their full width). Leave: fade only.
- Press: `scale(0.98)` for 150 ms on buttons. No hover lifts on cards; use a border/colour change.
- **Recording / live pulse:** the red dot fades between 100% and 45% opacity over 2 s, ease-in-out, looping. Never scale it. Always paired with the words "You are recording" or "Live".
- **GSAP only for the recording countdown (3-2-1).** The landing hero and onboarding entrances use the same curve and timing as CSS keyframes (`[data-hero-reveal]` in globals.css), so they start at first paint. Everything else is CSS transitions.
- `prefers-reduced-motion: reduce`: slides and scales become fades of ≤150 ms; the pulse becomes a static dot; the countdown shows the numbers without animation; GSAP timelines jump to their end state.
- Banned: confetti, particles, shatter, shimmer on text, parallax, auto-playing loops, spring overshoot.

## 7. Icons and graphics

- **One pack: Lucide** (ISC licence) via `lucide-react`. Stroke width **1.75**, sizes 16 (inline with footnote), 20 (default UI), 24 (empty states, nav on mobile). Icons are `currentColor`.
- Don't draw or generate icons. If Lucide lacks one, pick the nearest Lucide icon, or ask.
- Custom graphics (logo mark, empty-state art, diagrams) are hand-written, editable SVG using only the tokens above: line art at 1.75 stroke, `text-secondary` lines with one `accent` detail. No illustrations of people's faces, no 3D, no stock art.
- Icon-only buttons always have an `aria-label` and a tooltip.

## 8. Components

Built on Tailwind + shadcn/ui (MIT), restyled to these tokens. Check the licence of every registry or 21st.dev component before adding it, and note it in `docs/design/components.md`.

**Buttons.** Height 44 (default) or 36 visual + 4 px invisible hit padding (dense toolbars only, never for primary actions); 52 for landing CTAs. Padding x 16. `r-md`. Font `callout` 500.

- `primary`: `accent` fill, `on-accent` text. At most one per view (two only on the landing hero).
- `secondary`: `surface`/`raised` fill, `border-strong` 1 px border, `text`.
- `ghost`: transparent, `text-secondary`, hover `raised`.
- `destructive`: `danger-soft` fill, `danger` text. Solid `danger` fill only inside the confirm dialog.
- Every button has hover, pressed, focus-visible, disabled and loading (spinner + same label, width locked) states.

**Focus.** `2px solid accent`, `2px offset`, on every interactive element, `:focus-visible` only. Never removed.

**Inputs.** Height 44, `r-md`, `surface` fill, `input-border` 1 px, focus = accent ring. Label above (footnote 500, `text`), helper below (footnote, `text-secondary`), error below in `danger` with an icon. Placeholder is an example, never the label.

**Cards.** `surface`, `border`, `r-lg`, `shadow-sm`, padding 20. Video cards: 16:9 thumbnail with `r-lg` top, duration chip bottom-right, `AccessChip` top-left.

**Dialogs.** Max width 440 (confirm) / 560 (forms). Title `title-3`, one-sentence body, actions right-aligned (cancel left of confirm). Escape and clicking the scrim close it, except destructive confirms, which only close on Escape or Cancel.

**Toasts.** Bottom-centre on mobile, bottom-right on desktop. Never auto-dismiss toasts that contain an action ("Undo"); plain confirmations close after 6 s and pause on hover/focus.

**Avatars.** 24/32/40, `r-full`, initials on `raised` when there's no photo. Presence dot 10 px with a 2 px `surface` ring: online = `accent` + "Online" in tooltip/label, away = hollow ring.

## 9. Privacy cues (required on every item)

These are the heart of the Cloqui look. Every video, live room, channel, task and file shows who can see it.

- **`AccessChip`**: lock icon (16) + audience label, `caption` 500, `r-sm`, `accent-soft` fill with `accent` text when private to a small group, `raised` fill with `text-secondary` when shared to the whole workspace. Labels: "Only you", "You and Maria", "4 people", "Design team", "Everyone in Acme". **Public link** (videos only, opt-in): `Globe` icon, `attention-soft` fill with `attention` text, label "Anyone with the link". Amber because it needs watching, not because it's wrong. Never use the word "Public" on its own.
- **Public link section** in the video share panel (owner only): off by default. When on, an `attention-soft` box with the link (read-only input), "Copy link", and one line on the effect. When workspace admins have blocked public links, the toggle is disabled with that reason under it.
- **"Who can see this"** button sits in the header of every item page, one click from the content. Opens the share panel: people list with roles (Owner, Editor, Viewer, Guest), add-people field (email or member), and per-item controls (expiry, view-only, passcode, watermark). Each control states its effect in plain words under it.
- **Private badge**: `Private` with a lock, shown on shared items and rich cards in chat.
- **Recording indicator**: a fixed pill at the top centre, `raised` fill, red pulse dot + "You are recording" + elapsed time (tabular) + Pause + Stop. Live rooms use the same pill: "Live · 4 people".
- **Confirmation for sharing and revoking**, plain and specific: "Remove Maria's access? She will stop seeing this right away." Buttons name the action: "Remove access" / "Keep access".
- **Access denied**: a calm, centred card, closed-door line illustration, "You don't have access to this", one line on why ("Only people Jonel invited can open it."), primary "Request access", secondary "Go to Home". No red, no warning icons.
- **Security claims**: say "encrypted in transit and at rest". Never "end-to-end encrypted" until it is built.

## 10. States every screen needs

Loading (skeletons in `raised` with no shimmer, a 150 ms fade-in after 300 ms so fast loads show nothing), empty (line illustration + one sentence on why + one action), error (what happened + how to fix + retry), and access-denied (above). Plus the dark and light themes, and phone (375–440), tablet (768) and desktop (1280+) widths.

## 11. Changelog

- 2026-10-26 · v1.0.4: Jonel approved opt-in public links for videos. AccessChip gains a third scope, "Anyone with the link" (amber, globe icon). Everything else stays invite-only.
- 2026-10-26 · v1.0.3: hero and onboarding entrances moved from GSAP to CSS keyframes, same look. The hero headline is the largest paint and was waiting on JavaScript: Lighthouse performance 88 → 93.
- 2026-10-26 · v1.0.2: dark `text-muted` #7A869C → #8290A6. axe caught 4.17:1 on raised surfaces (drawers, menus).
- 2026-10-25 · v1.0.1: light `text-muted` #6B7689 → #626D80. axe caught 4.28:1 on the light page background.
- 2026-10-25 · v1.0 approved as drafted.
- 2026-10-25 · v0.1 draft. Palette tuned from the brief: input borders raised to meet 3:1, light accent darkened to `#0B7A60` for 5.3:1.
