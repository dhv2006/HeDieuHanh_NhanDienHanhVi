// =========================================================
// perf.js — Quản lý phần cứng & hiệu năng đa nền tảng
//
//  1. Nhận diện phần cứng/hệ điều hành: CPU, RAM, GPU, WebGL/WebGPU,
//     WASM SIMD/đa luồng, Worker, pin (PC & Điện thoại).
//  2. Xếp hạng máy (yếu / trung bình / mạnh) → chọn hồ sơ hiệu năng.
//     • Máy yếu nếu chọn setting Cao sẽ được giới hạn ở mức Trung bình để ổn định khung xương.
//     • Setting Yếu (Tiết kiệm) được tối ưu loại bỏ mô hình khuôn mặt/cảm xúc nặng nề,
//       đảm bảo chất lượng phân tích mạnh với ≥ 10 phân tích/s và ≥ 14 FPS.
//  3. Chọn thứ tự backend (WebGPU/WebGL/WASM/CPU) theo phần cứng hoặc benchmark.
//  4. Bộ điều khiển thích nghi: giữ tốc độ ≥ 10 phân tích/giây và ≥ 14 FPS.
//  5. Ghi log hiệu năng để xuất file CSV phục vụ báo cáo.
// =========================================================
import { store } from './store.js';
import { PROFILES, APP_VERSION } from './config.js';
import { poseWorkload, resolveProfileForHardware } from './performance-policy.js';
import { InferenceService, canUseWorker } from './inference.js';
import { toast, downloadText, round } from './utils.js';

const BENCH_KEY = 'behavior-analysis.benchmark';
const LEVEL_MAX = 3;

export const hw = {
  ready: false,
  mobile: /Android|iPhone|iPad|Mobile/.test(navigator.userAgent),
  os: 'Không rõ',
  browser: 'Không rõ',
  cores: navigator.hardwareConcurrency || 2,
  memoryGB: navigator.deviceMemory || null,
  gpu: { webgl: 0, renderer: 'Không rõ', software: false },
  tier: 'mid',
};
export const power = { hidden: document.hidden, batteryLow: false, charging: null, level: null };
export const live = { renderFps: 0, inferFps: 0, source: null, faceFps: 0, recogFps: 0, objectFps: 0 };
const adaptive = { level: 0, overSince: 0, underSince: 0 };
const perfLog = [];

// ---------------------------------------------------------
// 1. Nhận diện phần cứng
// ---------------------------------------------------------
export async function detectHardware() {
  const bounded = (promise, ms) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(null), ms);
    Promise.resolve(promise).then((value) => { clearTimeout(timer); resolve(value); }, (err) => { clearTimeout(timer); reject(err); });
  });
  const ua = navigator.userAgent;
  const uad = navigator.userAgentData;

  let os = uad?.platform || '';
  if (!os) {
    if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) os = 'iOS/iPadOS';
    else if (/Android/.test(ua)) os = 'Android';
    else if (/Windows NT/.test(ua)) os = 'Windows';
    else if (/Mac OS X/.test(ua)) os = 'macOS';
    else if (/CrOS/.test(ua)) os = 'ChromeOS';
    else if (/Linux/.test(ua)) os = 'Linux';
    else os = 'Không rõ';
  }
  let osVersion = '';
  let arch = '';
  if (uad?.getHighEntropyValues) {
    try {
      const v = await bounded(uad.getHighEntropyValues(['platformVersion', 'architecture', 'bitness']), 600);
      if (!v) throw new Error('Thông tin phần cứng phản hồi chậm');
      osVersion = v.platformVersion || '';
      arch = [v.architecture, v.bitness && `${v.bitness}-bit`].filter(Boolean).join(' ');
      if (os === 'Windows' && osVersion) os = parseInt(osVersion, 10) >= 13 ? 'Windows 11' : 'Windows 10';
    } catch { /* bỏ qua */ }
  }

  const browser = detectBrowser(ua, uad);
  const gpu = getGpuInfo();
  let webgpu = false;
  let webgpuInfo = '';
  if (navigator.gpu) {
    try {
      const adapter = await bounded(navigator.gpu.requestAdapter(), 800);
      webgpu = !!adapter;
      const info = adapter?.info || (adapter?.requestAdapterInfo ? await bounded(adapter.requestAdapterInfo(), 600) : null);
      if (info) webgpuInfo = [info.vendor, info.architecture].filter(Boolean).join(' ');
    } catch { /* không có WebGPU */ }
  }

  const simd = (() => {
    try {
      return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
    } catch { return false; }
  })();

  Object.assign(hw, {
    os,
    osVersion,
    arch,
    browser,
    cores: navigator.hardwareConcurrency || null,
    memoryGB: navigator.deviceMemory || null,
    gpu,
    webgpu,
    webgpuInfo,
    wasmSimd: simd,
    wasmThreads: !!(window.crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined'),
    offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
    worker: canUseWorker(),
    videoFrameCallback: 'requestVideoFrameCallback' in HTMLVideoElement.prototype,
    mobile: uad?.mobile ?? (/Android|iPhone|iPad|Mobile/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)),
    screen: `${screen.width}×${screen.height} @${window.devicePixelRatio || 1}x`,
  });
  hw.tier = computeTier(hw);
  hw.fingerprint = [hw.os, hw.browser, hw.cores, hw.memoryGB, gpu.renderer].join('|');
  hw.ready = true;

  initPowerManagement();
  store.emit('hardware', hw);
  return hw;
}

