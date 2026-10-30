// =========================================================
// store.js — Trạng thái dùng chung + hệ thống sự kiện đơn giản
// Các module không gọi trực tiếp nhau mà giao tiếp qua store.
// =========================================================
import { DEFAULT_SETTINGS } from './config.js';
import { uid } from './utils.js';

const SETTINGS_KEY = 'behavior-analysis.settings';
const listeners = new Map();

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export const store = {
  settings: loadSettings(),

  /** Đoạn hành vi: { id, personId, behavior, start, end, confidence, source } */
  segments: [],

  /** Khung mẫu (dùng vẽ lại khung xương & trả lời chatbot): { t, persons:[{id, box, labels, kp?}] } */
  frames: [],

  /** Video đang mở */
  media: { name: null, duration: 0, width: 0, height: 0 },

  /** true khi đang chạy phân tích video (khoá tua/phát) */
  analyzing: false,

  /** Thông tin phiên phân tích gần nhất */
  meta: { analyzedAt: null, source: null },

  // ---------- Sự kiện ----------
  on(event, fn) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
    return () => listeners.get(event).delete(fn);
  },
  emit(event, payload) {
    (listeners.get(event) || []).forEach((fn) => {
      try { fn(payload); } catch (e) { console.error(`[store] lỗi listener "${event}"`, e); }
    });
  },

  // ---------- Cài đặt ----------
  saveSettings(patch) {
    this.settings = { ...this.settings, ...patch };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch { /* bỏ qua */ }
    this.emit('settings', this.settings);
  },

  // ---------- Kết quả ----------
  setResults({ segments = [], frames = [], meta = {} } = {}) {
    this.segments = segments.map((s) => ({ ...s, id: s.id || uid() }));
    this.frames = frames;
    this.meta = { ...this.meta, ...meta };
    this.emit('results', { reason: 'set' });
  },

  addSegments(list) {
    if (!list.length) return;
    list.forEach((s) => this.segments.push({ ...s, id: s.id || uid() }));
    this.emit('results', { reason: 'add' });
  },

  removeSegment(id) {
    this.segments = this.segments.filter((s) => s.id !== id);
    this.emit('results', { reason: 'remove' });
  },

  clearSource(source) {
    this.segments = this.segments.filter((s) => s.source !== source);
    if (source === 'video') this.frames = [];
    this.emit('results', { reason: 'clear' });
  },

  /** Danh sách mã người xuất hiện trong kết quả */
  persons() {
    return [...new Set(this.segments.map((s) => s.personId))].sort((a, b) => a - b);
  },
};
