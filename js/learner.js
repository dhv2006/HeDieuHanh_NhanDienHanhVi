// =========================================================
// learner.js — Học hành vi mới
//
//  • Dạy có giám sát: người dùng ghi mẫu (camera / đoạn video) và đặt tên
//  • Huấn luyện: KNN (ít mẫu) hoặc MLP (nhiều mẫu) trong Web Worker
//  • Nhận diện có "cổng từ chối": mẫu quá xa mọi mẫu đã học → không gán
//    nhãn (tránh ép mọi chuyển động vào hành vi đã học)
//  • Tự khám phá: phân cụm k-means các chuyển động trong video, đề xuất
//    cụm mà bộ luật có sẵn giải thích kém → người dùng đặt tên để học
//  • Tự học (self-training): thêm mẫu dự đoán rất chắc chắn vào tập học
//  • Lưu bền vững trong IndexedDB, xuất/nhập "gói hành vi" dạng JSON
// =========================================================
import { store } from './store.js';
import { BEHAVIORS, LEARNED_COLORS, behaviorInfo } from './config.js';
import { dbGet, dbSet } from './db.js';
import { FEAT_DIM, featuresFromFrames } from './features.js';
import { SegmentBuilder } from './behavior.js';
import { normalizeVi, round, toast, downloadText, readFileAsText, debounce } from './utils.js';

const DB_KEY = 'learner-v1';
const MAX_PER_CLASS = 1500;
const REF_PER_CLASS = 300;
const TRAIN_URL = new URL('./workers/train-worker.js', import.meta.url);

const L = {
  classes: [],     // {key, label, color, createdAt}
  samples: [],     // {c, f: Float32Array, src}
  model: null,     // {type, keys[], mean, std, ref, refY, radius, (W1,b1,W2,b2,hidden), trainAcc, valAcc, trainedAt}
  dirty: false,
  lastDiscovery: null,
};

const toF32 = (x) => (x instanceof Float32Array ? x : Float32Array.from(Array.isArray(x) ? x : Object.values(x || {})));
const toI32 = (x) => (x instanceof Int32Array ? x : Int32Array.from(Array.isArray(x) ? x : Object.values(x || {})));

// ---------------------------------------------------------
// Khởi tạo & lưu trữ
// ---------------------------------------------------------
export async function initLearner() {
  const d = await dbGet(DB_KEY);
  if (d) {
    L.classes = d.classes || [];
    L.samples = (d.samples || []).map((s) => ({ c: s.c, src: s.src, f: toF32(s.f) }));
    L.model = d.model ? reviveModel(d.model) : null;
    L.dirty = !!d.dirty;
  }
  L.classes.forEach(register);
  emit();
}

function reviveModel(m) {
  const out = { ...m, mean: toF32(m.mean), std: toF32(m.std), ref: toF32(m.ref), refY: toI32(m.refY), radius: toF32(m.radius) };
  if (m.type === 'mlp') ['W1', 'b1', 'W2', 'b2'].forEach((k) => { out[k] = toF32(m[k]); });
  return out;
}

const persist = debounce(() => {
  dbSet(DB_KEY, { classes: L.classes, samples: L.samples, model: L.model, dirty: L.dirty });
}, 400);

function register(c) {
  BEHAVIORS[c.key] = { label: c.label, color: c.color, group: 'learned' };
}

function emit() {
  store.emit('learner', summary());
}

export function summary() {
  const counts = {};
  L.samples.forEach((s) => { counts[s.c] = (counts[s.c] || 0) + 1; });
  return {
    classes: L.classes.map((c) => ({ ...c, count: counts[c.key] || 0 })),
    total: L.samples.length,
    model: L.model ? {
      type: L.model.type, keys: L.model.keys, trainAcc: L.model.trainAcc, valAcc: L.model.valAcc,
      trainedAt: L.model.trainedAt, nTrain: L.model.nTrain, nVal: L.model.nVal,
    } : null,
    dirty: L.dirty,
  };
}

export const hasModel = () => !!L.model && store.settings.useLearned;

