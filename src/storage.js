// Picks live on the server (Express + JSON-on-Railway-Volume) so all three
// mates see each other's votes. localStorage is kept as a fast read-through
// cache + offline fallback — if the server is briefly unreachable the app
// keeps working using the last-seen values from the local cache.
//
// One key escapes the sync layer: `me` (which user this device belongs to)
// is per-device and never leaves the phone. That's what lets each device
// default to its owner without anyone needing to log in.
//
// MIGRATION: any pick locked before the server existed is sitting in
// localStorage on whichever phone cast it. On load, loadData() merges
// device-local user entries into whatever the server has (server wins on
// conflict, local fills the gaps). One open of the app per phone is enough
// to migrate that device's existing votes up to the shared store.

const KEY = (k) => `dogs-hq:${k}`;
const LOCAL_ONLY = new Set(["me"]);

function loadLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(KEY(key));
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveLocal(key, data) {
  try { localStorage.setItem(KEY(key), JSON.stringify(data)); } catch {}
}

async function getRemote(key) {
  const r = await fetch(`/api/state/${encodeURIComponent(key)}`);
  if (!r.ok) throw new Error(`GET ${key}: ${r.status}`);
  const { value } = await r.json();
  return value;
}

async function postRemote(key, value) {
  await fetch(`/api/state/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value }),
  });
}

// All our pick keys store {user: ...} shaped objects. Merge them so each
// device contributes its own user's entries without clobbering anyone
// else's data already on the server.
function mergeUserKeyed(serverVal, localVal) {
  const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);
  if (!isObj(localVal)) return null;
  const base = isObj(serverVal) ? serverVal : {};
  let changed = false;
  const merged = { ...base };
  for (const [user, val] of Object.entries(localVal)) {
    if (!(user in merged)) { merged[user] = val; changed = true; }
  }
  return changed ? merged : null;
}

export async function loadData(key, fallback) {
  if (LOCAL_ONLY.has(key)) return loadLocal(key, fallback);
  let serverValue;
  try {
    serverValue = await getRemote(key);
  } catch {
    // Offline / dev / server down — fall back to the local cache.
    return loadLocal(key, fallback);
  }
  const localValue = loadLocal(key, null);
  // One-time migration: if our local cache has user-keyed entries the server
  // doesn't yet have, push the merged result up. Self-healing — runs every
  // load but only writes when there's something new to add.
  const merged = mergeUserKeyed(serverValue, localValue);
  if (merged) {
    postRemote(key, merged).catch(() => null);
    saveLocal(key, merged);
    return merged;
  }
  if (serverValue != null) {
    saveLocal(key, serverValue); // refresh cache
    return serverValue;
  }
  return localValue ?? fallback;
}

export async function saveData(key, data) {
  saveLocal(key, data); // optimistic local write so the UI stays snappy
  if (LOCAL_ONLY.has(key)) return;
  try {
    await postRemote(key, data);
  } catch {
    /* failed to sync — value is still in localStorage; user can retry by
       interacting again later. For 3 mates this is fine; we don't queue. */
  }
  // Picks live in several places (tip, coach debates, recap, trivia) and the
  // consolidated "Have your say" panel needs to refresh its X/Y count when any
  // of them changes. Broadcast on save so subscribers can re-read.
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("dogs-hq:picks-changed", { detail: { key } }));
  }
}