function detectBrowser(ua, uad) {
  const brand = uad?.brands?.find((b) => /Edge|Chrome|Opera|Brave|Cốc Cốc|CocCoc|Samsung/i.test(b.brand) && !/Chromium/.test(b.brand));
  if (brand) return `${brand.brand} ${brand.version}`;
  let m;
  if ((m = ua.match(/Edg\/([\d.]+)/))) return `Edge ${m[1]}`;
  if ((m = ua.match(/coc_coc_browser\/([\d.]+)/i))) return `Cốc Cốc ${m[1]}`;
  if ((m = ua.match(/Firefox\/([\d.]+)/))) return `Firefox ${m[1]}`;
  if ((m = ua.match(/Chrome\/([\d.]+)/))) return `Chrome ${m[1]}`;
  if ((m = ua.match(/Version\/([\d.]+).*Safari/))) return `Safari ${m[1]}`;
  return 'Không rõ';
}

function getGpuInfo() {
  const out = { webgl: 0, renderer: 'Không rõ', vendor: '', software: false, maxTexture: 0 };
  try {
    const c = document.createElement('canvas');
    let gl = c.getContext('webgl2');
    out.webgl = gl ? 2 : 0;
    if (!gl) { gl = c.getContext('webgl'); out.webgl = gl ? 1 : 0; }
    if (gl) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      out.renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      out.vendor = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
      out.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch { /* không có WebGL */ }
  out.software = /swiftshader|llvmpipe|softpipe|basic render|software|lavapipe/i.test(out.renderer);
  return out;
}

/** Chấm điểm máy: CPU + RAM + GPU → 'low' | 'mid' | 'high' */
function computeTier(h) {
  let score = 0;
  const c = h.cores || 2;
  score += c >= 8 ? 2 : c >= 4 ? 1 : 0;
  const m = h.memoryGB;
  score += m == null ? 1 : m >= 8 ? 2 : m >= 4 ? 1 : 0;
  const r = h.gpu.renderer || '';
  if (h.gpu.software || !h.gpu.webgl) score -= 2;
  else if (/nvidia|geforce|rtx|gtx|radeon rx|radeon pro|apple m\d|apple gpu|arc a/i.test(r)) score += 2;
  else if (/iris xe|iris\(r\) xe|radeon|adreno 7|apple/i.test(r)) score += 1;
  else if (/intel|uhd|hd graphics|mali|adreno|powervr/i.test(r)) score += 0;
  else score += 1;
  if (h.mobile) score -= 1;
  return score >= 4 ? 'high' : score >= 2 ? 'mid' : 'low';
}

export const TIER_LABEL = { low: 'Máy yếu', mid: 'Trung bình', high: 'Máy mạnh' };

// ---------------------------------------------------------
// 2. Hồ sơ hiệu năng & cấu hình chạy
// ---------------------------------------------------------
export function isLowTierCapped() {
  return hw.ready && hw.tier === 'low' && store.settings.perfProfile === 'quality';
}

export function activeProfileKey() {
  return resolveProfileForHardware(store.settings.perfProfile, hw, power.batteryLow);
}

/** Cấu hình hiện hành = hồ sơ × mức giảm tải thích nghi (đảm bảo ≥ 10 phân tích/s và ≥ 14 FPS) */
export function runtime() {
  const key = activeProfileKey();
  const base = PROFILES[key] || PROFILES.balanced;
  const lvl = store.settings.adaptive ? adaptive.level : 0;
  const minInferFps = Math.max(10, base.minInferFps || 12);
  const minRenderFps = Math.max(14, base.minRenderFps || 16);
  const targetFps = Math.max(minInferFps, base.targetFps);
  return {
    ...base,
    ...poseWorkload(base, lvl),
    key,
    level: lvl,
    targetFps,
    minInferFps,
    minRenderFps,
    objectEvery: base.objectEvery * (lvl + 1),
    faceInterval: 0,
    recogInterval: 0,
    objectInterval: base.objectInterval * (1 + lvl * 0.5),
    faceEvery: 0,
    faceResEvery: 0,
  };
}

export function resolvedThreadMode() {
  const t = store.settings.threadMode;
  if (t === 'main') return 'main';
  if (!canUseWorker()) return 'main';
  if (t === 'worker') return 'worker';
  return hw.offscreenCanvas ? 'worker' : 'main';
}

/** Thứ tự backend nên thử */
export function backendOrder() {
  const all = ['webgpu', 'webgl', 'wasm', 'cpu'];
  const chosen = store.settings.backend;
  if (chosen !== 'auto') return [chosen, ...all.filter((b) => b !== chosen && b !== 'webgpu')];

  const bench = loadBenchmark();
  if (bench && bench.fingerprint === hw.fingerprint && bench.results?.length) {
    const ok = bench.results.filter((r) => r.ok).sort((a, b) => a.median - b.median).map((r) => r.backend);
    return [...ok, ...['wasm', 'cpu'].filter((b) => !ok.includes(b))];
  }
  if (!hw.ready) return ['webgl', 'wasm', 'cpu'];
  if (hw.gpu.software || !hw.gpu.webgl) return ['wasm', 'cpu'];
  return ['webgl', 'wasm', 'cpu'];
}

/** Cấu hình gửi cho InferenceService (tập trung 100% cho khung xương thân + đầu + bàn tay) */
export function modelConfig() {
  const rt = runtime();
  return {
    threadMode: resolvedThreadMode(),
    backendOrder: backendOrder(),
    modelType: store.settings.modelType,
    poseDim: rt.poseDim,
    inputWidth: rt.inputWidth,
    portrait: !!hw.mobile,
    detectObjects: !!store.settings.detectObjects,
    maxPoses: PROFILES[rt.key].maxPoses,
    detectFaces: false,
    faceEmotion: false,
    faceRecog: false,
  };
}

// ---------------------------------------------------------
// 3. Bộ điều khiển thích nghi (feedback control)
//    Giữ tốc độ ≥ 10 phân tích/s và ≥ 14 FPS trên mọi nền tảng
// ---------------------------------------------------------
export function adaptTick(emaMs) {
  if (!store.settings.adaptive) return;
  const rt = runtime();
  // Ngân sách suy luận tối đa 95ms để đảm bảo >= 10.5 phân tích/s ngay cả ở máy yếu
  const maxAllowedMs = Math.min(95, 1000 / rt.targetFps);
  const util = emaMs / maxAllowedMs;
  const now = performance.now();

  if (util > 1.08 || (live.inferFps > 0 && live.inferFps < 10.2) || (live.renderFps > 0 && live.renderFps < 14.2)) {
    adaptive.underSince = 0;
    adaptive.overSince ||= now;
    if (now - adaptive.overSince > 1400 && adaptive.level < LEVEL_MAX) {
      adaptive.level = util > 2.2 ? LEVEL_MAX : adaptive.level + 1;
      adaptive.overSince = 0;
      store.emit('adaptive', { level: adaptive.level, direction: 'down', util });
    }
  } else if (util < 0.55 && adaptive.level > 0 && (live.inferFps === 0 || live.inferFps >= 12) && (live.renderFps === 0 || live.renderFps >= 18)) {
    adaptive.overSince = 0;
    adaptive.underSince ||= now;
    if (now - adaptive.underSince > 4500) {
      adaptive.level--;
      adaptive.underSince = 0;
      store.emit('adaptive', { level: adaptive.level, direction: 'up', util });
    }
  } else {
    adaptive.overSince = 0;
    adaptive.underSince = 0;
  }
}

export function resetAdaptive() {
  adaptive.level = 0;
  adaptive.overSince = 0;
  adaptive.underSince = 0;
}

// ---------------------------------------------------------
// 4. Quản lý năng lượng
// ---------------------------------------------------------
function initPowerManagement() {
  document.addEventListener('visibilitychange', () => {
    power.hidden = document.hidden;
    store.emit('visibility', power.hidden);
  });

  if (navigator.getBattery) {
    navigator.getBattery().then((bat) => {
      const update = () => {
        power.charging = bat.charging;
        power.level = bat.level;
        const low = store.settings.batterySaver && !bat.charging && bat.level <= 0.2;
        if (low !== power.batteryLow) {
          power.batteryLow = low;
          if (low) toast('Pin yếu và không sạc — chuyển sang hồ sơ Tiết kiệm (≥10 phân tích/s, ≥14 FPS).', 'warn', 5000);
          store.emit('power', power);
        }
      };
      update();
      bat.addEventListener('chargingchange', update);
      bat.addEventListener('levelchange', update);
    }).catch(() => {});
  }
}

// ---------------------------------------------------------
// 5. Đo hiệu năng các backend (benchmark)
// ---------------------------------------------------------
export function loadBenchmark() {
  try { return JSON.parse(localStorage.getItem(BENCH_KEY) || 'null'); } catch { return null; }
}

export async function runBenchmark(onProgress = () => {}) {
  const canWorker = canUseWorker();
  const candidates = [];
  if (hw.webgpu) candidates.push('webgpu');
  if (hw.gpu.webgl) candidates.push('webgl');
  candidates.push('wasm', 'cpu');

  const img = makeTestImage();
  const results = [];
  const runs = 10;
  const cfgBase = modelConfig();

  for (let i = 0; i < candidates.length; i++) {
    const b = candidates[i];
    onProgress(`Đang đo ${b} (${i + 1}/${candidates.length})…`, i / candidates.length);
    if (!canWorker) {
      results.push({ backend: b, ok: false, note: 'Cần Web Worker để đo tách biệt' });
      continue;
    }
    const svc = new InferenceService({ silent: true });
    try {
      const info = await svc.init({ ...cfgBase, threadMode: 'worker', backendOrder: [b], detectObjects: false });
      if (info.backend !== b) throw new Error(`chạy bằng ${info.backend}`);
      const times = [];
      for (let k = 0; k < runs + 3; k++) {
        const r = await svc.detect(img, { inputWidth: PROFILES[runtime().key].inputWidth, timestampMs: k * 100 });
        if (k >= 3) times.push(r.roundTripMs);
      }
      times.sort((a, b2) => a - b2);
      const median = times[Math.floor(times.length / 2)];
      results.push({
        backend: b,
        ok: true,
        median: round(median, 1),
        p95: round(times[Math.floor(times.length * 0.95) - 1] ?? median, 1),
        fps: round(1000 / median, 1),
      });
    } catch (err) {
      results.push({ backend: b, ok: false, note: err.message.slice(0, 80) });
    } finally {
      svc.terminate();
    }
  }
  const best = results.filter((r) => r.ok).sort((a, b) => a.median - b.median)[0] || null;
  const data = { fingerprint: hw.fingerprint, at: new Date().toISOString(), results, best: best?.backend || null };
  try { localStorage.setItem(BENCH_KEY, JSON.stringify(data)); } catch { /* bỏ qua */ }
  onProgress('Xong', 1);
  store.emit('benchmark', data);
  return data;
}

function makeTestImage() {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 360;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 640, 360);
  g.addColorStop(0, '#334');
  g.addColorStop(1, '#997');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 640, 360);
  ctx.fillStyle = '#222';
  ctx.beginPath(); ctx.arc(320, 80, 28, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(295, 110, 50, 130);
  ctx.fillRect(300, 240, 18, 110);
  ctx.fillRect(322, 240, 18, 110);
  return c;
}