// ---------------------------------------------------------
// Quản lý lớp & mẫu
// ---------------------------------------------------------
export function findClassByLabel(label) {
  const n = normalizeVi(label);
  return L.classes.find((c) => normalizeVi(c.label) === n) || null;
}

/** Trả về key của hành vi (tạo mới nếu chưa có) */
export function ensureClass(label) {
  label = String(label || '').trim();
  if (!label) throw new Error('Tên hành vi không được để trống');
  const found = findClassByLabel(label);
  if (found) return found.key;
  const slug = normalizeVi(label).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'hanh_vi';
  let key = `learned_${slug}`;
  let i = 2;
  while (BEHAVIORS[key] || L.classes.some((c) => c.key === key)) key = `learned_${slug}_${i++}`;
  const c = { key, label, color: LEARNED_COLORS[L.classes.length % LEARNED_COLORS.length], createdAt: new Date().toISOString() };
  L.classes.push(c);
  register(c);
  persist();
  emit();
  return key;
}

export function addSamples(key, feats, src = 'manual') {
  const valid = feats.filter((f) => f && f.length === FEAT_DIM);
  if (!valid.length) return 0;
  valid.forEach((f) => L.samples.push({ c: key, f: toF32(f), src }));
  // Giới hạn số mẫu mỗi lớp: bỏ ngẫu nhiên mẫu cũ (giữ bộ nhớ ổn định)
  const mine = L.samples.filter((s) => s.c === key);
  if (mine.length > MAX_PER_CLASS) {
    const drop = new Set();
    while (drop.size < mine.length - MAX_PER_CLASS) drop.add(mine[Math.floor(Math.random() * (mine.length - valid.length))]);
    L.samples = L.samples.filter((s) => !drop.has(s));
  }
  L.dirty = true;
  persist();
  emit();
  return valid.length;
}

export function removeClass(key) {
  L.classes = L.classes.filter((c) => c.key !== key);
  L.samples = L.samples.filter((s) => s.c !== key);
  delete BEHAVIORS[key];
  if (L.model?.keys.includes(key)) { L.model = null; }
  L.dirty = true;
  persist();
  emit();
}

export function renameClass(key, label) {
  const c = L.classes.find((x) => x.key === key);
  if (!c || !label.trim()) return;
  c.label = label.trim();
  register(c);
  persist();
  emit();
}

export function clearSamplesOf(key) {
  L.samples = L.samples.filter((s) => s.c !== key);
  L.dirty = true;
  persist();
  emit();
}

// ---------------------------------------------------------
// Huấn luyện
// ---------------------------------------------------------
/**
 * @param {{algo:'auto'|'knn'|'mlp', onProgress?:(p)=>void, silent?:boolean}} opts
 */
export async function train({ algo = 'auto', onProgress = () => {} } = {}) {
  const counts = {};
  L.samples.forEach((s) => { counts[s.c] = (counts[s.c] || 0) + 1; });
  const keys = L.classes.map((c) => c.key).filter((k) => (counts[k] || 0) >= 3);
  if (!keys.length) throw new Error('Cần ít nhất 3 mẫu cho một hành vi để huấn luyện.');

  const used = L.samples.filter((s) => keys.includes(s.c));
  const n = used.length;
  const X = new Float32Array(n * FEAT_DIM);
  const y = new Int32Array(n);
  used.forEach((s, i) => { X.set(s.f, i * FEAT_DIM); y[i] = keys.indexOf(s.c); });

  const useMlp = algo === 'mlp' || (algo === 'auto' && keys.length >= 2 && n >= 60);
  let model;
  if (useMlp && keys.length >= 2) {
    // Gửi bản sao X (không transfer) vì còn dùng X để dựng tập tham chiếu
    const m = await runWorker({ type: 'train', X: X.slice(), y, n, d: FEAT_DIM, classes: keys.length, opts: { epochs: 80, hidden: 64 } }, onProgress, 'trained');
    model = { ...m.model, type: 'mlp' };
  } else {
    onProgress({ epoch: 1, epochs: 1, text: 'Tính thống kê KNN' });
    model = buildKnnStats(X, y, n, keys.length);
  }
  const ref = buildReference(X, y, n, keys.length, model.mean, model.std);
  L.model = {
    ...model, keys, ref: ref.ref, refY: ref.refY,
    trainedAt: new Date().toISOString(),
  };
  if (model.type === 'knn') L.model.radius = ref.radius;
  L.dirty = false;
  persist();
  emit();
  return summary().model;
}

