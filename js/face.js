// =========================================================
// face.js — Đã loại bỏ mô hình nhận diện khuôn mặt & biểu cảm
// theo yêu cầu thiết kế (chỉ giữ hàm nhãn định danh người #1, #2…)
// =========================================================
import { store } from './store.js';

export async function initFaces() {
  return true;
}

export function personName(source, id) {
  return store.names?.[`${source}|${id}`] || null;
}

export function personLabel(id, source = null) {
  if (source) {
    const n = personName(source, id);
    if (n) return `#${id} ${n}`;
  }
  return `Người #${id}`;
}

export function listPeople() {
  return [];
}

export function expandFace() {
  return null;
}

export function compactFace() {
  return null;
}
