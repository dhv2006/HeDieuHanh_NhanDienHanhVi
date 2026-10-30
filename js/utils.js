// =========================================================
// utils.js — Hàm tiện ích: DOM, thời gian (mili-giây), hình học, thông báo
// =========================================================

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

/** 75.3 -> "01:15.3" ; 3725 -> "1:02:05.0" */
export function fmtTime(sec, withTenths = true) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const ss = withTenths ? s.toFixed(1).padStart(4, '0') : String(Math.floor(s)).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Định dạng thời gian chính xác tới mili-giây: 1.245 -> "00:01.245" */
export function fmtTimeMs(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const totalMs = Math.round(sec * 1000);
  const ms = String(totalMs % 1000).padStart(3, '0');
  const totalSec = Math.floor(totalMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = String(totalSec % 60).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${s}.${ms}` : `${mm}:${s}.${ms}`;
}

/** "1:20" | "01:20.500" | "80" | "1:02:03" -> giây. Trả về null nếu không hợp lệ */
export function parseTime(str) {
  if (str == null) return null;
  const s = String(str).trim().replace(',', '.').replace(/s$/i, '').trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  const parts = s.split(':');
  if (parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  return parts.reduce((acc, p) => acc * 60 + parseFloat(p), 0);
}

export function fmtDuration(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  if (sec < 1) return `${Math.round(sec * 1000)} ms`;
  if (sec < 60) return `${sec.toFixed(2)}s (${Math.round(sec * 1000)} ms)`;
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1);
  return `${m} phút ${s} giây`;
}

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Bỏ dấu tiếng Việt, về chữ thường — dùng để so khớp câu hỏi chatbot */
export function normalizeVi(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}

export const uid = () => Math.random().toString(36).slice(2, 10);

// ---------- Hình học ----------
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** Góc (độ) tại điểm b tạo bởi a-b-c */
export function jointAngle(a, b, c) {
  if (!a || !b || !c) return 180;
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const cos = (v1.x * v2.x + v1.y * v2.y) / ((Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y)) || 1);
  return (Math.acos(clamp(cos, -1, 1)) * 180) / Math.PI;
}

/** Góc lệch (độ) của vector top->bottom so với phương thẳng đứng. 0 = thẳng đứng, 90 = nằm ngang */
export function angleFromVertical(top, bottom) {
  if (!top || !bottom) return 0;
  const dx = bottom.x - top.x;
  const dy = bottom.y - top.y;
  return (Math.atan2(Math.abs(dx), dy) * 180) / Math.PI;
}

// ---------- File ----------
export function downloadText(filename, text, mime = 'application/json') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  downloadBlob(filename, blob);
}

export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('Không đọc được file'));
    r.readAsText(file, 'utf-8');
  });
}

export function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('Không đọc được file nhị phân'));
    r.readAsArrayBuffer(file);
  });
}

export function safeFileName(name) {
  return String(name || 'du-lieu-phan-tich').replace(/\.[^.]+$/, '').replace(/[^\w\-]+/g, '_').slice(0, 60) || 'du-lieu-phan-tich';
}

// ---------- Thông báo ----------
export function toast(message, type = 'info', ms = 3500) {
  const box = document.getElementById('toasts');
  if (!box) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

let audioCtx = null;
/** Tiếng bíp cảnh báo bằng Web Audio (không cần file âm thanh) */
export function beep(freq = 880, duration = 0.25) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch { /* trình duyệt không hỗ trợ âm thanh — bỏ qua */ }
}

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