function runWorker(msg, onProgress, doneType) {
  return new Promise((resolve, reject) => {
    const w = new Worker(TRAIN_URL);
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress') onProgress(m);
      else if (m.type === doneType) { w.terminate(); resolve(m); }
      else if (m.type === 'error') { w.terminate(); reject(new Error(m.message)); }
    };
    w.onerror = (e) => { w.terminate(); reject(new Error(e.message || 'Worker huấn luyện lỗi')); };
    w.postMessage(msg, [msg.X.buffer]);
  });
}

function buildKnnStats(X, y, n, C) {
  const d = FEAT_DIM;
  const mean = new Float32Array(d), std = new Float32Array(d);
  for (let i = 0; i < n; i++) for (let j = 0; j < d; j++) mean[j] += X[i * d + j];
  for (let j = 0; j < d; j++) mean[j] /= n;
  for (let i = 0; i < n; i++) for (let j = 0; j < d; j++) std[j] += (X[i * d + j] - mean[j]) ** 2;
  for (let j = 0; j < d; j++) std[j] = Math.max(Math.sqrt(std[j] / n), 0.1);   // cùng sàn với worker
  // Độ chính xác leave-one-out ước lượng nhanh
  return { type: 'knn', mean, std, classes: C, trainAcc: null, valAcc: null, nTrain: n, nVal: 0 };
}

/** Tập tham chiếu đã chuẩn hoá (≤ REF_PER_CLASS mẫu/lớp) cho KNN & cổng từ chối */
function buildReference(X, y, n, C, mean, std) {
  const d = FEAT_DIM;
  const perClass = Array.from({ length: C }, () => []);
  for (let i = 0; i < n; i++) perClass[y[i]].push(i);
  const pick = perClass.map((arr) => {
    if (arr.length <= REF_PER_CLASS) return arr;
    const step = arr.length / REF_PER_CLASS;
    return Array.from({ length: REF_PER_CLASS }, (_, k) => arr[Math.floor(k * step)]);
  }).flat();
  const ref = new Float32Array(pick.length * d);
  const refY = new Int32Array(pick.length);
  pick.forEach((idx, r) => {
    refY[r] = y[idx];
    for (let j = 0; j < d; j++) ref[r * d + j] = (X[idx * d + j] - mean[j]) / std[j];
  });
  // Bán kính mỗi lớp = phân vị 95 khoảng cách tới láng giềng cùng lớp × 1.8
  const radius = new Float32Array(C);
  for (let c = 0; c < C; c++) {
    const rows = [];
    for (let r = 0; r < refY.length; r++) if (refY[r] === c) rows.push(r);
    const ds = [];
    for (const a of rows) {
      let best = Infinity;
      for (const b of rows) if (a !== b) best = Math.min(best, d2(ref, a, ref, b, d));
      if (best < Infinity) ds.push(Math.sqrt(best));
    }
    ds.sort((p, q) => p - q);
    radius[c] = ds.length ? ds[Math.min(ds.length - 1, Math.floor(ds.length * 0.95))] * 1.8 + 0.5 : 6;
  }
  return { ref, refY, radius };
}

function d2(A, a, B, b, d) {
  let s = 0;
  for (let j = 0; j < d; j++) { const t = A[a * d + j] - B[b * d + j]; s += t * t; }
  return s;
}

// ---------------------------------------------------------
// Dự đoán
// ---------------------------------------------------------
const zbuf = new Float32Array(FEAT_DIM);

