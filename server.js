// Dog Yard server. Serves the built SPA and a tiny key-value state API so the
// three mates' picks sync across devices instead of living only in localStorage.
//
// Persistence: a single JSON file on a Railway Volume mounted at /app/data
// (override via DATA_DIR env). The volume survives redeploys — without it,
// state would vanish every Tuesday/Thursday/Monday when the auto-refresh
// GitHub Action pushes a new data.json and Railway redeploys.
//
// The API surface is intentionally tiny:
//   GET  /api/state/:key  → { value: <stored> | null }
//   POST /api/state/:key  → body { value: ... }, persists, returns { ok: true }
// `key` matches whatever src/storage.js sends (e.g. "tips-r10", "debates-r10").

import express from "express";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";

const PORT = process.env.PORT || 4173;
const DATA_DIR = process.env.DATA_DIR || "./data";
const STATE_FILE = `${DATA_DIR}/state.json`;

let state = {};
// Serialise file writes — multiple in-flight POSTs would otherwise race on the
// read-modify-write of state.json. Chained promise queue keeps them ordered.
let writeChain = Promise.resolve();

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

function persist() {
  writeChain = writeChain
    .catch(() => null)
    .then(() => writeFile(STATE_FILE, JSON.stringify(state, null, 2))
      .catch(e => console.error(`[state] save error: ${e.message}`)));
  return writeChain;
}

const app = express();
app.use(express.json({ limit: "200kb" }));

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

// Static SPA + catchall for client-side routes (we don't have any but keep the
// pattern in case we add them).
app.use(express.static("dist"));
app.get("*", (req, res) => res.sendFile("index.html", { root: "dist" }));

await mkdir(DATA_DIR, { recursive: true }).catch(e => console.error(`[boot] mkdir ${DATA_DIR}: ${e.message}`));
if (!existsSync(DATA_DIR)) {
  console.error(`[boot] WARNING: ${DATA_DIR} not writable — state will not survive redeploys. Mount a Railway Volume here.`);
}
await load();
app.listen(PORT, () => console.log(`[boot] Dog Yard up on :${PORT} (data dir: ${DATA_DIR})`));
