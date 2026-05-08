// Dog Yard server. Serves the built SPA, the pick-sync API, and a Tony-only
// "regenerate now" pipeline trigger.
//
// Persistence: a single JSON file on a Railway Volume mounted at /app/data
// (override via DATA_DIR env). The volume survives redeploys — without it,
// state would vanish every Tuesday/Thursday/Monday when the auto-refresh
// GitHub Action pushes a new data.json and Railway redeploys.
//
// Pick-sync API (used by src/storage.js):
//   GET  /api/state/:key  → { value: <stored> | null }
//   POST /api/state/:key  → body { value: ... }, persists, returns { ok: true }
//
// Regen API (Tony-only via x-dogs-user header on POST):
//   POST /api/regenerate          → kicks off `npm run generate && npm run build`
//   GET  /api/regenerate/status   → { running, startedAt, finishedAt, error, generatedAt }
//   GET  /api/check-stale         → { stale, reason, generatedAt }; auto-kicks regen if stale
//
// Staleness model — derived from match.kickoffISO in src/data.json:
//   - +2h after kickoff:  result is final, regen to update washup score
//   - +12h after kickoff: Kennel post-match takes have built up
//   - T-48h before next kickoff: team lists are named (Tue afternoon)
// The cron in .github/workflows/refresh-data.yml is the safety net; this is
// the in-app responsiveness layer.

import express from "express";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const SRC_DATA = `${ROOT}/src/data.json`;

const PORT = process.env.PORT || 4173;
const DATA_DIR = process.env.DATA_DIR || "./data";
const STATE_FILE = `${DATA_DIR}/state.json`;

// Identity allowed to manually trigger regen. Auto-regen has no gate (the
// staleness check itself is the gate). Three users hardcoded across the app.
const REGEN_ADMIN = "Tony";

let state = {};
// Serialise file writes — multiple in-flight POSTs would otherwise race on the
// read-modify-write of state.json. Chained promise queue keeps them ordered.
let writeChain = Promise.resolve();

// In-memory snapshot of src/data.json fields the server cares about. Re-read
// after each successful regen so /api/check-stale reflects the new state.
let dataMeta = { generatedAt: null, kickoffISO: null };

// Regen job state. Single global slot — only one pipeline run at a time.
const regen = {
  running: false,
  startedAt: null,
  finishedAt: null,
  error: null,
  // Tracks who/what kicked off the most recent run, useful for debugging.
  trigger: null,
};

async function load() {
  try {
    const raw = await readFile(STATE_FILE, "utf8");
    state = JSON.parse(raw);
    console.log(`[state] loaded ${Object.keys(state).length} keys from ${STATE_FILE}`);
  } catch (e) {
    if (e.code !== "ENOENT") console.error(`[state] load error: ${e.message}`);
    else console.log(`[state] no existing ${STATE_FILE}, starting fresh`);
    state = {};
  }
}

async function refreshDataMeta() {
  try {
    const raw = await readFile(SRC_DATA, "utf8");
    const d = JSON.parse(raw);
    dataMeta = { generatedAt: d.generatedAt || null, kickoffISO: d.match?.kickoffISO || null };
  } catch (e) {
    console.error(`[meta] refresh failed: ${e.message}`);
  }
}

function persist() {
  writeChain = writeChain
    .catch(() => null)
    .then(() => writeFile(STATE_FILE, JSON.stringify(state, null, 2))
      .catch(e => console.error(`[state] save error: ${e.message}`)));
  return writeChain;
}

// Returns { stale: bool, reason: string|null }. Stale = a refresh window has
// passed since the data was last generated. See module header for the windows.
function evaluateStale() {
  const { generatedAt, kickoffISO } = dataMeta;
  if (!generatedAt || !kickoffISO) return { stale: false, reason: "no kickoff/generatedAt yet" };
  const gen = new Date(generatedAt).getTime();
  const k = new Date(kickoffISO).getTime();
  const now = Date.now();
  const H = 3600e3;
  const windows = [
    { at: k + 2 * H, label: "+2h after kickoff (result final)" },
    { at: k + 12 * H, label: "+12h after kickoff (post-match washup)" },
    { at: k - 48 * H, label: "T-48h before kickoff (team lists)" },
  ];
  const passed = windows.filter(w => w.at < now);
  if (passed.length === 0) return { stale: false, reason: "no refresh window passed yet" };
  const mostRecent = passed.reduce((a, b) => (a.at > b.at ? a : b));
  if (gen >= mostRecent.at) return { stale: false, reason: `data is fresh past ${mostRecent.label}` };
  return { stale: true, reason: `data predates window: ${mostRecent.label}` };
}