/** @returns {{key, confidence, distance}|null} */
export function predict(feat, { threshold = store.settings.learnThreshold } = {}) {
  const m = L.model;
  if (!m || !feat) return null;
  const d = FEAT_DIM;
  for (let j = 0; j < d; j++) zbuf[j] = (feat[j] - m.mean[j]) / m.std[j];

  // Láng giềng gần nhất theo từng lớp + 5 láng giềng gần nhất
  const C = m.keys.length;
  const nearest = new Float32Array(C).fill(Infinity);
  const K = 5;
  const topD = [], topY = [];
  for (let r = 0; r < m.refY.length; r++) {
    let s = 0;
    for (let j = 0; j < d; j++) { const t = zbuf[j] - m.ref[r * d + j]; s += t * t; }
    const c = m.refY[r];
    if (s < nearest[c]) nearest[c] = s;
    if (topD.length < K || s < topD[topD.length - 1]) {
      let i = topD.length;
      topD.push(s); topY.push(c);
      while (i > 0 && topD[i - 1] > s) { topD[i] = topD[i - 1]; topY[i] = topY[i - 1]; i--; }
      topD[i] = s; topY[i] = c;
      if (topD.length > K) { topD.pop(); topY.pop(); }
    }
  }

  let best, conf;
  if (m.type === 'mlp') {
    const probs = mlpForward(m, zbuf);
    best = 0;
    for (let c = 1; c < C; c++) if (probs[c] > probs[best]) best = c;
    conf = probs[best];
  } else {
    const votes = new Float32Array(C);
    topY.forEach((c, i) => { votes[c] += 1 / (Math.sqrt(topD[i]) + 0.5); });
    const total = votes.reduce((a, b) => a + b, 0) || 1;
    best = 0;
    for (let c = 1; c < C; c++) if (votes[c] > votes[best]) best = c;
    conf = votes[best] / total;
  }

  // Cổng từ chối (open-set): quá xa các mẫu đã học của lớp này → không nhận
  const dist = Math.sqrt(nearest[best]);
  const rad = m.radius[best];
  if (!(dist <= rad)) return null;
  conf *= 1 - 0.4 * (dist / rad);     // càng gần biên càng kém chắc chắn
  if (conf < threshold) return null;
  return { key: m.keys[best], confidence: round(conf, 3), distance: dist };
}

function mlpForward(m, z) {
  const H = m.hidden, C = m.keys.length, d = FEAT_DIM;
  const h = new Float32Array(H);
  for (let k = 0; k < H; k++) {
    let s = m.b1[k];
    for (let j = 0; j < d; j++) s += z[j] * m.W1[j * H + k];
    h[k] = s > 0 ? s : 0;
  }
  const o = new Float32Array(C);
  let mx = -Infinity;
  for (let c = 0; c < C; c++) {
    let s = m.b2[c];
    for (let k = 0; k < H; k++) s += h[k] * m.W2[k * C + c];
    o[c] = s;
    if (s > mx) mx = s;
  }
  let sum = 0;
  for (let c = 0; c < C; c++) { o[c] = Math.exp(o[c] - mx); sum += o[c]; }
  for (let c = 0; c < C; c++) o[c] /= sum;
  return o;
}

// ---------------------------------------------------------
// Dạy từ đoạn video (dùng khung đã lưu, không cần chạy lại AI)
// ---------------------------------------------------------
export function teachFromFrames(label, { personId, from, to }) {
  const feats = featuresFromFrames(store.frames, { personId, from, to, minScore: store.settings.minScore });
  if (!feats.length) throw new Error('Không có dữ liệu khung xương trong khoảng này (cần phân tích video trước, hoặc JSON có kèm toạ độ khớp).');
  const key = ensureClass(label);
  const n = addSamples(key, feats.map((x) => x.feat), 'video');
  return { key, n };
}

