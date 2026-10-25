---
name: tweak
description: Fine-tune Cloqui's design tokens (theme colours and corner radius) with a live slider panel, then "Bake" them into globals.css with contrast checks. Use when the user runs /tweak or wants to try colour or roundness changes by eye.
user-invocable: true
---

# /tweak

A development-only panel for adjusting design tokens live, then writing the result into the code.

## Use it

1. `pnpm dev`, open any page.
2. Click the sliders button in the bottom-left corner, or press **Alt+Shift+T**.
3. Drag the corner-radius slider and pick colours. The whole app updates as you go.
4. Open **Contrast** to see each text/background pair. Anything under 4.5:1 turns red, and
   **Bake** stays off until every pair passes.
5. **Bake** writes the values into `src/app/globals.css`, for the theme you're looking at.
   Switch theme (user menu → Theme) and repeat for the other one.
6. **Close** discards anything you didn't bake. **Reset** goes back to what's in the file.

## What it changes

- Per theme: `--bg`, `--surface`, `--raised`, `--text`, `--text-secondary`, `--text-muted`,
  `--accent`, `--on-accent`, `--accent-ink`. `--accent-soft` follows `--accent` (same opacity).
- Shared: `--radius-md`, with `sm` = md − 2, `lg` = md + 2, `xl` = md + 4.

Everything else (type scale, spacing, motion, danger and attention colours) is deliberately out
of reach: change those in the `cloqui-design` skill first.

## After baking (Claude does this)

1. Read the `git diff` of `globals.css` and say in plain words what changed.
2. Update `.claude/skills/cloqui-design/SKILL.md` to the new values, bump its patch version and
   add a changelog line. The skill is the source of truth; the code must match it.
3. Update `docs/design/contrast.md` with the new ratios.
4. Run `pnpm check` and the Playwright suite: axe checks contrast in both themes.
5. Show Jonel a before/after and ask before committing.

## Safety

- The panel only renders when `NODE_ENV=development`. The Bake route (`/api/dev/tweak`) returns
  404 in production, from any host other than localhost, and from any other origin.
- Values are checked as plain hex colours and whole-pixel radii before anything is written, so
  nothing else can get into the CSS file. Logic and tests: `src/lib/tweak.ts`.
