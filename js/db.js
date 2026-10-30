// =========================================================
// db.js — Lưu trữ bền vững bằng IndexedDB (dung lượng lớn hơn
// localStorage, không chặn luồng giao diện). Tự lùi về localStorage
// nếu trình duyệt chặn IndexedDB (vd. chế độ riêng tư).
// =========================================================
const DB_NAME = 'behavior-analysis';
const STORE = 'kv';
let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('Không có IndexedDB')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    let settled = false;
    const fail = (error) => { if (!settled) {settled=true;clearTimeout(timer);reject(error);} };
    const timer = setTimeout(() => fail(new Error('Kho dữ liệu phản hồi quá lâu')), 1200);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => {
      if (settled) {req.result.close();return;}
      settled=true;clearTimeout(timer);
      req.result.onversionchange = () => req.result.close();
      resolve(req.result);
    };
    req.onerror = () => fail(req.error);
    req.onblocked = () => fail(new Error('Kho dữ liệu đang bị một tab khác giữ'));
  });
  return dbPromise;
}

function tx(mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    const timer = setTimeout(() => {try {t.abort();} catch {} reject(new Error('Kho dữ liệu phản hồi quá lâu'));}, 1500);
    t.oncomplete = () => {clearTimeout(timer);resolve(req?.result);};
    t.onerror = t.onabort = () => {clearTimeout(timer);reject(t.error || new Error('Giao dịch dữ liệu bị hủy'));};
  }));
}

export async function dbGet(key) {
  try {
    return await tx('readonly', (s) => s.get(key));
  } catch {
    try { return JSON.parse(localStorage.getItem(`${DB_NAME}.${key}`) || 'null'); } catch { return null; }
  }
}

export async function dbSet(key, value) {
  try {
    await tx('readwrite', (s) => s.put(value, key));
  } catch {
    try { localStorage.setItem(`${DB_NAME}.${key}`, JSON.stringify(value)); } catch { /* đầy bộ nhớ */ }
  }
}

export async function dbDel(key) {
  try { await tx('readwrite', (s) => s.delete(key)); } catch { try {localStorage.removeItem(`${DB_NAME}.${key}`);} catch {} }
}