// ---------------------------------------------------------
// Tự khám phá hành vi mới (phân cụm không giám sát)
// ---------------------------------------------------------
export async function discover({ k = 0, onProgress = () => {} } = {}) {
  const frames = store.frames;
  let feats = featuresFromFrames(frames, { minScore: store.settings.minScore });
  if (feats.length < 30) throw new Error('Cần video đã phân tích với ít nhất vài giây có người để khám phá.');
  if (feats.length > 4000) feats = feats.filter((_, i) => i % Math.ceil(feats.length / 4000) === 0);

  const n = feats.length;
  const X = new Float32Array(n * FEAT_DIM);
  feats.forEach((f, i) => X.set(f.feat, i * FEAT_DIM));
  const res = await runWorker({ type: 'kmeans', X, n, d: FEAT_DIM, k, kMax: 8 }, (p) => onProgress(p), 'clusters');

  const step = store.meta.sampleInterval || store.settings.sampleInterval;
  const clusters = [];
  for (let c = 0; c < res.k; c++) {
    const members = [];
    for (let i = 0; i < n; i++) if (res.assign[i] === c) members.push(i);
    if (!members.length) continue;

    // Nhãn luật chiếm ưu thế trong cụm
    const counts = {};
    members.forEach((i) => feats[i].labels.forEach((l) => { counts[l] = (counts[l] || 0) + 1; }));
    const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const purity = ranked.length ? ranked[0][1] / members.length : 0;

    // Hành vi đã học trùng khớp
    let learned = null;
    if (L.model) {
      const lc = {};
      members.forEach((i) => { const p = predict(feats[i].feat, { threshold: 0.5 }); if (p) lc[p.key] = (lc[p.key] || 0) + 1; });
      const top = Object.entries(lc).sort((a, b) => b[1] - a[1])[0];
      if (top && top[1] / members.length >= 0.5) learned = { key: top[0], share: top[1] / members.length };
    }

    // Các đoạn liên tục theo từng người
    const runs = [];
    const byPerson = {};
    members.forEach((i) => (byPerson[feats[i].personId] ||= []).push(feats[i].t));
    Object.entries(byPerson).forEach(([pid, ts]) => {
      ts.sort((a, b) => a - b);
      let s = ts[0], prev = ts[0], cnt = 1;
      const flush = () => { if (prev - s + step >= 0.75) runs.push({ personId: Number(pid), start: s, end: prev + step, n: cnt }); };
      for (let q = 1; q < ts.length; q++) {
        if (ts[q] - prev <= step * 2.5) { prev = ts[q]; cnt++; } else { flush(); s = prev = ts[q]; cnt = 1; }
      }
      flush();
    });
    runs.sort((a, b) => (b.end - b.start) - (a.end - a.start));

    clusters.push({
      id: c,
      size: members.length,
      share: members.length / n,
      rule: ranked.slice(0, 2).map(([key, v]) => ({ key, share: v / members.length })),
      purity,
      novelty: learned ? 0 : 1 - purity,
      learned,
      runs: runs.slice(0, 6),
      members,
    });
  }
  // "Biến thể": nhiều cụm cùng nhãn luật chính (vd. đều là “Đứng”) nhưng chuyển động
  // khác nhau → các cụm nhỏ hơn có thể là hành vi mới mà luật chưa phân biệt được
  // (vd. đứng chống cằm, đứng khoanh tay kiểu lạ…).
  const byTop = {};
  clusters.forEach((c) => { const top = c.rule[0]?.key || '_none'; (byTop[top] ||= []).push(c); });
  Object.values(byTop).forEach((group) => {
    if (group.length < 2) return;
    group.sort((a, b) => b.size - a.size);
    group.slice(1).forEach((c) => {
      if (c.learned) return;
      c.variantOf = c.rule[0]?.key || null;
      c.novelty = Math.max(c.novelty, 0.55);
    });
  });
  clusters.sort((a, b) => b.novelty - a.novelty || b.size - a.size);
  L.lastDiscovery = { feats, clusters, k: res.k, score: res.score };
  return { k: res.k, score: res.score, clusters };
}

