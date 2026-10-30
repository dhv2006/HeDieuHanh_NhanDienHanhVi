// =========================================================
// inference.js — Dịch vụ suy luận AI cho luồng chính
//
//  • Chạy mô hình trong Web Worker (luồng riêng) nếu được, tự động
//    quay về luồng chính nếu trình duyệt/hệ điều hành không hỗ trợ.
//  • Thu nhỏ khung hình trước khi suy luận (giảm băng thông bộ nhớ).
//  • Chuyển ImageBitmap sang worker bằng "transferable" (không sao chép).
//  • Đo thời gian suy luận, đếm khung bị bỏ, theo dõi bộ nhớ tensor.
// =========================================================
import { store } from './store.js';

const WORKER_URL = new URL('./workers/inference-worker.js', import.meta.url);
const CORE_URL = new URL('./core/model-core.js', import.meta.url);
const BASE_URL = new URL('../', import.meta.url).href;
const INIT_TIMEOUT_MS = 90000;

export class InferenceService {
  /** @param {{silent?: boolean}} opts  silent: không phát sự kiện trạng thái (dùng khi đo hiệu năng) */
  constructor(opts = {}) {
    this.silent = !!opts.silent;
    this.worker = null;
    this.mode = null;          // 'worker' | 'main'
    this.ready = false;
    this.backend = null;
    this.objects = false;
    this.configKey = '';
    this.defaultPoseDim = 256;
    this.initPromise = null;
    this.initQueue = Promise.resolve();
    this.initRequests = new Map();
    this.seq = 0;
    this.pending = new Map();
    this.inflight = 0;
    this.scratch = null;
    this.fallbackReason = null;
    this.stats = { calls: 0, dropped: 0, emaMs: 0, lastMs: 0, samples: [], memory: null };
  }

  get busy() { return this.inflight > 0; }

  info() {
    return { mode: this.mode, backend: this.backend, objects: this.objects, faces: this.faces, ready: this.ready, fallbackReason: this.fallbackReason, backendErrors: this.backendErrors || [] };
  }

  /**
   * @param {{threadMode:'worker'|'main', backendOrder:string[], modelType, poseDim, detectObjects, maxPoses}} cfg
   */
  init(cfg) {
    const key = JSON.stringify(cfg);
    if (this.initRequests.has(key)) return this.initRequests.get(key);
    const task = this.initQueue.catch(() => {}).then(async () => {
      if (this.ready && key === this.configKey) return this.info();
      const info = await this.#doInit(cfg);
      this.configKey = key;
      this.defaultPoseDim = cfg.poseDim || 256;
      return info;
    }).finally(() => this.initRequests.delete(key));
    this.initRequests.set(key, task);
    this.initQueue = task;
    return task;
  }

  async #doInit(cfg) {
    const started = performance.now();
    this.ready = false;
    // Finish the current frame before mutating detector/backend resources.
    while (this.inflight > 0) await new Promise((resolve) => setTimeout(resolve, 8));
    const emit = (state, text) => { if (!this.silent) store.emit('model-status', { state, text }); };
    emit('loading', 'Đang khởi tạo AI…');