// Kicks off `npm run generate && npm run build`. Returns immediately; observe
// `regen` to know when it's done. Refuses if a run is already in flight.
function startRegen(trigger) {
  if (regen.running) return { started: false, reason: "already running" };
  regen.running = true;
  regen.startedAt = new Date().toISOString();
  regen.finishedAt = null;
  regen.error = null;
  regen.trigger = trigger;
  console.log(`[regen] starting (trigger: ${trigger})`);

  // Run generate first, then build. Streamed via shell so the && chain works
  // and stdout/stderr land in the Railway logs for after-the-fact debugging.
  const child = spawn("sh", ["-c", "npm run generate && npm run build"], {
    cwd: ROOT,
    env: process.env,
    stdio: ["ignore", "inherit", "inherit"],
  });
  child.on("exit", async (code) => {
    if (code === 0) {
      await refreshDataMeta();
      regen.error = null;
      console.log(`[regen] done (generatedAt: ${dataMeta.generatedAt})`);
    } else {
      regen.error = `exit code ${code}`;
      console.error(`[regen] failed with exit ${code}`);
    }
    regen.finishedAt = new Date().toISOString();
    regen.running = false;
  });
  child.on("error", (err) => {
    regen.error = err.message;
    regen.finishedAt = new Date().toISOString();
    regen.running = false;
    console.error(`[regen] spawn error: ${err.message}`);
  });
  return { started: true };
}

const app = express();
app.use(express.json({ limit: "200kb" }));

// ── Pick-sync API ──
app.get("/api/state/:key", (req, res) => {
  res.json({ value: state[req.params.key] ?? null });
});

app.post("/api/state/:key", async (req, res) => {
  state[req.params.key] = req.body?.value ?? null;
  await persist();
  res.json({ ok: true });
});

// Operator visibility: hit /api/_dump to inspect everything in one go.
app.get("/api/_dump", (req, res) => res.json(state));

// ── Regen API ──
app.post("/api/regenerate", (req, res) => {
  const who = String(req.get("x-dogs-user") || "").trim();
  if (who !== REGEN_ADMIN) return res.status(403).json({ ok: false, reason: "not authorised" });
  const result = startRegen(`manual:${who}`);
  res.json({ ok: true, ...result, status: regenStatus() });
});

function regenStatus() {
  return {
    running: regen.running,
    startedAt: regen.startedAt,
    finishedAt: regen.finishedAt,
    error: regen.error,
    trigger: regen.trigger,
    generatedAt: dataMeta.generatedAt,
  };
}

app.get("/api/regenerate/status", (req, res) => res.json(regenStatus()));

// Auto-regen entry point. Called by the client on app boot. If staleness
// rules say we're due for a refresh and nothing is currently running, we
// kick off the pipeline silently — current visitor keeps their stale view,
// the next page load gets fresh content. (Forcing a reload mid-session
// would be jarring; manual button exists for that.)
//
// Cooldown: avoid retrying every page load when the pipeline is failing
// (e.g. NRL API hiccup). Manual button bypasses this — Tony can always force.
const AUTO_REGEN_COOLDOWN_MS = 10 * 60e3;
app.get("/api/check-stale", (req, res) => {
  const evals = evaluateStale();
  let triggered = false;
  const sinceLast = regen.finishedAt ? Date.now() - new Date(regen.finishedAt).getTime() : Infinity;
  const onCooldown = sinceLast < AUTO_REGEN_COOLDOWN_MS;
  if (evals.stale && !regen.running && !onCooldown) {
    startRegen("auto:check-stale");
    triggered = true;
  }
  res.json({ ...evals, triggered, onCooldown, generatedAt: dataMeta.generatedAt });
});

// ── Static SPA + catchall for client-side routes ──
app.use(express.static("dist"));
app.get("*", (req, res) => res.sendFile("index.html", { root: "dist" }));

await mkdir(DATA_DIR, { recursive: true }).catch(e => console.error(`[boot] mkdir ${DATA_DIR}: ${e.message}`));
if (!existsSync(DATA_DIR)) {
  console.error(`[boot] WARNING: ${DATA_DIR} not writable — state will not survive redeploys. Mount a Railway Volume here.`);
}
await load();
await refreshDataMeta();

// Run the staleness check once on boot so a fresh container catches up if
// it's deployed mid-week without recent cron runs. Logs reason either way.
{
  const evals = evaluateStale();
  console.log(`[boot] stale check: ${evals.stale ? "STALE" : "fresh"} — ${evals.reason}`);
  if (evals.stale) startRegen("auto:boot");
}

app.listen(PORT, () => console.log(`[boot] Dog Yard up on :${PORT} (data dir: ${DATA_DIR})`));