/** Học 1 cụm vừa khám phá dưới tên người dùng đặt */
export function learnCluster(clusterId, label) {
  const D = L.lastDiscovery;
  const cl = D?.clusters.find((c) => c.id === clusterId);
  if (!cl) throw new Error('Không tìm thấy cụm — hãy chạy khám phá lại.');
  // Chỉ lấy mẫu nằm trong các đoạn liên tục (ít nhiễu hơn toàn bộ cụm)
  const inRuns = cl.members.filter((i) => {
    const f = D.feats[i];
    return cl.runs.some((r) => r.personId === f.personId && f.t >= r.start && f.t <= r.end);
  });
  const chosen = (inRuns.length >= 10 ? inRuns : cl.members).map((i) => D.feats[i].feat);
  const key = ensureClass(label);
  return { key, n: addSamples(key, chosen, 'discover') };
}

// ---------------------------------------------------------
// Áp dụng mô hình đã học lên kết quả video hiện có
// ---------------------------------------------------------
export function applyToFrames() {
  if (!L.model) throw new Error('Chưa có mô hình đã học. Hãy huấn luyện trước.');
  const feats = featuresFromFrames(store.frames, { minScore: store.settings.minScore });
  if (!feats.length) throw new Error('Không có dữ liệu khung xương để áp dụng.');
  const step = store.meta.sampleInterval || store.settings.sampleInterval;
  const builder = new SegmentBuilder('video', step);
  let curT = null;
  let group = [];
  const flush = () => { if (curT !== null) builder.push(curT, group); group = []; };
  for (const f of feats) {
    if (f.t !== curT) { flush(); curT = f.t; }
    const p = predict(f.feat);
    if (p) group.push({ personId: f.personId, labels: [{ behavior: p.key, confidence: p.confidence }] });
  }
  flush();
  const segs = builder.finalize();
  const others = store.segments.filter((s) => !(s.source === 'video' && s.behavior.startsWith('learned_')));
  store.setResults({ segments: [...others, ...segs], frames: store.frames, meta: store.meta });
  return segs.length;
}

/** Tự học: lấy các mẫu dự đoán rất chắc chắn làm mẫu mới rồi huấn luyện lại */
export async function selfTrain() {
  if (!L.model || !store.settings.selfTrain) return 0;
  const feats = featuresFromFrames(store.frames, { minScore: store.settings.minScore, stride: 2 });
  const picked = {};
  for (const f of feats) {
    const p = predict(f.feat, { threshold: 0.9 });
    if (!p) continue;
    (picked[p.key] ||= []).push(f.feat);
  }
  let added = 0;
  for (const [key, arr] of Object.entries(picked)) added += addSamples(key, arr.slice(0, 60), 'self');
  if (added) await train({ algo: 'auto' });
  return added;
}

// ---------------------------------------------------------
// Xuất / nhập gói hành vi
// ---------------------------------------------------------
export function exportPack() {
  if (!L.classes.length) { toast('Chưa có hành vi nào đã học.', 'warn'); return; }
  const data = {
    app: 'behavior-analysis',
    kind: 'behavior-pack',
    version: 1,
    featDim: FEAT_DIM,
    exportedAt: new Date().toISOString(),
    classes: L.classes,
    samples: L.samples.map((s) => ({ c: s.c, src: s.src, f: Array.from(s.f, (v) => Math.round(v * 1000) / 1000) })),
  };
  downloadText(`goi-hanh-vi_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data));
  toast(`Đã xuất ${L.classes.length} hành vi, ${L.samples.length} mẫu.`, 'ok');
}

export async function importPack(file) {
  const data = JSON.parse(await readFileAsText(file));
  if (data.kind !== 'behavior-pack' || !Array.isArray(data.classes)) throw new Error('Không phải file gói hành vi.');
  if (data.featDim !== FEAT_DIM) throw new Error('Gói được tạo bởi phiên bản khác (số chiều đặc trưng không khớp).');
  const keyMap = {};
  data.classes.forEach((c) => { keyMap[c.key] = ensureClass(c.label); });
  const byKey = {};
  (data.samples || []).forEach((s) => { if (keyMap[s.c]) (byKey[keyMap[s.c]] ||= []).push(s.f); });
  let n = 0;
  Object.entries(byKey).forEach(([k, arr]) => { n += addSamples(k, arr, 'import'); });
  return { classes: data.classes.length, samples: n };
}

export function labelOf(key) { return behaviorInfo(key).label; }
