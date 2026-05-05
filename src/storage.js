// localStorage shim that mirrors window.storage's get/set API
const KEY = (k) => `dogs-hq:${k}`;

export async function loadData(key, fallback) {
  try {
    const raw = localStorage.getItem(KEY(key));
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export async function saveData(key, data) {
  try {
    localStorage.setItem(KEY(key), JSON.stringify(data));
  } catch {}
}