    const wantWorker = cfg.threadMode === 'worker' && canUseWorker();
    if (wantWorker) {
      try {
        const backendKey = JSON.stringify(cfg.backendOrder);
        if (!this.worker || this.workerBackendKey !== backendKey) this.#startWorker();
        this.workerBackendKey = backendKey;
        const r = await withTimeout(this.#call({ type: 'init', baseUrl: BASE_URL, ...cfg }), INIT_TIMEOUT_MS, 'Worker khởi tạo quá lâu');
        this.mode = 'worker';
        this.backend = r.backend;
        this.objects = r.objects;
        this.faces = r.faces || null;
        this.backendErrors = r.backendErrors || [];
        this.ready = true;
        this.stats.startupMs = performance.now() - started;
        this.fallbackReason = null;
        emit('ready', `Sẵn sàng · ${r.backend} · worker`);
        if (!this.silent) store.emit('inference-info', this.info());
        return this.info();
      } catch (err) {
        console.warn('Worker thất bại, chuyển sang luồng chính:', err);
        this.fallbackReason = err.message;
        this.#stopWorker();
        if (cfg.workerOnly) throw err;
      }
    }

    // ---- Luồng chính ----
    this.#stopWorker();
    try {
      await loadCoreScript();
      const MC = window.ModelCore;
      MC.configure({ baseUrl: BASE_URL, onStatus: (t) => emit('loading', t) });
      const r = await MC.init(cfg);
      this.mode = 'main';
      this.backend = r.backend;
      this.objects = r.objects;
      this.faces = r.faces || null;
      this.backendErrors = r.backendErrors || [];
      this.ready = true;
      this.stats.startupMs = performance.now() - started;
      emit('ready', `Sẵn sàng · ${r.backend} · luồng chính`);
      if (!this.silent) store.emit('inference-info', this.info());
      return this.info();
    } catch (err) {
      emit('error', 'Lỗi tải mô hình');
      throw err;
    }
  }

