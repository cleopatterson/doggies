# Dog Yard — Claude project notes

(User-facing rename: app shows as "🐶 Dog Yard". Internal identifiers — package name, `dogs-hq:` localStorage prefix, repo name, Railway domain — were left as-is so existing picks survive and we don't bust deploy URLs.)

## What this is
Companion app for the **Parkyard** WhatsApp group (Tony, Benny, Jordy) — Bulldogs NRL fans. Pre-game context, all picks consolidated on the Coach tab, post-match washup. See [dogs-hq-brief_updated.md](dogs-hq-brief_updated.md) for the full product brief (the older `dogs-hq-brief.md` is superseded).

## Repo + live
- GitHub: <https://github.com/cleopatterson/doggies>
- Live: <https://doggies.up.railway.app/>

## Stack
- **Vite + React 18** SPA, mobile-optimised (`max-width: 480px`)
- Inline styles, no CSS framework. **Barlow Condensed** for headings, **Inter** for body. Bulldogs blue (`#005eb8`) accent.
- **Server-synced picks** via tiny Express app ([server.js](server.js)) backed by a JSON file on a Railway Volume. [src/storage.js](src/storage.js) writes through to `/api/state/:key` with localStorage as a read-through cache + offline fallback. Identity (the `me` key) stays per-device.
- Hosted on **Railway**

## Local dev
**Port: `5180`** — port 5173 is in use by another local project. Vite is configured with `strictPort: true` so it'll fail loudly rather than silently shift.

```
npm run dev       # http://localhost:5180
npm run build     # → dist/
npm run start     # serve dist on $PORT (Railway uses this)
npm run generate  # refresh src/data.json from NRL + Kennel + Claude
```

## Deployment (Railway)
[railway.json](railway.json) — Nixpacks builder, `buildCommand: "npm run build"` (NOT `npm ci && npm run build` — Nixpacks already installs deps and the duplicate locks the cache). Start command: `npm run start` → `node server.js`.

The Railway service runs a tiny Express app ([server.js](server.js)) that:
- Serves the built SPA from `dist/`
- Exposes `GET/POST /api/state/:key` so picks sync across the three mates' devices
- Persists state to `${DATA_DIR}/state.json` (default `./data`, but Railway must mount a Volume there — see below)

Required env vars in Railway:
- `ANTHROPIC_API_KEY`
- `NRL_TEAM_ID=500010`
- `NRL_SEASON=2026`
- Railway sets `PORT` automatically (typically 8080)
- `DATA_DIR=/app/data` (or wherever the volume is mounted)

**⚠ Railway Volume required** — without it, the JSON state file lives only inside the container and gets wiped every redeploy (which the auto-refresh GitHub Action triggers Tue/Thu/Mon). To make picks survive week-to-week:
1. Railway dashboard → service → Volumes → New Volume
2. Mount path: `/app/data` (matches the default `DATA_DIR`)
3. Redeploy. Picks now persist across deploys/restarts.

If the volume is missing, the server still starts and the API still works — but state evaporates every refresh. Logs print a warning at boot when the data dir isn't writable.

## Architecture (V1)
A single consolidated picks panel above two contextual tabs. All 5 weekly picks (tip + 2 coach debates + recap + trivia) live in one collapsible "Have your say" panel at the top, so nothing is hidden behind tab navigation. The tabs underneath are pure context — match info / Kennel chatter for **This Week**, score + washup for **Last Game**. The brief was inspired by `dogs-hq-v9.jsx` (architecture only — content/copy is our existing shape, not v9's mock data).

### Header
One dark band that contains the title row and the picks panel:
1. **Title row** — official Bulldogs SVG badge (`MATCH.dogsLogo` from nrl.com) + "DOG YARD" centred, with two 30×30 circular corner buttons:
    - **Top-left: 🏆 trophy** (`<LadderHeader>`). Tap to expand the Parkyard Cup standings inline below the title — full NRL-ladder-style table with per-pick columns (🎯 tips / 📼 recap / 🎓 trivia / 🧠 coach + total). Closed by default; 👑 badge appears on the trophy itself when the current user is leading. Trivia + recap self-grade on lock; tip + coach still wait on the post-match resolution feed. The expanded panel also carries a slim **`<SwitchIdentityLink>`** footer ("You're voting as Tony · change") as a rarely-used escape hatch for someone who picked the wrong identity on first load (each mate has their own phone, so day-to-day voter chrome isn't needed).
    - **Top-right: ↻ refresh** — Tony's button triggers a server-side pipeline regen (`/api/regenerate` → polls `/api/regenerate/status` → hard-reloads on done). Everyone else gets a cache-busting reload. Tooltip shows `Updated Xm ago`.
2. **`<HaveYourSayPanel>`** — collapsible strip directly below the title row. Subtitle reads `X/Y picked` for the current user (or `All in ✓` in green when complete), with a live count via the `dogs-hq:picks-changed` window event that [src/storage.js](src/storage.js) dispatches on every save. Contains, in fixed order:
    - **`<TipCard>`** — 5 margin bands (loss / 1-6 / 7-12 / 13-18 / 19+).
    - **`<DebatesList>`** — 2 coaching decisions, constrained to be **observably resolvable from the team list or on-field events** (e.g. "Where does Burton start — 6, 7, or 13?") and citing/linking their originating Kennel thread. Pre-Tuesday (no team list yet) this renders a "picks pending" placeholder instead.
    - **Recap `<QuizCard>`** — 1 question about last week's match, sourced directly from try scorers / top performers / key stats. Option labels are name-only; the stat lives in the explainer so the answer isn't given away.
    - **Trivia `<TriviaCard>`** — 1 weekly Bulldogs question. Generator avoids repeating the prior round's topic by reading the existing `data.json` before synthesis.

### `<Accordion>` pattern
Supporting content (Kennel chatter, post-match reactions) inside the tabs uses the `<Accordion>` component — closed by default, tap to expand. The consolidated picks panel uses its own bespoke styling (custom-rolled to match the dark header band visually) rather than the card-style Accordion.

### Tabs

The tabs are pure context now — all picks live in `<HaveYourSayPanel>` above. Both tabs render cleanly even when picks haven't been made.

- **This Week** 🎯 — subtitle `Rd N v Opp`.
  - Match header (badges, kickoff, venue, H2H odds inline with each team).
  - Accordion: **🏟️ From The Kennel** (mood one-liner + spicy forum quote + classified hot threads list). Open by default.
- **Last Game** 💬 — subtitle `dogsScore-oppScore v Opp`. Retrospective.
  - Score banner with both team logos + result badge.
  - Claude-written headline + vibe paragraph (the match summary).
  - Accordion: **🏟️ From The Kennel** (post-match mood + summary + paraphrased hot takes with thread links + gameday thread link). Open by default.
  - Detailed match data (try scorers, top performers, key stats) is **not displayed** — it's the source data for the recap question. Generator still pulls and stores it under `data.washup.tries` / `topPerformers` / `keyStats` so the recap prompt has facts to draw from.

### Pick mechanics
- **Two-step lock everywhere**: first tap drafts, "Lock it in" commits. The shared `<ConfirmBar>` component owns the visual. Stops accidental locks.
- **`<QuizCard>`** is generic and reused for trivia + recap. Storage keyed by `kind` (`trivia-r{N}` / `recap-r{N}`) plus matching `*Grade-r{N}` boolean records.
- **Live pick count** — every `saveData` call in [src/storage.js](src/storage.js) fires a `dogs-hq:picks-changed` CustomEvent on `window`. The `usePicksCount(me)` hook listens and re-reads the four pick keys (`tips`, `debates`, `recap`, `trivia` for the current round), so the panel's `X/Y picked` subtitle updates the instant a lock happens — no page reload needed.

## Identity & voting integrity
- Claimed once per device via `useIdentity` hook → stored as `dogs-hq:me` in localStorage. Modal prompt fires on first load only.
- No always-on voter chrome — each of the three mates has their own phone, so showing "Voting as X" everywhere is just noise. The escape hatch (when someone mis-claims on setup) is a `<SwitchIdentityLink>` tucked at the bottom of the expanded ladder panel: tap 🏆 → scroll past standings → "You're voting as X · change" opens a confirmation modal.
- Picks lock the moment they're cast — `if (my) return` blocks any further changes per debate/tip.

## Refresh button
Small `↻` icon top-right of the header. Tooltip shows `Updated Xm ago` from `data.generatedAt`. Tap reloads with a cache-bust query param so a fresh Railway deploy gets picked up cleanly.

## External links
All Kennel thread links route through `<ExtLink>` (top of [src/App.jsx](src/App.jsx)) which calls `window.open(url, '_blank', 'noopener,noreferrer')` on click. `target="_blank"` alone is unreliable in mobile webviews (notably WhatsApp's in-app browser).

## Cut from V1 (re-introduce only with explicit ask)
Intel accordion, Player to Watch, Head to Head matchups, Trivia Corner, separate Kennel hot-threads card on the This Week tab, fan-pages quote in the washup, Coach Mode team picker / side-by-side compare. Player headshots from NRL (URLs ARE in the match data — wire up when needed).

---

## Data pipeline — `npm run generate`

Real data is generated by [scripts/generate.js](scripts/generate.js) into [src/data.json](src/data.json), which `App.jsx` imports at build time.

What it does:
1. **NRL fixture** — `https://www.nrl.com/draw/data?competition=111&season={NRL_SEASON}` → next upcoming Bulldogs fixture (using `NRL_TEAM_ID=500010`). Pulls round, opponent, venue, kickoff ISO, ladder positions, **TAB head-to-head odds** (`homeTeam.odds` / `awayTeam.odds`), and **team logo CDN URLs** built from `theme.key` + `theme.logos["badge.svg"]` version stamp.
2. **Kennel forum index** — thekennel.net.au Bulldogs Discussion (plain HTTP, 2s rate limit). Parses `<div class="structItem structItem--thread">` rows for prefix tag (`GAMEDAY` / `Opinion` / `Official` / `News` / `Social Media`), title, reply count, URL.
3. **Hot Kennel threads** — GAMEDAY thread + top 4 by reply count. Fetches up to 12 posts each via `<article data-author>` blocks (strips quoted parents).
4. **Previous match (washup source)** — walks back from upcoming round to find the most recent Bulldogs `FullTime` fixture. Fetches the match centre HTML and extracts the `q-data` JSON blob on `<div id="vue-match-centre">` (~140KB, HTML-encoded). Pulls score, attendance, weather, **try scorers** (resolved via `homeTeam.players` / `awayTeam.players` for names), top performers, and key stat groups.
5. **Kennel post-match** — searches forum index pages 1-2 for the previous round's GAMEDAY thread URL and fetches the last 3 pages. By Tuesday of the next week the GAMEDAY thread has often dropped off the first 2 pages, so post-match takes lean on the hot threads from step 3 instead.
6. **Claude synthesis** — sends fixture + previous match + Kennel digests to `claude-opus-4-7` with a strict-JSON prompt. Returns `kennelTipLean`, exactly 1 `kennelTipQuote` (the spiciest), exactly 2 `debates` constrained to observably-resolvable coaching calls, a weekly `trivia` block (question + 4 options + `correctIndex` + explainer), exactly 1 `recap` question sourced **directly from the prevMatch digest** (try scorers, top performers, key stats — strict instructions to never invent and to keep the stat value out of the option labels), and a `washup` blob (headline, vibe, kennelMood, kennelSummary, kennelHotTakes). Each `debate`, quote, and hot take includes a `threadSlug` that gets resolved to a full Kennel URL after Claude returns. The `oddsDrivers` block was removed — felt like AI filler.
   - **Trivia no-repeat** — before calling Claude, the generator reads the existing `src/data.json` and pulls the prior round's trivia question into the prompt with an explicit "don't repeat this topic" rule. Without it Claude kept reaching for the 2004-premiership factoid (it's the first "safe ground" example in the rules). Soft-fails on first run when there's no prior file.
7. Writes `src/data.json` with everything plus a generation timestamp.

⚠️ The `.env` script uses `dotenv.config({ override: true })` because some shells (e.g. Claude Desktop) export an empty `ANTHROPIC_API_KEY`. Don't change it.

## Auto-refresh — GitHub Actions
[.github/workflows/refresh-data.yml](.github/workflows/refresh-data.yml) runs three times a week and commits `src/data.json` only when it actually changed. Railway auto-redeploys on push.

| When (AEST) | Cron (UTC) | Why |
|---|---|---|
| Tue 7pm | `0 9 * * 2` | Teams named, fresh debates + odds |
| Thu 4pm | `0 6 * * 4` | Last-minute news before kickoff |
| Mon 7am | `0 21 * * 0` | Post-match washup |

Requires `ANTHROPIC_API_KEY` in **GitHub repo Settings → Secrets and variables → Actions**. `workflow_dispatch` is enabled so you can also trigger a refresh manually from the Actions tab.

## OG / WhatsApp link preview
- [public/og-image.png](public/og-image.png) (1200×630) — Bulldogs-blue gradient, "DOGS HQ" wordmark, dog emoji, Tony·Benny·Jordy footer. Source SVG kept beside it.
- [vite.config.js](vite.config.js) has an `injectOg()` plugin that reads `src/data.json` at build time and substitutes `{{ogTitle}}` / `{{ogDescription}}` / `{{siteUrl}}` placeholders in `index.html` so the WhatsApp preview always reflects the upcoming round (e.g. `🐶 Dogs HQ — Rd 10 v Dolphins`). `SITE_URL` env var overrides the default `https://doggies.up.railway.app`.
- WhatsApp aggressively caches OG previews per-URL — append `?v=2` once after major image changes to force a refetch.

---

## Things the pipeline can't get (keep documenting these)
- **Betting line / total points** — NRL fixture JSON only exposes H2H odds, not the spread or O/U. Removed from UI.
- **Team lists (named 1-17)** — published Tuesday afternoon, requires Puppeteer (nrl.com team list pages are JS-rendered). Out of scope for V1.
- **Tip + coach grading data (Ladder feed)** — `data.json` doesn't yet emit `tipBand` (which margin band the actual result fell into) or per-debate `verdicts` (which option Claude judges as the right call after the match). The Ladder UI already does the math; it just sees an empty `resolutions` array until the pipeline emits resolution data. When ready, populate `data.washup.tipBand` (one of `loss / win_1_6 / win_7_12 / win_13_18 / win_19_plus`) and `data.washup.debateVerdicts: { [debateId]: "right call label" }` and the standings light up.

## File map
- [src/App.jsx](src/App.jsx) — single-file UI: consolidated `<HaveYourSayPanel>` + the two context tabs + `<LadderHeader>` (trophy corner button + standings) + identity flow
- [server.js](server.js) — Express app: serves `dist/` + `/api/state/:key` GET/POST backed by `${DATA_DIR}/state.json`
- [src/storage.js](src/storage.js) — `loadData(key, fallback)` / `saveData(key, data)` — server API with localStorage cache fallback; `me` key stays local
- [src/data.json](src/data.json) — bundled at build time; produced by `npm run generate`
- [scripts/generate.js](scripts/generate.js) — NRL + Kennel + Claude pipeline
- [index.html](index.html) — OG meta tag template (placeholders filled by Vite plugin)
- [vite.config.js](vite.config.js) — Vite config + `injectOg` plugin
- [railway.json](railway.json) — Railway deploy config
- [.github/workflows/refresh-data.yml](.github/workflows/refresh-data.yml) — auto-refresh cron
- [public/og-image.png](public/og-image.png) — WhatsApp link preview image
- `dogs-hq-v7.jsx` — original prototype (reference only, not imported)

## Conventions
- Three users hardcoded: `Tony`, `Benny`, `Jordy`. Picks are keyed by user.
- Storage keys are round-scoped (`tips-r10`, `debates-r10`) so each round resets cleanly.
- Live round data: `src/data.json`. Static UI options (the 5 tipping bands, the user list) remain at the top of `App.jsx`.
- "Debate" and "coaching decision" are the same thing in V1. Each question is a concrete tactical call Ciraldo has to make, with 3 multiple-choice options. No vibe-only "are we ok with this?" takes.
- Kennel chatter is referenced inline on each card (one italic line citing thread context), not as a separate panel.
- Any external feed value used in the UI must be **null-safe** — TAB odds and Kennel data both intermittently drop fields. Already burned by `ODDS.dogs.toFixed(2)` crashing the whole tree when odds went null.

## Phase 2 — not built yet
- **OpenClaw WhatsApp bot** auto-posting the link to Parkyard on Thursday 6pm + Monday 8am (per brief)
- **Tip + coach grading pipeline** for the Ladder (described above)
- **Player headshots** from the NRL match-centre data (URLs are already in the q-data blob; not yet wired into the UI)
