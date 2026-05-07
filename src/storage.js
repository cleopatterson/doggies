// Picks live on the server (Express + JSON-on-Railway-Volume) so all three
// mates see each other's votes. localStorage is kept as a fast read-through
// cache + offline fallback — if the server is briefly unreachable the app
// keeps working using the last-seen values from the local cache.
//
// One key escapes the sync layer: `me` (which user this device belongs to)
// is per-device and never leaves the phone. That's what lets each device
// default to its owner without anyone needing to log in.

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

export async function loadData(key, fallback) {
  if (LOCAL_ONLY.has(key)) return loadLocal(key, fallback);
  try {
    const r = await fetch(`/api/state/${encodeURIComponent(key)}`);
    if (r.ok) {
      const { value } = await r.json();
      if (value != null) {
        saveLocal(key, value); // refresh cache
        return value;
      }
    }
  } catch {
    /* offline / dev / server down — fall through to cache */
  }
  return loadLocal(key, fallback);
}

export async function saveData(key, data) {
  saveLocal(key, data); // optimistic local write so the UI stays snappy
  if (LOCAL_ONLY.has(key)) return;
  try {
    await fetch(`/api/state/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: data }),
    });
  } catch {
    /* failed to sync — value is still in localStorage; user can retry by
       interacting again later. For 3 mates this is fine; we don't queue. */
  }
}