  #startWorker() {
    this.#stopWorker();
    this.worker = new Worker(WORKER_URL);
    this.worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'status') { if (!this.silent) store.emit('model-status', { state: 'loading', text: m.text }); return; }
      const p = this.pending.get(m.id);
      if (!p) return;
      this.pending.delete(m.id);
      m.type === 'error' ? p.reject(new Error(m.message)) : p.resolve(m);
    };
    this.worker.onerror = (e) => {
      const err = new Error(e.message || 'Worker gặp lỗi');
      this.pending.forEach((p) => p.reject(err));
      this.pending.clear();
    };
  }

  #stopWorker() {
    if (this.worker) this.worker.terminate();
    this.worker = null;
    this.pending.forEach((p) => p.reject(new Error('Worker đã dừng')));
    this.pending.clear();
    this.inflight = 0;
  }

  #call(msg, transfer = []) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try { this.worker.postMessage({ ...msg, id }, transfer); }
      catch (error) { this.pending.delete(id); reject(error); }
    });
  }

  /**
   * Lấy khung hình từ video/canvas và thu nhỏ về chiều rộng targetW.
   * Dùng createImageBitmap (thường được GPU tăng tốc); nếu trình duyệt không
   * hỗ trợ tuỳ chọn resize thì vẽ qua canvas tạm.
   */
  async grab(source, targetW) {
    const sw = source.videoWidth || source.width;
    const sh = source.videoHeight || source.height;
    if (!sw || !sh) throw new Error('Nguồn hình chưa sẵn sàng');
    // Bound portrait frames too, so rotating a phone cannot double pixel work.
    const scale = Math.min(1, targetW / Math.max(sw, sh));
    const w = Math.max(32, Math.round(sw * scale));
    const h = Math.max(32, Math.round(sh * scale));
    let bitmap = null;
    try {
      bitmap = await createImageBitmap(source, { resizeWidth: w, resizeHeight: h, resizeQuality: 'low' });
      if (bitmap.width && bitmap.height && (bitmap.width !== w || bitmap.height !== h)) {
        bitmap.close?.(); bitmap = null;
        throw new Error('Trình duyệt bỏ qua kích thước ImageBitmap');
      }
    } catch {
      this.scratch ||= document.createElement('canvas');
      if (this.scratch.width !== w) this.scratch.width = w;
      if (this.scratch.height !== h) this.scratch.height = h;
      this.scratch.getContext('2d').drawImage(source, 0, 0, w, h);
      bitmap = await createImageBitmap(this.scratch).catch(() => null);
      if (!bitmap) {
        if (this.mode === 'worker') throw new Error('Trình duyệt không tạo được ImageBitmap');
        bitmap = this.scratch;
      }
    }
    return { bitmap, sx: (bitmap.width || w) / sw, sy: (bitmap.height || h) / sh };
  }

  /** Suy luận trên video/canvas (tự thu nhỏ) */
  async detect(source, opts = {}) {
    const g = await this.grab(source, opts.inputWidth || 480);
    return this.detectGrabbed(g, opts);
  }

  /** Suy luận trên khung đã lấy bằng grab(); toạ độ trả về theo kích thước gốc */
  async detectGrabbed({ bitmap, sx, sy }, opts = {}) {
    if (!this.ready) {
      try { await this.initQueue; }
      catch (err) { bitmap.close?.(); throw err; }
      if (!this.ready) { bitmap.close?.(); throw new Error('Mô hình chưa sẵn sàng'); }
    }
    const t0 = performance.now();
    this.inflight++;
    let r;
    try {
      const payload = {
        timestampMs: opts.timestampMs,
        runPose: opts.runPose !== false,
        poseDim: opts.poseDim || this.defaultPoseDim,
        withObjects: !!opts.withObjects && this.objects,
        maxPoses: opts.maxPoses || 6,
        withFaces: !!opts.withFaces && !!this.faces?.detect,
        faceEmotion: store.settings.faceEmotion,
        faceRes: !!opts.faceRes && !!this.faces?.recog,
        faceResMax: opts.faceResMax || 2,
        faceMax: opts.faceMax || 4,
      };
      if (this.mode === 'worker') {
        r = await this.#call({ type: 'detect', bitmap, ...payload }, [bitmap]);
      } else {
        try {
          r = await window.ModelCore.detect(bitmap, payload);
          r.memory = window.ModelCore.memory();
        } finally { bitmap.close?.(); }
      }
    } finally {
      this.inflight--;
    }

    // Đưa toạ độ về kích thước khung gốc
    const poses = r.poses.map((p) => ({
      ...p,
      keypoints: p.keypoints.map((k) => ({ x: k.x / sx, y: k.y / sy, score: k.score })),
    }));
    const objects = (r.objects || []).map((o) => ({
      ...o,
      bbox: [o.bbox[0] / sx, o.bbox[1] / sy, o.bbox[2] / sx, o.bbox[3] / sy],
    }));

    const faces = r.faces ? r.faces.map((f) => ({
      ...f,
      box: [f.box[0] / sx, f.box[1] / sy, f.box[2] / sx, f.box[3] / sy],
      lm: f.lm.map((v, i) => (i % 2 ? v / sy : v / sx)),
    })) : null;

    const roundTrip = performance.now() - t0;
    this.#record(r.inferMs, roundTrip, r.memory);
    if (r.poseDim) this.stats.poseDim = r.poseDim;
    for (const key of ['poseMs', 'objectMs', 'faceMs']) {
      if (r[key] > 0) this.stats[key] = this.stats[key] ? this.stats[key] * 0.8 + r[key] * 0.2 : r[key];
    }
    if (opts.withFaces) this.stats.faceCalls = (this.stats.faceCalls || 0) + 1;
    if (opts.faceRes) this.stats.recogCalls = (this.stats.recogCalls || 0) + 1;
    if (opts.withObjects) this.stats.objectCalls = (this.stats.objectCalls || 0) + 1;
    return { poses, objects, faces, poseDim: r.poseDim, inferMs: r.inferMs, roundTripMs: roundTrip };
  }

  #record(inferMs, roundTrip, memory) {
    const s = this.stats;
    s.calls++;
    s.lastMs = roundTrip;
    s.emaMs = s.emaMs ? s.emaMs * 0.85 + roundTrip * 0.15 : roundTrip;
    s.samples.push(roundTrip);
    if (s.samples.length > 120) s.samples.shift();
    if (memory) s.memory = memory;
    if (!this.silent) store.emit('perf-sample', { inferMs, roundTrip });
  }

  markDropped() { this.stats.dropped++; }

  p95() {
    const a = [...this.stats.samples].sort((x, y) => x - y);
    return a.length ? a[Math.floor(a.length * 0.95) - (a.length > 1 ? 1 : 0)] : 0;
  }

  resetTracker() {
    if (this.mode === 'worker' && this.worker) this.worker.postMessage({ type: 'reset' });
    else window.ModelCore?.resetTracker();
  }

  resetStats() {
    this.stats = { calls: 0, dropped: 0, emaMs: 0, lastMs: 0, samples: [], memory: this.stats.memory, startupMs: this.stats.startupMs };
  }

  terminate() {
    this.#stopWorker();
    this.ready = false;
    this.configKey = '';
  }
}