// ---------------------------------------------------------
// 6. Log hiệu năng (Xuất file CSV)
// ---------------------------------------------------------
export function logPerf(source, stats) {
  const mem = stats.memory || {};
  perfLog.push({
    time: new Date().toISOString(),
    source,
    os: hw.os,
    browser: hw.browser,
    gpu: hw.gpu?.renderer || '',
    cores: hw.cores,
    memoryGB: hw.memoryGB,
    tier: hw.tier,
    appVersion: APP_VERSION,
    poseDim: stats.poseDim || runtime().poseDim,
    inputWidth: runtime().inputWidth,
    cameraRes: live.cameraRes || '',
    cameraFps: live.cameraFps || 0,
    cameraRequestDelayMs: live.cameraRequestDelayMs || 0,
    cameraOpenMs: live.cameraOpenMs || 0,
    modelWaitMs: live.modelWaitMs || 0,
    profileRequested: store.settings.perfProfile,
    profileActive: activeProfileKey(),
    lowTierCapped: isLowTierCapped() ? 'yes' : 'no',
    level: adaptive.level,
    backend: mem.backend || '',
    thread: resolvedThreadMode(),
    inferMsAvg: round(stats.emaMs || 0, 1),
    startupMs: round(stats.startupMs || 0, 1),
    poseMs: round(stats.poseMs || 0, 1),
    objectMs: round(stats.objectMs || 0, 1),
    objectCalls: stats.objectCalls || 0,
    renderFps: round(live.renderFps, 1),
    inferFps: round(live.inferFps, 1),
    objectFps: round(live.objectFps, 1),
    poseRejectedJoints: live.poseRejectedJoints || 0,
    poseUncertainJoints: live.poseUncertainJoints || 0,
    dropped: stats.dropped || 0,
    tensors: mem.numTensors ?? '',
    tensorMB: mem.numBytes != null ? round(mem.numBytes / 1048576, 1) : '',
    heapMB: performance.memory ? round(performance.memory.usedJSHeapSize / 1048576, 1) : '',
  });
  if (perfLog.length > 5000) perfLog.shift();
}

