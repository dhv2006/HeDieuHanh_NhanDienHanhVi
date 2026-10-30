// =========================================================
// features.js — Trích đặc trưng từ chuỗi khung xương
//
// Mỗi mẫu = 1 "cửa sổ" ~1 giây quanh thời điểm t của 1 người.
// Vector 59 chiều, bất biến với vị trí & khoảng cách tới camera:
//   [0..33]  toạ độ 17 khớp đã chuẩn hoá (gốc = hông, đơn vị = thân)
//   [34..50] tốc độ trung bình từng khớp (thân/giây)
//   [51..54] độ lệch chuẩn x, y của 2 cổ tay (bắt động tác lặp)
//   [55..56] vận tốc ngang/dọc của cả cơ thể
//   [57]     độ nghiêng thân   [58] tỉ lệ khung bao rộng/cao
// =========================================================
import { KP } from './config.js';

export const FEAT_DIM = 59;
export const WINDOW_SEC = 1.0;

const clampv = (v, lim) => (v > lim ? lim : v < -lim ? -lim : v);

/** Chuẩn hoá 1 khung xương: dời gốc về hông, chia cho chiều dài thân */
export function normalizeEntry(kp, minScore, t) {
  const ok = (i) => kp[i] && kp[i].score >= minScore;
  const mid = (a, b) => (ok(a) && ok(b)
    ? { x: (kp[a].x + kp[b].x) / 2, y: (kp[a].y + kp[b].y) / 2 }
    : ok(a) ? kp[a] : ok(b) ? kp[b] : null);

  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity, n = 0;
  for (let i = 0; i < 17; i++) {
    if (!ok(i)) continue;
    n++;
    x1 = Math.min(x1, kp[i].x); y1 = Math.min(y1, kp[i].y);
    x2 = Math.max(x2, kp[i].x); y2 = Math.max(y2, kp[i].y);
  }
  if (n < 5) return null;

  const hip = mid(KP.lHip, KP.rHip);
  const sh = mid(KP.lShoulder, KP.rShoulder);
  const center = hip || sh || { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
  let s = hip && sh ? Math.hypot(sh.x - hip.x, sh.y - hip.y) : (y2 - y1) * 0.3;
  if (!(s > 2)) s = Math.max((y2 - y1) * 0.3, 2);

  const v = new Float32Array(34);
  const vis = new Uint8Array(17);
  for (let i = 0; i < 17; i++) {
    if (!ok(i)) continue;
    vis[i] = 1;
    v[i * 2] = clampv((kp[i].x - center.x) / s, 4);
    v[i * 2 + 1] = clampv((kp[i].y - center.y) / s, 4);
  }
  const tilt = hip && sh ? Math.atan2(Math.abs(hip.x - sh.x), hip.y - sh.y) / (Math.PI / 2) : 0;
  const aspect = (x2 - x1) / Math.max(1, y2 - y1);
  return { t, cx: center.x, cy: center.y, s, v, vis, tilt, aspect: Math.min(4, aspect) };
}

/** Đặc trưng của 1 cửa sổ (entries sắp theo thời gian, phần tử cuối = hiện tại) */
export function windowFeatures(entries) {
  if (!entries || entries.length < 3) return null;
  const cur = entries[entries.length - 1];
  const first = entries[0];
  const span = cur.t - first.t;
  if (span < 0.15) return null;

  const f = new Float32Array(FEAT_DIM);
  f.set(cur.v, 0);

  // Tốc độ từng khớp
  for (let i = 0; i < 17; i++) {
    let dsum = 0, tsum = 0;
    for (let k = 1; k < entries.length; k++) {
      const a = entries[k - 1], b = entries[k];
      if (!a.vis[i] || !b.vis[i]) continue;
      dsum += Math.hypot(b.v[i * 2] - a.v[i * 2], b.v[i * 2 + 1] - a.v[i * 2 + 1]);
      tsum += b.t - a.t;
    }
    f[34 + i] = tsum > 0 ? Math.min(10, dsum / tsum) : 0;
  }

  // Dao động cổ tay
  [KP.lWrist, KP.rWrist].forEach((w, j) => {
    const xs = [], ys = [];
    entries.forEach((e) => { if (e.vis[w]) { xs.push(e.v[w * 2]); ys.push(e.v[w * 2 + 1]); } });
    f[51 + j * 2] = std(xs);
    f[52 + j * 2] = std(ys);
  });

  const sAvg = (cur.s + first.s) / 2;
  f[55] = clampv((cur.cx - first.cx) / sAvg / span, 6);
  f[56] = clampv((cur.cy - first.cy) / sAvg / span, 6);
  f[57] = cur.tilt;
  f[58] = cur.aspect;
  return f;
}

function std(a) {
  if (a.length < 2) return 0;
  const m = a.reduce((s, x) => s + x, 0) / a.length;
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length);
}

/**
 * Trích đặc trưng từ các khung đã lưu (store.frames, có toạ độ kp).
 * @returns {Array<{t, personId, feat, labels}>}
 */
export function featuresFromFrames(frames, { personId = null, from = -Infinity, to = Infinity, minScore = 0.3, stride = 1 } = {}) {
  const seqs = new Map();
  for (const f of frames) {
    for (const p of f.persons) {
      if (!p.kp) continue;
      if (personId != null && p.id !== personId) continue;
      const kp = p.kp.map(([x, y, score]) => ({ x, y, score }));
      const e = normalizeEntry(kp, minScore, f.t);
      if (!e) continue;
      e.labels = p.labels;
      if (!seqs.has(p.id)) seqs.set(p.id, []);
      seqs.get(p.id).push(e);
    }
  }
  const out = [];
  for (const [pid, seq] of seqs) {
    let startIdx = 0;
    for (let i = 0; i < seq.length; i += 1) {
      const t = seq[i].t;
      while (startIdx < i && t - seq[startIdx].t > WINDOW_SEC) startIdx++;
      if (t < from || t > to || i % stride) continue;
      const feat = windowFeatures(seq.slice(startIdx, i + 1));
      if (feat) out.push({ t, personId: pid, feat, labels: seq[i].labels || [] });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

export function hasKeypoints(frames) {
  return frames.some((f) => f.persons.some((p) => Array.isArray(p.kp)));
}