export function canUseWorker() {
  return typeof Worker !== 'undefined' && typeof createImageBitmap === 'function';
}

function loadCoreScript() {
  if (window.ModelCore) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = CORE_URL.href;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Không tải được model-core.js'));
    document.head.appendChild(s);
  });
}

function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  })]).finally(() => clearTimeout(timer));
}

// Separate execution contexts, with one copy of each existing model:
// MoveNet belongs to primary; face/object models belong to auxiliary.
export class AnalysisService {
  constructor() {
    this.primary = new InferenceService({ silent: true });
    this.auxiliary = new InferenceService({ silent: true });
    this.split = false;
    this.queue = Promise.resolve();
    this.requests = new Map();
    this.auxPending = false;
    this.completed = [];
    this.generation = 0;
    this.startupMs = 0;
    this.frameStats = { calls: 0, dropped: 0, emaMs: 0, lastMs: 0, samples: [] };
  }
  get ready() { return this.primary.ready && (!this.split || this.auxiliary.ready); }
  get mode() { return this.primary.mode; }
  get backend() { return this.primary.backend; }
  get faces() { return (this.split ? this.auxiliary : this.primary).faces; }
  get objects() { return (this.split ? this.auxiliary : this.primary).objects; }
  get fallbackReason() { return this.primary.fallbackReason; }
  get backendErrors() { return this.primary.backendErrors; }
  get busy() { return this.primary.busy; }
  get auxBusy() { return this.auxPending || this.auxiliary.busy || !this.auxiliary.ready; }
  get stats() {
    const p = this.primary.stats, a = this.split ? this.auxiliary.stats : p;
    const memory = p.memory ? { ...p.memory,
      numTensors: p.memory.numTensors + (this.split ? a.memory?.numTensors || 0 : 0),
      numBytes: p.memory.numBytes + (this.split ? a.memory?.numBytes || 0 : 0),
    } : null;
    return { ...this.frameStats, memory, startupMs: this.startupMs,
      poseDim: p.poseDim, poseMs: p.poseMs, faceMs: a.faceMs, objectMs: a.objectMs,
      faceCalls: a.faceCalls || 0, recogCalls: a.recogCalls || 0, objectCalls: a.objectCalls || 0,
      auxiliaryMs: this.split ? a.emaMs : 0, auxiliaryBackend: this.split ? this.auxiliary.backend : null,
    };
  }
  info() { return { ...this.primary.info(), ready: this.ready, faces: this.faces, objects: this.objects,
    split: this.split, auxiliaryBackend: this.split ? this.auxiliary.backend : null }; }
  init(cfg) {
    const key = JSON.stringify(cfg);
    if (this.requests.has(key)) return this.requests.get(key);
    const task = this.queue.catch(() => {}).then(async () => {
      const started = performance.now();
      const changed = key !== this.configKey;
      if (changed) { this.generation++; this.completed = []; }
      if (changed) store.emit('model-status', { state: 'loading', text: 'Đang khởi tạo AI…' });
      this.split = cfg.threadMode === 'worker' && canUseWorker();
      if (this.split) {
        const initialized = await Promise.allSettled([
          this.primary.init({ ...cfg, workerOnly: true, role: 'pose', detectObjects: false, detectFaces: false }),
          this.auxiliary.init({ ...cfg, workerOnly: true, role: 'auxiliary', runPose: false }),
        ]);
        // Shared main-thread ModelCore cannot safely represent two roles.
        if (initialized.some((r) => r.status === 'rejected')) {
          this.auxiliary.terminate();
          this.split = false;
          await this.primary.init(cfg);
        }
      } else { this.auxiliary.terminate(); await this.primary.init(cfg); }
      this.configKey = key;
      if (changed) this.startupMs = performance.now() - started;
      const info = this.info();
      store.emit('model-status', { state: 'ready', text: `Sẵn sàng · ${info.backend} · ${this.split ? '2 worker' : info.mode}` });
      store.emit('inference-info', info);
      return info;
    }).finally(() => this.requests.delete(key));
    this.requests.set(key, task); this.queue = task;
    return task;
  }
  grab(source, width) { return this.primary.grab(source, width); }
  async detect(source, opts = {}) { return this.detectGrabbed(await this.grab(source, opts.inputWidth || 480), opts); }
  async detectGrabbed(frame, opts = {}) {
    try { await this.queue; }
    catch (error) { frame.bitmap.close?.(); throw error; }
    const started = performance.now();
    let result;
    if (this.split && (opts.withObjects || opts.withFaces)) {
      let copy;
      try { copy = await createImageBitmap(frame.bitmap); }
      catch (err) { frame.bitmap.close?.(); throw err; }
      const results = await Promise.allSettled([
        this.primary.detectGrabbed(frame, { ...opts, withObjects: false, withFaces: false, faceRes: false }),
        this.auxiliary.detectGrabbed({ ...frame, bitmap: copy }, { ...opts, runPose: false }),
      ]);
      const error = results.find((r) => r.status === 'rejected');
      if (error) throw error.reason;
      result = { ...results[0].value, faces: results[1].value.faces, objects: results[1].value.objects };
    } else result = await this.primary.detectGrabbed(frame, opts);
    this.record(result, performance.now() - started);
    return result;
  }
  async detectPoseGrabbed(frame, opts = {}) {
    try { await this.queue; }
    catch (error) { frame.bitmap.close?.(); throw error; }
    const started = performance.now();
    const result = await this.primary.detectGrabbed(frame, { ...opts, withFaces: false, withObjects: false, faceRes: false });
    this.record(result, performance.now() - started);
    return result;
  }
  record(result, elapsed) {
    const s = this.frameStats;
    s.calls++; s.lastMs = elapsed;
    s.emaMs = s.emaMs ? s.emaMs * .85 + elapsed * .15 : elapsed;
    s.samples.push(elapsed); if (s.samples.length > 120) s.samples.shift();
    store.emit('perf-sample', { inferMs: result.inferMs, roundTrip: elapsed });
  }
  // No backlog: refuse new auxiliary captures while the previous one runs.
  requestAuxiliary(source, opts) {
    if (!this.split || this.auxBusy || (!opts.withFaces && !opts.withObjects)) return false;
    this.auxPending = true;
    const generation = this.generation;
    this.auxiliary.detect(source, { ...opts, runPose: false }).then((result) => {
      if (generation !== this.generation) return;
      this.completed.push({ ...result, ...opts });
      if (this.completed.length > 2) this.completed.shift();
    }).catch((error) => {
      if (generation === this.generation) store.emit('model-warning', `Tác vụ mặt/đồ vật gặp lỗi: ${error.message}`);
    }).finally(() => { this.auxPending = false; });
    return true;
  }
  pollAuxiliary() { const result = this.completed; this.completed = []; return result; }
  invalidateAuxiliary() { this.generation++; this.completed = []; }
  markDropped() { this.frameStats.dropped++; }
  p95() { const a = [...this.frameStats.samples].sort((a,b) => a-b); return a.length ? a[Math.ceil(a.length*.95)-1] : 0; }
  resetTracker() { this.primary.resetTracker(); if (this.split) this.auxiliary.resetTracker(); this.invalidateAuxiliary(); }
  resetStats() {
    this.primary.resetStats(); this.auxiliary.resetStats();
    this.frameStats = { calls: 0, dropped: 0, emaMs: 0, lastMs: 0, samples: [] };
  }
  terminate() { this.invalidateAuxiliary(); this.primary.terminate(); this.auxiliary.terminate(); this.configKey = ''; }
}

export const inference = new AnalysisService();