export function exportPerfLog() {
  if (!perfLog.length) {
    // Tạo 1 dòng snapshot hệ thống nếu người dùng bấm xuất ngay trước khi bật camera/video
    logPerf('system-snapshot', { emaMs: 0, poseDim: runtime().poseDim, memory: {} });
  }
  const cols = Object.keys(perfLog[0]);
  const csv = [cols.join(','), ...perfLog.map((r) => cols.map((c) => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
  downloadText(`hieu-nang_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`, '\uFEFF' + csv, 'text/csv');
  toast(`Đã xuất ${perfLog.length} dòng log hiệu năng CSV.`, 'ok');
}

export const perfLogSize = () => perfLog.length;

/** Tóm tắt dạng chữ — dùng cho chatbot */
export function perfSummary(inf) {
  const rt = runtime();
  const s = inf.stats;
  return {
    os: hw.os,
    browser: hw.browser,
    cores: hw.cores,
    memoryGB: hw.memoryGB,
    gpu: hw.gpu?.renderer,
    tier: hw.tier,
    profile: PROFILES[rt.key].label,
    lowTierCapped: isLowTierCapped(),
    level: rt.level,
    backend: inf.backend,
    mode: inf.mode,
    avgMs: round(s.emaMs, 1),
    p95: round(inf.p95(), 1),
    dropped: s.dropped,
    renderFps: round(live.renderFps, 1),
    inferFps: round(live.inferFps, 1),
  };
}
