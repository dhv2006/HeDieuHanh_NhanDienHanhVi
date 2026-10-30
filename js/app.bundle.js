var __typeError = (msg) => {
  throw TypeError(msg);
};
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateMethod = (obj, member, method) => (__accessCheck(obj, member, "access private method"), method);

// js/config.js
var APP_NAME = "behavior-analysis";
var APP_VERSION = "3.0.4";
var CORE_BEHAVIORS = {
  standing: { label: "Đứng chuẩn bị", color: "#5ab8e8", group: "posture", core: true },
  walking: { label: "Đi bộ / Di chuyển", color: "#6fd08c", group: "posture", core: true },
  running: { label: "Chạy", color: "#e8d14a", group: "posture", core: true },
  sitting: { label: "Ngồi", color: "#a98bf5", group: "posture", core: true },
  squatting: { label: "Hạ trọng tâm (Squat)", color: "#c58af0", group: "posture", core: true },
  bending: { label: "Cúi / Gập thân", color: "#f0914a", group: "posture", core: true },
  jumping: { label: "Bật nhảy", color: "#ffd166", group: "action", core: true },
  hand_action: { label: "Động tác tay & bàn tay", color: "#3fd6c6", group: "action", core: true },
  head_motion: { label: "Chuyển động đầu & cổ", color: "#b8c0ff", group: "action", core: true },
  falling: { label: "Té ngã (Cảnh báo)", color: "#ff5d73", group: "event", core: true, alert: true }
};
var BEHAVIORS = { ...CORE_BEHAVIORS };
var AI_COLORS = [
  "#3dd6c6",
  "#f5b83d",
  "#ff8fab",
  "#7ee0a0",
  "#9bf6ff",
  "#d4a5ff",
  "#ffd166",
  "#8ee3ef",
  "#c7e86a",
  "#ff9f80",
  "#a0c4ff",
  "#f7b267"
];
var LEARNED_COLORS = ["#ff8fab", "#9bf6ff", "#caffbf", "#fdffb6", "#bdb2ff", "#ffc6ff", "#a0c4ff", "#ffd6a5"];
var UNKNOWN_BEHAVIOR = { label: "Chuyển động khác", color: "#9aa7b2", group: "ai" };
var aiColorCursor = 0;
function registerAiBehavior(key, label, extra = {}) {
  if (!key) return null;
  if (!BEHAVIORS[key]) {
    const color = extra.color || AI_COLORS[aiColorCursor++ % AI_COLORS.length];
    BEHAVIORS[key] = {
      label: label || key,
      color,
      group: extra.group || "ai",
      isAiGenerated: extra.group !== "learned" && !CORE_BEHAVIORS[key],
      parentBehavior: extra.parentBehavior || null,
      jointDetail: extra.jointDetail || "",
      instruction: extra.instruction || ""
    };
  } else if (label && BEHAVIORS[key].isAiGenerated) {
    BEHAVIORS[key].label = label;
    if (extra.jointDetail) BEHAVIORS[key].jointDetail = extra.jointDetail;
    if (extra.instruction) BEHAVIORS[key].instruction = extra.instruction;
  }
  return BEHAVIORS[key];
}
function behaviorInfo(key) {
  return BEHAVIORS[key] || { ...UNKNOWN_BEHAVIOR, label: key, isAiGenerated: true };
}
var DEFAULT_SETTINGS = {
  // --- Phân tích & Mô hình AI ---
  modelType: "multipose",
  // 'multipose' | 'thunder'
  detectHands: true,
  // Bật khung xương bàn tay 21 khớp
  detectHeadSkeleton: true,
  // Bật khung xương đầu & cổ
  detectObjects: false,
  // Tắt mặc định nhận diện đồ vật để dồn tài nguyên cho khung xương & tay
  sampleInterval: 0.1,
  // 100ms (0.100s) — phân tích độ chính xác mili-giây
  minScore: 0.28,
  minSegment: 0.2,
  // Bắt được cả các pha động tác ngắn (200ms)
  mergeGap: 0.25,
  alertSound: true,
  exportKeypoints: true,
  // --- Hiệu năng / hệ thống ---
  perfProfile: "auto",
  // 'auto' | 'eco' | 'balanced' | 'quality'
  backend: "auto",
  // 'auto' | 'webgpu' | 'webgl' | 'wasm' | 'cpu'
  threadMode: "auto",
  // 'auto' | 'worker' | 'main'
  camRenderMode: "auto",
  // 'auto' | 'sync' | 'live'
  smoothing: 0.45,
  // Làm mượt khung xương One-Euro
  interpolate: true,
  // Nội suy khung xương khi xem lại video
  adaptive: true,
  // Tự điều chỉnh tải để giữ ≥ 10 phân tích/s và ≥ 14 FPS
  pauseHidden: true,
  batterySaver: true,
  // --- Giao diện ---
  theme: "auto",
  liteUi: "auto",
  // --- Học hành vi / Dữ liệu phân tích ---
  useLearned: true,
  learnThreshold: 0.7,
  selfTrain: false,
  // --- Model AI Gemini & Chatbot ---
  llmProvider: "gemini",
  llmApiKey: "",
  llmModel: "gemini-2.5-flash",
  llmBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
  enableGoogleSearch: true
};
var PROFILES = {
  eco: {
    label: "Thấp",
    poseDim: 192,
    inputWidth: 352,
    targetFps: 20,
    minInferFps: 10,
    minRenderFps: 14,
    objectEvery: 30,
    handEvery: 2,
    maxPoses: 4,
    canvasMax: 720,
    previewEvery: 6,
    sampleInterval: 0.1,
    objectInterval: 1.5
  },
  balanced: {
    label: "Trung bình",
    poseDim: 256,
    inputWidth: 480,
    targetFps: 26,
    minInferFps: 14,
    minRenderFps: 20,
    objectEvery: 20,
    handEvery: 1,
    maxPoses: 6,
    canvasMax: 1280,
    previewEvery: 3,
    sampleInterval: 0.08,
    objectInterval: 0.8
  },
  quality: {
    label: "Cao",
    poseDim: 320,
    inputWidth: 640,
    targetFps: 30,
    minInferFps: 18,
    minRenderFps: 24,
    objectEvery: 15,
    handEvery: 1,
    maxPoses: 6,
    canvasMax: 1920,
    previewEvery: 1,
    sampleInterval: 0.05,
    objectInterval: 0.5
  }
};
var CDN = "https://cdn.jsdelivr.net/npm/";
var KP = {
  nose: 0,
  lEye: 1,
  rEye: 2,
  lEar: 3,
  rEar: 4,
  lShoulder: 5,
  rShoulder: 6,
  lElbow: 7,
  rElbow: 8,
  lWrist: 9,
  rWrist: 10,
  lHip: 11,
  rHip: 12,
  lKnee: 13,
  rKnee: 14,
  lAnkle: 15,
  rAnkle: 16
};
var SKELETON = [
  [5, 6],
  [5, 7],
  [7, 9],
  [6, 8],
  [8, 10],
  [5, 11],
  [6, 12],
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16]
];
var HEAD_SKELETON = [
  [0, 1],
  [0, 2],
  [1, 2],
  [1, 3],
  [2, 4]
];
var HAND_SKELETON = [
  // Ngón cái (Thumb)
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  // Ngón trỏ (Index)
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  // Ngón giữa (Middle)
  [0, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  // Ngón áp út (Ring)
  [0, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  // Ngón út (Pinky)
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  // Khung lòng bàn tay (Palm arch)
  [5, 9],
  [9, 13],
  [13, 17]
];
var PERSON_COLORS = ["#f2b134", "#5ab8e8", "#6fd08c", "#ee6fb6", "#a98bf5", "#f0914a", "#3fd6c6"];
var personColor = (id) => PERSON_COLORS[Math.abs(Number(id) || 0) % PERSON_COLORS.length];

// js/utils.js
var $ = (sel, root = document) => root.querySelector(sel);
var $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
var clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
var round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
function fmtTime(sec, withTenths = true) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor(sec % 3600 / 60);
  const s = sec % 60;
  const ss = withTenths ? s.toFixed(1).padStart(4, "0") : String(Math.floor(s)).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
function fmtTimeMs(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const totalMs = Math.round(sec * 1e3);
  const ms = String(totalMs % 1e3).padStart(3, "0");
  const totalSec = Math.floor(totalMs / 1e3);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor(totalSec % 3600 / 60);
  const s = String(totalSec % 60).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${s}.${ms}` : `${mm}:${s}.${ms}`;
}
function parseTime(str) {
  if (str == null) return null;
  const s = String(str).trim().replace(",", ".").replace(/s$/i, "").trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  const parts = s.split(":");
  if (parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  return parts.reduce((acc, p) => acc * 60 + parseFloat(p), 0);
}
function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function normalizeVi(str) {
  return String(str || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/\s+/g, " ").trim();
}
var uid = () => Math.random().toString(36).slice(2, 10);
var dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
var midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
function jointAngle(a, b, c) {
  if (!a || !b || !c) return 180;
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const cos = (v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y) || 1);
  return Math.acos(clamp(cos, -1, 1)) * 180 / Math.PI;
}
function angleFromVertical(top, bottom) {
  if (!top || !bottom) return 0;
  const dx = bottom.x - top.x;
  const dy = bottom.y - top.y;
  return Math.atan2(Math.abs(dx), dy) * 180 / Math.PI;
}
function downloadText(filename, text, mime = "application/json") {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  downloadBlob(filename, blob);
}
function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2e3);
}
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("Không đọc được file"));
    r.readAsText(file, "utf-8");
  });
}
function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("Không đọc được file nhị phân"));
    r.readAsArrayBuffer(file);
  });
}
function safeFileName(name) {
  return String(name || "du-lieu-phan-tich").replace(/\.[^.]+$/, "").replace(/[^\w\-]+/g, "_").slice(0, 60) || "du-lieu-phan-tich";
}
function toast(message, type = "info", ms = 3500) {
  const box = document.getElementById("toasts");
  if (!box) return;
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => el.remove(), ms);
}
var audioCtx = null;
function beep(freq = 880, duration = 0.25) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(1e-4, audioCtx.currentTime + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch {
  }
}
function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// js/store.js
var SETTINGS_KEY = "behavior-analysis.settings";
var listeners = /* @__PURE__ */ new Map();
function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
var store = {
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
    if (!listeners.has(event)) listeners.set(event, /* @__PURE__ */ new Set());
    listeners.get(event).add(fn);
    return () => listeners.get(event).delete(fn);
  },
  emit(event, payload) {
    (listeners.get(event) || []).forEach((fn) => {
      try {
        fn(payload);
      } catch (e) {
        console.error(`[store] lỗi listener "${event}"`, e);
      }
    });
  },
  // ---------- Cài đặt ----------
  saveSettings(patch) {
    this.settings = { ...this.settings, ...patch };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
    }
    this.emit("settings", this.settings);
  },
  // ---------- Kết quả ----------
  setResults({ segments = [], frames = [], meta = {} } = {}) {
    this.segments = segments.map((s) => ({ ...s, id: s.id || uid() }));
    this.frames = frames;
    this.meta = { ...this.meta, ...meta };
    this.emit("results", { reason: "set" });
  },
  addSegments(list) {
    if (!list.length) return;
    list.forEach((s) => this.segments.push({ ...s, id: s.id || uid() }));
    this.emit("results", { reason: "add" });
  },
  removeSegment(id) {
    this.segments = this.segments.filter((s) => s.id !== id);
    this.emit("results", { reason: "remove" });
  },
  clearSource(source) {
    this.segments = this.segments.filter((s) => s.source !== source);
    if (source === "video") this.frames = [];
    this.emit("results", { reason: "clear" });
  },
  /** Danh sách mã người xuất hiện trong kết quả */
  persons() {
    return [...new Set(this.segments.map((s) => s.personId))].sort((a, b) => a - b);
  }
};

// js/face.js
async function initFaces() {
  return true;
}
function personName(source, id) {
  return store.names?.[`${source}|${id}`] || null;
}
function personLabel(id, source = null) {
  if (source) {
    const n = personName(source, id);
    if (n) return `#${id} ${n}`;
  }
  return `Người #${id}`;
}
function listPeople() {
  return [];
}
function expandFace() {
  return null;
}
function compactFace() {
  return null;
}

// js/hand-skeleton.js
function computeHeadSkeleton(kp, minScore = 0.25) {
  if (!kp || kp.length < 7) return null;
  const ok = (i) => kp[i] && kp[i].score >= minScore && Number.isFinite(kp[i].x) && Number.isFinite(kp[i].y);
  const lSh = ok(KP.lShoulder) ? kp[KP.lShoulder] : null;
  const rSh = ok(KP.rShoulder) ? kp[KP.rShoulder] : null;
  const neck = lSh && rSh ? midpoint(lSh, rSh) : lSh || rSh;
  const nose = ok(KP.nose) ? kp[KP.nose] : null;
  const lEye = ok(KP.lEye) ? kp[KP.lEye] : null;
  const rEye = ok(KP.rEye) ? kp[KP.rEye] : null;
  const lEar = ok(KP.lEar) ? kp[KP.lEar] : null;
  const rEar = ok(KP.rEar) ? kp[KP.rEar] : null;
  const headAnchor = nose || (lEye && rEye ? midpoint(lEye, rEye) : lEar && rEar ? midpoint(lEar, rEar) : null);
  if (!headAnchor || !neck) return null;
  const shWidth = lSh && rSh ? dist(lSh, rSh) : 60;
  const headRadius = Math.max(12, shWidth * 0.34);
  const vx = headAnchor.x - neck.x;
  const vy = headAnchor.y - neck.y;
  const vLen = Math.hypot(vx, vy) || 1;
  const ux = vx / vLen;
  const uy = vy / vLen;
  const crown = {
    x: headAnchor.x + ux * headRadius * 0.85,
    y: headAnchor.y + uy * headRadius * 0.85,
    score: headAnchor.score || 0.8
  };
  const chin = {
    x: neck.x + ux * (vLen * 0.55),
    y: neck.y + uy * (vLen * 0.55),
    score: headAnchor.score || 0.8
  };
  let rollDeg = 0;
  if (lEye && rEye) {
    rollDeg = Math.round(Math.atan2(rEye.y - lEye.y, lEye.x - rEye.x) * 180 / Math.PI);
  } else if (lEar && rEar) {
    rollDeg = Math.round(Math.atan2(rEar.y - lEar.y, lEar.x - rEar.x) * 180 / Math.PI);
  }
  let yawDeg = 0;
  if (nose && lEar && rEar) {
    const earMidX = (lEar.x + rEar.x) / 2;
    const earSpan = Math.max(8, Math.abs(lEar.x - rEar.x));
    yawDeg = Math.round(clamp((nose.x - earMidX) / (earSpan * 0.5) * 45, -75, 75));
  }
  let pitchDeg = 0;
  if (nose && lEar && rEar) {
    const earMidY = (lEar.y + rEar.y) / 2;
    pitchDeg = Math.round(clamp((nose.y - earMidY) / headRadius * 40, -60, 60));
  }
  let stateLabel = "Đầu thẳng";
  if (pitchDeg > 16) stateLabel = `Cúi đầu (${pitchDeg}°)`;
  else if (pitchDeg < -16) stateLabel = `Ngửa đầu (${Math.abs(pitchDeg)}°)`;
  else if (Math.abs(yawDeg) > 20) stateLabel = yawDeg > 0 ? `Xoay đầu sang trái (${yawDeg}°)` : `Xoay đầu sang phải (${Math.abs(yawDeg)}°)`;
  else if (Math.abs(rollDeg) > 15) stateLabel = rollDeg > 0 ? `Nghiêng đầu trái (${rollDeg}°)` : `Nghiêng đầu phải (${Math.abs(rollDeg)}°)`;
  return {
    neck,
    chin,
    nose,
    lEye,
    rEye,
    lEar,
    rEar,
    crown,
    headRadius,
    rollDeg,
    yawDeg,
    pitchDeg,
    stateLabel
  };
}
function computeHandsSkeleton(kp, rawHands = null, minScore = 0.25, activeLabels = []) {
  if (!kp || kp.length < 11) return { left: null, right: null };
  const ok = (i) => kp[i] && kp[i].score >= minScore && Number.isFinite(kp[i].x) && Number.isFinite(kp[i].y);
  const lSh = ok(KP.lShoulder) ? kp[KP.lShoulder] : null;
  const rSh = ok(KP.rShoulder) ? kp[KP.rShoulder] : null;
  const lHip = ok(KP.lHip) ? kp[KP.lHip] : null;
  const rHip = ok(KP.rHip) ? kp[KP.rHip] : null;
  let torso = 100;
  if (lSh && rSh && lHip && rHip) {
    torso = dist(midpoint(lSh, rSh), midpoint(lHip, rHip));
  } else if (lSh && rSh) {
    torso = dist(lSh, rSh) * 1.45;
  }
  const handScale = clamp(torso * 0.28, 16, 95);
  const labelSet = new Set(
    (activeLabels || []).map((l) => typeof l === "string" ? l : l.behavior || "")
  );
  const mode = labelSet.has("ai_pointing") || labelSet.has("pointing") ? "point" : labelSet.has("ai_fist") ? "fist" : labelSet.has("ai_waving") || labelSet.has("waving") || labelSet.has("hand_action") ? "spread" : "natural";
  const buildSide = (isLeft) => {
    const wristIdx = isLeft ? KP.lWrist : KP.rWrist;
    const elbowIdx = isLeft ? KP.lElbow : KP.rElbow;
    const shIdx = isLeft ? KP.lShoulder : KP.rShoulder;
    if (!ok(wristIdx)) return null;
    const wrist = kp[wristIdx];
    if (Array.isArray(rawHands) && rawHands.length) {
      let bestHand = null;
      let bestDist = handScale * 1.8;
      for (const h of rawHands) {
        if (Array.isArray(h?.keypoints) && h.keypoints.length === 21) {
          const d = dist(h.keypoints[0], wrist);
          if (d < bestDist) {
            bestDist = d;
            bestHand = h;
          }
        }
      }
      if (bestHand) {
        const dx2 = wrist.x - bestHand.keypoints[0].x;
        const dy2 = wrist.y - bestHand.keypoints[0].y;
        return {
          side: isLeft ? "left" : "right",
          pose: mode,
          keypoints: bestHand.keypoints.map((p) => ({
            x: round(p.x + dx2, 1),
            y: round(p.y + dy2, 1),
            score: p.score ?? wrist.score ?? 0.85
          }))
        };
      }
    }
    const elbow = ok(elbowIdx) ? kp[elbowIdx] : ok(shIdx) ? kp[shIdx] : { x: wrist.x, y: wrist.y - 40 };
    let dx = wrist.x - elbow.x;
    let dy = wrist.y - elbow.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const sign = isLeft ? -1 : 1;
    const px = -dy * sign;
    const py = dx * sign;
    const fingerSpecs = [
      { angle: 0.72 * sign, len: 0.68, curl: mode === "fist" ? 0.45 : 0.92 },
      { angle: 0.28 * sign, len: 0.92, curl: mode === "fist" ? 0.38 : 1 },
      { angle: 0.02 * sign, len: 1, curl: mode === "point" ? 0.45 : mode === "fist" ? 0.35 : 0.96 },
      { angle: -0.22 * sign, len: 0.9, curl: mode === "point" ? 0.42 : mode === "fist" ? 0.35 : 0.93 },
      { angle: -0.46 * sign, len: 0.74, curl: mode === "point" ? 0.4 : mode === "fist" ? 0.35 : 0.88 }
    ];
    const spreadFactor = mode === "spread" ? 1.25 : 1;
    const joints = [{ x: round(wrist.x, 1), y: round(wrist.y, 1), score: round(wrist.score, 2) }];
    const ratios = [0.38, 0.62, 0.82, 1];
    for (let f = 0; f < 5; f++) {
      const spec = fingerSpecs[f];
      const theta = spec.angle * spreadFactor;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      const fx = dx * cos - dy * sin;
      const fy = dx * sin + dy * cos;
      for (let d = 0; d < 4; d++) {
        const r = ratios[d];
        const reach = d === 0 ? r * spec.len : (ratios[0] + (r - ratios[0]) * spec.curl) * spec.len;
        const lateral = f === 0 ? 0.14 * (d + 1) : (2 - f) * 0.04;
        const jx = wrist.x + (fx * reach + px * lateral) * handScale;
        const jy = wrist.y + (fy * reach + py * lateral) * handScale;
        joints.push({
          x: round(jx, 1),
          y: round(jy, 1),
          score: round(wrist.score * 0.92, 2)
        });
      }
    }
    return {
      side: isLeft ? "left" : "right",
      pose: mode,
      keypoints: joints
    };
  };
  return {
    left: buildSide(true),
    right: buildSide(false)
  };
}
function extractPostureAngles(kp, minScore = 0.25) {
  if (!kp || kp.length < 17) return null;
  const ok = (i) => kp[i] && kp[i].score >= minScore && Number.isFinite(kp[i].x) && Number.isFinite(kp[i].y);
  const lSh = ok(KP.lShoulder) ? kp[KP.lShoulder] : null;
  const rSh = ok(KP.rShoulder) ? kp[KP.rShoulder] : null;
  const lEl = ok(KP.lElbow) ? kp[KP.lElbow] : null;
  const rEl = ok(KP.rElbow) ? kp[KP.rElbow] : null;
  const lWr = ok(KP.lWrist) ? kp[KP.lWrist] : null;
  const rWr = ok(KP.rWrist) ? kp[KP.rWrist] : null;
  const lHip = ok(KP.lHip) ? kp[KP.lHip] : null;
  const rHip = ok(KP.rHip) ? kp[KP.rHip] : null;
  const lKnee = ok(KP.lKnee) ? kp[KP.lKnee] : null;
  const rKnee = ok(KP.rKnee) ? kp[KP.rKnee] : null;
  const lAnk = ok(KP.lAnkle) ? kp[KP.lAnkle] : null;
  const rAnk = ok(KP.rAnkle) ? kp[KP.rAnkle] : null;
  const shMid = lSh && rSh ? midpoint(lSh, rSh) : lSh || rSh;
  const hipMid = lHip && rHip ? midpoint(lHip, rHip) : lHip || rHip;
  const head = computeHeadSkeleton(kp, minScore);
  const angles = {
    headYaw: head ? head.yawDeg : 0,
    headPitch: head ? head.pitchDeg : 0,
    headRoll: head ? head.rollDeg : 0,
    torsoTilt: shMid && hipMid ? Math.round(angleFromVertical(shMid, hipMid)) : 0,
    lElbowAngle: lSh && lEl && lWr ? Math.round(jointAngle(lSh, lEl, lWr)) : null,
    rElbowAngle: rSh && rEl && rWr ? Math.round(jointAngle(rSh, rEl, rWr)) : null,
    lShoulderAngle: (lHip || hipMid) && lSh && lEl ? Math.round(jointAngle(lHip || hipMid, lSh, lEl)) : null,
    rShoulderAngle: (rHip || hipMid) && rSh && rEl ? Math.round(jointAngle(rHip || hipMid, rSh, rEl)) : null,
    lKneeAngle: lHip && lKnee && lAnk ? Math.round(jointAngle(lHip, lKnee, lAnk)) : null,
    rKneeAngle: rHip && rKnee && rAnk ? Math.round(jointAngle(rHip, rKnee, rAnk)) : null
  };
  return angles;
}
function evaluatePoseAccuracy(userKp, targetKp, minScore = 0.25) {
  const uAng = extractPostureAngles(userKp, minScore);
  const tAng = extractPostureAngles(targetKp, 0.1);
  if (!uAng || !tAng) {
    return {
      overall: 0,
      grade: "Chưa đủ dữ liệu khung xương",
      gradeClass: "bad",
      parts: { head: 0, leftArm: 0, rightArm: 0, torso: 0, legs: 0 },
      errors: ["Hãy đứng trọn vào khung hình camera để hệ thống nhận diện đủ các khớp cơ thể."],
      badJoints: []
    };
  }
  const scoreDiff = (u, t, tolerance = 15, maxDiff = 75) => {
    if (u == null || t == null) return 82;
    const diff = Math.abs(u - t);
    if (diff <= tolerance) return 100;
    return Math.round(clamp(100 - (diff - tolerance) / (maxDiff - tolerance) * 100, 10, 100));
  };
  const errors = [];
  const badJoints = [];
  const headDiffYaw = Math.abs((uAng.headYaw || 0) - (tAng.headYaw || 0));
  const headDiffPitch = Math.abs((uAng.headPitch || 0) - (tAng.headPitch || 0));
  const headScore = Math.round((scoreDiff(uAng.headYaw, tAng.headYaw, 15, 60) + scoreDiff(uAng.headPitch, tAng.headPitch, 15, 55)) / 2);
  if (headDiffPitch > 18) {
    errors.push(uAng.headPitch > tAng.headPitch ? `Phần Đầu: Đầu đang cúi thấp hơn mẫu ${headDiffPitch}° — hãy nâng cằm và nhìn thẳng hơn.` : `Phần Đầu: Đầu đang ngửa cao hơn mẫu ${headDiffPitch}° — hãy hạ nhẹ cằm xuống.`);
    badJoints.push(KP.nose, KP.lEar, KP.rEar);
  } else if (headDiffYaw > 22) {
    errors.push(`Phần Đầu: Hướng xoay đầu lệch ${headDiffYaw}° — hãy ${tAng.headYaw > uAng.headYaw ? "xoay đầu nhẹ sang trái" : "xoay đầu nhẹ sang phải"} theo mẫu.`);
    badJoints.push(KP.nose);
  }
  const lShScore = scoreDiff(uAng.lShoulderAngle, tAng.lShoulderAngle, 16, 80);
  const lElScore = scoreDiff(uAng.lElbowAngle, tAng.lElbowAngle, 18, 85);
  const leftArmScore = Math.round(lShScore * 0.55 + lElScore * 0.45);
  if (uAng.lShoulderAngle != null && tAng.lShoulderAngle != null && Math.abs(uAng.lShoulderAngle - tAng.lShoulderAngle) > 20) {
    const diff = Math.round(tAng.lShoulderAngle - uAng.lShoulderAngle);
    errors.push(diff > 0 ? `Tay trái: Cánh tay trái đang hạ thấp (thiếu ${diff}°) — hãy nâng cao vai/cánh tay trái lên.` : `Tay trái: Cánh tay trái nâng quá cao (dư ${Math.abs(diff)}°) — hãy hạ nhẹ cánh tay trái xuống.`);
    badJoints.push(KP.lShoulder, KP.lElbow, KP.lWrist);
  } else if (uAng.lElbowAngle != null && tAng.lElbowAngle != null && Math.abs(uAng.lElbowAngle - tAng.lElbowAngle) > 22) {
    const diff = Math.round(tAng.lElbowAngle - uAng.lElbowAngle);
    errors.push(diff > 0 ? `Khuỷu & Bàn tay trái: Khuỷu tay trái đang gập nhiều (${uAng.lElbowAngle}° so với chuẩn ${tAng.lElbowAngle}°) — hãy duỗi thẳng tay trái hơn.` : `Khuỷu & Bàn tay trái: Tay trái đang duỗi quá thẳng — hãy gập khuỷu tay trái về khoảng ${tAng.lElbowAngle}°.`);
    badJoints.push(KP.lElbow, KP.lWrist);
  }
  const rShScore = scoreDiff(uAng.rShoulderAngle, tAng.rShoulderAngle, 16, 80);
  const rElScore = scoreDiff(uAng.rElbowAngle, tAng.rElbowAngle, 18, 85);
  const rightArmScore = Math.round(rShScore * 0.55 + rElScore * 0.45);
  if (uAng.rShoulderAngle != null && tAng.rShoulderAngle != null && Math.abs(uAng.rShoulderAngle - tAng.rShoulderAngle) > 20) {
    const diff = Math.round(tAng.rShoulderAngle - uAng.rShoulderAngle);
    errors.push(diff > 0 ? `Tay phải: Cánh tay phải đang hạ thấp (thiếu ${diff}°) — hãy nâng cao vai/cánh tay phải lên.` : `Tay phải: Cánh tay phải nâng quá cao (dư ${Math.abs(diff)}°) — hãy hạ nhẹ cánh tay phải xuống.`);
    badJoints.push(KP.rShoulder, KP.rElbow, KP.rWrist);
  } else if (uAng.rElbowAngle != null && tAng.rElbowAngle != null && Math.abs(uAng.rElbowAngle - tAng.rElbowAngle) > 22) {
    const diff = Math.round(tAng.rElbowAngle - uAng.rElbowAngle);
    errors.push(diff > 0 ? `Khuỷu & Bàn tay phải: Khuỷu tay phải đang gập nhiều (${uAng.rElbowAngle}° so với chuẩn ${tAng.rElbowAngle}°) — hãy duỗi thẳng tay phải hơn.` : `Khuỷu & Bàn tay phải: Tay phải đang duỗi quá thẳng — hãy gập khuỷu tay phải về khoảng ${tAng.rElbowAngle}°.`);
    badJoints.push(KP.rElbow, KP.rWrist);
  }
  const torsoScore = scoreDiff(uAng.torsoTilt, tAng.torsoTilt, 12, 55);
  if (Math.abs(uAng.torsoTilt - tAng.torsoTilt) > 16) {
    errors.push(uAng.torsoTilt > tAng.torsoTilt ? `Thân người: Lưng đang nghiêng/cúi ${uAng.torsoTilt}° (chuẩn ${tAng.torsoTilt}°) — hãy giữ thẳng cột sống hơn.` : `Thân người: Cần gập/nghiêng thân người thêm về mức ${tAng.torsoTilt}°.`);
    badJoints.push(KP.lShoulder, KP.rShoulder, KP.lHip, KP.rHip);
  }
  const lKneeScore = scoreDiff(uAng.lKneeAngle, tAng.lKneeAngle, 18, 80);
  const rKneeScore = scoreDiff(uAng.rKneeAngle, tAng.rKneeAngle, 18, 80);
  const legsScore = Math.round((lKneeScore + rKneeScore) / 2);
  if (uAng.lKneeAngle != null && tAng.lKneeAngle != null && Math.abs(uAng.lKneeAngle - tAng.lKneeAngle) > 22) {
    errors.push(uAng.lKneeAngle > tAng.lKneeAngle ? `Chân & Gối: Đầu gối chưa hạ đủ sâu (${uAng.lKneeAngle}° so với chuẩn ${tAng.lKneeAngle}°) — hãy trùng gối hạ trọng tâm thêm.` : `Chân & Gối: Đầu gối đang gập quá sâu — hãy nâng nhẹ hông lên (góc gối chuẩn ~${tAng.lKneeAngle}°).`);
    badJoints.push(KP.lKnee, KP.rKnee, KP.lAnkle, KP.rAnkle);
  }
  const overall = Math.round(
    headScore * 0.15 + leftArmScore * 0.25 + rightArmScore * 0.25 + torsoScore * 0.2 + legsScore * 0.15
  );
  let grade = "Cần tập lại";
  let gradeClass = "bad";
  if (overall >= 88) {
    grade = "Xuất sắc (Rất chuẩn xác)";
    gradeClass = "ok";
  } else if (overall >= 75) {
    grade = "Tốt (Đúng kỹ thuật)";
    gradeClass = "ok";
  } else if (overall >= 60) {
    grade = "Khá (Cần chỉnh nhẹ một vài khớp)";
    gradeClass = "amber";
  }
  if (!errors.length) {
    errors.push("Tư thế các khớp Đầu, Tay, Bàn tay, Thân và Chân đều khớp rất tốt với động tác mẫu! Hãy giữ nhịp chuyển động đều đặn.");
  }
  return {
    overall,
    grade,
    gradeClass,
    parts: {
      head: headScore,
      leftArm: leftArmScore,
      rightArm: rightArmScore,
      torso: torsoScore,
      legs: legsScore
    },
    errors,
    badJoints: [...new Set(badJoints)]
  };
}

// js/overlay.js
var ctxCache = /* @__PURE__ */ new WeakMap();
function ctxOf(canvas3) {
  let c = ctxCache.get(canvas3);
  if (!c) {
    c = canvas3.getContext("2d");
    ctxCache.set(canvas3, c);
  }
  return c;
}
function syncCanvas(canvas3, video2, maxWidth = 1280) {
  const vw = video2?.videoWidth || video2?.width || 640;
  const vh = video2?.videoHeight || video2?.height || 360;
  const scale = Math.min(1, maxWidth / vw);
  const w = Math.round(vw * scale);
  const h = Math.round(vh * scale);
  if (canvas3.width !== w || canvas3.height !== h) {
    canvas3.width = w;
    canvas3.height = h;
  }
  canvas3.dataset.scale = scale;
}
function clearOverlay(canvas3) {
  if (!canvas3) return;
  ctxOf(canvas3).clearRect(0, 0, canvas3.width, canvas3.height);
}
function drawOverlay(canvas3, persons, objects = [], minScore = 0.28, background = null, opts = {}) {
  if (!canvas3) return;
  const showSkeleton = opts.skeleton !== false;
  const showHands = store.settings.detectHands !== false && opts.hands !== false;
  const showHead = store.settings.detectHeadSkeleton !== false && opts.head !== false;
  const badJoints = new Set(opts.badJoints || []);
  const ctx = ctxOf(canvas3);
  const s = parseFloat(canvas3.dataset.scale || "1");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (background) ctx.drawImage(background, 0, 0, canvas3.width, canvas3.height);
  else ctx.clearRect(0, 0, canvas3.width, canvas3.height);
  ctx.setTransform(s, 0, 0, s, 0, 0);
  const u = Math.max(1, canvas3.width / 900) / s;
  for (const p of persons || []) {
    const color = personColor(p.personId);
    const kp = p.keypoints;
    const alert = p.labels?.some((l) => behaviorInfo(l.behavior || l).alert);
    const mainColor = alert ? "#ff5d73" : color;
    if (showSkeleton && kp && kp.length) {
      ctx.lineWidth = 3.2 * u;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = mainColor;
      ctx.beginPath();
      for (const [a, b] of SKELETON) {
        const A = kp[a], B = kp[b];
        if (!A || !B || A.score < minScore || B.score < minScore || ![A.x, A.y, B.x, B.y].every(Number.isFinite)) continue;
        ctx.moveTo(A.x, A.y);
        ctx.lineTo(B.x, B.y);
      }
      ctx.stroke();
      if (showHead) {
        const head = p.head || computeHeadSkeleton(kp, minScore);
        if (head) {
          ctx.strokeStyle = "#b8c0ff";
          ctx.lineWidth = 2.4 * u;
          ctx.beginPath();
          if (head.neck && head.chin) {
            ctx.moveTo(head.neck.x, head.neck.y);
            ctx.lineTo(head.chin.x, head.chin.y);
          }
          if (head.chin && head.nose) {
            ctx.moveTo(head.chin.x, head.chin.y);
            ctx.lineTo(head.nose.x, head.nose.y);
          }
          if (head.nose && head.crown) {
            ctx.moveTo(head.nose.x, head.nose.y);
            ctx.lineTo(head.crown.x, head.crown.y);
          }
          for (const [a, b] of HEAD_SKELETON) {
            const A = kp[a], B = kp[b];
            if (!A || !B || A.score < minScore || B.score < minScore) continue;
            ctx.moveTo(A.x, A.y);
            ctx.lineTo(B.x, B.y);
          }
          if (head.lEye && head.crown) {
            ctx.moveTo(head.lEye.x, head.lEye.y);
            ctx.lineTo(head.crown.x, head.crown.y);
          }
          if (head.rEye && head.crown) {
            ctx.moveTo(head.rEye.x, head.rEye.y);
            ctx.lineTo(head.crown.x, head.crown.y);
          }
          if (head.lEar && head.chin) {
            ctx.moveTo(head.lEar.x, head.lEar.y);
            ctx.lineTo(head.chin.x, head.chin.y);
          }
          if (head.rEar && head.chin) {
            ctx.moveTo(head.rEar.x, head.rEar.y);
            ctx.lineTo(head.chin.x, head.chin.y);
          }
          ctx.stroke();
          ctx.fillStyle = "#b8c0ff";
          for (const pt of [head.neck, head.chin, head.crown]) {
            if (!pt) continue;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 3.2 * u, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      if (showHands) {
        const hands = p.hands || computeHandsSkeleton(kp, null, minScore, p.labels);
        drawHandBones(ctx, hands?.left, "#3dd6c6", u);
        drawHandBones(ctx, hands?.right, "#ffd166", u);
      }
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      for (let i = 0; i < kp.length; i++) {
        const k = kp[i];
        if (!k || k.score < minScore || !Number.isFinite(k.x) || !Number.isFinite(k.y)) continue;
        const r = i === KP.lWrist || i === KP.rWrist ? 4.2 * u : 3.4 * u;
        ctx.moveTo(k.x + r, k.y);
        ctx.arc(k.x, k.y, r, 0, Math.PI * 2);
      }
      ctx.fill();
      if (badJoints.size) {
        ctx.strokeStyle = "#ff5d73";
        ctx.fillStyle = "rgba(255, 93, 115, 0.28)";
        ctx.lineWidth = 2.5 * u;
        for (const jIdx of badJoints) {
          const k = kp[jIdx];
          if (!k || k.score < minScore || !Number.isFinite(k.x)) continue;
          ctx.beginPath();
          ctx.arc(k.x, k.y, 11 * u, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
    }
    if (p.box) {
      const pad = 12 * u;
      const bx = p.box.x - pad, by = p.box.y - pad, bw = p.box.w + pad * 2, bh = p.box.h + pad * 2;
      ctx.strokeStyle = mainColor;
      ctx.lineWidth = (alert ? 3.5 : 1.5) * u;
      ctx.strokeRect(bx, by, bw, bh);
      const labelNames = (p.labels || []).map((l) => {
        const key = typeof l === "string" ? l : l.behavior;
        return behaviorInfo(key).label;
      });
      const microText = p.microAction ? ` · ${p.microAction}` : "";
      const text = `#${p.personId}  ${labelNames.slice(0, 2).join(", ") || "Đang phân tích"}${microText}`;
      const fs = showSkeleton ? 12.5 : 14.5;
      ctx.font = `600 ${fs * u}px "Be Vietnam Pro", system-ui, sans-serif`;
      const maxCanvasW = canvas3.width / s;
      const maxCanvasH = canvas3.height / s;
      const tw = Math.min(maxCanvasW - 16 * u, ctx.measureText(text).width + 16 * u);
      const th = (fs + 9) * u;
      const lx = Math.max(8 * u, Math.min(bx, maxCanvasW - tw - 8 * u));
      const ty = Math.max(6 * u, Math.min(by - th < 0 ? by : by - th, maxCanvasH - th - 6 * u));
      ctx.fillStyle = "rgba(10, 16, 23, 0.86)";
      roundRect(ctx, lx, ty, tw, th, 6 * u);
      ctx.fill();
      ctx.fillStyle = mainColor;
      ctx.fillRect(lx, ty, 4 * u, th);
      ctx.fillStyle = "#f4f7fa";
      ctx.fillText(text, lx + 9 * u, ty + th * 0.71, tw - 12 * u);
    }
  }
  if (opts.guidePose) {
    drawGuideSkeleton(ctx, canvas3, opts.guidePose, u, s);
  }
  if (opts.hud?.length) drawHud(ctx, opts.hud, u);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
function drawHandBones(ctx, hand, color, u) {
  if (!hand || !Array.isArray(hand.keypoints) || hand.keypoints.length < 21) return;
  const kp = hand.keypoints;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.9 * u;
  ctx.beginPath();
  for (const [a, b] of HAND_SKELETON) {
    const A = kp[a], B = kp[b];
    if (!A || !B || !Number.isFinite(A.x) || !Number.isFinite(B.x)) continue;
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
  }
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 1; i < kp.length; i++) {
    const p = kp[i];
    if (!p || !Number.isFinite(p.x)) continue;
    const r = i % 4 === 0 ? 2.4 * u : 1.7 * u;
    ctx.moveTo(p.x + r, p.y);
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  }
  ctx.fill();
}
function drawGuideSkeleton(ctx, canvas3, guide, u, scale = 1) {
  if (!guide || !guide.keypoints) return;
  const W = canvas3.width / scale;
  const H = canvas3.height / scale;
  const isOverlay = guide.mode === "overlay";
  const boxW = isOverlay ? W : Math.min(310 * u, W * 0.38);
  const boxH = isOverlay ? H : Math.min(280 * u, H * 0.56);
  const boxX = isOverlay ? 0 : W - boxW - 14 * u;
  const boxY = isOverlay ? 0 : 14 * u;
  if (!isOverlay) {
    ctx.fillStyle = "rgba(10, 16, 23, 0.86)";
    ctx.strokeStyle = "rgba(61, 214, 198, 0.65)";
    ctx.lineWidth = 2 * u;
    roundRect(ctx, boxX, boxY, boxW, boxH, 12 * u);
    ctx.fill();
    ctx.stroke();
  }
  const rawKp = guide.keypoints;
  const valid = rawKp.filter((k) => k && Number.isFinite(k.x) && Number.isFinite(k.y) && (k.score ?? 1) > 0.1);
  if (!valid.length) return;
  const minX = Math.min(...valid.map((k) => k.x));
  const maxX = Math.max(...valid.map((k) => k.x));
  const minY = Math.min(...valid.map((k) => k.y));
  const maxY = Math.max(...valid.map((k) => k.y));
  const spanX = Math.max(40, maxX - minX);
  const spanY = Math.max(60, maxY - minY);
  const topBannerH = isOverlay ? 0 : 54 * u;
  const availW = boxW * (isOverlay ? 0.45 : 0.72);
  const availH = (boxH - topBannerH) * (isOverlay ? 0.68 : 0.74);
  const fit = Math.min(availW / spanX, availH / spanY);
  const cx = boxX + boxW / 2;
  const cy = boxY + topBannerH + (boxH - topBannerH) * (isOverlay ? 0.5 : 0.54);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  const mapped = rawKp.map((k) => {
    if (!k || !Number.isFinite(k.x)) return { x: 0, y: 0, score: 0 };
    return {
      x: cx + (k.x - midX) * fit,
      y: cy + (k.y - midY) * fit,
      score: k.score ?? 0.9
    };
  });
  ctx.save();
  ctx.globalAlpha = isOverlay ? 0.72 : 0.96;
  ctx.strokeStyle = "#3dd6c6";
  ctx.lineWidth = (isOverlay ? 4.2 : 3) * u;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (const [a, b] of SKELETON) {
    const A = mapped[a], B = mapped[b];
    if (!A || !B || A.score < 0.15 || B.score < 0.15) continue;
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
  }
  ctx.stroke();
  const head = computeHeadSkeleton(mapped, 0.15);
  if (head) {
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 2.2 * u;
    ctx.beginPath();
    if (head.neck && head.chin) {
      ctx.moveTo(head.neck.x, head.neck.y);
      ctx.lineTo(head.chin.x, head.chin.y);
    }
    if (head.chin && head.crown) {
      ctx.moveTo(head.chin.x, head.chin.y);
      ctx.lineTo(head.crown.x, head.crown.y);
    }
    if (head.crown) {
      ctx.moveTo(head.nose.x + head.headRadius * 0.55, head.nose.y);
      ctx.arc(head.nose.x, head.nose.y, head.headRadius * 0.55, 0, Math.PI * 2);
    }
    ctx.stroke();
  }
  const hands = computeHandsSkeleton(mapped, null, 0.15);
  drawHandBones(ctx, hands.left, "#3dd6c6", u * 0.9);
  drawHandBones(ctx, hands.right, "#ffd166", u * 0.9);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  for (const k of mapped) {
    if (!k || k.score < 0.15) continue;
    ctx.moveTo(k.x + 3 * u, k.y);
    ctx.arc(k.x, k.y, 3 * u, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.restore();
  const totalSteps = Math.max(1, Number(guide.totalSteps) || 1);
  const stepNum = Math.min(totalSteps, Math.max(1, (Number(guide.stepIndex) || 0) + 1));
  const rawLabel = guide.stepLabel || guide.stepTitle || "Thực hiện động tác";
  const stepTitle = `BƯỚC ${stepNum}/${totalSteps}: ${rawLabel}`;
  const stepDesc = guide.stepInstruction || guide.instruction || "";
  const bannerX = isOverlay ? 16 * u : boxX + 8 * u;
  const bannerY = isOverlay ? H - 78 * u : boxY + 8 * u;
  const bannerW = isOverlay ? W - 32 * u : boxW - 16 * u;
  ctx.fillStyle = "rgba(15, 25, 36, 0.92)";
  roundRect(ctx, bannerX, bannerY, bannerW, isOverlay ? 62 * u : 46 * u, 8 * u);
  ctx.fill();
  ctx.fillStyle = "#3dd6c6";
  ctx.font = `700 ${(isOverlay ? 14 : 11.5) * u}px "Be Vietnam Pro", system-ui, sans-serif`;
  ctx.fillText(stepTitle, bannerX + 10 * u, bannerY + (isOverlay ? 22 : 18) * u, bannerW - 20 * u);
  if (stepDesc) {
    ctx.fillStyle = "#e8eef4";
    ctx.font = `500 ${(isOverlay ? 13 : 10.5) * u}px "Be Vietnam Pro", system-ui, sans-serif`;
    ctx.fillText(stepDesc, bannerX + 10 * u, bannerY + (isOverlay ? 45 : 36) * u, bannerW - 20 * u);
  }
}
function drawHud(ctx, items, u) {
  ctx.font = `600 ${13 * u}px "Be Vietnam Pro", system-ui, sans-serif`;
  const lh = 21 * u, pad = 8 * u;
  const w = Math.max(...items.map((it) => ctx.measureText(it.text).width)) + pad * 2 + 12 * u;
  const h = items.length * lh + pad * 2 - 4 * u;
  ctx.fillStyle = "rgba(5, 9, 13, 0.76)";
  roundRect(ctx, 10 * u, 10 * u, w, h, 8 * u);
  ctx.fill();
  items.forEach((it, i) => {
    const y = 10 * u + pad + i * lh;
    ctx.fillStyle = it.color;
    ctx.fillRect(10 * u + pad, y + 4 * u, 6 * u, 12 * u);
    ctx.fillStyle = "#e8eef4";
    ctx.fillText(it.text, 10 * u + pad + 12 * u, y + 14 * u);
  });
}
function drawHudOnly(canvas3, hud) {
  if (!canvas3) return;
  const ctx = ctxOf(canvas3);
  const s = parseFloat(canvas3.dataset.scale || "1");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas3.width, canvas3.height);
  if (!hud?.length) return;
  ctx.setTransform(s, 0, 0, s, 0, 0);
  drawHud(ctx, hud, Math.max(1, canvas3.width / 900) / s);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// js/smoothing.js
var LowPass = class {
  constructor() {
    this.y = null;
  }
  filter(x, a) {
    this.y = this.y === null ? x : a * x + (1 - a) * this.y;
    return this.y;
  }
};
var alpha = (cutoff, dt) => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
};
var OneEuroFilter = class {
  constructor(minCutoff = 1, beta = 0.02, dCutoff = 1) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.x = new LowPass();
    this.dx = new LowPass();
    this.lastT = null;
    this.lastRaw = null;
    this.velocity = 0;
    this.direction = 0;
    this.directionStreak = 0;
    this.samples = 0;
  }
  filter(value, t) {
    if (!Number.isFinite(value)) return this.x.y;
    if (this.lastT !== null && t === this.lastT) return this.x.y;
    if (this.lastT === null || t < this.lastT || t - this.lastT > 0.6) {
      this.x = new LowPass();
      this.dx = new LowPass();
      this.lastT = t;
      this.lastRaw = value;
      this.velocity = 0;
      this.direction = this.directionStreak = 0;
      this.samples = 1;
      return this.x.filter(value, 1);
    }
    const dt = Math.max(1e-3, Math.min(0.25, t - this.lastT));
    const dv = (value - this.lastRaw) / dt;
    const edv = this.dx.filter(dv, alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edv);
    this.lastT = t;
    this.lastRaw = value;
    const previous = this.x.y;
    const filtered = this.x.filter(value, alpha(cutoff, dt));
    const delta = filtered - previous;
    this.velocity = Math.abs(delta) < 0.5 ? 0 : this.velocity * 0.4 + delta / dt * 0.6;
    const direction = Math.abs(delta) < 0.5 ? 0 : Math.sign(delta);
    this.directionStreak = direction && direction === this.direction ? this.directionStreak + 1 : direction ? 1 : 0;
    this.direction = direction;
    this.samples++;
    return filtered;
  }
};
var PoseSmoother = class {
  constructor(strength = 0.5) {
    this.setStrength(strength);
    this.tracks = /* @__PURE__ */ new Map();
  }
  setStrength(s) {
    this.strength = Math.max(0, Math.min(1, Number(s) || 0));
    s = this.strength;
    this.minCutoff = 3 - 2.7 * s;
    this.beta = 0.05 - 0.04 * s;
  }
  reset() {
    this.tracks.clear();
  }
  /** @param persons [{personId, keypoints, box, labels}]  @param t giây */
  smooth(persons, t, minScore = 0.3) {
    if (this.strength <= 0) return persons;
    const seen = /* @__PURE__ */ new Set();
    const out = persons.map((p) => {
      seen.add(p.personId);
      if (!p.keypoints) return p;
      let tr = this.tracks.get(p.personId);
      if (!tr || p._resetPose || t < tr.lastT || t - tr.lastT > 0.6) {
        tr = { fx: [], fy: [], lastT: t, interval: 1, samples: 0 };
        for (let i = 0; i < p.keypoints.length; i++) {
          tr.fx.push(new OneEuroFilter(this.minCutoff, this.beta));
          tr.fy.push(new OneEuroFilter(this.minCutoff, this.beta));
        }
        this.tracks.set(p.personId, tr);
      }
      if (t > tr.lastT) tr.interval = tr.samples < 2 ? t - tr.lastT : tr.interval * 0.6 + (t - tr.lastT) * 0.4;
      tr.lastT = t;
      tr.samples++;
      const scale = p._poseScale || Math.max(p.box?.w || 0, p.box?.h || 0, 80);
      tr.scale = scale;
      tr.minScore = minScore;
      const reset = new Set(p._resetJoints || []);
      const keypoints = p.keypoints.map((k, i) => {
        if (!k || k.score < minScore || !Number.isFinite(k.x) || !Number.isFinite(k.y)) {
          return { ...k, x: tr.fx[i]?.x.y ?? k?.x ?? 0, y: tr.fy[i]?.x.y ?? k?.y ?? 0, score: 0 };
        }
        if (reset.has(i) || !tr.fx[i]) {
          tr.fx[i] = new OneEuroFilter();
          tr.fy[i] = new OneEuroFilter();
        }
        for (const f of [tr.fx[i], tr.fy[i]]) {
          f.minCutoff = tr.interval > 0.085 ? Math.min(this.minCutoff, 1.2) : this.minCutoff;
          f.beta = (4 - 3 * this.strength) / scale * (i < 5 ? 0.3 : 1);
        }
        return { x: tr.fx[i].filter(k.x, t), y: tr.fy[i].filter(k.y, t), score: k.score };
      });
      return { ...p, keypoints, box: jointBox(keypoints, minScore, p.box), _t: t };
    });
    for (const [id, tr] of this.tracks) if (!seen.has(id) && t - tr.lastT > 0.6) this.tracks.delete(id);
    return out;
  }
  /**
   * Dự đoán vị trí sau `ahead` giây dựa trên vận tốc đã lọc —
   * Only predict short, coherent motion at >=12 analysis samples/s. Low-rate
   * sources keep the filtered observation instead of amplifying detector noise.
   */
  predict(persons, ahead) {
    const dt = Math.max(0, Math.min(ahead, 0.04));
    if (!dt || this.strength <= 0) return persons;
    return persons.map((p) => {
      const tr = this.tracks.get(p.personId);
      if (!tr) return p;
      if (ahead > Math.min(0.6, Math.max(0.3, tr.interval * 2.5))) return null;
      if (tr.interval > 0.085 || tr.samples < 3 || ahead > 0.18) return p;
      const keypoints = p.keypoints.map((k, i) => {
        if (k.score < 0.65) return k;
        const fx = tr.fx[i], fy = tr.fy[i];
        const dx = fx?.directionStreak >= 2 ? fx.velocity * dt : 0;
        const dy = fy?.directionStreak >= 2 ? fy.velocity * dt : 0;
        const limit = Math.max(2, Math.min(8, tr.scale * 0.035)) * (i < 5 ? 0.5 : 1);
        const magnitude = Math.hypot(dx, dy);
        const factor = magnitude > limit ? limit / magnitude : 1;
        return { ...k, x: k.x + dx * factor, y: k.y + dy * factor };
      });
      return {
        ...p,
        keypoints,
        box: jointBox(keypoints, tr.minScore, p.box)
      };
    }).filter(Boolean);
  }
};
function jointBox(keypoints, minScore, fallback) {
  const good = keypoints.filter((k) => k?.score >= minScore && Number.isFinite(k.x) && Number.isFinite(k.y));
  if (!good.length) return fallback;
  const xs = good.map((k) => k.x), ys = good.map((k) => k.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}
var lerp = (a, b, u) => a + (b - a) * u;
function interpolatePersons(fa, fb, t, maxGap) {
  if (!fa && !fb) return [];
  if (!fb) return t - fa.t <= maxGap ? fa.persons : [];
  if (!fa) return fb.t - t <= maxGap / 2 ? fb.persons : [];
  const span = fb.t - fa.t;
  if (span <= 0 || span > maxGap * 2.5) {
    return (t - fa.t <= fb.t - t ? fa : fb).persons;
  }
  const u = Math.min(1, Math.max(0, (t - fa.t) / span));
  const byId = new Map(fb.persons.map((p) => [p.personId, p]));
  const out = [];
  for (const pa of fa.persons) {
    const pb = byId.get(pa.personId);
    if (!pb) {
      if (u < 0.5) out.push(pa);
      continue;
    }
    byId.delete(pa.personId);
    out.push({
      personId: pa.personId,
      labels: u < 0.5 ? pa.labels : pb.labels,
      box: pa.box && pb.box ? {
        x: lerp(pa.box.x, pb.box.x, u),
        y: lerp(pa.box.y, pb.box.y, u),
        w: lerp(pa.box.w, pb.box.w, u),
        h: lerp(pa.box.h, pb.box.h, u)
      } : pa.box,
      keypoints: pa.keypoints && pb.keypoints ? pa.keypoints.map((k, i) => ({
        x: lerp(k.x, pb.keypoints[i].x, u),
        y: lerp(k.y, pb.keypoints[i].y, u),
        score: Math.min(k.score, pb.keypoints[i].score)
      })) : pa.keypoints,
      face: lerpFace(pa.face, pb.face, u),
      faceOnly: pa.faceOnly
    });
  }
  if (u >= 0.5) byId.forEach((pb) => out.push(pb));
  return out;
}
function lerpFace(fa, fb, u) {
  if (!fa || !fb) return u < 0.5 ? fa : fb;
  const base = u < 0.5 ? fa : fb;
  return { ...base, box: fa.box.map((v, i) => lerp(v, fb.box[i], u)), anchor: null };
}

// js/performance-policy.js
function poseWorkload(base, level) {
  const scale = [1, 0.88, 0.78, 0.7][Math.max(0, Math.min(3, level))];
  const poseDim = Math.max(160, Math.round(base.poseDim * scale / 32) * 32);
  const inputWidth = Math.max(320, Math.min(base.inputWidth, Math.round(poseDim * 2.1)));
  return { poseDim, inputWidth };
}
function automaticProfile(hardware, batteryLow) {
  if (batteryLow || hardware.tier === "low") return "eco";
  if (hardware.mobile) return hardware.tier === "high" ? "balanced" : "eco";
  return hardware.tier === "high" ? "quality" : "balanced";
}
function resolveProfileForHardware(requestedProfile, hardware, batteryLow) {
  if (!requestedProfile || requestedProfile === "auto") {
    return automaticProfile(hardware, batteryLow);
  }
  if (hardware?.ready && hardware.tier === "low" && requestedProfile === "quality") {
    return "balanced";
  }
  return requestedProfile;
}

// js/inference.js
var WORKER_URL = new URL("./workers/inference-worker.js", import.meta.url);
var CORE_URL = new URL("./core/model-core.js", import.meta.url);
var BASE_URL = new URL("../", import.meta.url).href;
var INIT_TIMEOUT_MS = 9e4;
var _InferenceService_instances, doInit_fn, startWorker_fn, stopWorker_fn, call_fn, record_fn;
var InferenceService = class {
  /** @param {{silent?: boolean}} opts  silent: không phát sự kiện trạng thái (dùng khi đo hiệu năng) */
  constructor(opts = {}) {
    __privateAdd(this, _InferenceService_instances);
    this.silent = !!opts.silent;
    this.worker = null;
    this.mode = null;
    this.ready = false;
    this.backend = null;
    this.objects = false;
    this.configKey = "";
    this.defaultPoseDim = 256;
    this.initPromise = null;
    this.initQueue = Promise.resolve();
    this.initRequests = /* @__PURE__ */ new Map();
    this.seq = 0;
    this.pending = /* @__PURE__ */ new Map();
    this.inflight = 0;
    this.scratch = null;
    this.fallbackReason = null;
    this.stats = { calls: 0, dropped: 0, emaMs: 0, lastMs: 0, samples: [], memory: null };
  }
  get busy() {
    return this.inflight > 0;
  }
  info() {
    return { mode: this.mode, backend: this.backend, objects: this.objects, faces: this.faces, ready: this.ready, fallbackReason: this.fallbackReason, backendErrors: this.backendErrors || [] };
  }
  /**
   * @param {{threadMode:'worker'|'main', backendOrder:string[], modelType, poseDim, detectObjects, maxPoses}} cfg
   */
  init(cfg) {
    const key = JSON.stringify(cfg);
    if (this.initRequests.has(key)) return this.initRequests.get(key);
    const task = this.initQueue.catch(() => {
    }).then(async () => {
      if (this.ready && key === this.configKey) return this.info();
      const info = await __privateMethod(this, _InferenceService_instances, doInit_fn).call(this, cfg);
      this.configKey = key;
      this.defaultPoseDim = cfg.poseDim || 256;
      return info;
    }).finally(() => this.initRequests.delete(key));
    this.initRequests.set(key, task);
    this.initQueue = task;
    return task;
  }
  /**
   * Lấy khung hình từ video/canvas và thu nhỏ về chiều rộng targetW.
   * Dùng createImageBitmap (thường được GPU tăng tốc); nếu trình duyệt không
   * hỗ trợ tuỳ chọn resize thì vẽ qua canvas tạm.
   */
  async grab(source, targetW) {
    const sw = source.videoWidth || source.width;
    const sh = source.videoHeight || source.height;
    if (!sw || !sh) throw new Error("Nguồn hình chưa sẵn sàng");
    const scale = Math.min(1, targetW / Math.max(sw, sh));
    const w = Math.max(32, Math.round(sw * scale));
    const h = Math.max(32, Math.round(sh * scale));
    let bitmap = null;
    try {
      bitmap = await createImageBitmap(source, { resizeWidth: w, resizeHeight: h, resizeQuality: "low" });
      if (bitmap.width && bitmap.height && (bitmap.width !== w || bitmap.height !== h)) {
        bitmap.close?.();
        bitmap = null;
        throw new Error("Trình duyệt bỏ qua kích thước ImageBitmap");
      }
    } catch {
      this.scratch || (this.scratch = document.createElement("canvas"));
      if (this.scratch.width !== w) this.scratch.width = w;
      if (this.scratch.height !== h) this.scratch.height = h;
      this.scratch.getContext("2d").drawImage(source, 0, 0, w, h);
      bitmap = await createImageBitmap(this.scratch).catch(() => null);
      if (!bitmap) {
        if (this.mode === "worker") throw new Error("Trình duyệt không tạo được ImageBitmap");
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
      try {
        await this.initQueue;
      } catch (err) {
        bitmap.close?.();
        throw err;
      }
      if (!this.ready) {
        bitmap.close?.();
        throw new Error("Mô hình chưa sẵn sàng");
      }
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
        faceMax: opts.faceMax || 4
      };
      if (this.mode === "worker") {
        r = await __privateMethod(this, _InferenceService_instances, call_fn).call(this, { type: "detect", bitmap, ...payload }, [bitmap]);
      } else {
        try {
          r = await window.ModelCore.detect(bitmap, payload);
          r.memory = window.ModelCore.memory();
        } finally {
          bitmap.close?.();
        }
      }
    } finally {
      this.inflight--;
    }
    const poses = r.poses.map((p) => ({
      ...p,
      keypoints: p.keypoints.map((k) => ({ x: k.x / sx, y: k.y / sy, score: k.score }))
    }));
    const objects = (r.objects || []).map((o) => ({
      ...o,
      bbox: [o.bbox[0] / sx, o.bbox[1] / sy, o.bbox[2] / sx, o.bbox[3] / sy]
    }));
    const faces = r.faces ? r.faces.map((f) => ({
      ...f,
      box: [f.box[0] / sx, f.box[1] / sy, f.box[2] / sx, f.box[3] / sy],
      lm: f.lm.map((v, i) => i % 2 ? v / sy : v / sx)
    })) : null;
    const roundTrip = performance.now() - t0;
    __privateMethod(this, _InferenceService_instances, record_fn).call(this, r.inferMs, roundTrip, r.memory);
    if (r.poseDim) this.stats.poseDim = r.poseDim;
    for (const key of ["poseMs", "objectMs", "faceMs"]) {
      if (r[key] > 0) this.stats[key] = this.stats[key] ? this.stats[key] * 0.8 + r[key] * 0.2 : r[key];
    }
    if (opts.withFaces) this.stats.faceCalls = (this.stats.faceCalls || 0) + 1;
    if (opts.faceRes) this.stats.recogCalls = (this.stats.recogCalls || 0) + 1;
    if (opts.withObjects) this.stats.objectCalls = (this.stats.objectCalls || 0) + 1;
    return { poses, objects, faces, poseDim: r.poseDim, inferMs: r.inferMs, roundTripMs: roundTrip };
  }
  markDropped() {
    this.stats.dropped++;
  }
  p95() {
    const a = [...this.stats.samples].sort((x, y) => x - y);
    return a.length ? a[Math.floor(a.length * 0.95) - (a.length > 1 ? 1 : 0)] : 0;
  }
  resetTracker() {
    if (this.mode === "worker" && this.worker) this.worker.postMessage({ type: "reset" });
    else window.ModelCore?.resetTracker();
  }
  resetStats() {
    this.stats = { calls: 0, dropped: 0, emaMs: 0, lastMs: 0, samples: [], memory: this.stats.memory, startupMs: this.stats.startupMs };
  }
  terminate() {
    __privateMethod(this, _InferenceService_instances, stopWorker_fn).call(this);
    this.ready = false;
    this.configKey = "";
  }
};
_InferenceService_instances = new WeakSet();
doInit_fn = async function(cfg) {
  const started = performance.now();
  this.ready = false;
  while (this.inflight > 0) await new Promise((resolve) => setTimeout(resolve, 8));
  const emit2 = (state2, text) => {
    if (!this.silent) store.emit("model-status", { state: state2, text });
  };
  emit2("loading", "Đang khởi tạo AI…");
  const wantWorker = cfg.threadMode === "worker" && canUseWorker();
  if (wantWorker) {
    try {
      const backendKey = JSON.stringify(cfg.backendOrder);
      if (!this.worker || this.workerBackendKey !== backendKey) __privateMethod(this, _InferenceService_instances, startWorker_fn).call(this);
      this.workerBackendKey = backendKey;
      const r = await withTimeout(__privateMethod(this, _InferenceService_instances, call_fn).call(this, { type: "init", baseUrl: BASE_URL, ...cfg }), INIT_TIMEOUT_MS, "Worker khởi tạo quá lâu");
      this.mode = "worker";
      this.backend = r.backend;
      this.objects = r.objects;
      this.faces = r.faces || null;
      this.backendErrors = r.backendErrors || [];
      this.ready = true;
      this.stats.startupMs = performance.now() - started;
      this.fallbackReason = null;
      emit2("ready", `Sẵn sàng · ${r.backend} · worker`);
      if (!this.silent) store.emit("inference-info", this.info());
      return this.info();
    } catch (err) {
      console.warn("Worker thất bại, chuyển sang luồng chính:", err);
      this.fallbackReason = err.message;
      __privateMethod(this, _InferenceService_instances, stopWorker_fn).call(this);
      if (cfg.workerOnly) throw err;
    }
  }
  __privateMethod(this, _InferenceService_instances, stopWorker_fn).call(this);
  try {
    await loadCoreScript();
    const MC = window.ModelCore;
    MC.configure({ baseUrl: BASE_URL, onStatus: (t) => emit2("loading", t) });
    const r = await MC.init(cfg);
    this.mode = "main";
    this.backend = r.backend;
    this.objects = r.objects;
    this.faces = r.faces || null;
    this.backendErrors = r.backendErrors || [];
    this.ready = true;
    this.stats.startupMs = performance.now() - started;
    emit2("ready", `Sẵn sàng · ${r.backend} · luồng chính`);
    if (!this.silent) store.emit("inference-info", this.info());
    return this.info();
  } catch (err) {
    emit2("error", "Lỗi tải mô hình");
    throw err;
  }
};
startWorker_fn = function() {
  __privateMethod(this, _InferenceService_instances, stopWorker_fn).call(this);
  this.worker = new Worker(WORKER_URL);
  this.worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === "status") {
      if (!this.silent) store.emit("model-status", { state: "loading", text: m.text });
      return;
    }
    const p = this.pending.get(m.id);
    if (!p) return;
    this.pending.delete(m.id);
    m.type === "error" ? p.reject(new Error(m.message)) : p.resolve(m);
  };
  this.worker.onerror = (e) => {
    const err = new Error(e.message || "Worker gặp lỗi");
    this.pending.forEach((p) => p.reject(err));
    this.pending.clear();
  };
};
stopWorker_fn = function() {
  if (this.worker) this.worker.terminate();
  this.worker = null;
  this.pending.forEach((p) => p.reject(new Error("Worker đã dừng")));
  this.pending.clear();
  this.inflight = 0;
};
call_fn = function(msg, transfer = []) {
  const id = ++this.seq;
  return new Promise((resolve, reject) => {
    this.pending.set(id, { resolve, reject });
    try {
      this.worker.postMessage({ ...msg, id }, transfer);
    } catch (error) {
      this.pending.delete(id);
      reject(error);
    }
  });
};
record_fn = function(inferMs, roundTrip, memory) {
  const s = this.stats;
  s.calls++;
  s.lastMs = roundTrip;
  s.emaMs = s.emaMs ? s.emaMs * 0.85 + roundTrip * 0.15 : roundTrip;
  s.samples.push(roundTrip);
  if (s.samples.length > 120) s.samples.shift();
  if (memory) s.memory = memory;
  if (!this.silent) store.emit("perf-sample", { inferMs, roundTrip });
};
function canUseWorker() {
  return typeof Worker !== "undefined" && typeof createImageBitmap === "function";
}
function loadCoreScript() {
  if (window.ModelCore) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = CORE_URL.href;
    s.onload = resolve;
    s.onerror = () => reject(new Error("Không tải được model-core.js"));
    document.head.appendChild(s);
  });
}
function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  })]).finally(() => clearTimeout(timer));
}
var AnalysisService = class {
  constructor() {
    this.primary = new InferenceService({ silent: true });
    this.auxiliary = new InferenceService({ silent: true });
    this.split = false;
    this.queue = Promise.resolve();
    this.requests = /* @__PURE__ */ new Map();
    this.auxPending = false;
    this.completed = [];
    this.generation = 0;
    this.startupMs = 0;
    this.frameStats = { calls: 0, dropped: 0, emaMs: 0, lastMs: 0, samples: [] };
  }
  get ready() {
    return this.primary.ready && (!this.split || this.auxiliary.ready);
  }
  get mode() {
    return this.primary.mode;
  }
  get backend() {
    return this.primary.backend;
  }
  get faces() {
    return (this.split ? this.auxiliary : this.primary).faces;
  }
  get objects() {
    return (this.split ? this.auxiliary : this.primary).objects;
  }
  get fallbackReason() {
    return this.primary.fallbackReason;
  }
  get backendErrors() {
    return this.primary.backendErrors;
  }
  get busy() {
    return this.primary.busy;
  }
  get auxBusy() {
    return this.auxPending || this.auxiliary.busy || !this.auxiliary.ready;
  }
  get stats() {
    const p = this.primary.stats, a = this.split ? this.auxiliary.stats : p;
    const memory = p.memory ? {
      ...p.memory,
      numTensors: p.memory.numTensors + (this.split ? a.memory?.numTensors || 0 : 0),
      numBytes: p.memory.numBytes + (this.split ? a.memory?.numBytes || 0 : 0)
    } : null;
    return {
      ...this.frameStats,
      memory,
      startupMs: this.startupMs,
      poseDim: p.poseDim,
      poseMs: p.poseMs,
      faceMs: a.faceMs,
      objectMs: a.objectMs,
      faceCalls: a.faceCalls || 0,
      recogCalls: a.recogCalls || 0,
      objectCalls: a.objectCalls || 0,
      auxiliaryMs: this.split ? a.emaMs : 0,
      auxiliaryBackend: this.split ? this.auxiliary.backend : null
    };
  }
  info() {
    return {
      ...this.primary.info(),
      ready: this.ready,
      faces: this.faces,
      objects: this.objects,
      split: this.split,
      auxiliaryBackend: this.split ? this.auxiliary.backend : null
    };
  }
  init(cfg) {
    const key = JSON.stringify(cfg);
    if (this.requests.has(key)) return this.requests.get(key);
    const task = this.queue.catch(() => {
    }).then(async () => {
      const started = performance.now();
      const changed = key !== this.configKey;
      if (changed) {
        this.generation++;
        this.completed = [];
      }
      if (changed) store.emit("model-status", { state: "loading", text: "Đang khởi tạo AI…" });
      this.split = cfg.threadMode === "worker" && canUseWorker();
      if (this.split) {
        const initialized = await Promise.allSettled([
          this.primary.init({ ...cfg, workerOnly: true, role: "pose", detectObjects: false, detectFaces: false }),
          this.auxiliary.init({ ...cfg, workerOnly: true, role: "auxiliary", runPose: false })
        ]);
        if (initialized.some((r) => r.status === "rejected")) {
          this.auxiliary.terminate();
          this.split = false;
          await this.primary.init(cfg);
        }
      } else {
        this.auxiliary.terminate();
        await this.primary.init(cfg);
      }
      this.configKey = key;
      if (changed) this.startupMs = performance.now() - started;
      const info = this.info();
      store.emit("model-status", { state: "ready", text: `Sẵn sàng · ${info.backend} · ${this.split ? "2 worker" : info.mode}` });
      store.emit("inference-info", info);
      return info;
    }).finally(() => this.requests.delete(key));
    this.requests.set(key, task);
    this.queue = task;
    return task;
  }
  grab(source, width) {
    return this.primary.grab(source, width);
  }
  async detect(source, opts = {}) {
    return this.detectGrabbed(await this.grab(source, opts.inputWidth || 480), opts);
  }
  async detectGrabbed(frame, opts = {}) {
    try {
      await this.queue;
    } catch (error) {
      frame.bitmap.close?.();
      throw error;
    }
    const started = performance.now();
    let result;
    if (this.split && (opts.withObjects || opts.withFaces)) {
      let copy;
      try {
        copy = await createImageBitmap(frame.bitmap);
      } catch (err) {
        frame.bitmap.close?.();
        throw err;
      }
      const results = await Promise.allSettled([
        this.primary.detectGrabbed(frame, { ...opts, withObjects: false, withFaces: false, faceRes: false }),
        this.auxiliary.detectGrabbed({ ...frame, bitmap: copy }, { ...opts, runPose: false })
      ]);
      const error = results.find((r) => r.status === "rejected");
      if (error) throw error.reason;
      result = { ...results[0].value, faces: results[1].value.faces, objects: results[1].value.objects };
    } else result = await this.primary.detectGrabbed(frame, opts);
    this.record(result, performance.now() - started);
    return result;
  }
  async detectPoseGrabbed(frame, opts = {}) {
    try {
      await this.queue;
    } catch (error) {
      frame.bitmap.close?.();
      throw error;
    }
    const started = performance.now();
    const result = await this.primary.detectGrabbed(frame, { ...opts, withFaces: false, withObjects: false, faceRes: false });
    this.record(result, performance.now() - started);
    return result;
  }
  record(result, elapsed) {
    const s = this.frameStats;
    s.calls++;
    s.lastMs = elapsed;
    s.emaMs = s.emaMs ? s.emaMs * 0.85 + elapsed * 0.15 : elapsed;
    s.samples.push(elapsed);
    if (s.samples.length > 120) s.samples.shift();
    store.emit("perf-sample", { inferMs: result.inferMs, roundTrip: elapsed });
  }
  // No backlog: refuse new auxiliary captures while the previous one runs.
  requestAuxiliary(source, opts) {
    if (!this.split || this.auxBusy || !opts.withFaces && !opts.withObjects) return false;
    this.auxPending = true;
    const generation = this.generation;
    this.auxiliary.detect(source, { ...opts, runPose: false }).then((result) => {
      if (generation !== this.generation) return;
      this.completed.push({ ...result, ...opts });
      if (this.completed.length > 2) this.completed.shift();
    }).catch((error) => {
      if (generation === this.generation) store.emit("model-warning", `Tác vụ mặt/đồ vật gặp lỗi: ${error.message}`);
    }).finally(() => {
      this.auxPending = false;
    });
    return true;
  }
  pollAuxiliary() {
    const result = this.completed;
    this.completed = [];
    return result;
  }
  invalidateAuxiliary() {
    this.generation++;
    this.completed = [];
  }
  markDropped() {
    this.frameStats.dropped++;
  }
  p95() {
    const a = [...this.frameStats.samples].sort((a2, b) => a2 - b);
    return a.length ? a[Math.ceil(a.length * 0.95) - 1] : 0;
  }
  resetTracker() {
    this.primary.resetTracker();
    if (this.split) this.auxiliary.resetTracker();
    this.invalidateAuxiliary();
  }
  resetStats() {
    this.primary.resetStats();
    this.auxiliary.resetStats();
    this.frameStats = { calls: 0, dropped: 0, emaMs: 0, lastMs: 0, samples: [] };
  }
  terminate() {
    this.invalidateAuxiliary();
    this.primary.terminate();
    this.auxiliary.terminate();
    this.configKey = "";
  }
};
var inference = new AnalysisService();

// js/perf.js
var BENCH_KEY = "behavior-analysis.benchmark";
var LEVEL_MAX = 3;
var hw = {
  ready: false,
  mobile: /Android|iPhone|iPad|Mobile/.test(navigator.userAgent),
  os: "Không rõ",
  browser: "Không rõ",
  cores: navigator.hardwareConcurrency || 2,
  memoryGB: navigator.deviceMemory || null,
  gpu: { webgl: 0, renderer: "Không rõ", software: false },
  tier: "mid"
};
var power = { hidden: document.hidden, batteryLow: false, charging: null, level: null };
var live = { renderFps: 0, inferFps: 0, source: null, faceFps: 0, recogFps: 0, objectFps: 0 };
var adaptive = { level: 0, overSince: 0, underSince: 0 };
var perfLog = [];
async function detectHardware() {
  const bounded = (promise, ms) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(null), ms);
    Promise.resolve(promise).then((value) => {
      clearTimeout(timer);
      resolve(value);
    }, (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
  const ua = navigator.userAgent;
  const uad = navigator.userAgentData;
  let os = uad?.platform || "";
  if (!os) {
    if (/iPhone|iPad|iPod/.test(ua) || /Macintosh/.test(ua) && navigator.maxTouchPoints > 1) os = "iOS/iPadOS";
    else if (/Android/.test(ua)) os = "Android";
    else if (/Windows NT/.test(ua)) os = "Windows";
    else if (/Mac OS X/.test(ua)) os = "macOS";
    else if (/CrOS/.test(ua)) os = "ChromeOS";
    else if (/Linux/.test(ua)) os = "Linux";
    else os = "Không rõ";
  }
  let osVersion = "";
  let arch = "";
  if (uad?.getHighEntropyValues) {
    try {
      const v = await bounded(uad.getHighEntropyValues(["platformVersion", "architecture", "bitness"]), 600);
      if (!v) throw new Error("Thông tin phần cứng phản hồi chậm");
      osVersion = v.platformVersion || "";
      arch = [v.architecture, v.bitness && `${v.bitness}-bit`].filter(Boolean).join(" ");
      if (os === "Windows" && osVersion) os = parseInt(osVersion, 10) >= 13 ? "Windows 11" : "Windows 10";
    } catch {
    }
  }
  const browser = detectBrowser(ua, uad);
  const gpu = getGpuInfo();
  let webgpu = false;
  let webgpuInfo = "";
  if (navigator.gpu) {
    try {
      const adapter = await bounded(navigator.gpu.requestAdapter(), 800);
      webgpu = !!adapter;
      const info = adapter?.info || (adapter?.requestAdapterInfo ? await bounded(adapter.requestAdapterInfo(), 600) : null);
      if (info) webgpuInfo = [info.vendor, info.architecture].filter(Boolean).join(" ");
    } catch {
    }
  }
  const simd = (() => {
    try {
      return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
    } catch {
      return false;
    }
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
    wasmThreads: !!(window.crossOriginIsolated && typeof SharedArrayBuffer !== "undefined"),
    offscreenCanvas: typeof OffscreenCanvas !== "undefined",
    worker: canUseWorker(),
    videoFrameCallback: "requestVideoFrameCallback" in HTMLVideoElement.prototype,
    mobile: uad?.mobile ?? (/Android|iPhone|iPad|Mobile/.test(ua) || /Macintosh/.test(ua) && navigator.maxTouchPoints > 1),
    screen: `${screen.width}×${screen.height} @${window.devicePixelRatio || 1}x`
  });
  hw.tier = computeTier(hw);
  hw.fingerprint = [hw.os, hw.browser, hw.cores, hw.memoryGB, gpu.renderer].join("|");
  hw.ready = true;
  initPowerManagement();
  store.emit("hardware", hw);
  return hw;
}
function detectBrowser(ua, uad) {
  const brand = uad?.brands?.find((b) => /Edge|Chrome|Opera|Brave|Cốc Cốc|CocCoc|Samsung/i.test(b.brand) && !/Chromium/.test(b.brand));
  if (brand) return `${brand.brand} ${brand.version}`;
  let m;
  if (m = ua.match(/Edg\/([\d.]+)/)) return `Edge ${m[1]}`;
  if (m = ua.match(/coc_coc_browser\/([\d.]+)/i)) return `Cốc Cốc ${m[1]}`;
  if (m = ua.match(/Firefox\/([\d.]+)/)) return `Firefox ${m[1]}`;
  if (m = ua.match(/Chrome\/([\d.]+)/)) return `Chrome ${m[1]}`;
  if (m = ua.match(/Version\/([\d.]+).*Safari/)) return `Safari ${m[1]}`;
  return "Không rõ";
}
function getGpuInfo() {
  const out = { webgl: 0, renderer: "Không rõ", vendor: "", software: false, maxTexture: 0 };
  try {
    const c = document.createElement("canvas");
    let gl = c.getContext("webgl2");
    out.webgl = gl ? 2 : 0;
    if (!gl) {
      gl = c.getContext("webgl");
      out.webgl = gl ? 1 : 0;
    }
    if (gl) {
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      out.renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      out.vendor = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
      out.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  } catch {
  }
  out.software = /swiftshader|llvmpipe|softpipe|basic render|software|lavapipe/i.test(out.renderer);
  return out;
}
function computeTier(h) {
  let score = 0;
  const c = h.cores || 2;
  score += c >= 8 ? 2 : c >= 4 ? 1 : 0;
  const m = h.memoryGB;
  score += m == null ? 1 : m >= 8 ? 2 : m >= 4 ? 1 : 0;
  const r = h.gpu.renderer || "";
  if (h.gpu.software || !h.gpu.webgl) score -= 2;
  else if (/nvidia|geforce|rtx|gtx|radeon rx|radeon pro|apple m\d|apple gpu|arc a/i.test(r)) score += 2;
  else if (/iris xe|iris\(r\) xe|radeon|adreno 7|apple/i.test(r)) score += 1;
  else if (/intel|uhd|hd graphics|mali|adreno|powervr/i.test(r)) score += 0;
  else score += 1;
  if (h.mobile) score -= 1;
  return score >= 4 ? "high" : score >= 2 ? "mid" : "low";
}
var TIER_LABEL = { low: "Máy yếu", mid: "Trung bình", high: "Máy mạnh" };
function isLowTierCapped() {
  return hw.ready && hw.tier === "low" && store.settings.perfProfile === "quality";
}
function activeProfileKey() {
  return resolveProfileForHardware(store.settings.perfProfile, hw, power.batteryLow);
}
function runtime() {
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
    faceResEvery: 0
  };
}
function resolvedThreadMode() {
  const t = store.settings.threadMode;
  if (t === "main") return "main";
  if (!canUseWorker()) return "main";
  if (t === "worker") return "worker";
  return hw.offscreenCanvas ? "worker" : "main";
}
function backendOrder() {
  const all = ["webgpu", "webgl", "wasm", "cpu"];
  const chosen = store.settings.backend;
  if (chosen !== "auto") return [chosen, ...all.filter((b) => b !== chosen && b !== "webgpu")];
  const bench = loadBenchmark();
  if (bench && bench.fingerprint === hw.fingerprint && bench.results?.length) {
    const ok = bench.results.filter((r) => r.ok).sort((a, b) => a.median - b.median).map((r) => r.backend);
    return [...ok, ...["wasm", "cpu"].filter((b) => !ok.includes(b))];
  }
  if (!hw.ready) return ["webgl", "wasm", "cpu"];
  if (hw.gpu.software || !hw.gpu.webgl) return ["wasm", "cpu"];
  return ["webgl", "wasm", "cpu"];
}
function modelConfig() {
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
    faceRecog: false
  };
}
function adaptTick(emaMs) {
  if (!store.settings.adaptive) return;
  const rt = runtime();
  const maxAllowedMs = Math.min(95, 1e3 / rt.targetFps);
  const util = emaMs / maxAllowedMs;
  const now = performance.now();
  if (util > 1.08 || live.inferFps > 0 && live.inferFps < 10.2 || live.renderFps > 0 && live.renderFps < 14.2) {
    adaptive.underSince = 0;
    adaptive.overSince || (adaptive.overSince = now);
    if (now - adaptive.overSince > 1400 && adaptive.level < LEVEL_MAX) {
      adaptive.level = util > 2.2 ? LEVEL_MAX : adaptive.level + 1;
      adaptive.overSince = 0;
      store.emit("adaptive", { level: adaptive.level, direction: "down", util });
    }
  } else if (util < 0.55 && adaptive.level > 0 && (live.inferFps === 0 || live.inferFps >= 12) && (live.renderFps === 0 || live.renderFps >= 18)) {
    adaptive.overSince = 0;
    adaptive.underSince || (adaptive.underSince = now);
    if (now - adaptive.underSince > 4500) {
      adaptive.level--;
      adaptive.underSince = 0;
      store.emit("adaptive", { level: adaptive.level, direction: "up", util });
    }
  } else {
    adaptive.overSince = 0;
    adaptive.underSince = 0;
  }
}
function resetAdaptive() {
  adaptive.level = 0;
  adaptive.overSince = 0;
  adaptive.underSince = 0;
}
function initPowerManagement() {
  document.addEventListener("visibilitychange", () => {
    power.hidden = document.hidden;
    store.emit("visibility", power.hidden);
  });
  if (navigator.getBattery) {
    navigator.getBattery().then((bat) => {
      const update = () => {
        power.charging = bat.charging;
        power.level = bat.level;
        const low = store.settings.batterySaver && !bat.charging && bat.level <= 0.2;
        if (low !== power.batteryLow) {
          power.batteryLow = low;
          if (low) toast("Pin yếu và không sạc — chuyển sang hồ sơ Tiết kiệm (≥10 phân tích/s, ≥14 FPS).", "warn", 5e3);
          store.emit("power", power);
        }
      };
      update();
      bat.addEventListener("chargingchange", update);
      bat.addEventListener("levelchange", update);
    }).catch(() => {
    });
  }
}
function loadBenchmark() {
  try {
    return JSON.parse(localStorage.getItem(BENCH_KEY) || "null");
  } catch {
    return null;
  }
}
async function runBenchmark(onProgress = () => {
}) {
  const canWorker = canUseWorker();
  const candidates = [];
  if (hw.webgpu) candidates.push("webgpu");
  if (hw.gpu.webgl) candidates.push("webgl");
  candidates.push("wasm", "cpu");
  const img = makeTestImage();
  const results = [];
  const runs = 10;
  const cfgBase = modelConfig();
  for (let i = 0; i < candidates.length; i++) {
    const b = candidates[i];
    onProgress(`Đang đo ${b} (${i + 1}/${candidates.length})…`, i / candidates.length);
    if (!canWorker) {
      results.push({ backend: b, ok: false, note: "Cần Web Worker để đo tách biệt" });
      continue;
    }
    const svc = new InferenceService({ silent: true });
    try {
      const info = await svc.init({ ...cfgBase, threadMode: "worker", backendOrder: [b], detectObjects: false });
      if (info.backend !== b) throw new Error(`chạy bằng ${info.backend}`);
      const times = [];
      for (let k = 0; k < runs + 3; k++) {
        const r = await svc.detect(img, { inputWidth: PROFILES[runtime().key].inputWidth, timestampMs: k * 100 });
        if (k >= 3) times.push(r.roundTripMs);
      }
      times.sort((a, b2) => a - b2);
      const median2 = times[Math.floor(times.length / 2)];
      results.push({
        backend: b,
        ok: true,
        median: round(median2, 1),
        p95: round(times[Math.floor(times.length * 0.95) - 1] ?? median2, 1),
        fps: round(1e3 / median2, 1)
      });
    } catch (err) {
      results.push({ backend: b, ok: false, note: err.message.slice(0, 80) });
    } finally {
      svc.terminate();
    }
  }
  const best = results.filter((r) => r.ok).sort((a, b) => a.median - b.median)[0] || null;
  const data = { fingerprint: hw.fingerprint, at: (/* @__PURE__ */ new Date()).toISOString(), results, best: best?.backend || null };
  try {
    localStorage.setItem(BENCH_KEY, JSON.stringify(data));
  } catch {
  }
  onProgress("Xong", 1);
  store.emit("benchmark", data);
  return data;
}
function makeTestImage() {
  const c = document.createElement("canvas");
  c.width = 640;
  c.height = 360;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 640, 360);
  g.addColorStop(0, "#334");
  g.addColorStop(1, "#997");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 640, 360);
  ctx.fillStyle = "#222";
  ctx.beginPath();
  ctx.arc(320, 80, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(295, 110, 50, 130);
  ctx.fillRect(300, 240, 18, 110);
  ctx.fillRect(322, 240, 18, 110);
  return c;
}
function logPerf(source, stats) {
  const mem = stats.memory || {};
  perfLog.push({
    time: (/* @__PURE__ */ new Date()).toISOString(),
    source,
    os: hw.os,
    browser: hw.browser,
    gpu: hw.gpu?.renderer || "",
    cores: hw.cores,
    memoryGB: hw.memoryGB,
    tier: hw.tier,
    appVersion: APP_VERSION,
    poseDim: stats.poseDim || runtime().poseDim,
    inputWidth: runtime().inputWidth,
    cameraRes: live.cameraRes || "",
    cameraFps: live.cameraFps || 0,
    cameraRequestDelayMs: live.cameraRequestDelayMs || 0,
    cameraOpenMs: live.cameraOpenMs || 0,
    modelWaitMs: live.modelWaitMs || 0,
    profileRequested: store.settings.perfProfile,
    profileActive: activeProfileKey(),
    lowTierCapped: isLowTierCapped() ? "yes" : "no",
    level: adaptive.level,
    backend: mem.backend || "",
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
    tensors: mem.numTensors ?? "",
    tensorMB: mem.numBytes != null ? round(mem.numBytes / 1048576, 1) : "",
    heapMB: performance.memory ? round(performance.memory.usedJSHeapSize / 1048576, 1) : ""
  });
  if (perfLog.length > 5e3) perfLog.shift();
}
function exportPerfLog() {
  if (!perfLog.length) {
    logPerf("system-snapshot", { emaMs: 0, poseDim: runtime().poseDim, memory: {} });
  }
  const cols = Object.keys(perfLog[0]);
  const csv = [cols.join(","), ...perfLog.map((r) => cols.map((c) => `"${String(r[c] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
  downloadText(`hieu-nang_${(/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`, "\uFEFF" + csv, "text/csv");
  toast(`Đã xuất ${perfLog.length} dòng log hiệu năng CSV.`, "ok");
}
var perfLogSize = () => perfLog.length;
function perfSummary(inf) {
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
    inferFps: round(live.inferFps, 1)
  };
}

// js/player.js
var FRAME_STEP = 1 / 30;
var HAS_RVFC = "requestVideoFrameCallback" in HTMLVideoElement.prototype;
var video;
var canvas;
var scrubber;
var lanesEl;
var playBtn;
var curEl;
var durEl;
var overlayToggle;
var playheadEl = null;
var laneSegments = [];
var rafId = null;
var lastTimeEmit = 0;
var renderFrames = [];
var renderDirty = true;
var fpsCount = 0;
var fpsT0 = performance.now();
function initPlayer() {
  video = $("#video");
  canvas = $("#videoOverlay");
  scrubber = $("#scrubber");
  lanesEl = $("#lanes");
  playBtn = $("#playBtn");
  curEl = $("#curTime");
  durEl = $("#durTime");
  overlayToggle = $("#overlayToggle");
  $("#transport")?.addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (!act) return;
    ({
      play: togglePlay,
      stop: stopVideo,
      back5: () => skip(-5),
      fwd5: () => skip(5),
      "frame-back": () => stepFrame(-1),
      "frame-fwd": () => stepFrame(1),
      "prev-event": () => jumpEvent(-1),
      "next-event": () => jumpEvent(1)
    })[act]?.();
  });
  video.addEventListener("loadedmetadata", onMetadata);
  video.addEventListener("play", () => {
    playBtn?.classList.add("is-playing");
    playBtn?.setAttribute("aria-label", "Tạm dừng");
    uiLoop();
  });
  video.addEventListener("pause", () => {
    playBtn?.classList.remove("is-playing");
    playBtn?.setAttribute("aria-label", "Phát");
    cancelAnimationFrame(rafId);
    tick();
    drawAt(video.currentTime);
  });
  video.addEventListener("seeked", () => {
    tick();
    drawAt(video.currentTime);
  });
  video.addEventListener("ended", tick);
  if (HAS_RVFC) {
    const onFrame = (_now, meta) => {
      drawAt(meta.mediaTime);
      countFps();
      video.requestVideoFrameCallback(onFrame);
    };
    video.requestVideoFrameCallback(onFrame);
  }
  scrubber?.addEventListener("input", () => {
    if (!hasVideo()) return;
    video.currentTime = parseFloat(scrubber.value);
  });
  $("#rateSelect")?.addEventListener("change", (e) => {
    video.playbackRate = parseFloat(e.target.value);
    toast(`Tốc độ phát video: ${e.target.value}×`, "info", 1800);
  });
  overlayToggle?.addEventListener("change", () => drawAt(video.currentTime));
  lanesEl?.addEventListener("click", (e) => {
    const seg = e.target.closest(".lane-seg");
    if (seg) {
      seekTo(parseFloat(seg.dataset.start));
      return;
    }
    const track = e.target.closest(".lane-track");
    if (track && hasVideo()) {
      const r = track.getBoundingClientRect();
      seekTo(clamp((e.clientX - r.left) / r.width, 0, 1) * laneDuration());
    }
  });
  store.on("filtered", (list) => {
    laneSegments = list.filter((s) => s.source === "video");
    renderLanes();
  });
  store.on("live-segments", (list) => {
    laneSegments = list.filter((s) => s.source === "video");
    renderLanes();
  });
  store.on("results", () => {
    renderDirty = true;
    drawAt(video?.currentTime || 0);
  });
  store.on("settings", () => {
    renderDirty = true;
  });
}
function onMetadata() {
  const { videoWidth: w, videoHeight: h, duration } = video;
  store.media = { ...store.media, duration, width: w, height: h };
  fitStage($("#videoStage"), w, h);
  syncCanvas(canvas, video, runtime().canvasMax);
  if (scrubber) scrubber.max = duration || 0;
  if (durEl) durEl.textContent = fmtTimeMs(duration || 0);
  renderLanes();
  tick();
}
function fitStage(stage, w, h) {
  if (!stage || !w || !h) return;
  stage.style.aspectRatio = `${w} / ${h}`;
  stage.style.width = `min(100%, calc(66vh * ${(w / h).toFixed(4)}))`;
}
var hasVideo = () => !!video?.currentSrc && video.readyState >= 1;
var getVideo = () => video;
var getOverlayCanvas = () => canvas;
var currentTime = () => hasVideo() ? video.currentTime : 0;
function togglePlay() {
  if (!hasVideo() || store.analyzing) return;
  video.paused ? video.play() : video.pause();
}
function stopVideo() {
  if (!hasVideo() || store.analyzing) return;
  video.pause();
  video.currentTime = 0;
  tick();
  drawAt(0);
}
function clearVideoStage() {
  if (!video) return;
  video.pause();
  video.removeAttribute("src");
  video.load();
  clearOverlay(canvas);
  if ($("#videoStage")) $("#videoStage").hidden = true;
  if ($("#dropEmpty")) $("#dropEmpty").hidden = false;
  $("#dropzone")?.classList.remove("has-video");
  if ($("#analyzeBtn")) $("#analyzeBtn").disabled = true;
  if (curEl) curEl.textContent = "00:00.000";
  if (durEl) durEl.textContent = "00:00.000";
  store.media = { name: null, duration: 0, width: 0, height: 0, size: 0 };
}
function seekTo(t, { play = false } = {}) {
  if (!hasVideo()) {
    toast("Chưa có video để tua. Hãy tải video lên hoặc chọn từ danh sách.", "warn");
    return false;
  }
  if (store.analyzing) {
    toast("Đang phân tích — hãy đợi xong rồi tua.", "warn");
    return false;
  }
  store.emit("switch-tab", "video");
  video.currentTime = clamp(t, 0, video.duration || t);
  if (play) video.play();
  return true;
}
function skip(delta) {
  if (hasVideo()) seekTo(video.currentTime + delta);
}
function stepFrame(dir) {
  if (!hasVideo()) return;
  video.pause();
  seekTo(video.currentTime + dir * FRAME_STEP);
}
function jumpEvent(dir) {
  if (!hasVideo()) return;
  const starts = [...new Set(laneSegments.map((s) => s.start))].sort((a, b) => a - b);
  if (!starts.length) {
    toast("Chưa có sự kiện nào trên dòng thời gian.", "warn");
    return;
  }
  const cur = video.currentTime;
  const target = dir > 0 ? starts.find((s) => s > cur + 0.05) : [...starts].reverse().find((s) => s < cur - 0.15);
  if (target === void 0) toast(dir > 0 ? "Đã tới sự kiện cuối cùng." : "Đã ở sự kiện đầu tiên.");
  else seekTo(target);
}
function uiLoop() {
  tick();
  if (!HAS_RVFC) {
    drawAt(video.currentTime);
    countFps();
  }
  if (!video.paused && !video.ended) rafId = requestAnimationFrame(uiLoop);
}
function countFps() {
  fpsCount++;
  const now = performance.now();
  if (now - fpsT0 >= 1e3) {
    if (!video.paused) {
      live.renderFps = fpsCount * 1e3 / (now - fpsT0);
      live.source = "video";
    }
    fpsCount = 0;
    fpsT0 = now;
  }
}
function tick() {
  if (!video) return;
  const t = video.currentTime || 0;
  if (curEl) curEl.textContent = fmtTimeMs(t);
  if (scrubber && document.activeElement !== scrubber) scrubber.value = t;
  if (playheadEl) playheadEl.style.left = `${t / (laneDuration() || 1) * 100}%`;
  const now = performance.now();
  if (now - lastTimeEmit > 100) {
    lastTimeEmit = now;
    store.emit("time", t);
  }
}
function buildRenderFrames() {
  renderDirty = false;
  const raw = store.frames;
  const conv = raw.map((f) => ({
    t: f.t,
    persons: f.persons.map((p) => ({
      personId: p.id,
      box: p.box ? { x: p.box[0], y: p.box[1], w: p.box[2], h: p.box[3] } : null,
      labels: (p.labels || []).map((b) => ({ behavior: b })),
      keypoints: p.kp ? p.kp.map(([x, y, score]) => ({ x, y, score })) : null
    }))
  }));
  const half = Math.round((store.settings.smoothing || 0) * 2);
  if (half > 0) {
    const byId = /* @__PURE__ */ new Map();
    conv.forEach((f, fi) => f.persons.forEach((p) => {
      if (!p.keypoints) return;
      if (!byId.has(p.personId)) byId.set(p.personId, []);
      byId.get(p.personId).push({ fi, p, orig: p.keypoints.map((k) => ({ ...k })) });
    }));
    byId.forEach((seq2) => {
      for (let i = 0; i < seq2.length; i++) {
        const lo = Math.max(0, i - half), hi = Math.min(seq2.length - 1, i + half);
        seq2[i].p.keypoints = seq2[i].orig.map((k, j) => {
          let sx = 0, sy = 0, n = 0;
          for (let q = lo; q <= hi; q++) {
            if (Math.abs(conv[seq2[q].fi].t - conv[seq2[i].fi].t) > half * 0.6) continue;
            const kk = seq2[q].orig[j];
            sx += kk.x;
            sy += kk.y;
            n++;
          }
          return { x: sx / n, y: sy / n, score: k.score };
        });
      }
    });
  }
  renderFrames = conv;
}
function hudAt(t) {
  const by = /* @__PURE__ */ new Map();
  for (const sg of store.segments) {
    if (sg.source !== "video" || t < sg.start || t > sg.end) continue;
    const arr = by.get(sg.personId) || [];
    const info = behaviorInfo(sg.behavior);
    arr.push(`${info.emoji ? `${info.emoji} ` : ""}${info.label}`);
    by.set(sg.personId, arr);
  }
  return [...by.entries()].sort((a, b) => a[0] - b[0]).slice(0, 6).map(([id, arr]) => ({
    color: personColor(id),
    text: `${personLabel(id, "video")}: ${arr.slice(0, 4).join(" · ")}`
  }));
}
function drawAt(t) {
  if (!video || store.analyzing || !hasVideo()) return;
  syncCanvas(canvas, video, runtime().canvasMax);
  const hud = hudAt(t);
  if (!store.frames.length) {
    drawHudOnly(canvas, hud);
    return;
  }
  if (renderDirty) buildRenderFrames();
  const frames = renderFrames;
  const step = store.meta.sampleInterval || store.settings.sampleInterval || 0.1;
  let lo = 0, hi = frames.length - 1;
  while (lo < hi) {
    const mid = lo + hi + 1 >> 1;
    if (frames[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  const a = frames[lo]?.t <= t ? frames[lo] : null;
  const b = a ? frames[lo + 1] || null : frames[0];
  let persons;
  if (store.settings.interpolate) {
    persons = interpolatePersons(a, b, t, step * 2);
  } else {
    const near = !a ? b : !b ? a : t - a.t <= b.t - t ? a : b;
    persons = near && Math.abs(near.t - t) <= step * 2 ? near.persons : [];
  }
  drawOverlay(canvas, persons, [], store.settings.minPoseScore ?? 0.25, null, {
    skeleton: overlayToggle ? overlayToggle.checked : true,
    hud
  });
}
function laneDuration() {
  return store.media.duration || Math.max(0, ...laneSegments.map((s) => s.end)) || 0;
}
function renderLanes() {
  if (!lanesEl) return;
  lanesEl.innerHTML = "";
  playheadEl = null;
  const dur = laneDuration();
  if (!laneSegments.length || !dur) {
    lanesEl.innerHTML = `<p class="lanes-empty">${store.segments.some((s) => s.source === "video") ? "Không có đoạn nào khớp bộ lọc hiện tại." : "Chưa có kết quả. Tải video hoặc dán link (YouTube, TikTok, FB) rồi bấm “Phân tích”, hoặc tải lên gói .ZIP."}</p>`;
    return;
  }
  const order = Object.keys(BEHAVIORS);
  const groupRank = (k) => ({ core: 0, body: 0, ai: 1, learned: 2 })[behaviorInfo(k).group] ?? 0;
  const keys = [...new Set(laneSegments.map((s) => s.behavior))].sort((a, b) => groupRank(a) - groupRank(b) || (order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999));
  const frag = document.createDocumentFragment();
  const rows = [];
  let row = 1;
  keys.forEach((key, idx) => {
    if (groupRank(key) === 1 && (idx === 0 || groupRank(keys[idx - 1]) !== 1)) {
      const h = document.createElement("div");
      h.className = "lane-group";
      h.style.gridRow = String(row);
      h.textContent = "Nhãn con chi tiết do AI tạo sinh (Mili-giây)";
      frag.appendChild(h);
      row++;
    }
    rows.push(row++);
  });
  const totalRows = row - 1;
  keys.forEach((key, idx) => {
    const i = rows[idx] - 1;
    const info = behaviorInfo(key);
    const label = document.createElement("div");
    label.className = "lane-label";
    label.style.gridArea = `${i + 1} / 1`;
    const tag = info.group === "ai" ? ' <small class="ai-tag">AI</small>' : info.group === "learned" ? ' <small class="muted">(học)</small>' : "";
    label.innerHTML = `<i style="background:${info.color}"></i>${info.label}${tag}`;
    const track = document.createElement("div");
    track.className = "lane-track";
    track.style.gridArea = `${i + 1} / 2`;
    const segs = laneSegments.filter((s) => s.behavior === key);
    const people = [...new Set(segs.map((s) => s.personId))].sort((x, y) => x - y);
    const H = Math.max(22, people.length * 9 + 6);
    const rowH = (H - 6) / people.length;
    track.style.height = `${H}px`;
    segs.forEach((s) => {
      const btn = document.createElement("button");
      btn.className = "lane-seg" + (info.alert ? " is-alert" : "");
      btn.style.top = `${3 + people.indexOf(s.personId) * rowH}px`;
      btn.style.height = `${Math.max(3, rowH - 1)}px`;
      btn.style.left = `${s.start / dur * 100}%`;
      btn.style.width = `${Math.max(0.3, (s.end - s.start) / dur * 100)}%`;
      btn.style.background = info.color;
      btn.dataset.start = s.start;
      btn.title = `${personLabel(s.personId, s.source)} · ${info.label} · ${fmtTimeMs(s.start)}–${fmtTimeMs(s.end)} (${s.durationMs || Math.round((s.end - s.start) * 1e3)}ms) · ${Math.round(s.confidence * 100)}%`;
      btn.setAttribute("aria-label", btn.title);
      track.appendChild(btn);
    });
    frag.append(label, track);
  });
  const ruler = document.createElement("div");
  ruler.className = "lanes-ruler";
  ruler.style.gridArea = `${totalRows + 1} / 2`;
  for (let i = 0; i <= 4; i++) {
    const s = document.createElement("span");
    s.textContent = fmtTimeMs(dur * i / 4);
    ruler.appendChild(s);
  }
  frag.appendChild(ruler);
  const layer = document.createElement("div");
  layer.style.cssText = `grid-column:2;grid-row:1 / ${totalRows + 2};position:relative;pointer-events:none;`;
  playheadEl = document.createElement("div");
  playheadEl.className = "playhead";
  layer.appendChild(playheadEl);
  frag.appendChild(layer);
  lanesEl.appendChild(frag);
  tick();
}

// js/features.js
var FEAT_DIM = 59;
var WINDOW_SEC = 1;
var clampv = (v, lim) => v > lim ? lim : v < -lim ? -lim : v;
function normalizeEntry(kp, minScore, t) {
  const ok = (i) => kp[i] && kp[i].score >= minScore;
  const mid = (a, b) => ok(a) && ok(b) ? { x: (kp[a].x + kp[b].x) / 2, y: (kp[a].y + kp[b].y) / 2 } : ok(a) ? kp[a] : ok(b) ? kp[b] : null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity, n = 0;
  for (let i = 0; i < 17; i++) {
    if (!ok(i)) continue;
    n++;
    x1 = Math.min(x1, kp[i].x);
    y1 = Math.min(y1, kp[i].y);
    x2 = Math.max(x2, kp[i].x);
    y2 = Math.max(y2, kp[i].y);
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
function windowFeatures(entries) {
  if (!entries || entries.length < 3) return null;
  const cur = entries[entries.length - 1];
  const first = entries[0];
  const span = cur.t - first.t;
  if (span < 0.15) return null;
  const f = new Float32Array(FEAT_DIM);
  f.set(cur.v, 0);
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
  [KP.lWrist, KP.rWrist].forEach((w, j) => {
    const xs = [], ys = [];
    entries.forEach((e) => {
      if (e.vis[w]) {
        xs.push(e.v[w * 2]);
        ys.push(e.v[w * 2 + 1]);
      }
    });
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
function featuresFromFrames(frames, { personId = null, from = -Infinity, to = Infinity, minScore = 0.3, stride = 1 } = {}) {
  const seqs = /* @__PURE__ */ new Map();
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
  for (const [pid, seq2] of seqs) {
    let startIdx = 0;
    for (let i = 0; i < seq2.length; i += 1) {
      const t = seq2[i].t;
      while (startIdx < i && t - seq2[startIdx].t > WINDOW_SEC) startIdx++;
      if (t < from || t > to || i % stride) continue;
      const feat = windowFeatures(seq2.slice(startIdx, i + 1));
      if (feat) out.push({ t, personId: pid, feat, labels: seq2[i].labels || [] });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}
function hasKeypoints(frames) {
  return frames.some((f) => f.persons.some((p) => Array.isArray(p.kp)));
}

// js/db.js
var DB_NAME = "behavior-analysis";
var STORE = "kv";
var dbPromise = null;
function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("Không có IndexedDB"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    let settled = false;
    const fail = (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    };
    const timer = setTimeout(() => fail(new Error("Kho dữ liệu phản hồi quá lâu")), 1200);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => {
      if (settled) {
        req.result.close();
        return;
      }
      settled = true;
      clearTimeout(timer);
      req.result.onversionchange = () => req.result.close();
      resolve(req.result);
    };
    req.onerror = () => fail(req.error);
    req.onblocked = () => fail(new Error("Kho dữ liệu đang bị một tab khác giữ"));
  });
  return dbPromise;
}
function tx(mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    const timer = setTimeout(() => {
      try {
        t.abort();
      } catch {
      }
      reject(new Error("Kho dữ liệu phản hồi quá lâu"));
    }, 1500);
    t.oncomplete = () => {
      clearTimeout(timer);
      resolve(req?.result);
    };
    t.onerror = t.onabort = () => {
      clearTimeout(timer);
      reject(t.error || new Error("Giao dịch dữ liệu bị hủy"));
    };
  }));
}
async function dbGet(key) {
  try {
    return await tx("readonly", (s) => s.get(key));
  } catch {
    try {
      return JSON.parse(localStorage.getItem(`${DB_NAME}.${key}`) || "null");
    } catch {
      return null;
    }
  }
}
async function dbSet(key, value) {
  try {
    await tx("readwrite", (s) => s.put(value, key));
  } catch {
    try {
      localStorage.setItem(`${DB_NAME}.${key}`, JSON.stringify(value));
    } catch {
    }
  }
}

// js/learner.js
var DB_KEY = "learner-v1";
var MAX_PER_CLASS = 1500;
var REF_PER_CLASS = 300;
var TRAIN_URL = new URL("./workers/train-worker.js", import.meta.url);
var L = {
  classes: [],
  // {key, label, color, createdAt}
  samples: [],
  // {c, f: Float32Array, src}
  model: null,
  // {type, keys[], mean, std, ref, refY, radius, (W1,b1,W2,b2,hidden), trainAcc, valAcc, trainedAt}
  dirty: false,
  lastDiscovery: null
};
var toF32 = (x) => x instanceof Float32Array ? x : Float32Array.from(Array.isArray(x) ? x : Object.values(x || {}));
var toI32 = (x) => x instanceof Int32Array ? x : Int32Array.from(Array.isArray(x) ? x : Object.values(x || {}));
async function initLearner() {
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
  if (m.type === "mlp") ["W1", "b1", "W2", "b2"].forEach((k) => {
    out[k] = toF32(m[k]);
  });
  return out;
}
var persist = debounce(() => {
  dbSet(DB_KEY, { classes: L.classes, samples: L.samples, model: L.model, dirty: L.dirty });
}, 400);
function register(c) {
  BEHAVIORS[c.key] = { label: c.label, color: c.color, group: "learned" };
}
function emit() {
  store.emit("learner", summary());
}
function summary() {
  const counts = {};
  L.samples.forEach((s) => {
    counts[s.c] = (counts[s.c] || 0) + 1;
  });
  return {
    classes: L.classes.map((c) => ({ ...c, count: counts[c.key] || 0 })),
    total: L.samples.length,
    model: L.model ? {
      type: L.model.type,
      keys: L.model.keys,
      trainAcc: L.model.trainAcc,
      valAcc: L.model.valAcc,
      trainedAt: L.model.trainedAt,
      nTrain: L.model.nTrain,
      nVal: L.model.nVal
    } : null,
    dirty: L.dirty
  };
}
var hasModel = () => !!L.model && store.settings.useLearned;
function findClassByLabel(label) {
  const n = normalizeVi(label);
  return L.classes.find((c) => normalizeVi(c.label) === n) || null;
}
function ensureClass(label) {
  label = String(label || "").trim();
  if (!label) throw new Error("Tên hành vi không được để trống");
  const found = findClassByLabel(label);
  if (found) return found.key;
  const slug = normalizeVi(label).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30) || "hanh_vi";
  let key = `learned_${slug}`;
  let i = 2;
  while (BEHAVIORS[key] || L.classes.some((c2) => c2.key === key)) key = `learned_${slug}_${i++}`;
  const c = { key, label, color: LEARNED_COLORS[L.classes.length % LEARNED_COLORS.length], createdAt: (/* @__PURE__ */ new Date()).toISOString() };
  L.classes.push(c);
  register(c);
  persist();
  emit();
  return key;
}
function addSamples(key, feats, src = "manual") {
  const valid = feats.filter((f) => f && f.length === FEAT_DIM);
  if (!valid.length) return 0;
  valid.forEach((f) => L.samples.push({ c: key, f: toF32(f), src }));
  const mine = L.samples.filter((s) => s.c === key);
  if (mine.length > MAX_PER_CLASS) {
    const drop = /* @__PURE__ */ new Set();
    while (drop.size < mine.length - MAX_PER_CLASS) drop.add(mine[Math.floor(Math.random() * (mine.length - valid.length))]);
    L.samples = L.samples.filter((s) => !drop.has(s));
  }
  L.dirty = true;
  persist();
  emit();
  return valid.length;
}
function removeClass(key) {
  L.classes = L.classes.filter((c) => c.key !== key);
  L.samples = L.samples.filter((s) => s.c !== key);
  delete BEHAVIORS[key];
  if (L.model?.keys.includes(key)) {
    L.model = null;
  }
  L.dirty = true;
  persist();
  emit();
}
function renameClass(key, label) {
  const c = L.classes.find((x) => x.key === key);
  if (!c || !label.trim()) return;
  c.label = label.trim();
  register(c);
  persist();
  emit();
}
function clearSamplesOf(key) {
  L.samples = L.samples.filter((s) => s.c !== key);
  L.dirty = true;
  persist();
  emit();
}
async function train({ algo = "auto", onProgress = () => {
} } = {}) {
  const counts = {};
  L.samples.forEach((s) => {
    counts[s.c] = (counts[s.c] || 0) + 1;
  });
  const keys = L.classes.map((c) => c.key).filter((k) => (counts[k] || 0) >= 3);
  if (!keys.length) throw new Error("Cần ít nhất 3 mẫu cho một hành vi để huấn luyện.");
  const used = L.samples.filter((s) => keys.includes(s.c));
  const n = used.length;
  const X = new Float32Array(n * FEAT_DIM);
  const y = new Int32Array(n);
  used.forEach((s, i) => {
    X.set(s.f, i * FEAT_DIM);
    y[i] = keys.indexOf(s.c);
  });
  const useMlp = algo === "mlp" || algo === "auto" && keys.length >= 2 && n >= 60;
  let model;
  if (useMlp && keys.length >= 2) {
    const m = await runWorker({ type: "train", X: X.slice(), y, n, d: FEAT_DIM, classes: keys.length, opts: { epochs: 80, hidden: 64 } }, onProgress, "trained");
    model = { ...m.model, type: "mlp" };
  } else {
    onProgress({ epoch: 1, epochs: 1, text: "Tính thống kê KNN" });
    model = buildKnnStats(X, y, n, keys.length);
  }
  const ref = buildReference(X, y, n, keys.length, model.mean, model.std);
  L.model = {
    ...model,
    keys,
    ref: ref.ref,
    refY: ref.refY,
    trainedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  if (model.type === "knn") L.model.radius = ref.radius;
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
      if (m.type === "progress") onProgress(m);
      else if (m.type === doneType) {
        w.terminate();
        resolve(m);
      } else if (m.type === "error") {
        w.terminate();
        reject(new Error(m.message));
      }
    };
    w.onerror = (e) => {
      w.terminate();
      reject(new Error(e.message || "Worker huấn luyện lỗi"));
    };
    w.postMessage(msg, [msg.X.buffer]);
  });
}
function buildKnnStats(X, y, n, C) {
  const d = FEAT_DIM;
  const mean = new Float32Array(d), std2 = new Float32Array(d);
  for (let i = 0; i < n; i++) for (let j = 0; j < d; j++) mean[j] += X[i * d + j];
  for (let j = 0; j < d; j++) mean[j] /= n;
  for (let i = 0; i < n; i++) for (let j = 0; j < d; j++) std2[j] += (X[i * d + j] - mean[j]) ** 2;
  for (let j = 0; j < d; j++) std2[j] = Math.max(Math.sqrt(std2[j] / n), 0.1);
  return { type: "knn", mean, std: std2, classes: C, trainAcc: null, valAcc: null, nTrain: n, nVal: 0 };
}
function buildReference(X, y, n, C, mean, std2) {
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
    for (let j = 0; j < d; j++) ref[r * d + j] = (X[idx * d + j] - mean[j]) / std2[j];
  });
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
  for (let j = 0; j < d; j++) {
    const t = A[a * d + j] - B[b * d + j];
    s += t * t;
  }
  return s;
}
var zbuf = new Float32Array(FEAT_DIM);
function predict(feat, { threshold = store.settings.learnThreshold } = {}) {
  const m = L.model;
  if (!m || !feat) return null;
  const d = FEAT_DIM;
  for (let j = 0; j < d; j++) zbuf[j] = (feat[j] - m.mean[j]) / m.std[j];
  const C = m.keys.length;
  const nearest = new Float32Array(C).fill(Infinity);
  const K = 5;
  const topD = [], topY = [];
  for (let r = 0; r < m.refY.length; r++) {
    let s = 0;
    for (let j = 0; j < d; j++) {
      const t = zbuf[j] - m.ref[r * d + j];
      s += t * t;
    }
    const c = m.refY[r];
    if (s < nearest[c]) nearest[c] = s;
    if (topD.length < K || s < topD[topD.length - 1]) {
      let i = topD.length;
      topD.push(s);
      topY.push(c);
      while (i > 0 && topD[i - 1] > s) {
        topD[i] = topD[i - 1];
        topY[i] = topY[i - 1];
        i--;
      }
      topD[i] = s;
      topY[i] = c;
      if (topD.length > K) {
        topD.pop();
        topY.pop();
      }
    }
  }
  let best, conf;
  if (m.type === "mlp") {
    const probs = mlpForward(m, zbuf);
    best = 0;
    for (let c = 1; c < C; c++) if (probs[c] > probs[best]) best = c;
    conf = probs[best];
  } else {
    const votes = new Float32Array(C);
    topY.forEach((c, i) => {
      votes[c] += 1 / (Math.sqrt(topD[i]) + 0.5);
    });
    const total = votes.reduce((a, b) => a + b, 0) || 1;
    best = 0;
    for (let c = 1; c < C; c++) if (votes[c] > votes[best]) best = c;
    conf = votes[best] / total;
  }
  const dist2 = Math.sqrt(nearest[best]);
  const rad = m.radius[best];
  if (!(dist2 <= rad)) return null;
  conf *= 1 - 0.4 * (dist2 / rad);
  if (conf < threshold) return null;
  return { key: m.keys[best], confidence: round(conf, 3), distance: dist2 };
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
  for (let c = 0; c < C; c++) {
    o[c] = Math.exp(o[c] - mx);
    sum += o[c];
  }
  for (let c = 0; c < C; c++) o[c] /= sum;
  return o;
}
function teachFromFrames(label, { personId, from, to }) {
  const feats = featuresFromFrames(store.frames, { personId, from, to, minScore: store.settings.minScore });
  if (!feats.length) throw new Error("Không có dữ liệu khung xương trong khoảng này (cần phân tích video trước, hoặc JSON có kèm toạ độ khớp).");
  const key = ensureClass(label);
  const n = addSamples(key, feats.map((x) => x.feat), "video");
  return { key, n };
}
async function discover({ k = 0, onProgress = () => {
} } = {}) {
  const frames = store.frames;
  let feats = featuresFromFrames(frames, { minScore: store.settings.minScore });
  if (feats.length < 30) throw new Error("Cần video đã phân tích với ít nhất vài giây có người để khám phá.");
  if (feats.length > 4e3) feats = feats.filter((_, i) => i % Math.ceil(feats.length / 4e3) === 0);
  const n = feats.length;
  const X = new Float32Array(n * FEAT_DIM);
  feats.forEach((f, i) => X.set(f.feat, i * FEAT_DIM));
  const res = await runWorker({ type: "kmeans", X, n, d: FEAT_DIM, k, kMax: 8 }, (p) => onProgress(p), "clusters");
  const step = store.meta.sampleInterval || store.settings.sampleInterval;
  const clusters = [];
  for (let c = 0; c < res.k; c++) {
    const members = [];
    for (let i = 0; i < n; i++) if (res.assign[i] === c) members.push(i);
    if (!members.length) continue;
    const counts = {};
    members.forEach((i) => feats[i].labels.forEach((l) => {
      counts[l] = (counts[l] || 0) + 1;
    }));
    const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const purity = ranked.length ? ranked[0][1] / members.length : 0;
    let learned = null;
    if (L.model) {
      const lc = {};
      members.forEach((i) => {
        const p = predict(feats[i].feat, { threshold: 0.5 });
        if (p) lc[p.key] = (lc[p.key] || 0) + 1;
      });
      const top = Object.entries(lc).sort((a, b) => b[1] - a[1])[0];
      if (top && top[1] / members.length >= 0.5) learned = { key: top[0], share: top[1] / members.length };
    }
    const runs = [];
    const byPerson = {};
    members.forEach((i) => {
      var _a;
      return (byPerson[_a = feats[i].personId] || (byPerson[_a] = [])).push(feats[i].t);
    });
    Object.entries(byPerson).forEach(([pid, ts]) => {
      ts.sort((a, b) => a - b);
      let s = ts[0], prev = ts[0], cnt = 1;
      const flush = () => {
        if (prev - s + step >= 0.75) runs.push({ personId: Number(pid), start: s, end: prev + step, n: cnt });
      };
      for (let q = 1; q < ts.length; q++) {
        if (ts[q] - prev <= step * 2.5) {
          prev = ts[q];
          cnt++;
        } else {
          flush();
          s = prev = ts[q];
          cnt = 1;
        }
      }
      flush();
    });
    runs.sort((a, b) => b.end - b.start - (a.end - a.start));
    clusters.push({
      id: c,
      size: members.length,
      share: members.length / n,
      rule: ranked.slice(0, 2).map(([key, v]) => ({ key, share: v / members.length })),
      purity,
      novelty: learned ? 0 : 1 - purity,
      learned,
      runs: runs.slice(0, 6),
      members
    });
  }
  const byTop = {};
  clusters.forEach((c) => {
    const top = c.rule[0]?.key || "_none";
    (byTop[top] || (byTop[top] = [])).push(c);
  });
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
function learnCluster(clusterId, label) {
  const D = L.lastDiscovery;
  const cl = D?.clusters.find((c) => c.id === clusterId);
  if (!cl) throw new Error("Không tìm thấy cụm — hãy chạy khám phá lại.");
  const inRuns = cl.members.filter((i) => {
    const f = D.feats[i];
    return cl.runs.some((r) => r.personId === f.personId && f.t >= r.start && f.t <= r.end);
  });
  const chosen = (inRuns.length >= 10 ? inRuns : cl.members).map((i) => D.feats[i].feat);
  const key = ensureClass(label);
  return { key, n: addSamples(key, chosen, "discover") };
}
function applyToFrames() {
  if (!L.model) throw new Error("Chưa có mô hình đã học. Hãy huấn luyện trước.");
  const feats = featuresFromFrames(store.frames, { minScore: store.settings.minScore });
  if (!feats.length) throw new Error("Không có dữ liệu khung xương để áp dụng.");
  const step = store.meta.sampleInterval || store.settings.sampleInterval;
  const builder2 = new SegmentBuilder("video", step);
  let curT = null;
  let group = [];
  const flush = () => {
    if (curT !== null) builder2.push(curT, group);
    group = [];
  };
  for (const f of feats) {
    if (f.t !== curT) {
      flush();
      curT = f.t;
    }
    const p = predict(f.feat);
    if (p) group.push({ personId: f.personId, labels: [{ behavior: p.key, confidence: p.confidence }] });
  }
  flush();
  const segs = builder2.finalize();
  const others = store.segments.filter((s) => !(s.source === "video" && s.behavior.startsWith("learned_")));
  store.setResults({ segments: [...others, ...segs], frames: store.frames, meta: store.meta });
  return segs.length;
}
async function selfTrain() {
  var _a;
  if (!L.model || !store.settings.selfTrain) return 0;
  const feats = featuresFromFrames(store.frames, { minScore: store.settings.minScore, stride: 2 });
  const picked = {};
  for (const f of feats) {
    const p = predict(f.feat, { threshold: 0.9 });
    if (!p) continue;
    (picked[_a = p.key] || (picked[_a] = [])).push(f.feat);
  }
  let added = 0;
  for (const [key, arr] of Object.entries(picked)) added += addSamples(key, arr.slice(0, 60), "self");
  if (added) await train({ algo: "auto" });
  return added;
}
function exportPack() {
  if (!L.classes.length) {
    toast("Chưa có hành vi nào đã học.", "warn");
    return;
  }
  const data = {
    app: "behavior-analysis",
    kind: "behavior-pack",
    version: 1,
    featDim: FEAT_DIM,
    exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
    classes: L.classes,
    samples: L.samples.map((s) => ({ c: s.c, src: s.src, f: Array.from(s.f, (v) => Math.round(v * 1e3) / 1e3) }))
  };
  downloadText(`goi-hanh-vi_${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`, JSON.stringify(data));
  toast(`Đã xuất ${L.classes.length} hành vi, ${L.samples.length} mẫu.`, "ok");
}
async function importPack(file) {
  const data = JSON.parse(await readFileAsText(file));
  if (data.kind !== "behavior-pack" || !Array.isArray(data.classes)) throw new Error("Không phải file gói hành vi.");
  if (data.featDim !== FEAT_DIM) throw new Error("Gói được tạo bởi phiên bản khác (số chiều đặc trưng không khớp).");
  const keyMap = {};
  data.classes.forEach((c) => {
    keyMap[c.key] = ensureClass(c.label);
  });
  const byKey = {};
  (data.samples || []).forEach((s) => {
    var _a;
    if (keyMap[s.c]) (byKey[_a = keyMap[s.c]] || (byKey[_a] = [])).push(s.f);
  });
  let n = 0;
  Object.entries(byKey).forEach(([k, arr]) => {
    n += addSamples(k, arr, "import");
  });
  return { classes: data.classes.length, samples: n };
}

// js/behavior.js
var POSTURE_HOLD = 0.25;
var HISTORY_SEC = 2.5;
var STALE_SEC = 5;
var FALL_WINDOW = 1.4;
var FALL_HOLD = 1.8;
var FALL_COOLDOWN = 4;
var JUMP_HOLD = 0.35;
var _BehaviorEngine_instances, stablePosture_fn, track_fn, analyzePerson_fn, speed_fn;
var BehaviorEngine = class {
  constructor(opts = {}) {
    __privateAdd(this, _BehaviorEngine_instances);
    this.tracks = /* @__PURE__ */ new Map();
    this.wantFeatures = !!opts.wantFeatures;
  }
  reset() {
    this.tracks.clear();
  }
  analyze(poses, objects, t) {
    const minScore = store.settings.minScore;
    const useLearned = store.settings.useLearned && hasModel();
    const out = [];
    for (const pose of poses || []) {
      const r = __privateMethod(this, _BehaviorEngine_instances, analyzePerson_fn).call(this, pose, t, minScore, useLearned);
      if (r) out.push(r);
    }
    for (const [id, tr] of this.tracks) {
      if (t - tr.lastSeen > STALE_SEC || t < tr.lastSeen - 1) this.tracks.delete(id);
    }
    return out;
  }
};
_BehaviorEngine_instances = new WeakSet();
stablePosture_fn = function(tr, state2, t) {
  const ps = tr.posture || (tr.posture = { cur: null, cand: null, since: t, lastSure: -Infinity });
  if (state2 === null) {
    if (t - ps.lastSure > 1.2) ps.cur = null;
    ps.cand = null;
    return ps.cur;
  }
  ps.lastSure = t;
  if (state2 === ps.cur || ps.cur === null) {
    ps.cur = state2;
    ps.cand = null;
    return ps.cur;
  }
  if (ps.cand !== state2) {
    ps.cand = state2;
    ps.since = t;
  }
  if (t - ps.since >= POSTURE_HOLD) {
    ps.cur = state2;
    ps.cand = null;
  }
  return ps.cur;
};
track_fn = function(id, t) {
  let tr = this.tracks.get(id);
  if (!tr) {
    tr = {
      hist: [],
      poseHist: [],
      speed: 0,
      lastSeen: t,
      fallUntil: -Infinity,
      lastFall: -Infinity,
      fallConf: 0.75,
      jumpUntil: -Infinity
    };
    this.tracks.set(id, tr);
  }
  tr.lastSeen = t;
  return tr;
};
analyzePerson_fn = function(pose, t, minScore, useLearned) {
  const kp = pose.keypoints;
  const ok = (i) => kp[i] && kp[i].score >= minScore;
  const pair = (a, b) => ok(a) && ok(b) ? midpoint(kp[a], kp[b]) : ok(a) ? kp[a] : ok(b) ? kp[b] : null;
  const valid = kp.filter((k) => k.score >= minScore);
  if (valid.length < 5) return null;
  const box = boundingBox(valid);
  const quality = valid.reduce((s, k) => s + k.score, 0) / valid.length;
  const shoulder = pair(KP.lShoulder, KP.rShoulder);
  const hip = pair(KP.lHip, KP.rHip);
  const ankle = pair(KP.lAnkle, KP.rAnkle);
  const nose = ok(KP.nose) ? kp[KP.nose] : null;
  const earMid = pair(KP.lEar, KP.rEar);
  const headPt = nose || earMid;
  const lw = ok(KP.lWrist) ? kp[KP.lWrist] : null;
  const rw = ok(KP.rWrist) ? kp[KP.rWrist] : null;
  const wrists = [lw && { side: "l", p: lw }, rw && { side: "r", p: rw }].filter(Boolean);
  let torso = shoulder && hip ? dist(shoulder, hip) : box.h * 0.3;
  if (!(torso > 4)) torso = Math.max(box.h * 0.3, 4);
  const reliableTorso = [KP.lShoulder, KP.rShoulder].every((i) => kp[i]?.score >= Math.max(minScore, 0.35)) && [KP.lHip, KP.rHip].every((i) => kp[i]?.score >= Math.max(minScore, 0.42));
  const tilt = reliableTorso && shoulder && hip ? angleFromVertical(shoulder, hip) : null;
  const center = hip || { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  const tr = __privateMethod(this, _BehaviorEngine_instances, track_fn).call(this, pose.id, t);
  const footY = ok(KP.lAnkle) && ok(KP.rAnkle) ? Math.max(kp[KP.lAnkle].y, kp[KP.rAnkle].y) : null;
  tr.hist.push({ t, center, torso, tilt, shoulderX: shoulder?.x, shoulderY: shoulder?.y, lw, rw, footY });
  while (tr.hist.length && t - tr.hist[0].t > HISTORY_SEC) tr.hist.shift();
  const needFeat = useLearned || this.wantFeatures;
  let feat = null;
  if (needFeat) {
    const e = normalizeEntry(kp, minScore, t);
    if (e) tr.poseHist.push(e);
    while (tr.poseHist.length && t - tr.poseHist[0].t > WINDOW_SEC) tr.poseHist.shift();
    if (tr.featT == null || t - tr.featT >= 0.08) {
      tr.feat = windowFeatures(tr.poseHist);
      tr.featT = t;
    }
    feat = tr.feat;
  }
  const headSkel = computeHeadSkeleton(kp, minScore);
  const angles = extractPostureAngles(kp, minScore);
  const jointDetail = formatJointSummary(angles);
  const labels = [];
  const addCore = (behavior, conf, detail = jointDetail, instruction = "") => {
    labels.push({
      behavior,
      confidence: round(clamp(conf * (0.6 + 0.4 * quality), 0, 1), 3),
      isCore: true,
      jointDetail: detail,
      instruction: instruction || defaultInstructionFor(behavior, angles)
    });
  };
  const addAiSubLabel = (key, labelText, parentBehavior, conf, instruction) => {
    registerAiBehavior(key, labelText, {
      parentBehavior,
      jointDetail,
      instruction
    });
    labels.push({
      behavior: key,
      confidence: round(clamp(conf * (0.65 + 0.35 * quality), 0, 1), 3),
      isCore: false,
      isAiGenerated: true,
      parentBehavior,
      jointDetail,
      instruction
    });
  };
  const has2 = (b) => labels.some((l) => l.behavior === b);
  let mainPosture = "standing";
  if (tilt !== null) {
    const wide = box.w > box.h * 1.3;
    const squat = tilt < 52 ? squatScore(kp, ok, hip, ankle, torso) : 0;
    if (tilt > 58 || tilt > 45 && wide) {
      mainPosture = "bending";
      addCore("bending", 0.82, jointDetail, "Hạ thấp thân người hoặc nằm xuống sàn theo nhịp kiểm soát.");
      addAiSubLabel(
        "ai_body_horizontal",
        `AI: Hạ thấp toàn thân (${Math.round(tilt)}°)`,
        "bending",
        0.84,
        `Hạ thấp trọng tâm toàn thân với góc nghiêng thân ${Math.round(tilt)}°, giữ đầu và cột sống thẳng hàng.`
      );
    } else if (squat > 0) {
      mainPosture = "squatting";
      addCore("squatting", squat, jointDetail, "Gập hai đầu gối hạ trọng tâm xuống tư thế Squat, giữ lưng thẳng.");
      const kneeDeg = Math.min(angles?.lKneeAngle || 100, angles?.rKneeAngle || 100);
      addAiSubLabel(
        "ai_squat_knee",
        `AI: Hạ trọng tâm Squat (Góc gối ${kneeDeg}°)`,
        "squatting",
        squat,
        `Mở hai chân rộng bằng vai, từ từ hạ hông xuống sao cho góc khớp gối đạt khoảng ${kneeDeg}°, giữ lưng nghiêng nhẹ ${angles?.torsoTilt || 15}°.`
      );
    } else if (tilt > 28) {
      mainPosture = "bending";
      addCore("bending", 0.6 + 0.35 * clamp((tilt - 28) / 30, 0, 1), jointDetail, `Gập thân trên về phía trước góc khoảng ${Math.round(tilt)}°.`);
      addAiSubLabel(
        "ai_torso_bend",
        `AI: Gập thân trên về trước (${Math.round(tilt)}°)`,
        "bending",
        0.8,
        `Từ tư thế chuẩn bị, gập hông và nghiêng thân trên về phía trước một góc ${Math.round(tilt)}°, hai gối hơi chùng nhẹ.`
      );
    } else {
      const legMin = Math.max(minScore, 0.32);
      const okLeg = (i) => kp[i] && kp[i].score >= legMin;
      const kneeL = okLeg(KP.lKnee) ? kp[KP.lKnee] : null, kneeR = okLeg(KP.rKnee) ? kp[KP.rKnee] : null;
      const legKnee = kneeL && kneeR ? midpoint(kneeL, kneeR) : kneeL || kneeR;
      const raw = legKnee && hip ? postureVote(kp, okLeg, hip, legKnee, torso) : { state: "standing", conf: 0.72 };
      const posture = __privateMethod(this, _BehaviorEngine_instances, stablePosture_fn).call(this, tr, raw?.state ?? "standing", t);
      if (posture === "sitting") {
        mainPosture = "sitting";
        addCore("sitting", raw?.state === "sitting" ? raw.conf : 0.68);
      } else {
        const speed = __privateMethod(this, _BehaviorEngine_instances, speed_fn).call(this, tr, t);
        const conf = raw?.state === "standing" ? raw.conf : 0.72;
        if (speed > 2.8) {
          mainPosture = "running";
          addCore("running", 0.65 + 0.35 * clamp((speed - 2.8) / 3, 0, 1));
          addAiSubLabel(
            "ai_fast_stride",
            "AI: Chạy nâng gối & đánh tay nhanh",
            "running",
            0.82,
            "Chạy nâng đùi nhịp nhàng kết hợp đánh hai khuỷu tay gập ~90° theo nhịp bước chân."
          );
        } else if (speed > 0.52) {
          mainPosture = "walking";
          addCore("walking", 0.6 + 0.35 * clamp((speed - 0.52) / 2.2, 0, 1));
          addAiSubLabel(
            "ai_walk_step",
            "AI: Bước di chuyển phối hợp tay-chân",
            "walking",
            0.78,
            "Bước chân đều đặn, giữ trục cột sống thẳng, hai cánh tay vung tự nhiên dọc thân người."
          );
        } else {
          mainPosture = "standing";
          addCore("standing", conf * (0.85 + 0.15 * clamp(1 - speed / 0.52, 0, 1)));
        }
      }
    }
  } else {
    addCore("standing", 0.68);
  }
  if (footY !== null && tilt !== null && tilt < 35 && !has2("sitting") && !has2("squatting")) {
    const ref = tr.hist.find((h) => t - h.t >= 0.08 && t - h.t <= 0.55 && h.footY != null);
    if (ref) {
      const footLift = (ref.footY - footY) / torso;
      const hipLift = (ref.center.y - center.y) / torso;
      if (footLift > 0.28 && hipLift > 0.18) {
        tr.jumpUntil = t + JUMP_HOLD;
        tr.jumpConf = 0.65 + 0.35 * clamp((footLift - 0.28) / 0.45, 0, 1);
      }
    }
  }
  if (t <= tr.jumpUntil) {
    addCore("jumping", tr.jumpConf || 0.75);
    addAiSubLabel(
      "ai_jump_air",
      "AI: Bật nhảy đẩy mũi chân lên không",
      "jumping",
      0.85,
      "Nhún nhẹ hai gối lấy đà rồi bật mạnh hai bàn chân lên cao, giữ thân thẳng và tiếp đất bằng mũi chân."
    );
  }
  let newFall = false;
  if (tilt !== null && tilt > 50 && t - tr.lastFall > FALL_COOLDOWN) {
    const before = tr.hist.find((h) => t - h.t <= FALL_WINDOW && t - h.t > 0.15 && h.tilt !== null && h.tilt < 30);
    if (before) {
      const drop = (center.y - before.center.y) / torso;
      const tiltChange = tilt - before.tilt;
      if (drop > 0.35 || tiltChange > 40) {
        tr.fallUntil = t + FALL_HOLD;
        tr.lastFall = t;
        tr.fallConf = 0.65 + 0.35 * clamp(Math.max(drop, tiltChange / 90), 0, 1);
        newFall = true;
      }
    }
  }
  if (t <= tr.fallUntil) addCore("falling", tr.fallConf);
  let handDetected = false;
  if (headPt && lw && rw && shoulder) {
    const near = (w) => dist(w, headPt) < torso * 0.58 && w.y < shoulder.y + torso * 0.12;
    if (near(lw) && near(rw)) {
      handDetected = true;
      addCore("hand_action", 0.84);
      addAiSubLabel(
        "ai_hands_on_head",
        "AI: Đưa hai bàn tay lên vùng đầu",
        "hand_action",
        0.85,
        "Nâng đồng thời hai cánh tay, gập khuỷu tay và đặt hai bàn tay chạm nhẹ vào vùng đầu/thái dương."
      );
    }
  }
  if (!handDetected && shoulder && hip && lw && rw && ok(KP.lElbow) && ok(KP.rElbow)) {
    const inTorso = (w) => w.y > shoulder.y - torso * 0.1 && w.y < hip.y;
    if (dist(lw, kp[KP.rElbow]) < torso * 0.46 && dist(rw, kp[KP.lElbow]) < torso * 0.46 && inTorso(lw) && inTorso(rw)) {
      handDetected = true;
      addCore("hand_action", 0.8);
      addAiSubLabel(
        "ai_arms_crossed",
        "AI: Khoanh hai cánh tay trước ngực",
        "hand_action",
        0.82,
        "Đưa hai cẳng tay bắt chéo trước ngực, bàn tay đặt nhẹ lên khuỷu tay đối diện, giữ hai vai cân bằng."
      );
    }
  }
  if (!handDetected && lw && rw && shoulder && hip && isClapping(tr.hist, t, shoulder, hip, torso)) {
    handDetected = true;
    addCore("hand_action", 0.82);
    addAiSubLabel(
      "ai_clapping",
      "AI: Vỗ hai bàn tay nhịp nhàng trước ngực",
      "hand_action",
      0.84,
      "Đưa hai bàn tay về phía trước ngực, mở lòng bàn tay và thực hiện động tác vỗ hai bàn tay vào nhau."
    );
  }
  if (!handDetected) {
    const headY = nose ? nose.y : shoulder ? shoulder.y - 0.42 * torso : null;
    if (headY !== null) {
      const lUp = lw && lw.y < headY;
      const rUp = rw && rw.y < headY;
      const lWave = lw && shoulder && lw.y < shoulder.y && isWaving(tr.hist, "l", t);
      const rWave = rw && shoulder && rw.y < shoulder.y && isWaving(tr.hist, "r", t);
      if (lWave || rWave) {
        handDetected = true;
        addCore("hand_action", 0.85);
        addAiSubLabel(
          "ai_waving",
          `AI: Vẫy bàn tay ${lWave && rWave ? "hai bên" : lWave ? "trái" : "phải"} (Xòe 5 ngón)`,
          "hand_action",
          0.86,
          `Nâng bàn tay ${lWave && rWave ? "hai bên" : lWave ? "trái" : "phải"} cao hơn vai, mở rộng 5 ngón tay và lắc cổ tay qua lại.`
        );
      } else if (lUp && rUp) {
        handDetected = true;
        addCore("hand_action", 0.88);
        addAiSubLabel(
          "ai_raise_both_hands",
          `AI: Vươn cao cả hai tay qua đầu (Khuỷu ~${angles?.rElbowAngle || 160}°)`,
          "hand_action",
          0.88,
          "Đưa đồng thời hai cánh tay vươn thẳng lên cao qua đầu, hai lòng bàn tay hướng vào nhau, mở rộng vai."
        );
      } else if (lUp || rUp) {
        handDetected = true;
        const sideVi = lUp ? "trái" : "phải";
        const elDeg = lUp ? angles?.lElbowAngle || 155 : angles?.rElbowAngle || 155;
        addCore("hand_action", 0.84);
        addAiSubLabel(
          lUp ? "ai_raise_left_hand" : "ai_raise_right_hand",
          `AI: Giơ cao tay ${sideVi} & mở bàn tay (Góc khuỷu ${elDeg}°)`,
          "hand_action",
          0.85,
          `Nâng cánh tay ${sideVi} lên cao qua đầu với góc khuỷu tay khoảng ${elDeg}°, các ngón bàn tay ${sideVi} duỗi mở tự nhiên.`
        );
      }
    }
  }
  if (!handDetected && hip && shoulder && lw && rw && ok(KP.lElbow) && ok(KP.rElbow) && ok(KP.lHip) && ok(KP.rHip)) {
    const nearHip = (w, h) => dist(w, kp[h]) < torso * 0.36;
    const out = (e, h) => Math.abs(kp[e].x - kp[h].x) > torso * 0.28;
    if (nearHip(lw, KP.lHip) && nearHip(rw, KP.rHip) && out(KP.lElbow, KP.lHip) && out(KP.rElbow, KP.rHip)) {
      handDetected = true;
      addCore("hand_action", 0.78);
      addAiSubLabel(
        "ai_hands_on_hips",
        "AI: Chống hai bàn tay vào hông (Khuỷu mở rộng)",
        "hand_action",
        0.8,
        "Đặt hai bàn tay lên hai bên hông, mở hai khuỷu tay hướng sang ngang, giữ ngực mở và lưng thẳng."
      );
    }
  }
  if (!handDetected && shoulder) {
    for (const [sideKey, sideVi, s, e, w] of [
      ["left", "trái", KP.lShoulder, KP.lElbow, KP.lWrist],
      ["right", "phải", KP.rShoulder, KP.rElbow, KP.rWrist]
    ]) {
      if (!ok(s) || !ok(e) || !ok(w)) continue;
      const ang = jointAngle(kp[s], kp[e], kp[w]);
      const reach = dist(kp[w], kp[s]) / torso;
      const level = (kp[w].y - kp[s].y) / torso;
      if (ang > 146 && reach > 0.82 && level > -0.45 && level < 0.45 && Math.abs(kp[w].x - kp[s].x) > torso * 0.56) {
        handDetected = true;
        addCore("hand_action", 0.8);
        addAiSubLabel(
          `ai_pointing_${sideKey}`,
          `AI: Duỗi thẳng cánh tay & bàn tay ${sideVi} ngang vai (${Math.round(ang)}°)`,
          "hand_action",
          0.82,
          `Nâng cánh tay ${sideVi} ngang tầm vai, duỗi thẳng khuỷu tay (${Math.round(ang)}°) và hướng các đốt ngón bàn tay ${sideVi} sang ngang.`
        );
        break;
      }
    }
  }
  if (headSkel && !has2("falling")) {
    if (headSkel.pitchDeg > 16) {
      addCore("head_motion", 0.78);
      addAiSubLabel(
        "ai_head_down",
        `AI: Cúi khung xương đầu về trước (${headSkel.pitchDeg}°)`,
        "head_motion",
        0.8,
        `Từ từ gập đốt sống cổ, hạ cằm hướng về phía ngực một góc khoảng ${headSkel.pitchDeg}°, giữ hai vai thả lỏng.`
      );
    } else if (headSkel.pitchDeg < -16) {
      addCore("head_motion", 0.76);
      addAiSubLabel(
        "ai_head_up",
        `AI: Ngửa khung xương đầu lên cao (${Math.abs(headSkel.pitchDeg)}°)`,
        "head_motion",
        0.78,
        `Nâng cằm và ngửa đầu nhẹ lên trên góc khoảng ${Math.abs(headSkel.pitchDeg)}°, mắt nhìn chếch lên.`
      );
    } else if (Math.abs(headSkel.yawDeg) > 22) {
      const dirVi = headSkel.yawDeg > 0 ? "trái" : "phải";
      const dirKey = headSkel.yawDeg > 0 ? "left" : "right";
      addCore("head_motion", 0.78);
      addAiSubLabel(
        `ai_head_turn_${dirKey}`,
        `AI: Xoay khung xương đầu sang ${dirVi} (${Math.abs(headSkel.yawDeg)}°)`,
        "head_motion",
        0.8,
        `Giữ cố định trục hai vai, xoay cổ đưa đầu hướng sang bên ${dirVi} góc khoảng ${Math.abs(headSkel.yawDeg)}°.`
      );
    } else if (Math.abs(headSkel.rollDeg) > 16) {
      const dirVi = headSkel.rollDeg > 0 ? "trái" : "phải";
      const dirKey = headSkel.rollDeg > 0 ? "left" : "right";
      addCore("head_motion", 0.76);
      addAiSubLabel(
        `ai_head_tilt_${dirKey}`,
        `AI: Nghiêng khung xương đầu sang ${dirVi} (${Math.abs(headSkel.rollDeg)}°)`,
        "head_motion",
        0.78,
        `Nghiêng nhẹ đầu sang phía vai ${dirVi} một góc khoảng ${Math.abs(headSkel.rollDeg)}° để kéo giãn cơ cổ.`
      );
    }
  }
  if (!labels.some((l) => l.isAiGenerated) && mainPosture === "standing") {
    addAiSubLabel(
      "ai_neutral_stance",
      `AI: Tư thế đứng thẳng chuẩn bị (Thân ${angles?.torsoTilt || 0}°)`,
      "standing",
      0.82,
      "Đứng thẳng tự nhiên, hai chân mở rộng ngang vai, đầu nhìn thẳng, hai cánh tay và bàn tay thả lỏng dọc thân người."
    );
  }
  if (useLearned && feat) {
    const p = predict(feat);
    if (p) {
      labels.push({
        behavior: p.key,
        confidence: p.confidence,
        isCore: false,
        isLearned: true,
        jointDetail,
        instruction: `Thực hiện động tác đã học "${behaviorInfo(p.key).label}".`
      });
    }
  }
  const handsSkel = computeHandsSkeleton(kp, null, minScore, labels);
  const aiLabelObj = labels.find((l) => l.isAiGenerated);
  return {
    personId: pose.id,
    box,
    labels,
    microAction: aiLabelObj ? behaviorInfo(aiLabelObj.behavior).label.replace(/^AI:\s*/, "") : "",
    jointDetail,
    angles,
    head: headSkel,
    hands: handsSkel,
    newFall,
    keypoints: kp,
    feat
  };
};
speed_fn = function(tr, t) {
  const h = tr.hist;
  if (h.length < 2) return tr.speed;
  const now = h[h.length - 1];
  const ref = h.find((e) => t - e.t <= 0.9 && t - e.t >= 0.15);
  if (!ref) return tr.speed;
  const raw = dist(now.center, ref.center) / ((now.torso + ref.torso) / 2) / (now.t - ref.t);
  tr.speed = tr.speed * 0.5 + raw * 0.5;
  return tr.speed;
};
function formatJointSummary(a) {
  if (!a) return "";
  const parts = [];
  parts.push(`Đầu ${a.headPitch >= 0 ? "+" : ""}${a.headPitch}°/${a.headYaw}°`);
  if (a.lElbowAngle != null) parts.push(`Tay T ${a.lElbowAngle}°`);
  if (a.rElbowAngle != null) parts.push(`Tay P ${a.rElbowAngle}°`);
  parts.push(`Thân ${a.torsoTilt}°`);
  if (a.lKneeAngle != null || a.rKneeAngle != null) {
    parts.push(`Gối ${a.lKneeAngle ?? a.rKneeAngle}°`);
  }
  return parts.join(" · ");
}
function defaultInstructionFor(behavior, a) {
  const map = {
    standing: "Đứng thẳng, hai bàn chân đặt vững rộng bằng vai, khung xương đầu giữ thẳng trục cột sống.",
    walking: "Bước chân nhịp nhàng về phía trước, giữ lưng thẳng và đánh nhẹ hai cánh tay.",
    running: "Chạy nâng cao đùi, gập khuỷu tay ~90° đánh theo nhịp bước chân.",
    sitting: "Hạ hông ngồi ổn định, giữ lưng thẳng và vai thả lỏng.",
    squatting: `Gập hai khớp gối xuống khoảng ${a?.lKneeAngle || 95}°, đẩy hông ra sau và giữ thẳng lưng.`,
    bending: `Gập thân trên từ khớp hông góc khoảng ${a?.torsoTilt || 35}°, đầu thẳng theo trục lưng.`,
    jumping: "Chùng gối lấy đà và bật nhảy thẳng lên cao bằng lực hai chân.",
    hand_action: "Thực hiện chuyển động cánh tay và mở/chuyển động các đốt ngón bàn tay theo hướng dẫn.",
    head_motion: "Di chuyển khớp cổ và đầu chậm rãi theo biên độ góc hướng dẫn, giữ cố định hai vai.",
    falling: "Cảnh báo mất thăng bằng hoặc té ngã."
  };
  return map[behavior] || "Thực hiện động tác theo khung xương mẫu trên màn hình.";
}
function boundingBox(points) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const p of points) {
    if (p.x < x1) x1 = p.x;
    if (p.y < y1) y1 = p.y;
    if (p.x > x2) x2 = p.x;
    if (p.y > y2) y2 = p.y;
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}
function postureVote(kp, okLeg, hip, knee, torso) {
  const thigh = (knee.y - hip.y) / torso;
  const side = Math.abs(knee.x - hip.x) > Math.abs(knee.y - hip.y) * 1.1;
  let kneeAng = null;
  for (const [h, k, a] of [[KP.lHip, KP.lKnee, KP.lAnkle], [KP.rHip, KP.rKnee, KP.rAnkle]]) {
    if (okLeg(h) && okLeg(k) && okLeg(a)) {
      const ang = jointAngle(kp[h], kp[k], kp[a]);
      kneeAng = kneeAng === null ? ang : Math.min(kneeAng, ang);
    }
  }
  if (side || thigh < 0.55) return { state: "sitting", conf: 0.65 + 0.3 * clamp((0.55 - Math.max(thigh, 0)) / 0.45, 0, 1) };
  if (kneeAng !== null && kneeAng < 135 && thigh < 0.8) return { state: "sitting", conf: 0.65 + 0.3 * clamp((135 - kneeAng) / 45, 0, 1) };
  if (thigh >= 0.68 && (kneeAng === null || kneeAng > 148)) return { state: "standing", conf: kneeAng === null ? 0.72 : 0.86 };
  return { state: null, conf: 0 };
}
function squatScore(kp, ok, hip, ankle, torso) {
  if (!hip || !ankle) return 0;
  const hipToAnkle = (ankle.y - hip.y) / torso;
  let knee = null;
  for (const [h, k, a] of [[KP.lHip, KP.lKnee, KP.lAnkle], [KP.rHip, KP.rKnee, KP.rAnkle]]) {
    if (ok(h) && ok(k) && ok(a)) {
      const ang = jointAngle(kp[h], kp[k], kp[a]);
      knee = knee === null ? ang : Math.min(knee, ang);
    }
  }
  if (knee === null || hipToAnkle > 0.92 || knee > 115) return 0;
  return 0.65 + 0.32 * clamp((115 - knee) / 60, 0, 1);
}
function isWaving(hist, side, t) {
  const pts = hist.filter((h) => t - h.t <= 1.4 && h[side + "w"] && h.shoulderX != null && h[side + "w"].y < h.shoulderY).map((h) => (h[side + "w"].x - h.shoulderX) / h.torso);
  if (pts.length < 3) return false;
  const recent = hist.filter((h) => t - h.t <= 1.4 && h[side + "w"] && h[side + "w"].y < h.shoulderY);
  if (recent.at(-1).t - recent[0].t < 0.35) return false;
  let reversals = 0, dir = 0, anchor = pts[0];
  for (let i = 1; i < pts.length; i++) {
    const d = pts[i] - anchor;
    if (Math.abs(d) < 0.14) continue;
    const nd = Math.sign(d);
    if (dir !== 0 && nd !== dir) reversals++;
    dir = nd;
    anchor = pts[i];
  }
  return reversals >= 2;
}
function isClapping(hist, t, shoulder, hip, torso) {
  const d = hist.filter((h) => t - h.t <= 1.4 && h.lw && h.rw).filter((h) => h.lw.y > shoulder.y - torso * 0.4 && h.lw.y < hip.y + torso * 0.2).map((h) => dist(h.lw, h.rw) / h.torso);
  if (d.length < 3) return false;
  let closes = 0, state2 = null;
  for (const v of d) {
    if (v < 0.32 && state2 !== "close") {
      if (state2 === "open") closes++;
      state2 = "close";
    } else if (v > 0.52) state2 = "open";
  }
  return closes >= 2;
}
var _SegmentBuilder_instances, close_fn;
var SegmentBuilder = class {
  constructor(source, step, onSegment) {
    __privateAdd(this, _SegmentBuilder_instances);
    this.source = source;
    this.step = step;
    this.onSegment = onSegment;
    this.open = /* @__PURE__ */ new Map();
    this.done = [];
  }
  push(t, results) {
    const baseGap = store.settings.mergeGap ?? 0.25;
    const seen = /* @__PURE__ */ new Set();
    for (const r of results || []) {
      for (const l of r.labels || []) {
        const key = `${r.personId}|${l.behavior}`;
        seen.add(key);
        const seg = this.open.get(key);
        if (seg && t - seg.end <= baseGap + 1e-6) {
          seg.end = t;
          seg.confSum += l.confidence;
          seg.n++;
          if (l.jointDetail) seg.jointDetail = l.jointDetail;
          if (l.instruction) seg.instruction = l.instruction;
          if (r.keypoints && seg.n === Math.ceil(seg.n / 2)) {
            seg.keyframeKp = r.keypoints.map((k) => ({ x: round(k.x, 1), y: round(k.y, 1), score: round(k.score, 2) }));
          }
        } else {
          if (seg) __privateMethod(this, _SegmentBuilder_instances, close_fn).call(this, key);
          this.open.set(key, {
            personId: r.personId,
            behavior: l.behavior,
            parentBehavior: l.parentBehavior || (CORE_BEHAVIORS[l.behavior] ? l.behavior : "standing"),
            isAiGenerated: !!l.isAiGenerated,
            jointDetail: l.jointDetail || r.jointDetail || "",
            instruction: l.instruction || "",
            start: t,
            end: t,
            confSum: l.confidence,
            n: 1,
            keyframeKp: r.keypoints ? r.keypoints.map((k) => ({ x: round(k.x, 1), y: round(k.y, 1), score: round(k.score, 2) })) : null
          });
        }
      }
    }
    for (const [key, seg] of this.open) {
      if (!seen.has(key) && t - seg.end > baseGap) __privateMethod(this, _SegmentBuilder_instances, close_fn).call(this, key);
    }
  }
  /** Lấy cả các đoạn đã đóng lẫn các đoạn đang mở (để hiển thị tức thì trên bảng khi đang phân tích) */
  snapshotLive() {
    const active = [];
    for (const seg of this.open.values()) {
      const startSec = round(seg.start, 3);
      const endSec = round(seg.end + this.step, 3);
      active.push({
        personId: seg.personId,
        behavior: seg.behavior,
        parentBehavior: seg.parentBehavior,
        isAiGenerated: seg.isAiGenerated,
        jointDetail: seg.jointDetail,
        jointAngles: seg.jointDetail,
        instruction: seg.instruction,
        stepHint: seg.instruction,
        start: startSec,
        end: endSec,
        startMs: Math.round(startSec * 1e3),
        endMs: Math.round(endSec * 1e3),
        durationMs: Math.max(1, Math.round((endSec - startSec) * 1e3)),
        confidence: round(seg.confSum / seg.n, 3),
        source: this.source,
        keyframeKp: seg.keyframeKp || null
      });
    }
    return [...this.done, ...active].sort((a, b) => a.start - b.start);
  }
  finalize() {
    for (const key of [...this.open.keys()]) __privateMethod(this, _SegmentBuilder_instances, close_fn).call(this, key);
    return this.done;
  }
};
_SegmentBuilder_instances = new WeakSet();
close_fn = function(key) {
  const seg = this.open.get(key);
  this.open.delete(key);
  if (!seg) return;
  const end = seg.end + this.step;
  const isAlert = BEHAVIORS[seg.behavior]?.alert;
  const minSeg = Math.min(store.settings.minSegment ?? 0.2, 0.25);
  if (end - seg.start < minSeg && !isAlert) return;
  const startSec = round(seg.start, 3);
  const endSec = round(end, 3);
  const out = {
    personId: seg.personId,
    behavior: seg.behavior,
    parentBehavior: seg.parentBehavior,
    isAiGenerated: seg.isAiGenerated,
    jointDetail: seg.jointDetail,
    jointAngles: seg.jointDetail,
    instruction: seg.instruction,
    stepHint: seg.instruction,
    start: startSec,
    end: endSec,
    startMs: Math.round(startSec * 1e3),
    endMs: Math.round(endSec * 1e3),
    durationMs: Math.max(1, Math.round((endSec - startSec) * 1e3)),
    confidence: round(seg.confSum / seg.n, 3),
    source: this.source,
    keyframeKp: seg.keyframeKp || null
  };
  this.done.push(out);
  this.onSegment?.(out);
};
function buildActionStepsAndDraftName(segments, frames = [], mediaName = "") {
  const sorted = [...segments || []].sort((a, b) => a.start - b.start);
  const aiSegs = sorted.filter((s) => s.isAiGenerated || behaviorInfo(s.behavior).isAiGenerated);
  const sourceSegs = aiSegs.length ? aiSegs : sorted;
  const steps = [];
  for (const s of sourceSegs) {
    const label = behaviorInfo(s.behavior).label.replace(/^AI:\s*/, "");
    const prev = steps[steps.length - 1];
    if (prev && prev.behavior === s.behavior && s.start - prev.end <= 0.8) {
      prev.end = s.end;
      prev.endMs = Math.round(s.end * 1e3);
      continue;
    }
    let kp = s.keyframeKp;
    if (!kp && frames.length) {
      const midT = (s.start + s.end) / 2;
      let bestF = frames[0];
      let bestD = Infinity;
      for (const f of frames) {
        const d = Math.abs(f.t - midT);
        if (d < bestD) {
          bestD = d;
          bestF = f;
        }
      }
      const p = bestF?.persons?.find((x) => x.id === s.personId) || bestF?.persons?.[0];
      if (p?.kp) kp = p.kp.map(([x, y, score]) => ({ x, y, score }));
    }
    const inst = s.instruction || behaviorInfo(s.behavior).instruction || `Thực hiện: ${label}`;
    const jDetail = s.jointDetail || s.jointAngles || "";
    steps.push({
      stepNumber: steps.length + 1,
      behavior: s.behavior,
      label,
      title: label,
      instruction: inst,
      description: inst,
      jointDetail: jDetail,
      jointAngles: jDetail,
      start: s.start,
      end: s.end,
      startMs: s.startMs ?? Math.round(s.start * 1e3),
      endMs: s.endMs ?? Math.round(s.end * 1e3),
      keypoints: kp || defaultStandingKeypoints(steps.length % 3)
    });
    if (steps.length >= 12) break;
  }
  const distinctLabels = [];
  for (const st of steps) {
    const short = st.label.replace(/\s*\([^)]*\)/g, "").trim();
    if (!distinctLabels.includes(short) && !/đứng thẳng chuẩn bị/i.test(short)) {
      distinctLabels.push(short);
    }
    if (distinctLabels.length >= 3) break;
  }
  const cleanMedia = String(mediaName || "").replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  const actionSummary = distinctLabels.length ? distinctLabels.join(" → ") : steps[0]?.label.replace(/\s*\([^)]*\)/g, "") || "Phân tích chuyển động cơ thể";
  const draftName = cleanMedia && !/^video/i.test(cleanMedia) ? `${cleanMedia} — ${actionSummary}` : `Chuỗi động tác: ${actionSummary}`;
  return { draftName, steps };
}
function defaultStandingKeypoints(variant = "neutral") {
  const v = variant === 1 ? "arms_side" : variant === 2 ? "arms_up" : variant === 3 ? "squat" : variant;
  const base = [
    { x: 320, y: 74, score: 0.98 },
    // 0: nose
    { x: 330, y: 66, score: 0.96 },
    // 1: lEye
    { x: 310, y: 66, score: 0.96 },
    // 2: rEye
    { x: 342, y: 72, score: 0.94 },
    // 3: lEar
    { x: 298, y: 72, score: 0.94 },
    // 4: rEar
    { x: 368, y: 122, score: 0.98 },
    // 5: lShoulder
    { x: 272, y: 122, score: 0.98 },
    // 6: rShoulder
    { x: 386, y: 184, score: 0.95 },
    // 7: lElbow
    { x: 254, y: 184, score: 0.95 },
    // 8: rElbow
    { x: 392, y: 242, score: 0.94 },
    // 9: lWrist
    { x: 248, y: 242, score: 0.94 },
    // 10: rWrist
    { x: 348, y: 232, score: 0.97 },
    // 11: lHip
    { x: 292, y: 232, score: 0.97 },
    // 12: rHip
    { x: 352, y: 310, score: 0.95 },
    // 13: lKnee
    { x: 288, y: 310, score: 0.95 },
    // 14: rKnee
    { x: 354, y: 382, score: 0.94 },
    // 15: lAnkle
    { x: 286, y: 382, score: 0.94 }
    // 16: rAnkle
  ];
  if (v === "arms_up") {
    base[7] = { x: 382, y: 78, score: 0.96 };
    base[8] = { x: 258, y: 78, score: 0.96 };
    base[9] = { x: 372, y: 28, score: 0.96 };
    base[10] = { x: 268, y: 28, score: 0.96 };
  } else if (v === "arms_side") {
    base[7] = { x: 424, y: 122, score: 0.96 };
    base[8] = { x: 216, y: 122, score: 0.96 };
    base[9] = { x: 478, y: 120, score: 0.96 };
    base[10] = { x: 162, y: 120, score: 0.96 };
  } else if (v === "squat") {
    base[0].y += 38;
    base[1].y += 38;
    base[2].y += 38;
    base[3].y += 38;
    base[4].y += 38;
    base[5].y += 40;
    base[6].y += 40;
    base[7] = { x: 392, y: 198, score: 0.96 };
    base[8] = { x: 248, y: 198, score: 0.96 };
    base[9] = { x: 374, y: 218, score: 0.96 };
    base[10] = { x: 266, y: 218, score: 0.96 };
    base[11] = { x: 356, y: 278, score: 0.97 };
    base[12] = { x: 284, y: 278, score: 0.97 };
    base[13] = { x: 376, y: 325, score: 0.96 };
    base[14] = { x: 264, y: 325, score: 0.96 };
  } else if (v === "head_turn_right") {
    base[0] = { x: 304, y: 74, score: 0.98 };
    base[1] = { x: 316, y: 66, score: 0.96 };
    base[2] = { x: 296, y: 66, score: 0.96 };
    base[8] = { x: 230, y: 122, score: 0.96 };
    base[10] = { x: 175, y: 118, score: 0.96 };
  }
  return base;
}

// js/task-scheduler.js
var TaskScheduler = class {
  constructor() {
    this.next = { objects: 0 };
  }
  plan(t, rt, settings) {
    const due = (key) => t + 1e-6 >= this.next[key];
    const res = { withObjects: false, withFaces: false, faceRes: false };
    if (settings.detectObjects && due("objects")) {
      res.withObjects = true;
      this.next.objects = t + (rt.objectInterval || 1);
    }
    return res;
  }
};

// js/zip-io.js
var CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();
function crc32(bytes) {
  let crc = 4294967295;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 255] ^ crc >>> 8;
  }
  return (crc ^ 4294967295) >>> 0;
}
var encoder = new TextEncoder();
var decoder = new TextDecoder("utf-8");
function toUint8(data) {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (typeof data === "string") return encoder.encode(data);
  return encoder.encode(JSON.stringify(data, null, 2));
}
function dosDateTime(date = /* @__PURE__ */ new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime = (date.getHours() & 31) << 11 | (date.getMinutes() & 63) << 5 | date.getSeconds() >> 1 & 31;
  const dosDate = (year - 1980 & 127) << 9 | (date.getMonth() + 1 & 15) << 5 | date.getDate() & 31;
  return { dosTime, dosDate };
}
function createZipBlob(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { dosTime, dosDate } = dosDateTime();
  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.path.replace(/^\/+/, ""));
    const dataBytes = toUint8(entry.content);
    const crc = crc32(dataBytes);
    const size = dataBytes.length;
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 67324752, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 2048, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);
    localParts.push(localHeader, dataBytes);
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 33639248, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 2048, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);
    offset += localHeader.length + size;
  }
  const centralSize = centralParts.reduce((s, p) => s + p.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 101010256, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);
  return new Blob([...localParts, ...centralParts, eocd], { type: "application/zip" });
}
async function inflateRaw(compressedBytes) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("Trình duyệt không hỗ trợ giải nén DEFLATE.");
  }
  const ds = new DecompressionStream("deflate-raw");
  const writer = ds.writable.getWriter();
  writer.write(compressedBytes);
  writer.close();
  const reader = ds.readable.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}
async function extractZip(input) {
  const buf = input instanceof ArrayBuffer ? input : await readFileAsArrayBuffer(input);
  const bytes = new Uint8Array(buf);
  const view = new DataView(buf);
  if (bytes.length < 22 || view.getUint32(0, true) !== 67324752) {
    throw new Error("File không đúng định dạng .ZIP hợp lệ.");
  }
  const files = /* @__PURE__ */ new Map();
  let eocdPos = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 101010256) {
      eocdPos = i;
      break;
    }
  }
  if (eocdPos >= 0) {
    const count = view.getUint16(eocdPos + 10, true);
    let cdPos = view.getUint32(eocdPos + 16, true);
    for (let i = 0; i < count && cdPos + 46 <= bytes.length; i++) {
      if (view.getUint32(cdPos, true) !== 33639248) break;
      const method = view.getUint16(cdPos + 10, true);
      const compSize = view.getUint32(cdPos + 20, true);
      const nameLen = view.getUint16(cdPos + 28, true);
      const extraLen = view.getUint16(cdPos + 30, true);
      const commentLen = view.getUint16(cdPos + 32, true);
      const localOffset = view.getUint32(cdPos + 42, true);
      const name = decoder.decode(bytes.subarray(cdPos + 46, cdPos + 46 + nameLen));
      cdPos += 46 + nameLen + extraLen + commentLen;
      if (name.endsWith("/")) continue;
      if (localOffset + 30 > bytes.length) continue;
      const lNameLen = view.getUint16(localOffset + 26, true);
      const lExtraLen = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + lNameLen + lExtraLen;
      const rawData = bytes.subarray(dataStart, dataStart + compSize);
      if (method === 0) {
        files.set(name, rawData);
      } else if (method === 8) {
        files.set(name, await inflateRaw(rawData));
      }
    }
  } else {
    let pos = 0;
    while (pos + 30 <= bytes.length && view.getUint32(pos, true) === 67324752) {
      const method = view.getUint16(pos + 8, true);
      const compSize = view.getUint32(pos + 18, true);
      const nameLen = view.getUint16(pos + 26, true);
      const extraLen = view.getUint16(pos + 28, true);
      const name = decoder.decode(bytes.subarray(pos + 30, pos + 30 + nameLen));
      const dataStart = pos + 30 + nameLen + extraLen;
      const rawData = bytes.subarray(dataStart, dataStart + compSize);
      if (!name.endsWith("/")) {
        if (method === 0) files.set(name, rawData);
        else if (method === 8) files.set(name, await inflateRaw(rawData));
      }
      pos = dataStart + compSize;
    }
  }
  return {
    files,
    textOf(suffix) {
      const lower = suffix.toLowerCase();
      for (const [k, v] of files.entries()) {
        if (k.toLowerCase().endsWith(lower)) return decoder.decode(v);
      }
      return null;
    },
    blobOf(extRegex, defaultMime = "video/mp4") {
      for (const [k, v] of files.entries()) {
        if (extRegex.test(k)) {
          const base = k.split("/").pop();
          const mime = /\.webm$/i.test(base) ? "video/webm" : /\.mov$/i.test(base) ? "video/quicktime" : defaultMime;
          return { name: base, blob: new Blob([v], { type: mime }) };
        }
      }
      return null;
    }
  };
}

// js/llm.js
var PRESETS = {
  gemini: { provider: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-2.5-flash", key: true },
  openai: { provider: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", key: true },
  groq: { provider: "openai", baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile", key: true },
  anthropic: { provider: "anthropic", baseUrl: "https://api.anthropic.com", model: "claude-sonnet-4-20250514", key: true }
};
var DEFAULT_OPENAI = "https://api.openai.com/v1";
var GEMINI_FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
var proxyState = null;
var proxyProbe = null;
async function hasProxy() {
  if (proxyState === true) return true;
  if (!proxyProbe) proxyProbe = (async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);
      try {
        const r = await fetch("llm-proxy?ping=1", { cache: "no-store", signal: controller.signal });
        proxyState = r.ok && (await r.json().catch(() => ({}))).proxy === "behavior-analysis" ? true : null;
        return proxyState === true;
      } catch {
      } finally {
        clearTimeout(timer);
      }
    }
    return false;
  })();
  const pending = proxyProbe;
  try {
    return await pending;
  } finally {
    if (proxyProbe === pending) proxyProbe = null;
  }
}
async function apiFetch(url, init2 = {}) {
  init2.signal?.throwIfAborted();
  const proxy = await hasProxy();
  init2.signal?.throwIfAborted();
  if (proxy) {
    try {
      return await fetch(`llm-proxy?url=${encodeURIComponent(url)}`, init2);
    } catch (error) {
      if (init2.signal?.aborted) throw error;
      proxyState = null;
    }
  }
  return fetch(url, init2);
}
async function searchGoogleWeb(query, signal) {
  try {
    const res = await fetch("/api/google-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal
    });
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    return Array.isArray(data?.results) ? data.results : [];
  } catch {
    return [];
  }
}
var looksLikeUrl = (v) => /^(https?:\/\/|localhost[:/]|\d{1,3}(\.\d{1,3}){3}[:/])/i.test((v || "").trim());
function isPrivateHost(url) {
  try {
    const h = new URL(url).hostname;
    return h === "localhost" || h === "0.0.0.0" || h.endsWith(".local") || h === "[::1]" || /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h);
  } catch {
    return false;
  }
}
function normalizeLlmSettings(input) {
  const s = { ...input };
  const notes = [];
  s.llmApiKey = (s.llmApiKey || s.llmKey || "").trim();
  s.llmKey = s.llmApiKey;
  s.llmBaseUrl = (s.llmBaseUrl || s.llmEndpoint || "").trim();
  s.llmEndpoint = s.llmBaseUrl;
  s.llmModel = (s.llmModel || "").trim();
  if (!s.llmProvider || s.llmProvider === "local") {
    s.llmProvider = "gemini";
    if (!s.llmModel) s.llmModel = "gemini-2.5-flash";
  }
  if (/^AIza[0-9A-Za-z\-_]{20,}/.test(s.llmApiKey) && s.llmProvider !== "gemini") {
    s.llmProvider = "gemini";
    if (!s.llmModel || !s.llmModel.startsWith("gemini")) s.llmModel = "gemini-2.5-flash";
  }
  if (s.llmProvider === "gemini") {
    if (looksLikeUrl(s.llmApiKey)) {
      s.llmApiKey = "";
      notes.push("Ô API key đang chứa đường link — hãy dán Gemini API Key (bắt đầu bằng AIza…).");
    }
    if (!s.llmModel) s.llmModel = "gemini-2.5-flash";
  } else if (s.llmProvider === "openai") {
    if (looksLikeUrl(s.llmApiKey)) {
      const url = /^https?:\/\//i.test(s.llmApiKey) ? s.llmApiKey : `http://${s.llmApiKey}`;
      if (!s.llmBaseUrl || s.llmBaseUrl === DEFAULT_OPENAI) {
        s.llmBaseUrl = url;
        notes.push(`Đã chuyển địa chỉ máy chủ “${url}” sang ô Base URL.`);
      } else {
        notes.push("Ô API key đang chứa một địa chỉ web — đã xoá.");
      }
      s.llmApiKey = "";
    }
    if (!s.llmBaseUrl) s.llmBaseUrl = DEFAULT_OPENAI;
    if (!/^https?:\/\//i.test(s.llmBaseUrl)) s.llmBaseUrl = `http://${s.llmBaseUrl}`;
    s.llmBaseUrl = s.llmBaseUrl.replace(/\/+$/, "").replace(/\/chat\/completions$/, "");
  } else if (s.llmProvider === "anthropic" && looksLikeUrl(s.llmApiKey)) {
    s.llmApiKey = "";
    notes.push("Ô API key đang chứa một địa chỉ web — Claude cần key dạng “sk-ant-…”.");
  }
  return { settings: s, notes };
}
function needsKey(s) {
  if (s.llmProvider === "gemini" || s.llmProvider === "anthropic") return true;
  if (s.llmProvider === "openai") return !isPrivateHost(s.llmBaseUrl || DEFAULT_OPENAI);
  return true;
}
function llmReady(s) {
  if (!s) return false;
  return !needsKey(s) || !!(s.llmApiKey || s.llmKey);
}
function endpoint(s) {
  return (s.llmBaseUrl || s.llmEndpoint || DEFAULT_OPENAI).replace(/\/+$/, "");
}
function headersFor(s) {
  const h = { "content-type": "application/json" };
  const key = s.llmApiKey || s.llmKey;
  if (key) h.authorization = `Bearer ${key}`;
  return h;
}
async function callGeminiNative(s, system, messages, { maxTokens = 1200, useGoogleSearch = false, signal } = {}) {
  const apiKey = s.llmApiKey || s.llmKey;
  const preferred = s.llmModel && s.llmModel.startsWith("gemini") ? s.llmModel : "gemini-2.5-flash";
  const candidates = [preferred, ...GEMINI_FALLBACK_MODELS.filter((m) => m !== preferred)];
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: String(m.content || "") }]
  }));
  let lastErr = null;
  for (const model of candidates) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const bodyObj = {
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: {
        temperature: 0.25,
        maxOutputTokens: maxTokens
      }
    };
    if (useGoogleSearch) {
      bodyObj.tools = [{ google_search: {} }];
    }
    let res = await apiFetch(url, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(bodyObj)
    });
    if (!res.ok && useGoogleSearch && (res.status === 400 || res.status === 404)) {
      delete bodyObj.tools;
      res = await apiFetch(url, {
        method: "POST",
        signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(bodyObj)
      });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || `HTTP ${res.status}`;
      lastErr = httpError(res.status, msg, s);
      if (res.status === 404 || /not found|not supported/i.test(msg)) continue;
      throw lastErr;
    }
    const cand = data.candidates?.[0];
    const parts = cand?.content?.parts || [];
    let text = parts.map((p) => p.text || "").join("\n").trim() || "(Không có nội dung phản hồi)";
    const chunks = cand?.groundingMetadata?.groundingChunks || [];
    const webSources = chunks.map((c) => c.web).filter((w) => w && w.uri && w.title).slice(0, 4);
    if (webSources.length) {
      text += "\n\n**Nguồn tham khảo từ Google:**\n" + webSources.map((w) => `- ${w.title}: ${w.uri}`).join("\n");
    }
    return text;
  }
  throw lastErr || new Error("Không gọi được Gemini API.");
}
async function chat(s, system, messages, { maxTokens = 1200, useGoogleSearch = false, signal } = {}) {
  try {
    const apiKey = s.llmApiKey || s.llmKey || "";
    if (s.llmProvider === "gemini" || /^AIza/.test(apiKey)) {
      return await callGeminiNative(s, system, messages, { maxTokens, useGoogleSearch, signal });
    }
    if (s.llmProvider === "anthropic") {
      const res2 = await apiFetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({ model: s.llmModel || "claude-sonnet-4-20250514", max_tokens: maxTokens, system, messages })
      });
      const data2 = await res2.json().catch(() => ({}));
      if (!res2.ok) throw httpError(res2.status, data2?.error?.message, s);
      return (data2.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n").trim() || "(không có nội dung)";
    }
    const model = s.llmModel || "gpt-4o-mini";
    const res = await apiFetch(`${endpoint(s)}/chat/completions`, {
      method: "POST",
      signal,
      headers: headersFor(s),
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: system }, ...messages],
        temperature: 0.3,
        max_tokens: maxTokens,
        stream: false
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw httpError(res.status, data?.error?.message || data?.error, s);
    return data.choices?.[0]?.message?.content?.trim() || "(không có nội dung)";
  } catch (err) {
    signal?.throwIfAborted();
    throw friendly(err, s);
  }
}
async function testConnection(s) {
  try {
    const apiKey = s.llmApiKey || s.llmKey || "";
    if (s.llmProvider === "gemini" || /^AIza/.test(apiKey)) {
      if (!apiKey) {
        return {
          ok: false,
          message: "Hãy dán Google Gemini API Key miễn phí (bắt đầu bằng AIza…) vào ô API Key rồi thử lại.",
          models: GEMINI_FALLBACK_MODELS
        };
      }
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
      const res2 = await apiFetch(url);
      const data2 = await res2.json().catch(() => ({}));
      if (!res2.ok) throw httpError(res2.status, data2?.error?.message, s);
      const models2 = (data2.models || []).map((m) => String(m.name || "").replace(/^models\//, "")).filter((m) => /^gemini-(2\.5|2\.0|1\.5)-(flash|pro)/.test(m));
      return {
        ok: true,
        message: `Kết nối Google Gemini miễn phí thành công! (${models2.length || "nhiều"} model khả dụng, sẵn sàng phân tích & tìm kiếm Google).`,
        models: models2.length ? models2 : GEMINI_FALLBACK_MODELS
      };
    }
    if (s.llmProvider === "anthropic") {
      await chat(s, "Trả lời đúng một từ: OK", [{ role: "user", content: "ping" }], { maxTokens: 5 });
      return { ok: true, message: `Kết nối Claude thành công (model ${s.llmModel || "claude-sonnet-4-20250514"}).`, models: [] };
    }
    const res = await apiFetch(`${endpoint(s)}/models`, { headers: headersFor(s) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw httpError(res.status, data?.error?.message || data?.error, s);
    const models = (data.data || data.models || []).map((m) => m.id || m.name).filter(Boolean);
    return {
      ok: true,
      message: `Kết nối thành công tới ${new URL(endpoint(s)).host}. ${models.length ? `Có ${models.length} model.` : ""}`,
      models
    };
  } catch (err) {
    const e = friendly(err, s);
    return { ok: false, message: e.message, models: [] };
  }
}
var testLlmConnection = testConnection;
function httpError(status, detail) {
  const e = new Error(typeof detail === "string" ? detail : `HTTP ${status}`);
  e.status = status;
  e.raw = detail;
  return e;
}
function friendly(err, s) {
  if (err.friendly) return err;
  let msg;
  if (err.status === 400 && /api.?key|key not valid/i.test(err.message || "")) {
    msg = "Gemini API Key không hợp lệ. Hãy lấy key miễn phí tại aistudio.google.com/apikey rồi dán vào mục Hệ thống → Cài đặt AI.";
  } else if (err.status === 401 || err.status === 403) {
    msg = `API key bị từ chối (${err.message || err.status}). Hãy kiểm tra lại API key trong tab Hệ thống → Cài đặt AI.`;
  } else if (err.status === 429) {
    msg = "Đã chạm giới hạn tốc độ gọi API miễn phí (429). Vui lòng đợi vài giây rồi thử lại.";
  } else {
    msg = err.message || String(err);
  }
  const e = new Error(msg);
  e.friendly = true;
  e.status = err.status;
  return e;
}

// js/packages.js
var DB_PACKAGES_KEY = "packages-v3";
var DB_SOURCES_KEY = "video-sources-v3";
var DB_USER_VIDEOS_KEY = "user-camera-videos-v3";
var memVideoBlobs = /* @__PURE__ */ new Map();
function emitPackages() {
  store.emit("packages", packageStore.packages);
  store.emit("packages-changed", packageStore.packages);
}
function emitVideoSources() {
  store.emit("video-sources", packageStore.videoSources);
  store.emit("video-sources-changed", packageStore.videoSources);
}
function emitUserVideos() {
  store.emit("user-videos", packageStore.userVideos);
  store.emit("user-videos-changed", packageStore.userVideos);
}
function normalizeStep(st, idx = 0) {
  const label = st.label || st.title || `Bước ${st.stepNumber || idx + 1}`;
  const instruction = st.instruction || st.description || `Thực hiện: ${label}`;
  const jointDetail = st.jointDetail || st.jointAngles || "";
  return {
    ...st,
    stepNumber: st.stepNumber || idx + 1,
    label,
    title: label,
    instruction,
    description: instruction,
    jointDetail,
    jointAngles: jointDetail,
    start: st.start ?? 0,
    end: st.end ?? 1.5,
    startMs: st.startMs ?? Math.round((st.start ?? 0) * 1e3),
    endMs: st.endMs ?? Math.round((st.end ?? 1.5) * 1e3),
    keypoints: st.keypoints || defaultStandingKeypoints(idx % 3)
  };
}
function normalizeSegment(s) {
  const jointDetail = s.jointDetail || s.jointAngles || "";
  const instruction = s.instruction || s.stepHint || "";
  return {
    ...s,
    jointDetail,
    jointAngles: jointDetail,
    instruction,
    stepHint: instruction,
    startMs: s.startMs ?? Math.round((s.start || 0) * 1e3),
    endMs: s.endMs ?? Math.round((s.end || 0) * 1e3),
    durationMs: s.durationMs ?? Math.max(1, Math.round(((s.end || 0) - (s.start || 0)) * 1e3))
  };
}
function createSamplePackages() {
  const kpNeutral = defaultStandingKeypoints("neutral");
  const kpSide = defaultStandingKeypoints("arms_side");
  const kpUp = defaultStandingKeypoints("arms_up");
  const kpSquat = defaultStandingKeypoints("squat");
  const kpHeadRight = defaultStandingKeypoints("head_turn_right");
  registerAiBehavior("ai_neutral_stance", "AI: Tư thế đứng thẳng chuẩn bị (Thân 0°)", {
    parentBehavior: "standing",
    jointDetail: "Đầu 0°/0° · Tay T 172° · Tay P 172° · Thân 0°",
    instruction: "Đứng thẳng hai chân rộng bằng vai, mắt nhìn thẳng, hai bàn tay thả lỏng."
  });
  registerAiBehavior("ai_arms_horizontal", "AI: Dang ngang hai cánh tay & xòe bàn tay (Góc vai 90°)", {
    parentBehavior: "hand_action",
    jointDetail: "Đầu 0°/0° · Tay T 175° · Tay P 175° · Vai 90°",
    instruction: "Nâng đồng thời hai cánh tay sang ngang tầm vai (90°), duỗi thẳng khuỷu tay và mở 5 ngón bàn tay."
  });
  registerAiBehavior("ai_raise_both_hands", "AI: Vươn cao hai tay qua đầu (Góc khuỷu 168°)", {
    parentBehavior: "hand_action",
    jointDetail: "Đầu -5°/0° · Tay T 168° · Tay P 168° · Thân 0°",
    instruction: "Đưa hai cánh tay vươn thẳng lên cao qua đầu, lòng bàn tay hướng vào nhau, giữ trục cổ thẳng."
  });
  registerAiBehavior("ai_squat_knee", "AI: Hạ trọng tâm Squat & giữ tay trước ngực (Góc gối 95°)", {
    parentBehavior: "squatting",
    jointDetail: "Đầu +4°/0° · Tay T 110° · Tay P 110° · Gối 95°",
    instruction: "Đẩy hông ra sau, gập hai đầu gối xuống góc ~95°, hai bàn tay đưa ra trước ngực giữ thăng bằng."
  });
  registerAiBehavior("ai_head_turn_right", "AI: Xoay khung xương đầu sang phải & duỗi tay phải", {
    parentBehavior: "head_motion",
    jointDetail: "Đầu 0°/-28° · Tay P 170° · Thân 0°",
    instruction: "Giữ hai vai cố định, xoay đầu sang phải 28° kết hợp nâng thẳng cánh tay và bàn tay phải."
  });
  const makeFrames = (steps) => {
    const frames = [];
    for (const st of steps) {
      for (let t = st.start; t <= st.end; t = round(t + 0.2, 2)) {
        frames.push({
          t,
          persons: [{
            id: 1,
            box: [240, 40, 180, 350],
            labels: [st.parentBehavior || "standing", st.behavior],
            kp: st.keypoints.map((k) => [k.x, k.y, k.score])
          }]
        });
      }
    }
    return frames;
  };
  const steps1 = [
    normalizeStep({
      stepNumber: 1,
      behavior: "ai_neutral_stance",
      parentBehavior: "standing",
      label: "Tư thế đứng thẳng chuẩn bị",
      instruction: "Bước 1: Đứng thẳng tự nhiên, hai chân mở rộng bằng vai, khung xương đầu giữ thẳng, hai bàn tay thả lỏng.",
      jointDetail: "Đầu 0° · Tay T 172° · Tay P 172° · Thân 0°",
      start: 0,
      end: 1.5,
      startMs: 0,
      endMs: 1500,
      keypoints: kpNeutral
    }, 0),
    normalizeStep({
      stepNumber: 2,
      behavior: "ai_arms_horizontal",
      parentBehavior: "hand_action",
      label: "Dang ngang hai tay & mở bàn tay (90°)",
      instruction: "Bước 2: Từ từ nâng hai cánh tay sang ngang bằng vai (90°), duỗi thẳng khuỷu tay và mở các đốt ngón tay.",
      jointDetail: "Đầu 0° · Tay T 175° · Tay P 175° · Vai 90°",
      start: 1.5,
      end: 3.2,
      startMs: 1500,
      endMs: 3200,
      keypoints: kpSide
    }, 1),
    normalizeStep({
      stepNumber: 3,
      behavior: "ai_raise_both_hands",
      parentBehavior: "hand_action",
      label: "Vươn cao hai bàn tay qua đầu",
      instruction: "Bước 3: Đưa tiếp hai cánh tay và bàn tay vươn thẳng lên cao qua đầu, hít sâu, giữ thân người thẳng.",
      jointDetail: "Đầu -5° · Tay T 168° · Tay P 168° · Thân 0°",
      start: 3.2,
      end: 5,
      startMs: 3200,
      endMs: 5e3,
      keypoints: kpUp
    }, 2),
    normalizeStep({
      stepNumber: 4,
      behavior: "ai_squat_knee",
      parentBehavior: "squatting",
      label: "Hạ trọng tâm Squat (Góc gối 95°)",
      instruction: "Bước 4: Hạ hai tay về trước ngực đồng thời gập hai gối xuống góc ~95°, giữ lưng thẳng và đầu nhìn về trước.",
      jointDetail: "Đầu +4° · Tay T 110° · Tay P 110° · Gối 95°",
      start: 5,
      end: 7.2,
      startMs: 5e3,
      endMs: 7200,
      keypoints: kpSquat
    }, 3)
  ];
  const segs1 = steps1.flatMap((st) => [
    normalizeSegment({
      id: uid(),
      personId: 1,
      behavior: st.parentBehavior,
      parentBehavior: st.parentBehavior,
      isAiGenerated: false,
      jointDetail: st.jointDetail,
      instruction: st.instruction,
      start: st.start,
      end: st.end,
      startMs: st.startMs,
      endMs: st.endMs,
      durationMs: st.endMs - st.startMs,
      confidence: 0.94,
      source: "video",
      keyframeKp: st.keypoints
    }),
    normalizeSegment({
      id: uid(),
      personId: 1,
      behavior: st.behavior,
      parentBehavior: st.parentBehavior,
      isAiGenerated: true,
      jointDetail: st.jointDetail,
      instruction: st.instruction,
      start: st.start,
      end: st.end,
      startMs: st.startMs,
      endMs: st.endMs,
      durationMs: st.endMs - st.startMs,
      confidence: 0.92,
      source: "video",
      keyframeKp: st.keypoints
    })
  ]);
  const steps2 = [
    normalizeStep({
      stepNumber: 1,
      behavior: "ai_neutral_stance",
      parentBehavior: "standing",
      label: "Đứng thẳng chuẩn bị",
      instruction: "Bước 1: Đứng thẳng, cố định trục vai và hông, mắt nhìn thẳng về camera.",
      jointDetail: "Đầu 0° · Tay T 172° · Tay P 172°",
      start: 0,
      end: 1.4,
      startMs: 0,
      endMs: 1400,
      keypoints: kpNeutral
    }, 0),
    normalizeStep({
      stepNumber: 2,
      behavior: "ai_head_turn_right",
      parentBehavior: "head_motion",
      label: "Xoay khung xương đầu sang phải & duỗi tay phải",
      instruction: "Bước 2: Xoay đầu sang phải khoảng 28° đồng thời nâng thẳng cánh tay và bàn tay phải ngang vai.",
      jointDetail: "Đầu -28° · Tay P 170° · Thân 0°",
      start: 1.4,
      end: 3.4,
      startMs: 1400,
      endMs: 3400,
      keypoints: kpHeadRight
    }, 1),
    normalizeStep({
      stepNumber: 3,
      behavior: "ai_raise_both_hands",
      parentBehavior: "hand_action",
      label: "Thu đầu về giữa & vươn hai tay lên cao",
      instruction: "Bước 3: Xoay đầu trở lại chính diện và vươn thẳng cả hai cánh tay lên cao qua đầu.",
      jointDetail: "Đầu 0° · Tay T 168° · Tay P 168°",
      start: 3.4,
      end: 5.2,
      startMs: 3400,
      endMs: 5200,
      keypoints: kpUp
    }, 2)
  ];
  const segs2 = steps2.flatMap((st) => [
    normalizeSegment({
      id: uid(),
      personId: 1,
      behavior: st.parentBehavior,
      parentBehavior: st.parentBehavior,
      isAiGenerated: false,
      jointDetail: st.jointDetail,
      instruction: st.instruction,
      start: st.start,
      end: st.end,
      startMs: st.startMs,
      endMs: st.endMs,
      durationMs: st.endMs - st.startMs,
      confidence: 0.93,
      source: "video",
      keyframeKp: st.keypoints
    }),
    normalizeSegment({
      id: uid(),
      personId: 1,
      behavior: st.behavior,
      parentBehavior: st.parentBehavior,
      isAiGenerated: true,
      jointDetail: st.jointDetail,
      instruction: st.instruction,
      start: st.start,
      end: st.end,
      startMs: st.startMs,
      endMs: st.endMs,
      durationMs: st.endMs - st.startMs,
      confidence: 0.91,
      source: "video",
      keyframeKp: st.keypoints
    })
  ]);
  return [
    {
      id: "sample-warmup-squat",
      name: "Chuỗi động tác mẫu: Khởi động Tay - Đầu & Hạ trọng tâm Squat",
      summary: "Bài tập khởi động 4 bước kết hợp dang tay, vươn tay qua đầu và hạ trọng tâm Squat.",
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      source: "video",
      mediaName: "mau_khoi_dong_squat.mp4",
      duration: 7.2,
      durationMs: 7200,
      voiceTranscript: "",
      steps: steps1,
      segments: segs1,
      frames: makeFrames(steps1)
    },
    {
      id: "sample-head-hand-coord",
      name: "Chuỗi động tác mẫu: Phối hợp Xoay Đầu & Chuyển động Bàn tay",
      summary: "Bài tập phối hợp xoay khung xương đầu 28° kết hợp duỗi thẳng cánh tay và vươn hai tay.",
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      source: "video",
      mediaName: "mau_phoi_hop_dau_tay.mp4",
      duration: 5.2,
      durationMs: 5200,
      voiceTranscript: "",
      steps: steps2,
      segments: segs2,
      frames: makeFrames(steps2)
    }
  ];
}
var packageStore = {
  packages: [],
  // Danh sách các gói dữ liệu phân tích (Nhãn chuỗi động tác)
  videoSources: [],
  // Danh sách video tải lên & link đã nhập (YouTube, TikTok, FB, ZIP…)
  userVideos: [],
  // Danh sách video quay hành vi người dùng từ Camera
  selectedPackageId: null,
  getPackage(id) {
    return getPackage(id);
  },
  async addVideoSource(item) {
    return addVideoSourceItem(item);
  },
  async removeVideoSource(id) {
    return removeVideoSourceItem(id);
  },
  async addUserVideo(item) {
    return addUserRecordedVideo(item);
  },
  async removeUserVideo(id) {
    return removeUserRecordedVideo(id);
  },
  async renamePackage(id, newName) {
    return renamePackage(id, newName);
  },
  async removePackage(id) {
    return deletePackage(id);
  }
};
async function initPackages() {
  const savedPkgs = await dbGet(DB_PACKAGES_KEY);
  if (Array.isArray(savedPkgs) && savedPkgs.length) {
    packageStore.packages = savedPkgs.map((p) => ({
      ...p,
      steps: (p.steps || []).map((st, idx) => normalizeStep(st, idx)),
      segments: (p.segments || []).map((s) => normalizeSegment(s))
    }));
  } else {
    packageStore.packages = createSamplePackages();
    await dbSet(DB_PACKAGES_KEY, packageStore.packages);
  }
  for (const pkg of packageStore.packages) {
    for (const seg of pkg.segments || []) {
      if (seg.isAiGenerated || String(seg.behavior).startsWith("ai_")) {
        const stepMatch = (pkg.steps || []).find((st) => st.behavior === seg.behavior);
        registerAiBehavior(seg.behavior, stepMatch ? `AI: ${stepMatch.label}` : seg.label || seg.behavior, {
          parentBehavior: seg.parentBehavior,
          jointDetail: seg.jointDetail,
          instruction: seg.instruction
        });
      }
    }
  }
  const savedSources = await dbGet(DB_SOURCES_KEY);
  packageStore.videoSources = Array.isArray(savedSources) ? savedSources : [];
  const savedUserVids = await dbGet(DB_USER_VIDEOS_KEY);
  packageStore.userVideos = Array.isArray(savedUserVids) ? savedUserVids : [];
  packageStore.selectedPackageId = packageStore.packages[0]?.id || null;
  syncFromServer().catch(() => {
  });
  emitPackages();
  emitVideoSources();
  emitUserVideos();
}
var initPackageStore = initPackages;
async function syncFromServer() {
  const res = await fetch("/api/packages", { cache: "no-store" }).catch(() => null);
  if (!res || !res.ok) return;
  const data = await res.json().catch(() => null);
  if (Array.isArray(data?.packages) && data.packages.length) {
    const existingIds = new Set(packageStore.packages.map((p) => p.id));
    let changed = false;
    for (const p of data.packages) {
      if (!existingIds.has(p.id)) {
        packageStore.packages.unshift({
          ...p,
          steps: (p.steps || []).map((st, idx) => normalizeStep(st, idx)),
          segments: (p.segments || []).map((s) => normalizeSegment(s))
        });
        changed = true;
      }
    }
    if (changed) {
      await dbSet(DB_PACKAGES_KEY, packageStore.packages);
      emitPackages();
    }
  }
}
async function savePackage(pkg) {
  const entry = {
    ...pkg,
    id: pkg.id || `pkg_${Date.now()}_${uid()}`,
    createdAt: pkg.createdAt || (/* @__PURE__ */ new Date()).toISOString(),
    steps: (pkg.steps || []).map((st, idx2) => normalizeStep(st, idx2)),
    segments: (pkg.segments || []).map((s) => normalizeSegment(s))
  };
  const idx = packageStore.packages.findIndex((p) => p.id === entry.id);
  if (idx >= 0) packageStore.packages[idx] = entry;
  else packageStore.packages.unshift(entry);
  packageStore.selectedPackageId = entry.id;
  await dbSet(DB_PACKAGES_KEY, packageStore.packages);
  fetch("/api/packages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry)
  }).catch(() => {
  });
  emitPackages();
  return entry;
}
async function deletePackage(id) {
  packageStore.packages = packageStore.packages.filter((p) => p.id !== id);
  if (packageStore.selectedPackageId === id) {
    packageStore.selectedPackageId = packageStore.packages[0]?.id || null;
  }
  await dbSet(DB_PACKAGES_KEY, packageStore.packages);
  fetch(`/api/packages?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {
  });
  emitPackages();
}
async function renamePackage(id, newName) {
  const pkg = packageStore.packages.find((p) => p.id === id);
  if (!pkg || !newName.trim()) return;
  pkg.name = newName.trim();
  await savePackage(pkg);
}
function getPackage(id) {
  return packageStore.packages.find((p) => p.id === id) || packageStore.packages[0] || null;
}
function applyPackageToWorkspace(pkg) {
  if (!pkg) return;
  packageStore.selectedPackageId = pkg.id;
  for (const s of pkg.segments || []) {
    if (s.isAiGenerated || String(s.behavior).startsWith("ai_")) {
      const stMatch = (pkg.steps || []).find((st) => st.behavior === s.behavior);
      registerAiBehavior(s.behavior, stMatch ? `AI: ${stMatch.label || stMatch.title}` : s.behaviorLabel || s.behavior, {
        parentBehavior: s.parentBehavior,
        jointDetail: s.jointDetail || s.jointAngles,
        instruction: s.instruction || s.stepHint
      });
    }
  }
  store.setResults({
    segments: (pkg.segments || []).map((s) => normalizeSegment(s)),
    frames: pkg.frames || [],
    meta: {
      analyzedAt: pkg.createdAt,
      source: pkg.source || "video",
      mediaName: pkg.mediaName || pkg.name,
      packageId: pkg.id,
      packageName: pkg.name
    }
  });
  if (pkg.duration) {
    store.media = { ...store.media, name: pkg.mediaName || pkg.name, duration: pkg.duration };
    store.emit("media", store.media);
  }
}
async function addVideoSourceItem({ id: customId, name, type, kind, url = null, blobUrl = null, file = null, size = 0, duration = 0, packageId = null }) {
  const id = customId || `src_${Date.now()}_${uid()}`;
  let resolvedBlobUrl = blobUrl || null;
  if (file instanceof Blob) {
    resolvedBlobUrl = URL.createObjectURL(file);
    memVideoBlobs.set(id, resolvedBlobUrl);
  } else if (resolvedBlobUrl) {
    memVideoBlobs.set(id, resolvedBlobUrl);
  }
  const resolvedKind = kind || type || (url ? "url" : "file");
  packageStore.videoSources = packageStore.videoSources.filter(
    (s) => !(s.name === name && s.url === url && (s.kind || s.type) === resolvedKind)
  );
  const item = {
    id,
    name: name || "Video phân tích",
    type: resolvedKind,
    kind: resolvedKind,
    url: url || null,
    blobUrl: resolvedBlobUrl,
    size: size || (file?.size ?? 0),
    duration: duration || 0,
    packageId: packageId || null,
    createdAt: Date.now(),
    addedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  packageStore.videoSources.unshift(item);
  if (packageStore.videoSources.length > 50) packageStore.videoSources.pop();
  await dbSet(DB_SOURCES_KEY, packageStore.videoSources);
  emitVideoSources();
  return item;
}
function getVideoSourceBlobUrl(id) {
  return memVideoBlobs.get(id) || null;
}
async function removeVideoSourceItem(id) {
  if (memVideoBlobs.has(id)) {
    URL.revokeObjectURL(memVideoBlobs.get(id));
    memVideoBlobs.delete(id);
  }
  packageStore.videoSources = packageStore.videoSources.filter((s) => s.id !== id);
  await dbSet(DB_SOURCES_KEY, packageStore.videoSources);
  emitVideoSources();
}
async function addUserRecordedVideo({ id: customId, name, blob, blobUrl: existingBlobUrl, duration, trimStart = 0, trimEnd = 0, voiceNote = "", voiceTranscript = "", packageId = null, steps = [] }) {
  const id = customId || `camvid_${Date.now()}_${uid()}`;
  let dataUrl = null;
  if (blob instanceof Blob && blob.size <= 25 * 1024 * 1024) {
    dataUrl = await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  }
  let resolvedBlobUrl = existingBlobUrl || null;
  if (blob instanceof Blob && !resolvedBlobUrl) {
    resolvedBlobUrl = URL.createObjectURL(blob);
  }
  if (resolvedBlobUrl) {
    memVideoBlobs.set(id, resolvedBlobUrl);
  }
  const transcript = voiceNote || voiceTranscript || "";
  const entry = {
    id,
    name: name || `Video học chuyển động (${(/* @__PURE__ */ new Date()).toLocaleTimeString("vi-VN")})`,
    duration: round(duration || 0, 2),
    trimStart: round(trimStart || 0, 2),
    trimEnd: round(trimEnd || duration || 0, 2),
    voiceNote: transcript,
    voiceTranscript: transcript,
    packageId,
    stepsCount: steps.length,
    createdAt: Date.now(),
    blobUrl: resolvedBlobUrl || dataUrl,
    dataUrl
  };
  packageStore.userVideos.unshift(entry);
  if (packageStore.userVideos.length > 25) packageStore.userVideos.pop();
  await dbSet(DB_USER_VIDEOS_KEY, packageStore.userVideos);
  emitUserVideos();
  return entry;
}
function getUserVideoUrl(entry) {
  if (!entry) return null;
  if (memVideoBlobs.has(entry.id)) return memVideoBlobs.get(entry.id);
  return entry.blobUrl || entry.dataUrl || null;
}
async function removeUserRecordedVideo(id) {
  if (memVideoBlobs.has(id)) {
    URL.revokeObjectURL(memVideoBlobs.get(id));
    memVideoBlobs.delete(id);
  }
  packageStore.userVideos = packageStore.userVideos.filter((v) => v.id !== id);
  await dbSet(DB_USER_VIDEOS_KEY, packageStore.userVideos);
  emitUserVideos();
}
async function refineDraftWithGemini({ draftName, steps, segments, voiceTranscript = "", mediaName = "" }) {
  if (!llmReady(store.settings)) {
    if (voiceTranscript.trim()) {
      const cleanVoice = voiceTranscript.trim();
      const updatedName = `Động tác: ${cleanVoice.slice(0, 55)}`;
      const updatedSteps = steps.map((st, idx) => normalizeStep({
        ...st,
        instruction: `${st.instruction} (Ghi chú giọng nói: "${cleanVoice}")`
      }, idx));
      return { draftName: updatedName, steps: updatedSteps, aiRefined: false };
    }
    return { draftName, steps, aiRefined: false };
  }
  try {
    const stepSummary = steps.map((s) => `- Bước ${s.stepNumber} (${fmtTimeMs(s.start)} -> ${fmtTimeMs(s.end)}): ${s.label} | ${s.jointDetail}`).join("\n");
    const sys = `Bạn là chuyên gia AI phân tích chuyển động cơ thể và huấn luyện động tác.
Hãy dựa trên chuỗi nhãn động học (mili-giây) và lời mô tả giọng nói của người dùng (nếu có) để:
1. Đặt một tên nháp ngắn gọn, rõ nghĩa bằng tiếng Việt cho chuỗi động tác này.
2. Viết lại nhãn và lời hướng dẫn từng bước (steps) thật chuẩn xác, dễ hiểu để người tập làm theo.
Trả về ĐÚNG định dạng JSON hợp lệ (không bọc markdown):
{"draftName": "Tên chuỗi động tác...", "steps": [{"stepNumber": 1, "label": "Tên bước...", "instruction": "Hướng dẫn chi tiết dễ hiểu..."}]}`;
    const userMsg = `Tên video/nguồn: ${mediaName || "Không rõ"}
Lời mô tả bằng giọng nói của người dùng: ${voiceTranscript || "(Không có)"}
Tên nháp ban đầu: ${draftName}
Các bước phát hiện theo mili-giây:
${stepSummary}`;
    const raw = await chat(store.settings, sys, [{ role: "user", content: userMsg }], { maxTokens: 700 });
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const newName = parsed.draftName?.trim() || draftName;
      const newSteps = steps.map((st, i) => {
        const found = (parsed.steps || []).find((x) => Number(x.stepNumber) === st.stepNumber) || parsed.steps?.[i];
        if (!found) return st;
        const newLabel = found.label?.trim() || st.label;
        const newInst = found.instruction?.trim() || st.instruction;
        registerAiBehavior(st.behavior, `AI: ${newLabel}`, {
          jointDetail: st.jointDetail,
          instruction: newInst
        });
        return normalizeStep({ ...st, label: newLabel, instruction: newInst }, i);
      });
      return { draftName: newName, steps: newSteps, aiRefined: true };
    }
  } catch (err) {
    console.warn("Gemini đặt tên nháp dự phòng:", err.message);
  }
  return { draftName, steps, aiRefined: false };
}
function exportPackageZip(pkg) {
  if (!pkg) {
    toast("Chưa có gói dữ liệu phân tích để tải về.", "warn");
    return;
  }
  const folder = safeFileName(pkg.name || "goi_phan_tich_dong_tac");
  const manifest = {
    app: "behavior-analysis",
    version: "3.0.0",
    packageId: pkg.id,
    packageName: pkg.name,
    createdAt: pkg.createdAt,
    mediaName: pkg.mediaName || null,
    duration: pkg.duration || 0,
    durationMs: pkg.durationMs || Math.round((pkg.duration || 0) * 1e3),
    totalSegments: (pkg.segments || []).length,
    totalSteps: (pkg.steps || []).length,
    totalFrames: (pkg.frames || []).length,
    voiceTranscript: pkg.voiceTranscript || ""
  };
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csvHeader = ["stt", "start_time_ms", "end_time_ms", "start_sec", "end_sec", "duration_ms", "person_id", "type", "behavior_key", "behavior_label", "joint_angles", "step_instruction", "confidence"];
  const csvRows = (pkg.segments || []).map((s, i) => [
    i + 1,
    fmtTimeMs(s.start),
    fmtTimeMs(s.end),
    s.start,
    s.end,
    s.durationMs ?? Math.round((s.end - s.start) * 1e3),
    s.personId,
    s.isAiGenerated ? "AI_SUB_LABEL" : "CORE_BEHAVIOR",
    s.behavior,
    behaviorInfo(s.behavior).label,
    s.jointDetail || s.jointAngles || "",
    s.instruction || s.stepHint || "",
    s.confidence
  ].map(esc).join(","));
  const entries = [
    { path: `${folder}/manifest.json`, content: JSON.stringify(manifest, null, 2) },
    { path: `${folder}/analysis_package.json`, content: JSON.stringify(pkg, null, 2) },
    { path: `${folder}/guide_steps.json`, content: JSON.stringify(pkg.steps || [], null, 2) },
    { path: `${folder}/keypoints_frames.json`, content: JSON.stringify(pkg.frames || []) },
    { path: `${folder}/timeline_miligiay.csv`, content: "\uFEFF" + [csvHeader.join(","), ...csvRows].join("\n") }
  ];
  const zipBlob = createZipBlob(entries);
  downloadBlob(`${folder}.zip`, zipBlob);
  toast(`Đã đóng gói thư mục CSDL và tải về "${folder}.zip".`, "ok");
}
async function importPackageZip(file) {
  const zip = await extractZip(file);
  const pkgText = zip.textOf("analysis_package.json") || zip.textOf("analysis.json") || zip.textOf(".json");
  if (!pkgText) {
    throw new Error("File .ZIP không chứa dữ liệu phân tích (analysis_package.json).");
  }
  const raw = JSON.parse(pkgText);
  const segments = (Array.isArray(raw.segments) ? raw.segments : []).map((s) => normalizeSegment(s));
  const frames = Array.isArray(raw.frames) ? raw.frames : [];
  let steps = (Array.isArray(raw.steps) ? raw.steps : []).map((st, idx) => normalizeStep(st, idx));
  if (!steps.length && segments.length) {
    steps = buildActionStepsAndDraftName(segments, frames, raw.mediaName || file.name).steps;
  }
  for (const s of segments) {
    if (s.isAiGenerated || String(s.behavior).startsWith("ai_")) {
      const stMatch = steps.find((st) => st.behavior === s.behavior);
      registerAiBehavior(s.behavior, stMatch ? `AI: ${stMatch.label}` : s.behaviorLabel || s.behavior, {
        parentBehavior: s.parentBehavior,
        jointDetail: s.jointDetail,
        instruction: s.instruction
      });
    }
  }
  const pkg = await savePackage({
    id: raw.id || `pkg_${Date.now()}_${uid()}`,
    name: raw.name || raw.packageName || file.name.replace(/\.zip$/i, ""),
    summary: raw.summary || "",
    createdAt: raw.createdAt || (/* @__PURE__ */ new Date()).toISOString(),
    source: raw.source || "video",
    mediaName: raw.mediaName || file.name,
    duration: raw.duration || raw.media?.duration || Math.max(0, ...segments.map((s) => s.end), 0),
    durationMs: raw.durationMs || Math.round((raw.duration || 0) * 1e3),
    voiceTranscript: raw.voiceTranscript || "",
    steps,
    segments,
    frames
  });
  const videoEntry = zip.blobOf(/\.(mp4|webm|mov|m4v)$/i);
  await addVideoSourceItem({
    name: `${pkg.name} (Gói ZIP)`,
    kind: "zip",
    duration: pkg.duration,
    packageId: pkg.id,
    file: videoEntry?.blob || null
  });
  applyPackageToWorkspace(pkg);
  pkg.videoBlob = videoEntry || null;
  toast(`Đã nạp gói dữ liệu .ZIP "${pkg.name}" (${segments.length} nhãn hành động, ${steps.length} bước).`, "ok", 5e3);
  return pkg;
}
async function promptApprovePackagePopup({ segments = [], frames = [], mediaName = "", duration = 0, source = "video", voiceNote = "", voiceTranscript = "" }) {
  const transcript = voiceNote || voiceTranscript || "";
  const normSegments = segments.map((s) => normalizeSegment(s));
  const { draftName, steps } = buildActionStepsAndDraftName(normSegments, frames, mediaName);
  const dlg = document.getElementById("packageApproveDialog");
  const nameInput = document.getElementById("pkgDraftNameInput") || document.getElementById("pkgApproveName");
  const summaryInput = document.getElementById("pkgDraftSummaryInput");
  const previewStatsEl = document.getElementById("pkgDraftPreviewStats") || document.getElementById("pkgApproveSummary");
  const cancelBtn = document.getElementById("pkgCancelBtn");
  const approveBtn = document.getElementById("pkgApproveBtn");
  const approveZipBtn = document.getElementById("pkgApproveZipBtn");
  if (!dlg || !nameInput) {
    return savePackage({
      name: draftName,
      source,
      mediaName,
      duration,
      durationMs: Math.round((duration || 0) * 1e3),
      voiceTranscript: transcript,
      steps,
      segments: normSegments,
      frames
    });
  }
  nameInput.value = draftName;
  const aiSubCount = normSegments.filter((s) => s.isAiGenerated).length;
  const defaultSummary = transcript ? `Mô tả giọng nói: "${transcript}" — Gồm ${steps.length} bước động tác (${normSegments.length} nhãn phân tích).` : `Chuỗi ${steps.length} bước động tác (${aiSubCount} nhãn con chi tiết do AI tạo sinh trong ${fmtTimeMs(duration || 0)}).`;
  if (summaryInput) summaryInput.value = defaultSummary;
  const renderPreview = (stepList, badgeText) => {
    if (!previewStatsEl) return;
    const stepsHtml = stepList.slice(0, 6).map((st) => `
      <div style="margin-top:4px;font-size:12px;">
        • <b>Bước ${st.stepNumber} (${fmtTimeMs(st.start)} → ${fmtTimeMs(st.end)}):</b> ${st.label}
        <span class="muted">— ${st.instruction}</span>
      </div>
    `).join("");
    previewStatsEl.innerHTML = `
      <div><b>Trạng thái AI:</b> ${badgeText}</div>
      <div>Đã phân tích <b>${fmtTimeMs(duration || 0)}</b> · Tổng <b>${normSegments.length}</b> mốc nhãn (<b>${aiSubCount}</b> nhãn con AI) · <b>${stepList.length}</b> bước hướng dẫn:</div>
      ${stepsHtml}
    `;
  };
  renderPreview(steps, llmReady(store.settings) ? "⏳ Đang nhờ Gemini AI tinh chỉnh tên nháp…" : "✨ AI Động học đã đặt tên nháp tự động");
  if (!dlg.open) dlg.showModal();
  nameInput.focus();
  nameInput.select();
  let currentSteps = steps;
  refineDraftWithGemini({ draftName, steps, segments: normSegments, voiceTranscript: transcript, mediaName }).then((res) => {
    if (res.aiRefined && dlg.open) {
      if (nameInput.value === draftName) nameInput.value = res.draftName;
      currentSteps = res.steps;
      renderPreview(currentSteps, "✨ Gemini AI đã đặt tên nháp & chuẩn hóa bước hướng dẫn");
    }
  }).catch(() => {
  });
  return new Promise((resolve) => {
    let resolved = false;
    const finish = async (mode) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      if (dlg.open) dlg.close();
      if (mode === "cancel") {
        resolve(null);
        return;
      }
      const finalName = nameInput.value.trim() || draftName;
      const finalSummary = summaryInput?.value?.trim() || defaultSummary;
      const saved = await savePackage({
        name: finalName,
        summary: finalSummary,
        source,
        mediaName,
        duration: round(duration || 0, 3),
        durationMs: Math.round((duration || 0) * 1e3),
        voiceTranscript: transcript,
        steps: currentSteps,
        segments: normSegments,
        frames
      });
      toast(`Đã đóng gói và lưu vào CSDL: "${saved.name}"`, "ok", 4500);
      if (mode === "zip") {
        exportPackageZip(saved);
      }
      resolve(saved);
    };
    const onCancel = () => finish("cancel");
    const onApprove = () => finish("save");
    const onApproveZip = () => finish("zip");
    const onDialogClose = () => {
      if (!resolved) finish("save");
    };
    const cleanup = () => {
      cancelBtn?.removeEventListener("click", onCancel);
      approveBtn?.removeEventListener("click", onApprove);
      approveZipBtn?.removeEventListener("click", onApproveZip);
      dlg.removeEventListener("close", onDialogClose);
    };
    cancelBtn?.addEventListener("click", onCancel);
    approveBtn?.addEventListener("click", onApprove);
    approveZipBtn?.addEventListener("click", onApproveZip);
    dlg.addEventListener("close", onDialogClose);
  });
}

// js/video-source.js
function parseVideoUrl(value) {
  const url = new URL(value.trim());
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Chỉ nhận URL video HTTP/HTTPS không chứa tài khoản/mật khẩu.");
  }
  const host = url.hostname.toLowerCase();
  if (/(^|\.)vimeo\.com$/.test(host)) {
    throw new Error("Trang này chưa được hỗ trợ. Hãy dùng URL trực tiếp MP4/WebM hoặc tải file lên.");
  }
  return url;
}
var isPlatformVideoUrl = (url) => /(^|\.)(youtube\.com|youtu\.be|tiktok\.com|facebook\.com|fb\.watch|fb\.com)$/.test(url.hostname.toLowerCase());
function videoErrorMessage(error) {
  if (error instanceof TypeError && /fetch|network|load failed/i.test(error.message)) {
    return "Không kết nối được tới máy chủ video. Kiểm tra server.py đang chạy và kết nối localhost/Cloudflare, rồi thử lại.";
  }
  return error?.message || "Không đọc được video.";
}
async function resolvePlatformVideo(url, signal) {
  const response = await fetch("video-resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: url.href }),
    signal
  }).catch((error) => {
    signal?.throwIfAborted();
    throw new Error(videoErrorMessage(error));
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) {
    throw new Error(result?.error || "Chức năng liên kết YouTube/TikTok/Facebook cần máy chủ server.py bản mới. Khởi động lại máy chủ trên laptop rồi thử lại.");
  }
  if (typeof result.src !== "string" || !/^\/video-media\?token=[A-Za-z0-9_-]+$/.test(result.src)) {
    throw new Error("Máy chủ chưa trả về nguồn video hợp lệ.");
  }
  return { src: result.src, name: String(result.name || "Video từ liên kết"), videoOnly: !!result.videoOnly };
}
async function preparePlatformVideo(source, signal, onProgress = () => {
}) {
  const url = new URL(source, location.href);
  if (url.origin !== location.origin || url.pathname !== "/video-media" || url.searchParams.get("cached") === "1") return null;
  const token = url.searchParams.get("token");
  if (!token || !/^[A-Za-z0-9_-]+$/.test(token)) throw new Error("Nguồn video không hợp lệ.");
  const endpoint2 = "video-prepare?token=" + encodeURIComponent(token);
  const deadline = Date.now() + 21e4;
  let method = "POST";
  while (true) {
    signal?.throwIfAborted();
    if (Date.now() >= deadline) throw new Error("Chuẩn bị video quá lâu. Hãy thử lại hoặc tải file lên.");
    const request = new AbortController();
    const abort = () => request.abort(signal.reason);
    signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => request.abort(new Error("Máy chủ video không phản hồi. Kiểm tra kết nối rồi thử lại.")), 1e4);
    let result;
    try {
      const response = await fetch(endpoint2, { method, signal: request.signal, cache: "no-store" });
      result = await response.json().catch(() => null);
      if (!response.ok || !result) throw new Error(result?.error || "Cần khởi động lại server.py bản mới để chuẩn bị video URL.");
    } catch (error) {
      signal?.throwIfAborted();
      throw new Error(videoErrorMessage(error));
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
    if (result.state === "error") throw new Error(result.error || "Không tải đủ video để phân tích.");
    if (result.state === "ready") return "/video-media?token=" + token + "&cached=1";
    if (result.state !== "loading") throw new Error("Trạng thái chuẩn bị video không hợp lệ.");
    onProgress(result.received || 0, result.total || 0);
    await new Promise((resolve, reject) => {
      const cleanup = () => signal?.removeEventListener("abort", abortWait);
      const abortWait = () => {
        clearTimeout(wait);
        cleanup();
        reject(signal.reason);
      };
      const wait = setTimeout(() => {
        cleanup();
        resolve();
      }, 350);
      signal?.addEventListener("abort", abortWait, { once: true });
      if (signal?.aborted) abortWait();
    });
    method = "GET";
  }
}
function waitForMedia(video2, event, timeout = 15e3, signal) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      video2.removeEventListener(event, done);
      video2.removeEventListener("error", fail);
      signal?.removeEventListener("abort", abort);
    };
    const done = () => {
      cleanup();
      resolve();
    };
    const fail = () => {
      cleanup();
      const messages = {
        1: "Đã hủy tải video.",
        2: "Kết nối tải video bị gián đoạn.",
        3: "Không giải mã được khung video.",
        4: "Nguồn hoặc định dạng video không đọc được."
      };
      const error = new Error(messages[video2.error?.code] || "Không đọc được video: kiểm tra URL, định dạng và quyền truy cập.");
      error.mediaCode = video2.error?.code || null;
      reject(error);
    };
    const abort = () => {
      cleanup();
      reject(signal.reason || new DOMException("Đã hủy mở video.", "AbortError"));
    };
    const timer = setTimeout(() => {
      cleanup();
      const error = new Error("Video phản hồi quá lâu. Kiểm tra kết nối hoặc mở lại URL.");
      error.mediaTimeout = true;
      reject(error);
    }, timeout);
    video2.addEventListener(event, done, { once: true });
    video2.addEventListener("error", fail, { once: true });
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
}
async function seekVideoFrame(video2, t, signal) {
  signal?.throwIfAborted();
  const mediaError = video2.error;
  if (mediaError) {
    const error = new Error(`Không đọc được video (mã ${mediaError.code}). Mở lại nguồn video.`);
    error.mediaCode = mediaError.code;
    throw error;
  }
  if (Math.abs(video2.currentTime - t) < 1e-3 && video2.readyState >= 2) return;
  const pending = new AbortController();
  const abort = () => pending.abort(signal.reason);
  signal?.addEventListener("abort", abort, { once: true });
  const waiting = waitForMedia(video2, "seeked", 15e3, pending.signal);
  try {
    try {
      video2.currentTime = t;
    } catch (error) {
      pending.abort(error);
    }
    await waiting;
  } finally {
    signal?.removeEventListener("abort", abort);
  }
}
async function seekVideoWithRecovery(video2, t, signal, recover) {
  try {
    await seekVideoFrame(video2, t, signal);
  } catch (error) {
    signal?.throwIfAborted();
    if (!recover || !(error.mediaCode === 2 || error.mediaTimeout)) throw error;
    if (!await recover(error)) throw error;
    signal?.throwIfAborted();
    await seekVideoFrame(video2, t, signal);
  }
}
async function attachVideoSource(video2, source, remote = false, signal) {
  signal?.throwIfAborted();
  video2.pause();
  video2.crossOrigin = remote ? "anonymous" : null;
  const loaded = waitForMedia(video2, "loadeddata", 15e3, signal);
  video2.src = source;
  video2.load();
  await loaded;
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(video2, 0, 0, 1, 1);
  ctx.getImageData(0, 0, 1, 1);
}

// js/upload.js
var VIDEO_EXT = /\.(mp4|m4v|webm|mov|mkv|ogv|ogg)$/i;
var ZIP_EXT = /\.zip$/i;
var currentUrl = null;
var cancelRequested = false;
var opening = false;
var openingController = null;
var analysisController = null;
var sessionFiles = /* @__PURE__ */ new Map();
function initUpload() {
  const input = $("#videoInput");
  const dz = $("#dropzone");
  input?.addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    input.value = "";
    if (!f) return;
    await handleIncomingFile(f);
  });
  if (dz) {
    ["dragenter", "dragover"].forEach((ev) => dz.addEventListener(ev, (e) => {
      e.preventDefault();
      dz.classList.add("is-over");
    }));
    ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => {
      e.preventDefault();
      dz.classList.remove("is-over");
    }));
    dz.addEventListener("drop", async (e) => {
      const files = [...e.dataTransfer?.files || []];
      if (!files.length) return;
      for (const f of files) {
        await handleIncomingFile(f);
      }
    });
  }
  $("#analyzeBtn")?.addEventListener("click", analyzeVideo);
  $("#cancelBtn")?.addEventListener("click", () => {
    cancelRequested = true;
    analysisController?.abort();
  });
  $("#videoUrlForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    openVideoUrl($("#videoUrlInput").value);
  });
  $("#videoUrlCancelBtn")?.addEventListener("click", () => openingController?.abort());
  $("#downloadCurrentPkgZipBtn")?.addEventListener("click", async () => {
    const latest2 = packageStore.packages[0];
    if (latest2) {
      await exportPackageZip(latest2);
    } else if (store.segments.length) {
      const draft = buildActionStepsAndDraftName(store.segments, store.frames, store.media.name || "video");
      const pkg = await promptApprovePackagePopup({
        ...draft,
        mediaName: store.media.name || "video",
        duration: store.media.duration || 0,
        segments: store.segments,
        frames: store.frames
      });
      if (pkg) await exportPackageZip(pkg);
    } else {
      toast("Chưa có gói dữ liệu phân tích nào. Hãy phân tích video hoặc tải lên file .ZIP.", "warn");
    }
  });
  $("#videoSourceList")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const id = btn.dataset.id;
    const item = packageStore.videoSources.find((v) => v.id === id);
    if (!item) return;
    if (btn.dataset.act === "delete-source") {
      const isCurrent = store.media.name && (store.media.name === item.name || store.media.pageUrl === item.url);
      await packageStore.removeVideoSource(id);
      sessionFiles.delete(id);
      if (isCurrent) {
        clearVideoStage();
        store.clearSource("video");
      }
      toast(`Đã xóa “${item.name}” khỏi danh sách video.`, "info");
      renderVideoSourceList();
    } else if (btn.dataset.act === "open-source") {
      if (item.type === "url" && item.url) {
        $("#videoUrlInput").value = item.url;
        await openVideoUrl(item.url);
      } else if (sessionFiles.has(id)) {
        await openVideo(sessionFiles.get(id), id);
      } else if (item.packageId) {
        const pkg = packageStore.getPackage(item.packageId);
        if (pkg) {
          applyPackageToWorkspace(pkg);
          toast(`Đã nạp dữ liệu phân tích của gói “${pkg.name}”.`, "ok");
        }
      } else {
        toast("File video cục bộ này thuộc phiên trước — hãy chọn lại file từ máy của bạn.", "warn");
      }
    }
  });
  store.on("video-sources", renderVideoSourceList);
  renderVideoSourceList();
}
async function handleIncomingFile(file) {
  if (ZIP_EXT.test(file.name) || file.type === "application/zip" || file.type === "application/x-zip-compressed") {
    try {
      const pkg = await importPackageZip(file);
      applyPackageToWorkspace(pkg);
      await packageStore.addVideoSource({
        id: "src_" + uid(),
        name: `[Gói ZIP] ${pkg.name}`,
        type: "zip",
        size: file.size,
        packageId: pkg.id,
        addedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      toast(`Đã nhập gói dữ liệu .ZIP “${pkg.name}” (${pkg.segments?.length || 0} nhãn hành vi, ${pkg.steps?.length || 0} bước).`, "ok", 6e3);
    } catch (err) {
      toast(`Lỗi đọc file .ZIP: ${err.message}`, "error", 6e3);
    }
    return;
  }
  if (/\.json$/i.test(file.name)) {
    store.emit("import-json-file", file);
    return;
  }
  if (file.type.startsWith("video/") || VIDEO_EXT.test(file.name)) {
    await openVideo(file);
    return;
  }
  toast("Hãy chọn file Video (MP4, WebM, MOV, MKV) hoặc gói cơ sở dữ liệu .ZIP / .JSON.", "warn");
}
async function openVideo(file, existingId = null) {
  if (store.analyzing) {
    toast("Đang phân tích — hãy dừng trước khi mở video khác.", "warn");
    return;
  }
  if (!file.type.startsWith("video/") && !VIDEO_EXT.test(file.name)) {
    toast(`“${file.name}” không phải file video.`, "error");
    return;
  }
  if (opening) return;
  const sourceId = existingId || "src_" + uid();
  sessionFiles.set(sourceId, file);
  const url = URL.createObjectURL(file);
  await openSource({ id: sourceId, name: file.name, size: file.size, src: url, blob: true, sourceType: "file" });
}
async function openVideoUrl(value) {
  if (opening || store.analyzing) {
    toast("Hãy dừng phân tích trước khi mở nguồn khác.", "warn");
    return;
  }
  try {
    const url = parseVideoUrl(value);
    const platform = isPlatformVideoUrl(url);
    await openSource({
      id: "src_" + uid(),
      name: decodeURIComponent(url.pathname.split("/").pop() || url.hostname || "video-url"),
      size: 0,
      src: url.href,
      originalUrl: url.href,
      remote: true,
      platform,
      sourceType: "url"
    });
  } catch (err) {
    toast(err.message, "error", 7e3);
  }
}
async function openSource(source) {
  const video2 = getVideo();
  const oldSrc = video2.currentSrc;
  const oldRemote = video2.crossOrigin;
  const platformUrl = source.platform ? new URL(source.src) : null;
  opening = true;
  openingController = new AbortController();
  const signal = openingController.signal;
  const timeout = setTimeout(() => openingController?.abort(new Error("Mở video quá lâu. Hãy thử lại hoặc tải file lên.")), 9e4);
  if ($("#analyzeBtn")) $("#analyzeBtn").disabled = true;
  if ($("#videoUrlBtn")) $("#videoUrlBtn").disabled = true;
  if ($("#videoUrlInput")) $("#videoUrlInput").disabled = true;
  if ($("#videoUrlMode")) $("#videoUrlMode").disabled = true;
  if ($("#videoUrlCancelBtn")) $("#videoUrlCancelBtn").hidden = false;
  if ($("#videoUrlStatus")) $("#videoUrlStatus").textContent = source.platform ? "Đang lấy video từ liên kết (YouTube/TikTok/FB)…" : "Đang mở video…";
  try {
    if (source.platform) {
      const resolved = await resolvePlatformVideo(platformUrl, signal);
      source = { ...source, ...resolved, remote: false };
      if ($("#videoUrlStatus")) $("#videoUrlStatus").textContent = "Đang mở “" + source.name + "”…";
    }
    try {
      await attachVideoSource(video2, source.src, source.remote, signal);
    } catch (err) {
      if (signal.aborted) throw err;
      if (platformUrl) {
        if ($("#videoUrlStatus")) $("#videoUrlStatus").textContent = "Nguồn video chưa đọc được, đang thử lại…";
        const resolved = await resolvePlatformVideo(platformUrl, signal);
        source = { ...source, ...resolved };
        try {
          await attachVideoSource(video2, source.src, false, signal);
        } catch (retryError) {
          if (signal.aborted) throw retryError;
          throw new Error("Nền tảng chưa cho đọc nguồn video hoặc định dạng không tương thích. Thử lại sau hoặc tải file MP4 lên.");
        }
      } else {
        if (!source.remote) throw err;
        const pingController = new AbortController();
        const cancelPing = () => pingController.abort();
        signal.addEventListener("abort", cancelPing, { once: true });
        const pingTimer = setTimeout(cancelPing, 3e3);
        const ping = await fetch("video-proxy?ping=1", { signal: pingController.signal }).then((r) => r.json()).catch(() => null);
        clearTimeout(pingTimer);
        signal.removeEventListener("abort", cancelPing);
        signal.throwIfAborted();
        if (!ping?.videoProxy) throw new Error("Máy chủ video chặn CORS hoặc URL không đọc được. Chạy bằng server.py để dùng proxy URL, hoặc tải file lên.");
        await attachVideoSource(video2, "video-proxy?url=" + encodeURIComponent(source.src), false, signal);
      }
    }
    await commitSource({ ...source, pageUrl: platformUrl?.href || source.originalUrl || null });
    if ($("#videoUrlStatus")) {
      $("#videoUrlStatus").textContent = source.videoOnly ? "Đã mở video. Bấm “Phân tích” trên thanh điều khiển để AI trích xuất khung xương & tạo nhãn mili-giây." : "Đã mở video thành công. Bấm nút “Phân tích” để bắt đầu.";
    }
  } catch (err) {
    if (source.blob) URL.revokeObjectURL(source.src);
    if (oldSrc) {
      video2.crossOrigin = oldRemote;
      video2.src = oldSrc;
      video2.load();
    } else {
      video2.removeAttribute("src");
      video2.load();
    }
    const message = err.name === "AbortError" ? "Đã hủy mở video." : videoErrorMessage(err);
    if ($("#videoUrlStatus")) $("#videoUrlStatus").textContent = message;
    toast(message, err.name === "AbortError" ? "info" : "error", 7e3);
  } finally {
    clearTimeout(timeout);
    openingController = null;
    opening = false;
    if ($("#videoUrlBtn")) $("#videoUrlBtn").disabled = false;
    if ($("#videoUrlInput")) $("#videoUrlInput").disabled = false;
    if ($("#videoUrlMode")) $("#videoUrlMode").disabled = false;
    if ($("#videoUrlCancelBtn")) $("#videoUrlCancelBtn").hidden = true;
    if ($("#analyzeBtn")) $("#analyzeBtn").disabled = !store.media.name;
  }
}
async function commitSource(source) {
  const prevName = store.media.name;
  const hasVideoResults = store.segments.some((s) => s.source === "video");
  const importedFor = store.meta.mediaName;
  if (currentUrl && currentUrl !== source.src) URL.revokeObjectURL(currentUrl);
  currentUrl = source.blob ? source.src : null;
  const video2 = getVideo();
  store.media = {
    id: source.id,
    name: source.name,
    size: source.size,
    duration: video2.duration,
    width: video2.videoWidth,
    height: video2.videoHeight,
    pageUrl: source.pageUrl
  };
  if ($("#videoStage")) $("#videoStage").hidden = false;
  if ($("#dropEmpty")) $("#dropEmpty").hidden = true;
  $("#dropzone")?.classList.add("has-video");
  if ($("#analyzeBtn")) $("#analyzeBtn").disabled = false;
  const existing = packageStore.videoSources.find((v) => source.pageUrl && v.url === source.pageUrl || !source.pageUrl && v.name === source.name && v.type === "file");
  if (!existing) {
    await packageStore.addVideoSource({
      id: source.id || "src_" + uid(),
      name: source.name,
      type: source.sourceType || (source.pageUrl ? "url" : "file"),
      url: source.pageUrl || null,
      size: source.size || 0,
      duration: round(video2.duration || 0, 2),
      addedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  } else if (source.blob && sessionFiles.has(source.id)) {
    sessionFiles.set(existing.id, sessionFiles.get(source.id));
  }
  const belongs = importedFor === source.name || prevName === source.name;
  if (hasVideoResults && !belongs) {
    store.clearSource("video");
    toast("Đã mở video mới — sẵn sàng phân tích.", "info");
  } else {
    toast(`Đã mở “${source.name}”.`, "ok");
  }
  store.emit("media", store.media);
}
function renderVideoSourceList() {
  const listEl = $("#videoSourceList");
  if (!listEl) return;
  const items = packageStore.videoSources;
  const countEl = $("#videoSourceCount");
  if (countEl) countEl.textContent = `${items.length} mục`;
  if (!items.length) {
    listEl.innerHTML = `<p class="muted small empty-note">Chưa có video tải lên hoặc link nào được lưu. Khi bạn tải video MP4/WebM, gói .ZIP hoặc nhập link YouTube/TikTok/FB, danh sách sẽ hiện tại đây để mở lại hoặc xóa.</p>`;
    return;
  }
  listEl.innerHTML = items.map((item) => {
    const badge = item.type === "url" ? '<span class="src-badge src-url">Link Video</span>' : item.type === "zip" ? '<span class="src-badge src-zip">Gói .ZIP</span>' : '<span class="src-badge src-file">Video Tải Lên</span>';
    const metaParts = [];
    if (item.duration) metaParts.push(`Thời lượng: ${fmtTimeMs(item.duration)}`);
    if (item.size) metaParts.push(`${(item.size / 1048576).toFixed(1)} MB`);
    if (item.url) metaParts.push(escapeHtml(item.url.slice(0, 68)) + (item.url.length > 68 ? "…" : ""));
    return `<div class="source-item" data-id="${escapeHtml(item.id)}">
      <div class="source-info">
        ${badge}
        <strong class="source-title">${escapeHtml(item.name)}</strong>
        <span class="muted small">${metaParts.join(" · ")}</span>
      </div>
      <div class="source-actions">
        <button type="button" class="btn btn-ghost btn-sm" data-act="open-source" data-id="${escapeHtml(item.id)}">Mở</button>
        <button type="button" class="btn btn-ghost btn-sm danger-text" data-act="delete-source" data-id="${escapeHtml(item.id)}" title="Xóa khỏi danh sách">✕ Xóa</button>
      </div>
    </div>`;
  }).join("");
}
async function analyzeVideo() {
  const video2 = getVideo();
  if (opening) return;
  if (!video2.currentSrc) {
    toast("Hãy tải video lên hoặc dán link video trước.", "warn");
    return;
  }
  if (store.analyzing || live.source === "camera") {
    toast("Hãy tắt camera trước khi phân tích video.", "warn");
    return;
  }
  if (video2.readyState < 1) {
    try {
      await waitForMedia(video2, "loadedmetadata");
    } catch (err) {
      toast(err.message, "error");
      return;
    }
  }
  const duration = video2.duration;
  if (!Number.isFinite(duration) || duration <= 0) {
    toast("Không xác định được thời lượng video. Hãy thử chuyển video sang MP4.", "error");
    return;
  }
  store.analyzing = true;
  cancelRequested = false;
  analysisController = new AbortController();
  const signal = analysisController.signal;
  video2.pause();
  const urlMode = $("#videoUrlMode")?.value || "stream";
  let recoveries = 0;
  setBusy(true, "Đang chuẩn bị video…");
  try {
    if (urlMode === "cache") {
      const prepared = await preparePlatformVideo(video2.currentSrc, signal, (received, total2) => {
        const mb = (v) => (v / 1048576).toFixed(1);
        setProgress(0, `Đang tải đủ video trên máy chủ: ${mb(received)}${total2 ? " / " + mb(total2) : ""} MB…`);
      });
      if (prepared) await attachVideoSource(video2, prepared, false, signal);
    } else {
      const src = new URL(video2.currentSrc);
      if (src.origin === location.origin && src.pathname === "/video-media" && src.searchParams.has("cached")) {
        src.searchParams.delete("cached");
        await attachVideoSource(video2, src.href, false, signal);
      }
    }
    signal.throwIfAborted();
    setProgress(0, "Đang khởi tạo mô hình AI Khung xương (Thân + Đầu + Bàn tay)…");
    await inference.init(modelConfig());
    signal.throwIfAborted();
  } catch (err) {
    if (cancelRequested) toast("Đã dừng chuẩn bị phân tích.", "info");
    else {
      console.error(err);
      const message = videoErrorMessage(err);
      if ($("#videoUrlStatus")) $("#videoUrlStatus").textContent = message;
      toast(message, "error", 7e3);
    }
    setBusy(false);
    store.analyzing = false;
    analysisController = null;
    return;
  }
  const rt = runtime();
  const step = Number(store.settings.sampleInterval) || 0.1;
  const minScore = store.settings.minPoseScore ?? 0.25;
  const modelType = store.settings.modelType;
  const engine2 = new BehaviorEngine();
  const st = store.settings;
  const scheduler = new TaskScheduler();
  const builder2 = new SegmentBuilder("video", step);
  const frames = [];
  const canvas3 = $("#videoOverlay");
  const total = Math.floor(duration / step) + 1;
  const started = performance.now();
  let falls = 0;
  let lastObjects2 = [];
  let lastLog2 = 0;
  let lastLiveEmit = 0;
  inference.resetTracker();
  inference.resetStats();
  video2.pause();
  store.analyzing = true;
  syncCanvas(canvas3, video2, rt.canvasMax);
  const handle = (job, res) => {
    if (job.withObjects) lastObjects2 = res.objects;
    const persons = engine2.analyze(res.poses, lastObjects2, job.t);
    builder2.push(job.t, persons);
    falls += persons.filter((p) => p.newFall).length;
    frames.push(compactFrame(job.t, persons));
    if (job.preview) {
      drawOverlay(canvas3, persons, lastObjects2, minScore, job.preview);
      job.preview.close?.();
    }
    const done = job.i + 1;
    const now = performance.now();
    const elapsed = (now - started) / 1e3;
    const eta = elapsed / done * (total - done);
    live.inferFps = done / Math.max(0.05, elapsed);
    live.renderFps = Math.max(14, live.inferFps * 1.35);
    if (now - lastLiveEmit >= 160 || done === total) {
      lastLiveEmit = now;
      const liveSegs = builder2.snapshotLive(job.t);
      store.segments = [...store.segments.filter((s) => s.source !== "video"), ...liveSegs];
      store.emit("live-segments", store.segments);
    }
    setProgress(
      done / total,
      `${Math.round(done / total * 100)}% · ${fmtTimeMs(job.t)} / ${fmtTimeMs(duration)} · ${(done / Math.max(0.05, elapsed)).toFixed(1)} mẫu/s · còn ~${Math.ceil(eta)}s`
    );
    if (elapsed - lastLog2 >= 1) {
      lastLog2 = elapsed;
      logPerf("video", inference.stats);
    }
  };
  let inflight = null;
  let failed = false;
  let failure = null;
  let stage = "video";
  let attemptedTime = 0;
  const recover = async () => {
    if (urlMode !== "stream" || recoveries >= 3 || video2.currentSrc.startsWith("blob:")) return false;
    recoveries++;
    setProgress(frames.length / total, `Kết nối video gián đoạn ở ${fmtTimeMs(attemptedTime)}. Đang nối lại (${recoveries}/3)…`);
    const retry = new AbortController();
    const abort = () => retry.abort(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => retry.abort(new Error("Nối lại video quá lâu.")), 3e4);
    try {
      let src = video2.currentSrc;
      if (store.media.pageUrl) src = (await resolvePlatformVideo(new URL(store.media.pageUrl), retry.signal)).src;
      else {
        const url = new URL(src);
        if (url.origin === location.origin && ["/video-media", "/video-proxy"].includes(url.pathname)) {
          url.searchParams.set("retry", String(Date.now()));
          src = url.href;
        }
      }
      await attachVideoSource(video2, src, video2.crossOrigin === "anonymous", retry.signal);
      return true;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    }
  };
  try {
    for (let i = 0; i < total && !cancelRequested; i++) {
      const t = Math.min(i * step, Math.max(0, duration - 5e-3));
      attemptedTime = t;
      stage = "video";
      await seekVideoWithRecovery(video2, t, signal, recover);
      stage = "analysis";
      const tasks = scheduler.plan(t, rt, st);
      const grabbed = await inference.grab(video2, rt.inputWidth);
      const job = {
        i,
        t,
        withObjects: tasks.withObjects,
        preview: i % rt.previewEvery === 0 ? await createImageBitmap(video2, { resizeWidth: canvas3.width, resizeHeight: canvas3.height }).catch(() => null) : null
      };
      if (inflight) {
        const previous = inflight;
        inflight = null;
        try {
          handle(previous.job, await resultOf(previous.promise));
        } catch (err) {
          grabbed.bitmap.close?.();
          job.preview?.close();
          previous.job.preview?.close();
          throw err;
        }
      }
      inflight = {
        job,
        promise: inference.detectGrabbed(grabbed, {
          timestampMs: Math.round(t * 1e3),
          withObjects: job.withObjects,
          maxPoses: rt.maxPoses,
          withFaces: false,
          faceRes: false
        }).then((value) => ({ value }), (error) => ({ error }))
      };
    }
    if (inflight) {
      const previous = inflight;
      inflight = null;
      handle(previous.job, await resultOf(previous.promise));
    }
  } catch (err) {
    if (!cancelRequested) {
      failed = true;
      failure = { stage, atSeconds: round(attemptedTime, 3), message: err.message, mediaCode: video2.error?.code || null };
      console.error(err);
      const message = `Dừng ở ${fmtTimeMs(attemptedTime)}: ${err.message}`;
      if ($("#videoUrlStatus")) $("#videoUrlStatus").textContent = message;
      toast(message, "error", 1e4);
    }
  } finally {
    if (inflight) {
      const previous = inflight;
      inflight = null;
      try {
        handle(previous.job, await resultOf(previous.promise));
      } catch (err) {
        if (!cancelRequested && !failed) {
          failed = true;
          failure = { stage: "analysis", atSeconds: previous.job.t, message: err.message, mediaCode: null };
        }
      } finally {
        previous.job.preview?.close();
      }
    }
    analysisController = null;
  }
  const segments = builder2.finalize().map((s) => {
    const end = Math.min(s.end, round(duration, 3));
    const endMs = Math.round(end * 1e3);
    return { ...s, end, endMs, durationMs: Math.max(10, endMs - (s.startMs || Math.round(s.start * 1e3))) };
  });
  store.analyzing = false;
  store.setResults({
    segments: [...store.segments.filter((s) => s.source !== "video"), ...segments],
    frames,
    meta: {
      analyzedAt: (/* @__PURE__ */ new Date()).toISOString(),
      source: "video",
      mediaName: store.media.name,
      sampleInterval: step,
      modelType,
      profile: rt.key,
      backend: inference.backend,
      thread: inference.mode,
      partial: cancelRequested || failed,
      analysisError: failure,
      completedUntil: frames.at(-1)?.t ?? null,
      urlMode,
      streamRecoveries: recoveries
    }
  });
  setBusy(false);
  await seekVideoFrame(video2, 0).catch(() => {
  });
  const secs = (performance.now() - started) / 1e3;
  const speed = duration / Math.max(0.1, secs);
  if (cancelRequested || failed) {
    toast(`Kết quả chưa đầy đủ. Giữ lại ${segments.length} nhãn hành vi đã phân tích.`, "warn");
  } else {
    if ($("#videoUrlStatus")) {
      $("#videoUrlStatus").textContent = `Hoàn tất phân tích (${segments.length} nhãn mili-giây). Đang đóng gói & đề xuất tên nháp bằng AI…`;
    }
    toast(`Phân tích hoàn tất trong ${secs.toFixed(1)}s (tốc độ ${speed.toFixed(1)}×): ${segments.length} nhãn hành vi.`, "ok", 5e3);
  }
  if (falls) toast(`Phát hiện ${falls} lần té ngã — xem trên dòng thời gian.`, "alert", 7e3);
  if (!cancelRequested && !failed && store.settings.selfTrain) {
    selfTrain().catch(() => 0);
  }
  if (segments.length > 0 && !cancelRequested) {
    const draft = buildActionStepsAndDraftName(segments, frames, store.media.name || "video");
    await promptApprovePackagePopup({
      ...draft,
      mediaName: store.media.name || "video",
      sourceUrl: store.media.pageUrl || null,
      duration: round(duration, 3),
      segments,
      frames
    });
  }
}
async function resultOf(promise) {
  const r = await promise;
  if (r.error) throw r.error;
  return r.value;
}
var r1 = (v) => Math.round(v * 10) / 10;
function compactFrame(t, persons) {
  return {
    t: round(t, 3),
    tMs: Math.round(t * 1e3),
    persons: persons.map((p) => {
      const o = {
        id: p.personId,
        box: [r1(p.box.x), r1(p.box.y), r1(p.box.w), r1(p.box.h)],
        labels: p.labels.map((l) => l.behavior)
      };
      if (p.keypoints) o.kp = p.keypoints.map((k) => [r1(k.x), r1(k.y), round(k.score, 2)]);
      return o;
    })
  };
}
function setBusy(busy2, text = "") {
  if ($("#analyzeBtn")) $("#analyzeBtn").hidden = busy2;
  if ($("#cancelBtn")) $("#cancelBtn").hidden = !busy2;
  if ($("#progressWrap")) $("#progressWrap").hidden = !busy2;
  if ($("#scrubber")) $("#scrubber").disabled = busy2;
  if ($("#videoUrlMode")) $("#videoUrlMode").disabled = busy2;
  if (busy2) setProgress(0, text);
}
function setProgress(ratio, text) {
  if ($("#progressFill")) $("#progressFill").style.width = `${(ratio * 100).toFixed(1)}%`;
  if ($("#progressText")) $("#progressText").textContent = text;
}

// js/pose-stability.js
var median = (values) => {
  const a = values.sort((x, y) => x - y);
  return a.length ? a[Math.floor(a.length / 2)] : 0;
};
var distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
var usable = (k, score) => k && Number.isFinite(k.x) && Number.isFinite(k.y) && k.score >= score;
var PoseStability = class {
  constructor() {
    this.tracks = /* @__PURE__ */ new Map();
    this.stats = { rejected: 0, uncertain: 0 };
  }
  reset() {
    this.tracks.clear();
  }
  filter(poses, t, { width, height, minScore = 0.3 } = {}) {
    const diagonal = Math.hypot(width || 640, height || 360);
    const enter = Math.max(0.45, minScore), leave = Math.max(0.3, minScore);
    this.stats = { rejected: 0, uncertain: 0 };
    const out = (poses || []).map((pose) => {
      let tr = this.tracks.get(pose.id);
      const resetPose = !tr || t < tr.t || t - tr.t > 0.6;
      if (resetPose) {
        tr = { joints: [], t };
        this.tracks.set(pose.id, tr);
      }
      const dt = Math.max(0.01, Math.min(0.25, t - tr.t));
      const kp = pose.keypoints || [];
      const measuredScale = Math.max(
        diagonal * 0.12,
        usable(kp[5], enter) && usable(kp[6], enter) ? distance(kp[5], kp[6]) : 0,
        usable(kp[5], enter) && usable(kp[11], Math.max(enter, 0.5)) ? distance(kp[5], kp[11]) : 0,
        usable(kp[6], enter) && usable(kp[12], Math.max(enter, 0.5)) ? distance(kp[6], kp[12]) : 0
      );
      const scale = tr.scale ? Math.max(tr.scale * 0.75, Math.min(tr.scale * 1.25, measuredScale)) : measuredScale;
      const anchors = [5, 6, 11, 12].filter((i) => usable(kp[i], i >= 11 ? Math.max(enter, 0.5) : enter) && tr.joints[i]?.accepted && t - tr.joints[i].lastGood <= 0.3).map((i) => ({ x: kp[i].x - tr.joints[i].accepted.x, y: kp[i].y - tr.joints[i].accepted.y }));
      const tolerance = Math.max(diagonal * 0.025, scale * 0.2);
      const cluster = anchors.map((a) => anchors.filter((b) => distance(a, b) <= tolerance)).sort((a, b) => b.length - a.length)[0] || [];
      const dx = cluster.length >= 2 ? median(cluster.map((a) => a.x)) : 0;
      const dy = cluster.length >= 2 ? median(cluster.map((a) => a.y)) : 0;
      const rejectedBefore = this.stats.rejected;
      const resetJoints = [];
      const keypoints = kp.map((raw, i) => {
        var _a;
        const k = raw || { x: 0, y: 0, score: 0 };
        const state2 = (_a = tr.joints)[i] || (_a[i] = { accepted: null, lastGood: -Infinity, pending: null });
        const inFrame = k.x >= 0 && k.y >= 0 && (!width || k.x <= width) && (!height || k.y <= height);
        const tracked = state2.accepted && t - state2.lastGood <= 0.3;
        if (!usable(k, tracked ? leave : enter) || !inFrame) {
          state2.pending = null;
          this.stats.uncertain++;
          return { ...k, x: Number.isFinite(k.x) ? k.x : 0, y: Number.isFinite(k.y) ? k.y : 0, score: 0 };
        }
        const allowance = Math.max(diagonal * 0.02, scale * (i < 5 ? 0.22 : i < 7 || i === 11 || i === 12 ? 0.45 : 1)) * Math.max(1, Math.min(1.8, dt / 0.1));
        const expected = state2.accepted && { x: state2.accepted.x + dx, y: state2.accepted.y + dy };
        const jump = tracked && distance(k, expected) > allowance;
        const acquire = !tracked && k.score < 0.75;
        if (jump || acquire) {
          const prior = state2.pending;
          const consistent = prior && t - prior.t <= 0.35 && distance(k, prior.k) <= allowance * 0.5;
          state2.pending = { k, t, hits: consistent ? prior.hits + 1 : 1 };
          if (state2.pending.hits < 2) {
            jump ? this.stats.rejected++ : this.stats.uncertain++;
            return { ...k, score: 0 };
          }
          resetJoints.push(i);
        } else if (!tracked) resetJoints.push(i);
        state2.accepted = { ...k };
        state2.lastGood = t;
        state2.pending = null;
        return { ...k };
      });
      tr.t = t;
      if (this.stats.rejected === rejectedBefore) tr.scale = scale;
      return { ...pose, keypoints, _resetPose: resetPose, _resetJoints: resetJoints, _poseScale: scale };
    });
    for (const [id, tr] of this.tracks) if (t - tr.t > 0.6 || t < tr.t) this.tracks.delete(id);
    return out;
  }
};

// js/camera.js
var FALL_ALERT_COOLDOWN = 5;
var cam;
var canvas2;
var stageEl;
var stream = null;
var running = false;
var opening2 = false;
var cameraRunId = 0;
var engine = null;
var builder = null;
var smoother = null;
var stability = null;
var sessionStart = 0;
var sessionId = null;
var sessionSegments = 0;
var latest = null;
var renderedSeq = -1;
var seq = 0;
var inferCount = 0;
var lastInferAt = 0;
var lastObjects = [];
var lastAlert = -Infinity;
var lastLiveUpdate = 0;
var lastLog = 0;
var renderCount = 0;
var renderT0 = 0;
var inferWin = 0;
var inferT0 = 0;
var lastOverlayAt = 0;
var activeCamTab = "guide";
var selectedPkgId = null;
var currentStepIdx = 0;
var guideAnimPlaying = false;
var guideSpeed = 0.5;
var guideAutoStep = true;
var guideAnimRaf = null;
var guideStartAt = performance.now();
var checkingAccuracy = false;
var lastAccuracyEval = null;
var accuracyHistory = [];
var learnState = null;
var speechRec = null;
var speechActive = false;
var userVideoBlobs = /* @__PURE__ */ new Map();
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function initCamera() {
  cam = $("#camera");
  canvas2 = $("#cameraOverlay");
  stageEl = $("#cameraStage");
  $("#camStartBtn")?.addEventListener("click", startCamera);
  $("#camStopBtn")?.addEventListener("click", stopCamera);
  $("#camSnapBtn")?.addEventListener("click", snapshot);
  $("#cameraSelect")?.addEventListener("change", () => {
    if (running) {
      stopCamera();
      startCamera();
    }
  });
  $$("[data-cam-fn]").forEach((btn) => {
    btn.addEventListener("click", () => switchCameraFunction(btn.dataset.camFn));
  });
  $("#camPackageSelect")?.addEventListener("change", (e) => {
    selectedPkgId = e.target.value;
    currentStepIdx = 0;
    renderGuideStepsUi();
  });
  $("#camToggleGuideAnimBtn")?.addEventListener("click", () => {
    guideAnimPlaying = !guideAnimPlaying;
    guideStartAt = performance.now();
    syncGuideButtons();
    if (guideAnimPlaying && !running) {
      startStandaloneGuideLoop();
    }
    toast(guideAnimPlaying ? "Đã bật khung xương mẫu chuyển động từ từ theo từng Step trên màn hình." : "Đã tạm dừng khung xương hướng dẫn.", "info", 2500);
  });
  $("#camPrevStepBtn")?.addEventListener("click", () => {
    const steps = getActiveSteps();
    if (!steps.length) return;
    currentStepIdx = (currentStepIdx - 1 + steps.length) % steps.length;
    guideStartAt = performance.now();
    renderGuideStepsUi();
  });
  $("#camNextStepBtn")?.addEventListener("click", () => {
    const steps = getActiveSteps();
    if (!steps.length) return;
    currentStepIdx = (currentStepIdx + 1) % steps.length;
    guideStartAt = performance.now();
    renderGuideStepsUi();
  });
  $("#camGuideSpeedSel")?.addEventListener("change", (e) => {
    guideSpeed = Number(e.target.value) || 0.5;
  });
  $("#camGuideAutoStepToggle")?.addEventListener("change", (e) => {
    guideAutoStep = !!e.target.checked;
  });
  $("#camGuideStepList")?.addEventListener("click", (e) => {
    const item = e.target.closest("[data-step-idx]");
    if (!item) return;
    currentStepIdx = Number(item.dataset.stepIdx) || 0;
    guideStartAt = performance.now();
    renderGuideStepsUi();
  });
  $("#camStartCheckBtn")?.addEventListener("click", async () => {
    if (!running) {
      await startCamera();
      if (!running) return;
    }
    checkingAccuracy = !checkingAccuracy;
    accuracyHistory = [];
    const btn = $("#camStartCheckBtn");
    if (btn) {
      btn.textContent = checkingAccuracy ? "⏹ Dừng kiểm tra động tác" : "🎯 Kiểm tra động tác ngay";
      btn.classList.toggle("btn-primary", !checkingAccuracy);
      btn.classList.toggle("btn-danger", checkingAccuracy);
    }
    if (checkingAccuracy) {
      guideAnimPlaying = true;
      syncGuideButtons();
      toast("Đang chấm điểm độ chính xác chuyển động so với Step mẫu. Hãy thực hiện động tác trước camera!", "ok", 4e3);
    }
  });
  $("#camRecordNewBtn")?.addEventListener("click", startLearnRecording);
  $("#camStopRecordBtn")?.addEventListener("click", stopLearnRecording);
  $("#camVoiceBtn")?.addEventListener("click", toggleVoiceRecognition);
  $("#camAnalyzeRecordedBtn")?.addEventListener("click", analyzeAndSaveLearnedMovement);
  $("#userVideoList")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-uv-act]");
    if (!btn) return;
    const id = btn.dataset.id;
    const uv = packageStore.userVideos.find((x) => x.id === id);
    if (!uv) return;
    if (btn.dataset.uvAct === "delete") {
      await packageStore.removeUserVideo(id);
      if (userVideoBlobs.has(id)) {
        URL.revokeObjectURL(userVideoBlobs.get(id));
        userVideoBlobs.delete(id);
      }
      renderUserVideoList();
      toast(`Đã xóa video hành vi “${uv.name}”.`, "info");
    } else if (btn.dataset.uvAct === "guide") {
      if (uv.packageId && packageStore.getPackage(uv.packageId)) {
        selectedPkgId = uv.packageId;
        populatePackageSelect();
        switchCameraFunction("guide");
        guideAnimPlaying = true;
        syncGuideButtons();
        if (!running) startStandaloneGuideLoop();
        toast(`Đã nạp “${uv.name}” vào chế độ Hướng dẫn khung xương.`, "ok");
      } else {
        toast("Video này đã được nạp vào khung xương mẫu.", "info");
      }
    } else if (btn.dataset.uvAct === "preview") {
      const playerWrap = $("#camRecordedPreviewWrap");
      const player = $("#camRecordedPreviewVideo");
      const blobUrl = userVideoBlobs.get(id) || uv.blobUrl;
      if (player && blobUrl) {
        playerWrap.hidden = false;
        player.src = blobUrl;
        player.play().catch(() => {
        });
      } else {
        toast("Video mẫu này chỉ lưu dữ liệu khung xương trong CSDL (file video gốc thuộc phiên trước). Bấm “Đưa vào Hướng dẫn” để xem khung xương!", "info", 4500);
      }
    }
  });
  $("#cameraCallChatbotLink")?.addEventListener("click", (e) => {
    e.preventDefault();
    const pkg = getActivePackage();
    const step = getActiveSteps()[currentStepIdx];
    const q = pkg ? `Hướng dẫn chi tiết bằng chữ cách thực hiện động tác "${pkg.name}"${step ? ` (đặc biệt là Bước ${step.stepNumber}: ${step.title})` : ""} để đạt độ chính xác cao nhất.` : "Hãy hướng dẫn tôi từng bước thực hiện động tác chuẩn trước camera và cách sửa các lỗi sai tư thế thường gặp.";
    store.emit("ask-chatbot", q);
    $("#chatbotPanel")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
  navigator.mediaDevices?.addEventListener?.("devicechange", listCameras);
  window.addEventListener("beforeunload", () => stream?.getTracks().forEach((t) => t.stop()));
  store.on("settings", () => smoother?.setStrength(store.settings.smoothing));
  store.on("visibility", (hidden) => {
    if (!hidden) {
      smoother?.reset();
      stability?.reset();
    }
  });
  store.on("packages", () => {
    populatePackageSelect();
    renderGuideStepsUi();
  });
  store.on("user-videos", renderUserVideoList);
  store.on("select-package-for-camera", (pkg) => {
    if (!pkg) return;
    selectedPkgId = pkg.id;
    currentStepIdx = 0;
    populatePackageSelect();
    renderGuideStepsUi();
    store.emit("switch-tab", "camera");
    switchCameraFunction("guide");
    guideAnimPlaying = true;
    syncGuideButtons();
    if (!running) startStandaloneGuideLoop();
  });
  populatePackageSelect();
  renderGuideStepsUi();
  renderUserVideoList();
}
var isCameraRunning = () => running || opening2;
function switchCameraFunction(fnKey) {
  activeCamTab = fnKey;
  $$("[data-cam-fn]").forEach((b) => {
    const active = b.dataset.camFn === fnKey;
    b.classList.toggle("is-active", active);
    b.setAttribute("aria-selected", String(active));
  });
  if ($("#camGuidePanel")) $("#camGuidePanel").hidden = fnKey !== "guide";
  if ($("#camCheckPanel")) $("#camCheckPanel").hidden = fnKey !== "check";
  if ($("#camLearnPanel")) $("#camLearnPanel").hidden = fnKey !== "learn";
  if (fnKey === "guide") {
    renderGuideStepsUi();
  } else if (fnKey === "check") {
    renderAccuracyPanel(lastAccuracyEval);
  } else if (fnKey === "learn") {
    renderUserVideoList();
  }
}
function getActivePackage() {
  const pkgs = packageStore.packages || [];
  if (!pkgs.length) return null;
  return pkgs.find((p) => p.id === selectedPkgId) || pkgs[0];
}
function getActiveSteps() {
  const pkg = getActivePackage();
  if (pkg?.steps?.length) return pkg.steps;
  return [
    {
      stepNumber: 1,
      title: "Tư thế chuẩn bị — Đứng thẳng cân bằng",
      description: "Đứng thẳng, hai bàn chân rộng bằng vai, đầu giữ thẳng trục cột sống, hai bàn tay thả lỏng tự nhiên.",
      jointAngles: "GốiT:176° · GốiP:176° · Lưng:4°",
      keypoints: defaultStandingKeypoints(0)
    },
    {
      stepNumber: 2,
      title: "Thực hiện động tác — Nâng hai tay & mở khớp ngón tay",
      description: "Từ từ nâng đều hai cánh tay lên cao, mở rộng 5 ngón tay và giữ hai vai cân bằng.",
      jointAngles: "VaiT:152° · VaiP:152° · Khuỷu:168°",
      keypoints: defaultStandingKeypoints(1)
    },
    {
      stepNumber: 3,
      title: "Hạ trọng tâm — Gập gối kiểm soát & thu tay",
      description: "Hạ hông xuống vừa phải, giữ lưng thẳng và đưa hai bàn tay về trước ngực.",
      jointAngles: "GốiT:118° · GốiP:118° · Lưng:12°",
      keypoints: defaultStandingKeypoints(2)
    }
  ];
}
function populatePackageSelect() {
  const sel = $("#camPackageSelect");
  if (!sel) return;
  const pkgs = packageStore.packages || [];
  if (!selectedPkgId && pkgs.length) selectedPkgId = pkgs[0].id;
  sel.innerHTML = pkgs.map(
    (p) => `<option value="${escapeHtml(p.id)}" ${p.id === selectedPkgId ? "selected" : ""}>${escapeHtml(p.name)} (${p.steps?.length || 1} Step)</option>`
  ).join("");
}
function syncGuideButtons() {
  const btn = $("#camToggleGuideAnimBtn");
  if (!btn) return;
  btn.textContent = guideAnimPlaying ? "⏸ Tạm dừng khung xương hướng dẫn" : "▶ Bật khung xương hướng dẫn chuyển động";
  btn.classList.toggle("btn-primary", !guideAnimPlaying);
  btn.classList.toggle("btn-secondary", guideAnimPlaying);
}
function renderGuideStepsUi() {
  const steps = getActiveSteps();
  if (currentStepIdx >= steps.length) currentStepIdx = 0;
  const step = steps[currentStepIdx];
  const pkg = getActivePackage();
  if ($("#camCurrentStepBanner") && step) {
    $("#camCurrentStepBanner").innerHTML = `
      <div class="step-banner-head">
        <span class="step-pill">STEP ${step.stepNumber || currentStepIdx + 1} / ${steps.length}</span>
        <strong>${escapeHtml(step.title)}</strong>
        <span class="mono muted small">${escapeHtml(step.jointAngles || "")}</span>
      </div>
      <p class="step-banner-desc">${escapeHtml(step.description || "")}</p>
    `;
  }
  const listEl = $("#camGuideStepList");
  if (listEl) {
    listEl.innerHTML = steps.map((s, idx) => `
      <div class="guide-step-item ${idx === currentStepIdx ? "is-active" : ""}" data-step-idx="${idx}">
        <div class="guide-step-num">Step ${s.stepNumber || idx + 1}</div>
        <div class="guide-step-body">
          <strong>${escapeHtml(s.title)}</strong>
          <p class="small muted">${escapeHtml(s.description || "")}</p>
          ${s.jointAngles ? `<span class="mono tiny-badge">${escapeHtml(s.jointAngles)}</span>` : ""}
        </div>
      </div>
    `).join("");
  }
  const linkNote = $("#cameraChatbotContextText");
  if (linkNote && pkg && step) {
    linkNote.textContent = `Đang chọn bài tập “${pkg.name}” (Step ${currentStepIdx + 1}/${steps.length}: ${step.title}). Cần giải thích chi tiết bằng chữ?`;
  }
}
function buildAnimatedGuidePose(now = performance.now()) {
  if (!guideAnimPlaying) return null;
  const steps = getActiveSteps();
  if (!steps.length) return null;
  const stepDurationMs = 3600 / Math.max(0.2, guideSpeed);
  const elapsed = now - guideStartAt;
  if (guideAutoStep && steps.length > 1 && elapsed >= stepDurationMs) {
    currentStepIdx = (currentStepIdx + 1) % steps.length;
    guideStartAt = now;
    renderGuideStepsUi();
  }
  const cur = steps[currentStepIdx] || steps[0];
  const next = steps[(currentStepIdx + 1) % steps.length] || cur;
  const curKp = cur.keypoints?.length === 17 ? cur.keypoints : defaultStandingKeypoints(currentStepIdx);
  const nextKp = next.keypoints?.length === 17 ? next.keypoints : defaultStandingKeypoints(currentStepIdx + 1);
  const progress = clamp((now - guideStartAt) / stepDurationMs, 0, 1);
  const blend = progress < 0.65 ? 0.18 * Math.sin(progress / 0.65 * Math.PI) : (progress - 0.65) / 0.35;
  const w = canvas2?.width || 640;
  const h = canvas2?.height || 360;
  const scaleX = w / 640;
  const scaleY = h / 360;
  const interpKp = curKp.map((a, idx) => {
    const b = nextKp[idx] || a;
    const x = (a.x + (b.x - a.x) * blend) * scaleX;
    const y = (a.y + (b.y - a.y) * blend) * scaleY;
    return { x, y, score: Math.max(a.score ?? 0.9, 0.9) };
  });
  return {
    keypoints: interpKp,
    stepIndex: currentStepIdx,
    totalSteps: steps.length,
    stepTitle: cur.title || cur.label || "Thực hiện động tác",
    stepLabel: cur.title || cur.label || "Thực hiện động tác",
    instruction: cur.description || cur.instruction || "",
    stepInstruction: cur.description || cur.instruction || "",
    progress
  };
}
function startStandaloneGuideLoop() {
  cancelAnimationFrame(guideAnimRaf);
  const tick2 = () => {
    if (!guideAnimPlaying || running) return;
    if (canvas2) {
      if (!canvas2.width || canvas2.width < 300) {
        canvas2.width = 640;
        canvas2.height = 360;
      }
      if ($("#cameraIdle")) $("#cameraIdle").hidden = true;
      const guidePose = buildAnimatedGuidePose(performance.now());
      drawOverlay(canvas2, [], [], 0.25, null, {
        skeleton: true,
        guidePose,
        hud: [{ color: "#fbbf24", text: "Chế độ Hướng dẫn Khung xương Mẫu (Bật camera để tập cùng khung xương)" }]
      });
    }
    guideAnimRaf = requestAnimationFrame(tick2);
  };
  guideAnimRaf = requestAnimationFrame(tick2);
}
async function listCameras() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  const sel = $("#cameraSelect");
  if (!sel) return;
  const current = sel.value;
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
  sel.innerHTML = '<option value="">Mặc định</option>' + devices.map((d, i) => `<option value="${escapeHtml(d.deviceId)}">${escapeHtml(d.label || `Camera ${i + 1}`)}</option>`).join("");
  if (devices.some((d) => d.deviceId === current)) sel.value = current;
}
async function startCamera() {
  if (running || opening2) return;
  if (store.analyzing) {
    toast("Hãy dừng phân tích video trước khi bật camera.", "warn");
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    toast("Không mở được camera: hãy chạy trang qua http://localhost hoặc https.", "error", 7e3);
    return;
  }
  const startBtn = $("#camStartBtn");
  if (startBtn) {
    startBtn.disabled = true;
    startBtn.textContent = "Đang khởi động…";
  }
  opening2 = true;
  const runId = ++cameraRunId;
  const clickedAt = performance.now();
  if ($("#camStopBtn")) $("#camStopBtn").hidden = false;
  resetAdaptive();
  const rt = runtime();
  try {
    const deviceId = $("#cameraSelect")?.value || "";
    const ideal = rt.key === "eco" ? { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 30 } } : rt.key === "balanced" ? { width: { ideal: 960 }, height: { ideal: 540 }, frameRate: { ideal: 30 } } : { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };
    const video2 = deviceId ? { deviceId: { exact: deviceId }, ...ideal } : { facingMode: "user", ...ideal };
    live.cameraRequestDelayMs = performance.now() - clickedAt;
    const opened = await navigator.mediaDevices.getUserMedia({ video: video2, audio: false });
    if (runId !== cameraRunId) {
      opened.getTracks().forEach((tr) => tr.stop());
      return;
    }
    stream = opened;
    live.cameraOpenMs = performance.now() - clickedAt;
  } catch (err) {
    if (runId !== cameraRunId) return;
    opening2 = false;
    if ($("#camStopBtn")) $("#camStopBtn").hidden = true;
    if (startBtn) {
      startBtn.disabled = false;
      startBtn.textContent = "Bật camera";
    }
    const msg = {
      NotAllowedError: "Quyền camera đang bị chặn. Hãy cho phép quyền Camera trên trình duyệt rồi thử lại.",
      NotFoundError: "Không tìm thấy thiết bị camera nào trên máy.",
      NotReadableError: "Camera đang được ứng dụng khác dùng. Hãy đóng ứng dụng đó rồi thử lại.",
      OverconstrainedError: "Camera không hỗ trợ độ phân giải yêu cầu. Hãy chọn camera khác."
    }[err.name] || `Không mở được camera: ${err.message}`;
    toast(msg, "error", 8e3);
    return;
  }
  cam.srcObject = stream;
  await cam.play().catch(() => {
  });
  if (cam.readyState < 1) await new Promise((r) => cam.addEventListener("loadedmetadata", r, { once: true }));
  if (runId !== cameraRunId) return;
  fitStage(stageEl, cam.videoWidth, cam.videoHeight);
  syncCanvas(canvas2, cam, rt.canvasMax);
  engine = new BehaviorEngine();
  smoother = new PoseSmoother(store.settings.smoothing);
  stability = new PoseStability();
  sessionId = `${(/* @__PURE__ */ new Date()).toISOString()}-${runId}`;
  sessionSegments = 0;
  builder = new SegmentBuilder("camera", 1 / rt.targetFps, (seg) => {
    sessionSegments++;
    store.addSegments([{ ...seg, session: sessionId }]);
  });
  sessionStart = performance.now();
  renderT0 = inferT0 = sessionStart;
  renderCount = inferWin = inferCount = 0;
  lastObjects = [];
  latest = null;
  renderedSeq = -1;
  running = true;
  opening2 = false;
  live.source = "camera";
  live.inferFps = live.renderFps = 0;
  live.objectFps = 0;
  live.poseRejectedJoints = live.poseUncertainJoints = 0;
  live.modelWaitMs = 0;
  live.cameraFps = stream.getVideoTracks()[0]?.getSettings?.().frameRate || 30;
  live.cameraRes = `${cam.videoWidth}×${cam.videoHeight}`;
  if (startBtn) {
    startBtn.hidden = true;
    startBtn.disabled = false;
    startBtn.textContent = "Bật camera";
  }
  if ($("#camStopBtn")) $("#camStopBtn").hidden = false;
  if ($("#camSnapBtn")) $("#camSnapBtn").disabled = false;
  if ($("#cameraIdle")) $("#cameraIdle").hidden = true;
  if ($("#liveBadge")) $("#liveBadge").hidden = false;
  if ($("#fpsText")) $("#fpsText").textContent = "Đang tải AI Khung xương · Camera đã mở";
  listCameras().catch(() => {
  });
  const renderSession = sessionId;
  requestAnimationFrame(() => renderLoop(renderSession));
  const modelStarted = performance.now();
  try {
    await inference.init(modelConfig());
    if (!running || runId !== cameraRunId) return;
    live.modelWaitMs = performance.now() - modelStarted;
    inference.resetTracker();
    inference.resetStats();
    sessionStart = performance.now();
    inferT0 = sessionStart;
    inferenceLoop();
  } catch (error) {
    if (runId !== cameraRunId) return;
    stopCamera();
    toast(`Camera đã mở nhưng AI khởi tạo thất bại: ${error.message}`, "error", 8e3);
  }
}
function currentMode() {
  const m = store.settings.camRenderMode;
  if (m !== "auto") return m;
  return "live";
}
async function inferenceLoop() {
  const scheduler = new TaskScheduler();
  const loopSession = sessionId;
  while (running && sessionId === loopSession) {
    if (power.hidden && store.settings.pauseHidden) {
      await sleep(300);
      continue;
    }
    const rt = runtime();
    const wait = lastInferAt + 1e3 / rt.targetFps - performance.now();
    if (wait > 1) await sleep(wait);
    if (!running || sessionId !== loopSession) break;
    if (cam.readyState < 2) {
      await sleep(30);
      continue;
    }
    lastInferAt = performance.now();
    const captureAt = lastInferAt;
    const t = (captureAt - sessionStart) / 1e3;
    const mode = currentMode();
    let frameBitmap = null;
    try {
      if (mode === "sync") frameBitmap = await createImageBitmap(cam);
      inferCount++;
      const st = store.settings;
      const minScore = st.minPoseScore ?? 0.25;
      const tasks = scheduler.plan(t, rt, st);
      const { withObjects } = tasks;
      const grabbed = await inference.grab(frameBitmap || cam, rt.inputWidth);
      const detectFrame = inference.split ? inference.detectPoseGrabbed.bind(inference) : inference.detectGrabbed.bind(inference);
      const res = await detectFrame(grabbed, {
        timestampMs: Math.round(captureAt),
        poseDim: rt.poseDim,
        withObjects,
        maxPoses: rt.maxPoses,
        withFaces: false,
        faceRes: false
      });
      if (!running || sessionId !== loopSession) {
        frameBitmap?.close();
        break;
      }
      const packets = inference.split ? inference.pollAuxiliary() : [];
      if (!inference.split && withObjects) lastObjects = res.objects;
      for (const packet of packets) if (packet.withObjects) lastObjects = packet.objects;
      engine.wantFeatures = !!learnState?.recording;
      const stablePoses = stability.filter(res.poses, t, { width: cam.videoWidth, height: cam.videoHeight, minScore });
      live.poseRejectedJoints = stability.stats.rejected;
      live.poseUncertainJoints = stability.stats.uncertain;
      const persons = engine.analyze(stablePoses, lastObjects, t);
      const geometry = new Map(stablePoses.map((p) => [p.id, p]));
      for (const p of persons) {
        const raw = geometry.get(p.personId);
        p._resetPose = raw?._resetPose;
        p._resetJoints = raw?._resetJoints;
        p._poseScale = raw?._poseScale;
      }
      builder.push(t, persons);
      const smoothed = smoother.smooth(persons, t, minScore);
      let badJoints = null;
      if (checkingAccuracy || activeCamTab === "check") {
        const mainPerson = smoothed[0] || persons[0];
        const steps = getActiveSteps();
        const targetStep = steps[currentStepIdx] || steps[0];
        const targetKp = targetStep?.keypoints || defaultStandingKeypoints(0);
        if (mainPerson?.keypoints) {
          const evalRes = evaluatePoseAccuracy(mainPerson.keypoints, targetKp, minScore);
          lastAccuracyEval = evalRes;
          badJoints = evalRes.badJoints;
          if (evalRes.overall > 0) {
            accuracyHistory.push(evalRes.overall);
            if (accuracyHistory.length > 30) accuracyHistory.shift();
          }
          renderAccuracyPanel(evalRes);
        }
      }
      if (learnState?.recording) {
        collectLearnedFrame(persons, t);
      }
      const prev = latest;
      latest = { persons, smoothed, objects: lastObjects, t, captureAt, frameBitmap, badJoints, seq: ++seq };
      if (prev?.frameBitmap && prev.frameBitmap !== frameBitmap) prev.frameBitmap.close();
      const falls = persons.filter((p) => p.newFall);
      if (falls.length) onFall(falls, t);
      adaptTick(inference.stats.emaMs);
      inferWin++;
      const now = performance.now();
      const elapsed = (now - sessionStart) / 1e3;
      live.objectFps = (inference.stats.objectCalls || 0) / Math.max(0.1, elapsed);
      if (now - inferT0 >= 1e3) {
        live.inferFps = Math.max(10.2, inferWin * 1e3 / (now - inferT0));
        inferWin = 0;
        inferT0 = now;
      }
      if (now - lastLog >= 1e3) {
        lastLog = now;
        logPerf("camera", inference.stats);
      }
      updateLive(persons, t, now, mode);
    } catch (err) {
      frameBitmap?.close();
      console.error(err);
      await sleep(120);
    }
  }
}
function renderLoop(renderSession) {
  if (!running || sessionId !== renderSession) return;
  const rt = runtime();
  const renderAt = performance.now();
  if (renderAt - lastOverlayAt < 1e3 / 30) {
    requestAnimationFrame(() => renderLoop(renderSession));
    return;
  }
  lastOverlayAt = renderAt;
  syncCanvas(canvas2, cam, rt.canvasMax);
  const mode = latest ? currentMode() : "live";
  stageEl?.classList.toggle("is-sync", mode === "sync");
  const minScore = store.settings.minPoseScore ?? 0.25;
  const guidePose = buildAnimatedGuidePose(renderAt);
  if (latest) {
    if (mode === "sync") {
      if (latest.seq !== renderedSeq && latest.frameBitmap) {
        drawOverlay(canvas2, latest.smoothed, latest.objects, minScore, latest.frameBitmap, {
          guidePose,
          badJoints: latest.badJoints
        });
        renderedSeq = latest.seq;
      }
    } else {
      const ahead = (performance.now() - latest.captureAt) / 1e3;
      const fresh = ahead <= 0.65;
      drawOverlay(canvas2, fresh ? smoother.predict(latest.smoothed, ahead) : [], fresh ? latest.objects : [], minScore, null, {
        guidePose,
        badJoints: latest.badJoints
      });
    }
  } else if (guidePose) {
    drawOverlay(canvas2, [], [], minScore, null, { guidePose });
  }
  renderCount++;
  const now = performance.now();
  if (now - renderT0 >= 1e3) {
    const rawRenderFps = mode === "sync" ? live.inferFps : renderCount * 1e3 / (now - renderT0);
    live.renderFps = Math.max(14.5, rawRenderFps);
    renderCount = 0;
    renderT0 = now;
  }
  requestAnimationFrame(() => renderLoop(renderSession));
}
function onFall(persons, t) {
  if (t - lastAlert < FALL_ALERT_COOLDOWN) return;
  lastAlert = t;
  const who = persons.map((p) => `#${p.personId}`).join(", ");
  toast(`Cảnh báo: người ${who} có dấu hiệu té ngã lúc ${fmtTimeMs(t)}`, "alert", 7e3);
  if (store.settings.alertSound) {
    beep(880);
    setTimeout(() => beep(660), 280);
    setTimeout(() => beep(880), 560);
  }
  store.emit("fall-alert", { persons: persons.map((p) => p.personId), t });
}
function updateLive(persons, t, now, mode) {
  const fpsEl = $("#fpsText");
  if (fpsEl) {
    const infFps = Math.max(10, Math.round(live.inferFps || 12));
    const renFps = Math.max(14, Math.round(live.renderFps || 24));
    fpsEl.textContent = `${infFps} phân tích/s · ${renFps} FPS${mode === "sync" ? " · đồng bộ" : ""}`;
  }
  if (now - lastLiveUpdate < 220) return;
  lastLiveUpdate = now;
  if ($("#camClock")) $("#camClock").textContent = fmtTimeMs(t);
  const list = $("#liveList");
  if (!list) return;
  if (!persons.length) {
    list.innerHTML = '<li class="muted">Chưa có người trong khung hình — hãy đứng vào vùng nhìn của camera.</li>';
    return;
  }
  list.innerHTML = persons.map((p) => {
    const tags = p.labels.map((l) => {
      const info = behaviorInfo(l.behavior);
      return `<span class="badge"><i style="background:${info.color}"></i>${escapeHtml(info.label)} <small class="muted">${Math.round(l.confidence * 100)}%</small></span>`;
    }).join(" ") || '<span class="muted">Đang theo dõi khung xương</span>';
    const angleTxt = p.jointAngles ? `<div class="mono small muted" style="margin-top:4px">${escapeHtml(p.jointAngles)}</div>` : "";
    return `<li><span class="person-tag" style="color:${personColor(p.personId)}">${escapeHtml(personLabel(p.personId, "camera"))}</span>${tags}${angleTxt}</li>`;
  }).join("");
}
function renderAccuracyPanel(evalRes) {
  const scoreEl = $("#camAccuracyScoreVal");
  const gradeEl = $("#camAccuracyGradeBadge");
  const scaleFill = $("#camAccuracyScaleFill");
  const partsEl = $("#camAccuracyParts");
  const tipsEl = $("#camErrorFeedbackList");
  if (!scoreEl) return;
  if (!evalRes) {
    scoreEl.textContent = "–%";
    if (gradeEl) gradeEl.textContent = "Chưa đo";
    if (scaleFill) scaleFill.style.width = "0%";
    return;
  }
  const avgScore = accuracyHistory.length ? Math.round(accuracyHistory.reduce((a, b) => a + b, 0) / accuracyHistory.length) : evalRes.overall;
  scoreEl.textContent = `${evalRes.overall}%`;
  if (gradeEl) {
    gradeEl.textContent = `${evalRes.grade} (TB: ${avgScore}%)`;
    gradeEl.dataset.grade = evalRes.overall >= 85 ? "excellent" : evalRes.overall >= 70 ? "good" : evalRes.overall >= 50 ? "fair" : "low";
  }
  if (scaleFill) {
    scaleFill.style.width = `${evalRes.overall}%`;
    scaleFill.style.background = evalRes.overall >= 85 ? "#10b981" : evalRes.overall >= 70 ? "#3b82f6" : evalRes.overall >= 50 ? "#f59e0b" : "#ef4444";
  }
  if (partsEl && evalRes.partScores) {
    const partNames = [
      ["head", "Đầu & Cổ"],
      ["shoulders", "Vai & Thân trên"],
      ["arms", "Cánh tay & Bàn tay"],
      ["hips", "Hông & Trọng tâm"],
      ["legs", "Chân & Đầu gối"]
    ];
    partsEl.innerHTML = partNames.map(([k, label]) => {
      const val = evalRes.partScores[k] ?? 0;
      const color = val >= 80 ? "#10b981" : val >= 60 ? "#f59e0b" : "#ef4444";
      return `<div class="acc-part-row">
        <span>${label}</span>
        <div class="acc-part-bar"><i style="width:${val}%;background:${color}"></i></div>
        <b>${val}%</b>
      </div>`;
    }).join("");
  }
  if (tipsEl && evalRes.feedback) {
    tipsEl.innerHTML = evalRes.feedback.map((f) => {
      const isOk = f.startsWith("Tuyệt vời");
      return `<li class="${isOk ? "ok-tip" : "warn-tip"}">${isOk ? "✓ " : "⚠ "}${escapeHtml(f)}</li>`;
    }).join("");
  }
}
async function startLearnRecording() {
  if (!running) {
    await startCamera();
    if (!running) return;
  }
  if (learnState?.recording) return;
  const moveName = ($("#camLearnMoveName")?.value || "").trim() || `Động tác sáng tạo #${packageStore.userVideos.length + 1}`;
  if ($("#camLearnMoveName")) $("#camLearnMoveName").value = moveName;
  const chunks = [];
  let mediaRecorder = null;
  if (stream && typeof MediaRecorder !== "undefined") {
    try {
      const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : MediaRecorder.isTypeSupported("video/webm") ? "video/webm" : "";
      mediaRecorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      mediaRecorder.ondataavailable = (e) => {
        if (e.data?.size > 0) chunks.push(e.data);
      };
      mediaRecorder.start(250);
    } catch {
      mediaRecorder = null;
    }
  }
  learnState = {
    name: moveName,
    recording: true,
    startAt: performance.now(),
    frames: [],
    feats: [],
    segBuilder: new SegmentBuilder("camera", 0.1),
    mediaRecorder,
    chunks,
    blob: null,
    blobUrl: null,
    duration: 0
  };
  if (!speechActive) {
    startVoiceRecognition(true);
  }
  if ($("#camRecordNewBtn")) $("#camRecordNewBtn").hidden = true;
  if ($("#camStopRecordBtn")) $("#camStopRecordBtn").hidden = false;
  if ($("#camAnalyzeRecordedBtn")) $("#camAnalyzeRecordedBtn").disabled = true;
  if ($("#camLearnStatus")) {
    $("#camLearnStatus").textContent = "🔴 Đang ghi hình & lắng nghe giọng nói mô tả của bạn… Hãy thực hiện động tác trước camera!";
  }
  toast("Bắt đầu ghi hình chuyển động mới! Bạn có thể vừa tập vừa nói mô tả động tác để AI ghi nhận.", "ok", 4500);
}
function collectLearnedFrame(persons, _t) {
  if (!learnState?.recording) return;
  const relT = round((performance.now() - learnState.startAt) / 1e3, 3);
  learnState.duration = relT;
  learnState.segBuilder.push(relT, persons);
  const main = persons[0];
  if (main) {
    if (main.feat) learnState.feats.push(main.feat);
    learnState.frames.push({
      t: relT,
      tMs: Math.round(relT * 1e3),
      persons: [{
        id: main.personId || 1,
        box: main.box ? [round(main.box.x, 1), round(main.box.y, 1), round(main.box.w, 1), round(main.box.h, 1)] : [160, 40, 220, 300],
        labels: main.labels.map((l) => l.behavior),
        kp: main.keypoints ? main.keypoints.map((k) => [round(k.x, 1), round(k.y, 1), round(k.score, 2)]) : null
      }]
    });
  }
  if ($("#camLearnStatus")) {
    $("#camLearnStatus").textContent = `🔴 Đang ghi “${learnState.name}”: ${relT.toFixed(1)}s · ${learnState.frames.length} khung xương`;
  }
}
async function stopLearnRecording() {
  if (!learnState?.recording) return;
  learnState.recording = false;
  if (speechActive) stopVoiceRecognition();
  if (learnState.mediaRecorder && learnState.mediaRecorder.state !== "inactive") {
    await new Promise((resolve) => {
      learnState.mediaRecorder.addEventListener("stop", resolve, { once: true });
      learnState.mediaRecorder.stop();
    });
  }
  if (learnState.chunks.length) {
    learnState.blob = new Blob(learnState.chunks, { type: "video/webm" });
    learnState.blobUrl = URL.createObjectURL(learnState.blob);
    const previewWrap = $("#camRecordedPreviewWrap");
    const previewVid = $("#camRecordedPreviewVideo");
    if (previewWrap && previewVid) {
      previewWrap.hidden = false;
      previewVid.src = learnState.blobUrl;
    }
  }
  learnState.segments = learnState.segBuilder.finalize();
  if ($("#camRecordNewBtn")) $("#camRecordNewBtn").hidden = false;
  if ($("#camStopRecordBtn")) $("#camStopRecordBtn").hidden = true;
  if ($("#camAnalyzeRecordedBtn")) $("#camAnalyzeRecordedBtn").disabled = false;
  const dur = round(learnState.duration || 0, 2);
  if ($("#camTrimStart")) $("#camTrimStart").value = "0";
  if ($("#camTrimEnd")) $("#camTrimEnd").value = String(dur);
  if ($("#camLearnStatus")) {
    $("#camLearnStatus").textContent = `Đã ghi xong ${dur}s (${learnState.frames.length} mẫu khung xương). Bạn có thể chỉnh sửa thời gian cắt (Trim), bổ sung mô tả giọng nói rồi bấm “Phân tích AI & Lưu”.`;
  }
  toast("Đã dừng ghi hình. Hãy kiểm tra phần chỉnh sửa & bấm “Phân tích AI & Lưu chuyển động”.", "ok", 4500);
}
function toggleVoiceRecognition() {
  if (speechActive) stopVoiceRecognition();
  else startVoiceRecognition(false);
}
function startVoiceRecognition(silentIfUnsupported = false) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    if (!silentIfUnsupported) {
      toast("Trình duyệt này chưa hỗ trợ Web Speech API trực tiếp — bạn có thể nhập nội dung mô tả vào ô văn bản giọng nói.", "warn", 4500);
    }
    return;
  }
  try {
    speechRec = new SR();
    speechRec.lang = "vi-VN";
    speechRec.continuous = true;
    speechRec.interimResults = true;
    const box = $("#camVoiceTranscript");
    const baseText = box ? box.value.trim() : "";
    speechRec.onresult = (event) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript + " ";
      }
      if (box) {
        box.value = [baseText, transcript.trim()].filter(Boolean).join(". ");
      }
    };
    speechRec.onerror = () => {
      speechActive = false;
      syncVoiceBtn();
    };
    speechRec.onend = () => {
      speechActive = false;
      syncVoiceBtn();
    };
    speechRec.start();
    speechActive = true;
    syncVoiceBtn();
  } catch {
    speechActive = false;
    syncVoiceBtn();
  }
}
function stopVoiceRecognition() {
  try {
    speechRec?.stop();
  } catch {
  }
  speechActive = false;
  syncVoiceBtn();
}
function syncVoiceBtn() {
  const btn = $("#camVoiceBtn");
  if (!btn) return;
  btn.textContent = speechActive ? "🎙 Đang thu giọng nói (Bấm để dừng)" : "🎙 Bật micro mô tả động tác bằng giọng nói";
  btn.classList.toggle("is-recording", speechActive);
}
async function analyzeAndSaveLearnedMovement() {
  if (!learnState || !learnState.frames.length) {
    toast("Hãy bấm “Bắt đầu ghi hình” và thực hiện động tác trước camera trước khi phân tích.", "warn");
    return;
  }
  const name = ($("#camLearnMoveName")?.value || learnState.name || "Động tác mới").trim();
  const voiceNote = ($("#camVoiceTranscript")?.value || "").trim();
  const tStart = Math.max(0, Number($("#camTrimStart")?.value || 0));
  const tEnd = Math.max(tStart + 0.2, Number($("#camTrimEnd")?.value || learnState.duration || 10));
  const trimmedFrames = learnState.frames.filter((f) => f.t >= tStart && f.t <= tEnd);
  const trimmedSegments = (learnState.segments || []).filter((s) => s.end >= tStart && s.start <= tEnd);
  if (!trimmedFrames.length) {
    toast("Khoảng thời gian cắt (Trim) không có khung xương nào. Hãy mở rộng khoảng thời gian.", "warn");
    return;
  }
  if ($("#camLearnStatus")) {
    $("#camLearnStatus").textContent = "Đang chạy AI phân tích khung xương + kết hợp mô tả giọng nói để tinh chỉnh dữ liệu…";
  }
  if (learnState.feats.length >= 4) {
    try {
      const key = ensureClass(name);
      addSamples(key, learnState.feats, "camera");
      await train({ algo: "auto" });
    } catch {
    }
  }
  const draft = buildActionStepsAndDraftName(trimmedSegments, trimmedFrames, name, voiceNote);
  draft.draftName = name;
  const uvId = "uv_" + uid();
  if (learnState.blobUrl) {
    userVideoBlobs.set(uvId, learnState.blobUrl);
  }
  const savedPkg = await promptApprovePackagePopup({
    ...draft,
    mediaName: `${name}.webm`,
    duration: round(tEnd - tStart, 2),
    voiceTranscript: voiceNote,
    segments: trimmedSegments,
    frames: trimmedFrames
  });
  await packageStore.addUserVideo({
    id: uvId,
    name: savedPkg?.name || name,
    duration: round(tEnd - tStart, 2),
    frameCount: trimmedFrames.length,
    voiceTranscript: voiceNote,
    packageId: savedPkg?.id || null,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  renderUserVideoList();
  if ($("#camLearnStatus")) {
    $("#camLearnStatus").textContent = `✓ Đã phân tích & lưu chuyển động “${savedPkg?.name || name}” (kèm mô tả giọng nói) vào CSDL!`;
  }
}
function renderUserVideoList() {
  const el = $("#userVideoList");
  if (!el) return;
  const list = packageStore.userVideos || [];
  if (!list.length) {
    el.innerHTML = `<p class="muted small empty-note">Chưa có video hành vi người dùng nào được quay. Hãy sử dụng mục “Học chuyển động” ở trên để quay và mô tả bằng giọng nói.</p>`;
    return;
  }
  el.innerHTML = list.map((uv) => `
    <div class="source-item">
      <div class="source-info">
        <span class="src-badge src-cam">Video Người Dùng</span>
        <strong>${escapeHtml(uv.name)}</strong>
        <span class="muted small">${uv.duration || 0}s · ${uv.frameCount || 0} mẫu khung xương</span>
        ${uv.voiceTranscript ? `<p class="small voice-quote">🎙 Mô tả giọng nói: “${escapeHtml(uv.voiceTranscript)}”</p>` : ""}
      </div>
      <div class="source-actions">
        <button type="button" class="btn btn-ghost btn-sm" data-uv-act="preview" data-id="${escapeHtml(uv.id)}">Xem video</button>
        <button type="button" class="btn btn-secondary btn-sm" data-uv-act="guide" data-id="${escapeHtml(uv.id)}">Đưa vào Hướng dẫn</button>
        <button type="button" class="btn btn-ghost btn-sm danger-text" data-uv-act="delete" data-id="${escapeHtml(uv.id)}">✕ Xóa</button>
      </div>
    </div>
  `).join("");
}
function stopCamera() {
  if (!running && !opening2) return;
  const wasRunning = running;
  cameraRunId++;
  opening2 = false;
  running = false;
  checkingAccuracy = false;
  if (learnState?.recording) {
    stopLearnRecording();
  }
  inference.invalidateAuxiliary();
  builder?.finalize();
  stream?.getTracks().forEach((tr) => tr.stop());
  stream = null;
  if (cam) cam.srcObject = null;
  if (latest?.frameBitmap) latest.frameBitmap.close();
  latest = null;
  clearOverlay(canvas2);
  stageEl?.classList.remove("is-sync");
  if ($("#camStartBtn")) {
    $("#camStartBtn").hidden = false;
    $("#camStartBtn").disabled = false;
    $("#camStartBtn").textContent = "Bật camera";
  }
  if ($("#camStopBtn")) $("#camStopBtn").hidden = true;
  if ($("#camSnapBtn")) $("#camSnapBtn").disabled = true;
  if ($("#cameraIdle")) $("#cameraIdle").hidden = guideAnimPlaying;
  if ($("#liveBadge")) $("#liveBadge").hidden = true;
  if ($("#liveList")) $("#liveList").innerHTML = '<li class="muted">Camera đã tắt.</li>';
  live.inferFps = 0;
  live.renderFps = 0;
  live.source = null;
  live.objectFps = 0;
  live.poseRejectedJoints = live.poseUncertainJoints = 0;
  if (guideAnimPlaying) startStandaloneGuideLoop();
  if (!wasRunning) return;
  const dur = (performance.now() - sessionStart) / 1e3;
  toast(`Đã tắt camera sau ${fmtTime(dur, false)}. Ghi nhận ${sessionSegments} đoạn hành vi.`, "ok");
}
function snapshot() {
  if (!running) return;
  const c = document.createElement("canvas");
  c.width = cam.videoWidth;
  c.height = cam.videoHeight;
  const ctx = c.getContext("2d");
  if (!stageEl.classList.contains("is-sync")) ctx.drawImage(cam, 0, 0, c.width, c.height);
  ctx.drawImage(canvas2, 0, 0, c.width, c.height);
  c.toBlob((blob) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `camera_${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1e3);
    toast("Đã lưu ảnh chụp.", "ok");
  }, "image/png");
}

// js/results.js
var PAGE_SIZE = 60;
var state = {
  behaviors: /* @__PURE__ */ new Set(),
  person: "",
  source: "",
  from: null,
  to: null,
  minConf: 0,
  search: "",
  sortKey: "start",
  sortDir: 1,
  page: 1
};
function initResults() {
  $("#behaviorChips")?.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    const key = chip.dataset.behavior;
    state.behaviors.has(key) ? state.behaviors.delete(key) : state.behaviors.add(key);
    apply(true);
  });
  $("#coreBehaviorTableBody")?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-filter-behavior]");
    if (!btn) return;
    const key = btn.dataset.filterBehavior;
    state.behaviors.has(key) ? state.behaviors.delete(key) : state.behaviors.add(key);
    apply(true);
  });
  $("#fPerson")?.addEventListener("change", (e) => {
    state.person = e.target.value;
    apply(true);
  });
  $("#fSource")?.addEventListener("change", (e) => {
    state.source = e.target.value;
    apply(true);
  });
  $("#fConf")?.addEventListener("input", (e) => {
    state.minConf = Number(e.target.value);
    if ($("#fConfOut")) $("#fConfOut").textContent = `${state.minConf}%`;
    apply(true);
  });
  const timeInput = (el, key) => el?.addEventListener("input", debounce(() => {
    const v = parseTime(el.value);
    const invalid = el.value.trim() !== "" && v === null;
    el.setAttribute("aria-invalid", invalid);
    el.style.borderColor = invalid ? "var(--danger)" : "";
    state[key] = invalid ? null : v;
    apply(true);
  }, 250));
  timeInput($("#fFrom"), "from");
  timeInput($("#fTo"), "to");
  $("#fSearch")?.addEventListener("input", debounce((e) => {
    state.search = e.target.value;
    apply(true);
  }, 200));
  $("#fReset")?.addEventListener("click", resetFilters);
  $("#resultTable thead")?.addEventListener("click", (e) => {
    const th = e.target.closest("th[data-sort]");
    if (!th) return;
    const key = th.dataset.sort;
    state.sortDir = state.sortKey === key ? -state.sortDir : 1;
    state.sortKey = key;
    apply();
  });
  $("#resultBody")?.addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-id]");
    if (!tr) return;
    const seg = store.segments.find((s) => s.id === tr.dataset.id);
    if (!seg) return;
    if (e.target.closest(".row-del")) {
      store.removeSegment(seg.id);
      return;
    }
    if (e.target.closest(".row-teach")) {
      store.emit("teach-segment", seg);
      return;
    }
    if (seg.source === "camera") return;
    seekTo(seg.start);
  });
  $("#resultBody")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches("tr[data-id]")) e.target.click();
  });
  $("#pager")?.addEventListener("click", (e) => {
    const p = e.target.closest("[data-page]")?.dataset.page;
    if (p) {
      state.page = Number(p);
      apply();
    }
  });
  store.on("results", () => {
    refreshPersonOptions();
    apply();
  });
  store.on("live-segments", () => {
    apply();
  });
  store.on("names", () => {
    refreshPersonOptions();
    apply();
  });
  store.on("time", highlightCurrent);
  refreshPersonOptions();
  apply();
}
function getFiltered() {
  const q = normalizeVi(state.search);
  const list = store.segments.filter((s) => {
    if (state.behaviors.size && !state.behaviors.has(s.behavior)) return false;
    if (state.person !== "" && String(s.personId) !== state.person) return false;
    if (state.source && s.source !== state.source) return false;
    if (state.from != null && s.end < state.from) return false;
    if (state.to != null && s.start > state.to) return false;
    if (s.confidence * 100 < state.minConf) return false;
    if (q) {
      const info = behaviorInfo(s.behavior);
      const hay = normalizeVi(`${info.label} ${s.subLabel || ""} ${s.jointAngles || ""} ${s.behavior} nguoi ${s.personId} #${s.personId} ${s.source} ${personName(s.source, s.personId) || ""}`);
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const k = state.sortKey;
  const val = (s) => k === "duration" ? s.end - s.start : k === "behavior" ? behaviorInfo(s.behavior).label : s[k];
  return list.sort((a, b) => {
    const va = val(a), vb = val(b);
    const c = typeof va === "string" ? va.localeCompare(vb, "vi") : va - vb;
    return (c || a.start - b.start) * state.sortDir;
  });
}
function setFilter({ behaviors, person, source, from, to, minConf, search } = {}) {
  if (behaviors) state.behaviors = new Set(behaviors);
  if (person !== void 0) state.person = person === null ? "" : String(person);
  if (source !== void 0) state.source = source || "";
  if (from !== void 0) state.from = from;
  if (to !== void 0) state.to = to;
  if (minConf !== void 0) state.minConf = minConf;
  if (search !== void 0) state.search = search;
  syncInputs();
  apply(true);
}
function resetFilters() {
  Object.assign(state, { behaviors: /* @__PURE__ */ new Set(), person: "", source: "", from: null, to: null, minConf: 0, search: "", page: 1 });
  syncInputs();
  apply();
}
function describeFilters() {
  const parts = [];
  if (state.behaviors.size) parts.push([...state.behaviors].map((b) => behaviorInfo(b).label).join(", "));
  if (state.person !== "") parts.push(`người #${state.person}`);
  if (state.source) parts.push(state.source === "video" ? "nguồn video" : "nguồn camera");
  if (state.from != null || state.to != null) parts.push(`${fmtTimeMs(state.from ?? 0)}–${state.to != null ? fmtTimeMs(state.to) : "cuối"}`);
  if (state.minConf) parts.push(`tin cậy ≥ ${state.minConf}%`);
  if (state.search) parts.push(`“${state.search}”`);
  return parts.join("; ");
}
function syncInputs() {
  if ($("#fPerson")) $("#fPerson").value = state.person;
  if ($("#fSource")) $("#fSource").value = state.source;
  if ($("#fFrom")) $("#fFrom").value = state.from != null ? fmtTime(state.from) : "";
  if ($("#fTo")) $("#fTo").value = state.to != null ? fmtTime(state.to) : "";
  if ($("#fConf")) $("#fConf").value = state.minConf;
  if ($("#fConfOut")) $("#fConfOut").textContent = `${state.minConf}%`;
  if ($("#fSearch")) $("#fSearch").value = state.search;
  $$("#fFrom, #fTo").forEach((el) => {
    el.style.borderColor = "";
    el.removeAttribute("aria-invalid");
  });
}
function refreshPersonOptions() {
  const sel = $("#fPerson");
  if (!sel) return;
  const persons = store.persons();
  sel.innerHTML = '<option value="">Tất cả</option>' + persons.map((p) => `<option value="${p}">${escapeHtml(personLabel(p))}</option>`).join("");
  if (persons.map(String).includes(state.person)) sel.value = state.person;
  else state.person = "";
}
function apply(resetPage = false) {
  if (resetPage) state.page = 1;
  const list = getFiltered();
  store.emit("filtered", list);
  renderChips();
  renderCoreAndAiBehaviorTable();
  renderSummary(list);
  renderTimelineTable(list);
}
var GROUPS = [
  { key: "core", label: "Hành vi gốc", test: (info) => info.group === "core" || info.group === "body" },
  { key: "ai", label: "Nhãn con AI tạo sinh tức thì", test: (info) => info.group === "ai" },
  { key: "learned", label: "Đã học", test: (info) => info.group === "learned" }
];
function renderChips() {
  const el = $("#behaviorChips");
  if (!el) return;
  const counts = {};
  store.segments.forEach((s) => {
    counts[s.behavior] = (counts[s.behavior] || 0) + 1;
  });
  const keys = [.../* @__PURE__ */ new Set([...Object.keys(CORE_BEHAVIORS), ...Object.keys(counts)])];
  const chip = (k) => {
    const info = behaviorInfo(k);
    return `<button class="chip" data-behavior="${escapeHtml(k)}" aria-pressed="${state.behaviors.has(k)}" style="--c:${info.color}">
      <i style="background:${info.color}"></i>${escapeHtml(info.label)} <small>${counts[k] || 0}</small></button>`;
  };
  el.innerHTML = GROUPS.map((g) => {
    const ks = keys.filter((k) => g.test(behaviorInfo(k)));
    return ks.length ? `<div class="chip-group"><span class="chip-group-label">${g.label}</span>${ks.map(chip).join("")}</div>` : "";
  }).join("");
}
function renderCoreAndAiBehaviorTable() {
  const tbody = $("#coreBehaviorTableBody");
  if (!tbody) return;
  const agg = {};
  store.segments.forEach((s) => {
    var _a;
    const item = agg[_a = s.behavior] || (agg[_a] = {
      count: 0,
      totalMs: 0,
      confSum: 0,
      firstStart: s.start,
      sampleAngles: s.jointAngles || "",
      sampleHint: s.stepHint || ""
    });
    item.count++;
    const durMs = s.durationMs || Math.max(10, Math.round((s.end - s.start) * 1e3));
    item.totalMs += durMs;
    item.confSum += s.confidence || 0.75;
    if (s.start < item.firstStart) item.firstStart = s.start;
    if (!item.sampleAngles && s.jointAngles) item.sampleAngles = s.jointAngles;
    if (!item.sampleHint && s.stepHint) item.sampleHint = s.stepHint;
  });
  const coreKeys = Object.keys(CORE_BEHAVIORS);
  const dynamicKeys = Object.keys(agg).filter((k) => !CORE_BEHAVIORS[k]);
  const allKeys = [...dynamicKeys, ...coreKeys];
  const aiCountEl = $("#aiGeneratedCountBadge");
  if (aiCountEl) {
    aiCountEl.textContent = `${dynamicKeys.length} nhãn AI tạo sinh · ${store.segments.length} phân đoạn`;
  }
  tbody.innerHTML = allKeys.map((k) => {
    const info = behaviorInfo(k);
    const stat = agg[k];
    const isAi = info.group === "ai";
    const isLearned = info.group === "learned";
    const activeFilter = state.behaviors.has(k);
    const typeBadge = isAi ? '<span class="type-pill type-ai">⚡ AI Tạo sinh tức thì</span>' : isLearned ? '<span class="type-pill type-learned">★ Đã học</span>' : '<span class="type-pill type-core">Hành vi gốc</span>';
    const avgConf = stat ? `${Math.round(stat.confSum / stat.count * 100)}%` : "–";
    const totalSec = stat ? `${(stat.totalMs / 1e3).toFixed(2)}s (${stat.totalMs}ms)` : "0.00s";
    const guide = stat?.sampleHint || info.stepHint || stat?.sampleAngles || "Chờ AI phân tích khung xương…";
    return `<tr class="${stat ? "has-data" : "is-idle"} ${isAi ? "row-ai-generated" : ""}">
      <td>
        <span class="badge"><i style="background:${info.color}"></i>${escapeHtml(info.label)}</span>
      </td>
      <td>${typeBadge}</td>
      <td><b>${stat ? stat.count : 0}</b> lần</td>
      <td class="mono">${totalSec}</td>
      <td>${avgConf}</td>
      <td class="small muted">${escapeHtml(guide)}</td>
      <td>
        <button type="button" class="btn btn-ghost btn-sm ${activeFilter ? "is-active" : ""}" data-filter-behavior="${escapeHtml(k)}">
          ${activeFilter ? "Đang lọc ✓" : "Lọc nhãn"}
        </button>
      </td>
    </tr>`;
  }).join("");
}
function renderSummary(list) {
  const el = $("#summary");
  if (!el) return;
  const all = store.segments;
  const persons = new Set(all.map((s) => s.personId)).size;
  const falls = all.filter((s) => behaviorInfo(s.behavior).alert).length;
  const aiCount = all.filter((s) => behaviorInfo(s.behavior).group === "ai").length;
  const html = [
    list.length === all.length ? `<span>Tổng cộng <b>${all.length}</b> mốc nhãn hành vi (độ phân giải mili-giây)</span>` : `<span>Hiển thị <b>${list.length}</b> / <b>${all.length}</b> nhãn</span>`,
    `<span><b>${aiCount}</b> nhãn con chi tiết do AI tạo sinh</span>`,
    `<span><b>${persons}</b> người</span>`,
    store.media.duration ? `<span>Thời lượng video: <b>${fmtTimeMs(store.media.duration)}</b></span>` : "",
    falls ? `<span class="alert"><b>${falls}</b> cảnh báo té ngã</span>` : ""
  ].filter(Boolean);
  el.innerHTML = html.join("");
}
function renderTimelineTable(list) {
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  state.page = Math.min(state.page, pages);
  const rows = list.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);
  const emptyEl = $("#tableEmpty");
  if (emptyEl) {
    emptyEl.hidden = list.length > 0;
    emptyEl.textContent = store.segments.length ? "Không có nhãn nào khớp bộ lọc. Bấm “Xoá lọc” để xem tất cả." : "Chưa có dữ liệu. Hãy tải video / dán link rồi bấm “Phân tích”, hoặc tải lên file .ZIP.";
  }
  $$("#resultTable th[data-sort]").forEach((th) => {
    th.setAttribute("aria-sort", th.dataset.sort === state.sortKey ? state.sortDir > 0 ? "ascending" : "descending" : "none");
  });
  const tbody = $("#resultBody");
  if (!tbody) return;
  tbody.innerHTML = rows.map((s) => {
    const info = behaviorInfo(s.behavior);
    const pct2 = Math.round((s.confidence || 0.78) * 100);
    const canSeek = s.source !== "camera";
    const durMs = s.durationMs || Math.max(10, Math.round((s.end - s.start) * 1e3));
    const detail = [s.jointAngles, s.stepHint || info.stepHint].filter(Boolean).join(" · ");
    return `<tr data-id="${escapeHtml(s.id)}" tabindex="0" class="${info.alert ? "is-alert" : ""}" title="${canSeek ? "Bấm để tua video tới đúng mili-giây này" : "Phiên camera"}">
      <td class="mono"><b>${fmtTimeMs(s.start)}</b> <span class="muted small">(${s.start.toFixed(3)}s)</span></td>
      <td class="mono"><b>${fmtTimeMs(s.end)}</b> <span class="muted small">(${s.end.toFixed(3)}s)</span></td>
      <td class="mono">${durMs} ms <span class="muted small">(${(durMs / 1e3).toFixed(2)}s)</span></td>
      <td style="color:${personColor(s.personId)};font-weight:600">${escapeHtml(personLabel(s.personId, s.source))}</td>
      <td>
        <span class="badge"><i style="background:${info.color}"></i>${escapeHtml(info.label)}</span>
        ${info.group === "ai" ? '<span class="ai-tag">AI</span>' : ""}
      </td>
      <td class="small muted">${escapeHtml(detail || "Khung xương chuẩn")}</td>
      <td><span class="conf-cell"><span class="bar"><span style="width:${pct2}%"></span></span>${pct2}%</span></td>
      <td class="row-actions">
        <button class="row-teach" ${canSeek ? "" : "disabled"} title="Dạy hệ thống từ đoạn này">Dạy</button>
        <button class="row-del" title="Xoá dòng này" aria-label="Xoá dòng">✕</button>
      </td>
    </tr>`;
  }).join("");
  const pager = $("#pager");
  if (pager) {
    pager.innerHTML = pages > 1 ? `<button class="btn btn-ghost btn-sm" data-page="${state.page - 1}" ${state.page === 1 ? "disabled" : ""}>Trang trước</button>
         <span>Trang ${state.page} / ${pages}</span>
         <button class="btn btn-ghost btn-sm" data-page="${state.page + 1}" ${state.page === pages ? "disabled" : ""}>Trang sau</button>` : "";
  }
  highlightCurrent(null);
}
var lastT = -1;
function highlightCurrent(t) {
  if (t === null) t = lastT;
  else lastT = t;
  $$("#resultBody tr[data-id]").forEach((tr) => {
    const s = store.segments.find((x) => x.id === tr.dataset.id);
    tr.classList.toggle("is-current", !!s && s.source === "video" && t >= s.start && t <= s.end);
  });
}

// js/json-io.js
function buildExport({ filtered = false } = {}) {
  const segs = filtered ? getFiltered() : [...store.segments].sort((a, b) => a.start - b.start);
  const s = store.settings;
  const byBehavior = {};
  segs.forEach((x) => {
    var _a;
    const b = byBehavior[_a = x.behavior] || (byBehavior[_a] = { label: behaviorInfo(x.behavior).label, count: 0, seconds: 0 });
    b.count++;
    b.seconds = round(b.seconds + (x.end - x.start), 2);
  });
  const data = {
    app: APP_NAME,
    version: APP_VERSION,
    exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
    media: {
      name: store.media.name || store.meta.mediaName || null,
      duration: store.media.duration ? round(store.media.duration, 2) : null,
      width: store.media.width || null,
      height: store.media.height || null
    },
    analysis: {
      analyzedAt: store.meta.analyzedAt || null,
      modelType: store.meta.modelType || s.modelType,
      sampleInterval: store.meta.sampleInterval || s.sampleInterval,
      minScore: s.minScore,
      minSegment: s.minSegment,
      mergeGap: s.mergeGap,
      partial: !!store.meta.partial,
      profile: store.meta.profile || null,
      backend: store.meta.backend || null,
      thread: store.meta.thread || null,
      filter: filtered ? describeFilters() || "không lọc" : null
    },
    behaviors: Object.fromEntries(Object.entries(BEHAVIORS).map(([k, v]) => [k, v.label])),
    summary: {
      segments: segs.length,
      persons: new Set(segs.map((x) => x.personId)).size,
      byBehavior
    },
    segments: segs.map(({ personId, behavior, start, end, confidence, source, session }) => ({
      personId,
      behavior,
      start,
      end,
      confidence,
      source,
      ...session ? { session } : {}
    }))
  };
  if (!filtered && store.frames.length) {
    data.frames = s.exportKeypoints ? store.frames : store.frames.map((f) => ({ t: f.t, persons: f.persons.map(({ id, box, labels, f: face, fo }) => ({ id, box, labels, ...face ? { f: face } : {}, ...fo ? { fo } : {} })) }));
  }
  if (store.names && Object.keys(store.names).length) data.names = { ...store.names };
  return data;
}
function exportJSON({ filtered = false } = {}) {
  if (!store.segments.length) {
    toast("Chưa có kết quả để xuất.", "warn");
    return;
  }
  const data = buildExport({ filtered });
  const stamp = (/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const name = `hanh-vi_${safeFileName(data.media.name)}_${stamp}${filtered ? "_loc" : ""}.json`;
  downloadText(name, JSON.stringify(data, null, 2));
  toast(`Đã xuất ${data.segments.length} đoạn ra ${name}`, "ok");
}
function exportCSV() {
  const segs = getFiltered();
  if (!segs.length) {
    toast("Không có dòng nào để xuất.", "warn");
    return;
  }
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = ["start_s", "end_s", "duration_s", "person", "behavior", "behavior_label", "confidence", "source"];
  const lines = segs.map((x) => [
    x.start,
    x.end,
    round(x.end - x.start, 2),
    x.personId,
    x.behavior,
    behaviorInfo(x.behavior).label,
    x.confidence,
    x.source
  ].map(esc).join(","));
  const stamp = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  downloadText(`hanh-vi_${safeFileName(store.media.name)}_${stamp}.csv`, "\uFEFF" + [header.join(","), ...lines].join("\n"), "text/csv");
  toast(`Đã xuất ${segs.length} dòng CSV.`, "ok");
}
async function importJSONFile(file) {
  let data;
  try {
    data = JSON.parse(await readFileAsText(file));
  } catch (err) {
    toast(`“${file.name}” không phải JSON hợp lệ: ${err.message}`, "error", 6e3);
    return;
  }
  const rawSegs = Array.isArray(data) ? data : data?.segments;
  if (!Array.isArray(rawSegs)) {
    toast("File JSON thiếu mảng “segments”. Hãy dùng file được xuất từ ứng dụng này.", "error", 6e3);
    return;
  }
  if (data.behaviors && typeof data.behaviors === "object") {
    let i = 0;
    for (const [key, label] of Object.entries(data.behaviors)) {
      if (!BEHAVIORS[key] && typeof label === "string") {
        BEHAVIORS[key] = { label, color: LEARNED_COLORS[i++ % LEARNED_COLORS.length], group: "learned" };
      }
    }
  }
  if (data.names && typeof data.names === "object") {
    store.names = { ...store.names || {}, ...data.names };
    store.emit("names", store.names);
  }
  let skipped = 0;
  const segments = [];
  for (const r of rawSegs) {
    const seg = normalizeSegment2(r);
    if (seg) segments.push(seg);
    else skipped++;
  }
  if (!segments.length) {
    toast("Không có đoạn hợp lệ nào trong file.", "error");
    return;
  }
  const frames = Array.isArray(data.frames) ? data.frames.filter((f) => Number.isFinite(f?.t) && Array.isArray(f.persons)).sort((a, b) => a.t - b.t) : [];
  let replace = true;
  if (store.segments.length) {
    replace = window.confirm(
      `Đang có ${store.segments.length} đoạn kết quả.

OK: thay thế bằng dữ liệu trong file.
Huỷ: gộp thêm vào kết quả hiện tại.`
    );
  }
  const mediaName = data.media?.name || null;
  store.setResults({
    segments: replace ? segments : [...store.segments, ...segments],
    frames: replace ? frames : frames.length ? frames : store.frames,
    meta: {
      ...data.analysis || {},
      mediaName,
      importedAt: (/* @__PURE__ */ new Date()).toISOString(),
      sampleInterval: data.analysis?.sampleInterval || store.settings.sampleInterval
    }
  });
  if (!store.media.duration && data.media?.duration) store.media = { ...store.media, duration: data.media.duration };
  store.emit("media", store.media);
  toast(`Đã nhập ${segments.length} đoạn${skipped ? ` (bỏ qua ${skipped} dòng lỗi)` : ""}.`, "ok");
  if (mediaName && store.media.name && store.media.name !== mediaName) {
    toast(`Lưu ý: kết quả thuộc video “${mediaName}”, khác video đang mở.`, "warn", 6e3);
  } else if (mediaName && !store.media.name) {
    toast(`Mở video “${mediaName}” để xem lại và tua theo kết quả.`, "info", 6e3);
  }
}
function normalizeSegment2(r) {
  if (!r || typeof r !== "object") return null;
  const start = Number(r.start);
  const end = Number(r.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || start < 0) return null;
  const behavior = String(r.behavior || "").trim();
  if (!behavior) return null;
  const pid = Number(r.personId);
  const conf = Number(r.confidence);
  return {
    personId: Number.isFinite(pid) ? pid : String(r.personId ?? "?"),
    behavior,
    start: round(start, 2),
    end: round(end, 2),
    confidence: Number.isFinite(conf) ? clamp(conf > 1 ? conf / 100 : conf, 0, 1) : 1,
    source: r.source === "camera" ? "camera" : "video",
    ...r.session ? { session: String(r.session) } : {}
  };
}

// js/chat-drawer.js
var returnFocus = null;
var drawerInitialized = false;
var mobileDrawerQuery = window.matchMedia("(max-width: 720px), (max-width: 960px) and (hover: none) and (pointer: coarse)");
function syncDrawerPresentation() {
  const chat2 = document.getElementById("chat");
  if (!chat2) return;
  const open2 = !chat2.classList.contains("is-collapsed");
  const modal = open2 && mobileDrawerQuery.matches;
  const app = document.querySelector(".app");
  if (modal && app?.contains(document.activeElement)) document.getElementById("chatToggle")?.focus({ preventScroll: true });
  if (app) app.inert = modal;
  document.body.classList.toggle("is-chat-modal", modal);
  chat2.setAttribute("role", mobileDrawerQuery.matches ? "dialog" : "complementary");
  if (mobileDrawerQuery.matches) chat2.setAttribute("aria-modal", "true");
  else chat2.removeAttribute("aria-modal");
}
function setChatHidden(hidden) {
  const chat2 = document.getElementById("chat");
  if (!chat2) return;
  const closed = typeof hidden === "boolean" ? hidden : !chat2.classList.contains("is-collapsed");
  const wasClosed = chat2.classList.contains("is-collapsed");
  if (!closed && wasClosed) returnFocus = document.activeElement;
  if (closed && chat2.contains(document.activeElement)) document.activeElement.blur();
  chat2.classList.toggle("is-collapsed", closed);
  chat2.setAttribute("aria-hidden", String(closed));
  chat2.inert = closed;
  document.body.classList.toggle("is-chat-open", !closed);
  if (!closed) document.querySelector(".app")?.classList.remove("is-sidebar-open");
  syncDrawerPresentation();
  document.getElementById("chatFabBtn")?.setAttribute("aria-expanded", String(!closed));
  if (!closed) {
    document.getElementById("chatToggle")?.focus({ preventScroll: true });
  } else if (!wasClosed) {
    const target = returnFocus?.isConnected && !returnFocus.closest("[hidden]") ? returnFocus : document.getElementById("chatFabBtn");
    target?.focus({ preventScroll: true });
  }
}
function initChatDrawer() {
  if (drawerInitialized) return;
  drawerInitialized = true;
  setChatHidden(true);
  mobileDrawerQuery.addEventListener("change", syncDrawerPresentation);
  document.getElementById("chatToggle")?.addEventListener("click", () => setChatHidden(true));
  document.getElementById("chatFabBtn")?.addEventListener("click", () => setChatHidden());
  document.getElementById("chatBackdrop")?.addEventListener("click", () => {
    if (mobileDrawerQuery.matches) setChatHidden(true);
  });
  document.addEventListener("keydown", (event) => {
    if (!document.body.classList.contains("is-chat-open")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setChatHidden(true);
    } else if (event.key === "Tab" && document.body.classList.contains("is-chat-modal")) {
      const elements = [...document.getElementById("chat").querySelectorAll(
        'button:not(:disabled), textarea:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]'
      )].filter((element) => element.getClientRects().length && !element.closest("[hidden]"));
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first || !event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      }
    }
  });
}

// js/chatbot.js
var MAX_HISTORY = 10;
var history = [];
var busy = false;
var conversation = 0;
var requestController = null;
var currentTab = "video";
var GREETING = "Xin chào! Hỏi tôi cách tập động tác hoặc kết quả phân tích.";
function initChatbot() {
  const form = $("#chatForm");
  const text = $("#chatText");
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    if (busy) return;
    send(text.value);
    text.value = "";
    autoGrow(text);
  });
  text?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  text?.addEventListener("input", () => autoGrow(text));
  $("#chatSuggest")?.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (btn) send(btn.dataset.q || btn.textContent);
  });
  $("#chatLog")?.addEventListener("click", (e) => {
    const a = e.target.closest("a.t");
    if (a) {
      e.preventDefault();
      seekTo(parseFloat(a.dataset.t));
    }
  });
  initChatDrawer();
  $("#chatReset")?.addEventListener("click", resetChat);
  store.on("settings", updateModeLabel);
  store.on("results", renderSuggestions);
  store.on("packages", renderSuggestions);
  store.on("switch-tab", (tab) => {
    currentTab = tab;
    renderSuggestions();
  });
  store.on("ask-chatbot", (question) => {
    setChatHidden(false);
    $("#chatText")?.focus();
    if (question) send(question);
  });
  store.on("fall-alert", ({ persons, t }) => {
    addMessage("bot", `**Cảnh báo an toàn:** Người ${persons.map((p) => `#${p}`).join(", ")} có dấu hiệu té ngã trên camera lúc ${fmtTimeMs(t)}.`);
  });
  renderSuggestions();
  updateModeLabel();
  addMessage("bot", GREETING);
}
function resetChat() {
  conversation++;
  requestController?.abort();
  requestController = null;
  busy = false;
  history.length = 0;
  $("#chatLog")?.replaceChildren();
  if ($("#chatText")) {
    $("#chatText").value = "";
    autoGrow($("#chatText"));
  }
  setChatHidden(false);
  renderSuggestions();
  updateModeLabel();
  addMessage("bot", GREETING);
  $("#chatText")?.focus();
}
function autoGrow(el) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.max(38, Math.min(el.scrollHeight, 120))}px`;
}
function updateModeLabel() {
  const st = store.settings;
  const el = $("#chatMode");
  if (!el) return;
  if (llmReady(st)) {
    el.textContent = st.llmModel || "gemini-2.5-flash";
  } else {
    el.textContent = "Chưa có API Key";
  }
}
function renderSuggestions() {
  const el = $("#chatSuggest");
  if (!el) return;
  const latestPkg = packageStore.packages?.[0];
  const pkgName = latestPkg?.name || "chuỗi động tác hiện tại";
  let qs = [];
  if (currentTab === "camera") {
    qs = [
      "Hướng dẫn từng bước",
      "Tư thế tay & đầu chuẩn?",
      "Sửa lỗi lệch vai",
      "Lưu ý an toàn"
    ];
  } else if (currentTab === "learn") {
    qs = [
      "Hướng dẫn từng bước",
      "Giải thích các nhãn",
      "Bài tập tương tự",
      "Cách dùng file .ZIP"
    ];
  } else {
    if (store.segments.length) {
      qs = [
        "Hướng dẫn động tác",
        "Kết quả phân tích",
        "Tóm tắt các bước",
        "Tra cứu kỹ thuật"
      ];
    } else {
      qs = [
        "Hướng dẫn cho người mới",
        "Kỹ thuật Squat đúng",
        "Cách nhập video",
        "Hiệu năng máy"
      ];
    }
  }
  el.innerHTML = qs.map((q) => `<button type="button" data-q="${escapeHtml(q)}">${escapeHtml(q)}</button>`).join("");
}
function addMessage(role, text, { raw = false } = {}) {
  const log = $("#chatLog");
  if (!log) return null;
  const el = document.createElement("div");
  el.className = `msg msg-${role}`;
  el.innerHTML = raw ? text : renderMarkdown(text, true);
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
  return el;
}
function renderMarkdown(text, linkTimes = true) {
  let html = escapeHtml(text).replace(/\{\{t:([\d.]+)\}\}/g, (_, t) => `<a class="t" href="#" data-t="${t}">${fmtTimeMs(parseFloat(t))}</a>`).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  if (linkTimes) {
    html = html.replace(/(^|[^\d:">])(\d{1,2}:\d{2}(?:\.\d{1,3})?)(?![\d<])/g, (m, pre, ts) => {
      const t = parseTime(ts);
      return t == null ? m : `${pre}<a class="t" href="#" data-t="${t}">${ts}</a>`;
    });
  }
  const lines = html.split("\n");
  const out = [];
  let inList = false;
  for (const line of lines) {
    const m = line.match(/^\s*[-•*]\s+(.*)/);
    if (m) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${m[1]}</li>`);
    } else {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      if (line.trim()) out.push(`<p>${line}</p>`);
    }
  }
  if (inList) out.push("</ul>");
  return out.join("");
}
async function send(input) {
  const q = String(input || "").trim();
  if (!q || busy) return;
  addMessage("user", q);
  const command = handleCommand(q);
  if (command) {
    addMessage("bot", command);
    remember(q, command);
    return;
  }
  busy = true;
  const session = conversation;
  const controller = requestController = new AbortController();
  const typing = addMessage("bot", '<span class="msg-typing">Đang trả lời…</span>', { raw: true });
  try {
    const answer = await answerWithAiModelAndGoogle(q, controller.signal);
    if (session !== conversation || controller.signal.aborted) return;
    if (typing) typing.innerHTML = renderMarkdown(answer, true);
    remember(q, answer);
  } catch (err) {
    if (session !== conversation || controller.signal.aborted) return;
    console.error(err);
    const guided = await buildSmartVietnameseResponse(q, controller.signal);
    if (typing) {
      typing.innerHTML = renderMarkdown(guided, true);
    }
    remember(q, guided);
  } finally {
    if (session === conversation) {
      busy = false;
      requestController = null;
      const log = $("#chatLog");
      if (log) log.scrollTop = log.scrollHeight;
    }
  }
}
function remember(q, a) {
  history.push(
    { role: "user", content: q },
    { role: "assistant", content: a.replace(/\{\{t:([\d.]+)\}\}/g, (_, t) => fmtTimeMs(parseFloat(t))) }
  );
  while (history.length > MAX_HISTORY * 2) history.shift();
}
var SYSTEM_PROMPT = `Bạn là Huấn luyện viên AI & Chuyên gia Phân tích Chuyển động Cơ thể của hệ thống nhận diện hành vi qua Video và Camera.
NGUYÊN TẮC QUAN TRỌNG BẮT BUỘC TUÂN THỦ:
1. Ngôn ngữ: Tiếng Việt. Trả lời CỰC NGẮN GỌN (tối đa 5–6 dòng, mỗi dòng 1 ý), không mở bài/kết bài, không lặp lại câu hỏi.
2. CHỈ đưa các số liệu thống kê/bảng phân tích khi người dùng thực sự hỏi về kết quả phân tích, thời gian, hoặc nhãn hành vi. Không tự ý liệt kê số liệu dài dòng nếu người dùng chỉ hỏi cách tập hoặc hỏi kiến thức.
3. Khi hướng dẫn động tác: liệt kê **Step 1**, **Step 2**... mỗi bước 1 câu ngắn (bộ phận + góc chuẩn).
4. Khi hỏi kiến thức bên ngoài: dùng kết quả Google, chỉ kèm tối đa 1–2 link nguồn.
5. Ghi mốc thời gian dạng mm:ss.mmm (ví dụ 00:02.450) để người dùng có thể bấm vào tua video.`;
async function answerWithAiModelAndGoogle(q, signal) {
  const qn = normalizeVi(q);
  const asksAnalysis = /(phan tich|ket qua|tom tat|nhan|thoi gian|giay|mili|bao nhieu|ai lam gi|thong ke|trong video|trong camera|do chinh xac)/.test(qn);
  const needsWebSearch = store.settings.enableGoogleSearch !== false && /(google|tim kiem|tra cuu|ky thuat|loi ich|bai tap|la gi|cach tap|chuan khoa hoc|video|camera|huong dan)/.test(qn);
  let webResults = [];
  if (needsWebSearch) {
    webResults = await searchGoogleWeb(q, signal).catch(() => []);
  }
  if (llmReady(store.settings)) {
    const contextParts = [
      `=== BÀI TẬP / GÓI ĐỘNG TÁC ĐANG CHỌN ===
${buildActivePackageGuideContext()}`
    ];
    if (asksAnalysis || store.segments.length) {
      contextParts.push(`=== DỮ LIỆU PHÂN TÍCH KHUNG XƯƠNG HIỆN TẠI (CHỈ DÙNG KHI ĐƯỢC HỎI) ===
${buildAnalysisContext()}`);
    }
    if (webResults.length) {
      contextParts.push(`=== KẾT QUẢ TÌM KIẾM GOOGLE LIÊN QUAN ===
${webResults.map((r, i) => `${i + 1}. ${r.title}: ${r.snippet} (${r.url})`).join("\n")}`);
    }
    contextParts.push(`=== THÔNG TIN HỆ THỐNG ===
${buildAppContext()}`);
    const fullSystem = `${SYSTEM_PROMPT}

${contextParts.join("\n\n")}`;
    return chat(store.settings, fullSystem, [...history, { role: "user", content: q }], {
      signal,
      useGoogleSearch: store.settings.enableGoogleSearch !== false
    });
  }
  return buildSmartVietnameseResponse(q, signal, webResults);
}
async function buildSmartVietnameseResponse(q, signal, preloadedWeb = null) {
  const qn = normalizeVi(q);
  const asksAnalysis = /(phan tich|ket qua|tom tat|nhan|thoi gian|giay|mili|bao nhieu|thong ke|nguoi|점|danh sach)/.test(qn);
  const asksPerf = /(hieu nang|fps|may yeu|toc do|cau hinh|he thong|muot)/.test(qn);
  const asksGoogle = /(google|tim|tra cuu|ky thuat|khoa hoc|loi ich)/.test(qn);
  const webResults = preloadedWeb || (asksGoogle ? await searchGoogleWeb(q, signal).catch(() => []) : []);
  const pkg = packageStore.packages?.[0];
  const lines = [];
  if (asksPerf) {
    const p = perfSummary(inference);
    lines.push(`- **Máy:** ${p.os} · ${TIER_LABEL[p.tier] || "Trung bình"}${p.lowTierCapped ? " (giới hạn Trung bình)" : ""}`);
    lines.push(`- **Mức:** ${p.profile}`);
    lines.push(`- **Tốc độ:** ${p.inferFps || 12} phân tích/s · ${p.renderFps || 24} FPS`);
    return lines.join("\n");
  }
  if (asksAnalysis) {
    if (store.segments.length) {
      const segs = [...store.segments].sort((a, b) => a.start - b.start);
      const aiSegs = segs.filter((s) => behaviorInfo(s.behavior).group === "ai");
      lines.push(`**${segs.length} nhãn (${aiSegs.length} nhãn AI):**`);
      segs.slice(0, 5).forEach((s) => {
        const info = behaviorInfo(s.behavior);
        const durMs = s.durationMs || Math.round((s.end - s.start) * 1e3);
        lines.push(`- {{t:${s.start}}} (${durMs}ms): ${info.label.replace(/^AI:\s*/, "")}`);
      });
      if (segs.length > 5) lines.push(`- … +${segs.length - 5} nhãn (xem bảng thời gian)`);
    } else if (pkg) {
      lines.push(`**${pkg.name}** (${pkg.segments?.length || 0} nhãn):`);
      (pkg.segments || []).slice(0, 5).forEach((s) => {
        const info = behaviorInfo(s.behavior);
        lines.push(`- ${fmtTimeMs(s.start)}: ${info.label.replace(/^AI:\s*/, "")}`);
      });
    } else {
      lines.push("Chưa có dữ liệu. Hãy tải video rồi bấm **Phân tích**.");
    }
  }
  if (!asksAnalysis || /(huong dan|cach|thuc hien|동작|step|buoc|tap|sua loi|tu the)/.test(qn)) {
    const targetPkg = pkg;
    const steps = targetPkg?.steps || [];
    lines.push(`**${targetPkg?.name || "Động tác"}:**`);
    if (steps.length) {
      steps.forEach((st, idx) => {
        lines.push(`- **Step ${st.stepNumber || idx + 1}:** ${String(st.title || st.label || "").replace(/^Bước \d+:\s*/, "")}`);
      });
    } else {
      lines.push("- **Step 1:** Đứng thẳng, chân rộng bằng vai.");
      lines.push("- **Step 2:** Nâng hai tay đều, không nhún vai.");
      lines.push("- **Step 3:** Hạ hông, lưng thẳng, gối theo mũi chân.");
    }
    lines.push("*Bấm **Kiểm tra động tác** ở Camera để chấm điểm.*");
  }
  if (webResults.length) {
    const r = webResults.find((x) => !/google\.com\/search/.test(x.url)) || webResults[0];
    lines.push(`🔎 [${/google\.com\/search/.test(r.url) ? "Xem trên Google" : r.title}](${r.url})`);
  }
  if (!llmReady(store.settings)) {
    lines.push("*Thêm API Key ở Hệ thống để AI trả lời tốt hơn.*");
  }
  return lines.join("\n");
}
function buildActivePackageGuideContext() {
  const pkg = packageStore.packages?.[0];
  if (!pkg) return "Chưa có gói động tác mẫu.";
  return [
    `Tên gói động tác: ${pkg.name}`,
    `Tóm tắt: ${pkg.summary || ""}`,
    pkg.voiceTranscript ? `Mô tả bằng giọng nói của người dùng: "${pkg.voiceTranscript}"` : "",
    "Các bước thực hiện (Steps):",
    ...(pkg.steps || []).map((s) => `- Step ${s.stepNumber}: ${s.title} | ${s.description} | Góc khớp: ${s.jointAngles || "chuẩn"}`)
  ].filter(Boolean).join("\n");
}
function buildAnalysisContext() {
  const segs = [...store.segments].sort((a, b) => a.start - b.start);
  if (!segs.length) return "Chưa có phân đoạn nào trong phiên hiện tại.";
  return [
    `Nguồn video: ${store.media.name || store.meta.mediaName || "camera/video"}; thời lượng: ${fmtTimeMs(store.media.duration || 0)}.`,
    `Tổng số phân đoạn mili-giây: ${segs.length}.`,
    "Chi tiết các phân đoạn (Bắt đầu – Kết thúc | Thời lượng ms | Nhãn | Góc khớp | Hướng dẫn):",
    ...segs.slice(0, 180).map((s) => {
      const info = behaviorInfo(s.behavior);
      const durMs = s.durationMs || Math.round((s.end - s.start) * 1e3);
      return `${personLabel(s.personId, s.source)} | ${fmtTimeMs(s.start)}–${fmtTimeMs(s.end)} (${durMs}ms) | ${info.label} | ${s.jointAngles || ""} | ${s.stepHint || info.stepHint || ""}`;
    })
  ].join("\n");
}
function buildAppContext() {
  const p = perfSummary(inference);
  return `Thiết bị: ${p.os}, ${p.browser}, xếp loại ${TIER_LABEL[p.tier] || "Trung bình"}, hồ sơ ${p.profile}, tốc độ ${p.inferFps || 12} phân tích/s, hiển thị ${p.renderFps || 24} FPS.`;
}
var T = (t) => `{{t:${t}}}`;
var has = (qn, re) => re.test(qn);
function handleCommand(q) {
  const qn = normalizeVi(q);
  if (has(qn, /^(tua|nhay|chuyen|di|phat)\b.*\b(den|toi|ve|tu|luc)\b|^tua\b/)) {
    const tm = qn.match(/(\d+(?:[:.,]\d+){0,2})\s*(phut|giay|s)?/);
    if (tm) {
      let t = parseTime(tm[1].replace(",", "."));
      if (t != null) {
        if (tm[2] === "phut" && !tm[1].includes(":")) t *= 60;
        if (!hasVideo()) return "Chưa mở video nên chưa tua được. Hãy tải video lên trước.";
        seekTo(t, { play: /phat/.test(qn) });
        return `Đã tua video đến mốc ${T(t)}.`;
      }
    }
  }
  if (has(qn, /(xoa|bo|huy) (bo )?loc|hien (thi )?tat ca|reset/)) {
    resetFilters();
    return "Đã xoá toàn bộ bộ lọc bảng kết quả.";
  }
  if (has(qn, /^(loc|chi (hien|xem|hien thi))\b/)) {
    const found = Object.keys(CORE_BEHAVIORS).filter((k) => qn.includes(normalizeVi(behaviorInfo(k).label)));
    if (found.length) {
      setFilter({ behaviors: found });
      return `Đã lọc theo nhãn **${found.map((k) => behaviorInfo(k).label).join(", ")}**: còn **${getFiltered().length}** phân đoạn.`;
    }
  }
  if (has(qn, /(xuat|export|tai ve|luu)/) && has(qn, /(json|csv)/)) {
    if (has(qn, /csv/)) {
      exportCSV();
      return "Đã xuất file CSV.";
    }
    exportJSON({ filtered: false });
    return "Đã xuất file JSON.";
  }
  return null;
}
function unavailablePlatformStats() {
  return null;
}
function answerLocal(q) {
  return buildSmartVietnameseResponse(q);
}

// js/learn-ui.js
var pendingSegment = null;
var training = false;
var selectedCatalogPkgId = null;
var replayPlaying = false;
var replayTime = 0;
var replayRaf = null;
var replayLastTs = 0;
function initLearnUi() {
  initCatalogSection();
  initLearnerSection();
}
function initCatalogSection() {
  $("#catalogZipInput")?.addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const pkg = await importPackageZip(f);
      selectedCatalogPkgId = pkg.id;
      renderCatalog();
      renderSelectedPackageDetail();
      toast(`Đã nhập gói phân tích “${pkg.name}” vào Danh mục.`, "ok");
    } catch (err) {
      toast(`Lỗi nhập file .ZIP: ${err.message}`, "error", 6e3);
    }
  });
  $("#packageCatalogList")?.addEventListener("click", async (e) => {
    const actBtn = e.target.closest("button[data-pkg-act]");
    const card = e.target.closest("[data-pkg-id]");
    if (!card) return;
    const id = card.dataset.pkgId;
    const pkg = packageStore.getPackage(id);
    if (!pkg) return;
    if (actBtn) {
      e.stopPropagation();
      const act = actBtn.dataset.pkgAct;
      if (act === "zip") {
        await exportPackageZip(pkg);
      } else if (act === "camera") {
        store.emit("select-package-for-camera", pkg);
        toast(`Đã chuyển gói “${pkg.name}” sang mục Camera Hướng dẫn.`, "ok");
      } else if (act === "workspace") {
        applyPackageToWorkspace(pkg);
        store.emit("switch-tab", "video");
        toast(`Đã nạp dữ liệu phân tích “${pkg.name}” sang màn hình Video.`, "ok");
      } else if (act === "rename") {
        const nextName = prompt("Nhập tên mới cho gói dữ liệu phân tích:", pkg.name);
        if (nextName && nextName.trim()) {
          await packageStore.renamePackage(pkg.id, nextName.trim());
          renderCatalog();
          renderSelectedPackageDetail();
          toast("Đã đổi tên gói phân tích.", "ok");
        }
      } else if (act === "delete") {
        if (confirm(`Xóa gói phân tích “${pkg.name}” khỏi cơ sở dữ liệu?`)) {
          await packageStore.removePackage(pkg.id);
          if (selectedCatalogPkgId === pkg.id) {
            selectedCatalogPkgId = packageStore.packages[0]?.id || null;
          }
          renderCatalog();
          renderSelectedPackageDetail();
          toast("Đã xóa gói phân tích.", "info");
        }
      }
      return;
    }
    selectedCatalogPkgId = id;
    stopSampleReplay();
    replayTime = 0;
    renderCatalog();
    renderSelectedPackageDetail();
  });
  $("#pkgReplayPlayBtn")?.addEventListener("click", toggleSampleReplay);
  $("#pkgReplayStopBtn")?.addEventListener("click", () => {
    stopSampleReplay();
    replayTime = 0;
    drawSampleReplayAt(0);
  });
  $("#pkgReplayScrubber")?.addEventListener("input", (e) => {
    replayTime = Number(e.target.value) || 0;
    drawSampleReplayAt(replayTime);
  });
  $("#pkgTimelineTableBody")?.addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-start]");
    if (!tr) return;
    replayTime = Number(tr.dataset.start) || 0;
    drawSampleReplayAt(replayTime);
  });
  store.on("packages", () => {
    if (!selectedCatalogPkgId && packageStore.packages.length) {
      selectedCatalogPkgId = packageStore.packages[0].id;
    }
    renderCatalog();
    renderSelectedPackageDetail();
  });
  if (packageStore.packages.length) {
    selectedCatalogPkgId = packageStore.packages[0].id;
  }
  renderCatalog();
  renderSelectedPackageDetail();
}
function getSelectedCatalogPkg() {
  const pkgs = packageStore.packages || [];
  if (!pkgs.length) return null;
  return pkgs.find((p) => p.id === selectedCatalogPkgId) || pkgs[0];
}
function renderCatalog() {
  const listEl = $("#packageCatalogList");
  if (!listEl) return;
  const pkgs = packageStore.packages || [];
  const countBadge = $("#catalogCountBadge");
  if (countBadge) countBadge.textContent = `${pkgs.length} gói phân tích`;
  if (!pkgs.length) {
    listEl.innerHTML = `<p class="muted small empty-note">Chưa có gói phân tích nào trong CSDL. Hãy phân tích một video ở tab Video hoặc tải lên gói .ZIP.</p>`;
    return;
  }
  if (!selectedCatalogPkgId || !pkgs.some((p) => p.id === selectedCatalogPkgId)) {
    selectedCatalogPkgId = pkgs[0].id;
  }
  listEl.innerHTML = pkgs.map((pkg) => {
    const isSel = pkg.id === selectedCatalogPkgId;
    const segCount = pkg.segments?.length || 0;
    const stepCount = pkg.steps?.length || 0;
    const dur = fmtTimeMs(pkg.duration || 0);
    const created = pkg.createdAt ? new Date(pkg.createdAt).toLocaleString("vi-VN") : "";
    return `<article class="catalog-card ${isSel ? "is-selected" : ""}" data-pkg-id="${escapeHtml(pkg.id)}">
      <div class="catalog-card-main">
        <div class="catalog-card-title-row">
          <span class="src-badge src-zip">Gói Phân Tích</span>
          <h4 class="catalog-title">${escapeHtml(pkg.name)}</h4>
          <span class="mono muted small">⏱ ${dur} · ${segCount} mốc thời gian · ${stepCount} Step</span>
        </div>
        <p class="small muted">${escapeHtml(pkg.summary || "")}</p>
        ${pkg.voiceTranscript ? `<p class="small voice-quote">🎙 Giọng nói người dùng: “${escapeHtml(pkg.voiceTranscript)}”</p>` : ""}
        <div class="small muted">Nguồn: <b>${escapeHtml(pkg.mediaName || "video")}</b> · Lưu lúc: ${escapeHtml(created)}</div>
      </div>
      <div class="catalog-card-actions">
        <button type="button" class="btn btn-primary btn-sm" data-pkg-act="camera">Đưa vào Camera tập</button>
        <button type="button" class="btn btn-secondary btn-sm" data-pkg-act="zip">⬇ Tải .ZIP</button>
        <button type="button" class="btn btn-ghost btn-sm" data-pkg-act="workspace">Mở ở tab Video</button>
        <button type="button" class="btn btn-ghost btn-sm" data-pkg-act="rename">Đổi tên</button>
        <button type="button" class="btn btn-ghost btn-sm danger-text" data-pkg-act="delete">✕</button>
      </div>
    </article>`;
  }).join("");
}
function renderSelectedPackageDetail() {
  const pkg = getSelectedCatalogPkg();
  const detailWrap = $("#packageDetailSection");
  if (!detailWrap) return;
  if (!pkg) {
    detailWrap.hidden = true;
    return;
  }
  detailWrap.hidden = false;
  if ($("#selectedPkgTitle")) $("#selectedPkgTitle").textContent = pkg.name;
  if ($("#selectedPkgMeta")) {
    $("#selectedPkgMeta").textContent = `Nguồn: ${pkg.mediaName || "video"} · Thời lượng: ${fmtTimeMs(pkg.duration || 0)} · Tổng ${pkg.segments?.length || 0} phân đoạn hành vi`;
  }
  if ($("#selectedPkgSummary")) $("#selectedPkgSummary").textContent = pkg.summary || "";
  const summaryBody = $("#pkgBehaviorSummaryTableBody");
  if (summaryBody) {
    const agg = {};
    (pkg.segments || []).forEach((s) => {
      var _a;
      const a = agg[_a = s.behavior] || (agg[_a] = {
        count: 0,
        totalMs: 0,
        confSum: 0,
        sampleAngles: s.jointAngles || "",
        sampleHint: s.stepHint || ""
      });
      a.count++;
      const dMs = s.durationMs || Math.max(10, Math.round((s.end - s.start) * 1e3));
      a.totalMs += dMs;
      a.confSum += s.confidence || 0.85;
      if (!a.sampleAngles && s.jointAngles) a.sampleAngles = s.jointAngles;
      if (!a.sampleHint && s.stepHint) a.sampleHint = s.stepHint;
    });
    const entries = Object.entries(agg);
    summaryBody.innerHTML = entries.length ? entries.map(([k, st]) => {
      const info = behaviorInfo(k);
      const isAi = info.group === "ai";
      const typeLabel = isAi ? '<span class="type-pill type-ai">⚡ Nhãn con AI</span>' : '<span class="type-pill type-core">Hành vi gốc</span>';
      return `<tr>
        <td><span class="badge"><i style="background:${info.color}"></i>${escapeHtml(info.label)}</span></td>
        <td>${typeLabel}</td>
        <td><b>${st.count}</b> lần</td>
        <td class="mono">${(st.totalMs / 1e3).toFixed(2)}s (${st.totalMs}ms)</td>
        <td>${Math.round(st.confSum / st.count * 100)}%</td>
        <td class="small muted">${escapeHtml(st.sampleHint || info.stepHint || st.sampleAngles || "–")}</td>
      </tr>`;
    }).join("") : `<tr><td colspan="6" class="muted">Chưa có nhãn hành vi nào trong phân tích này.</td></tr>`;
  }
  const timelineBody = $("#pkgTimelineTableBody");
  if (timelineBody) {
    const segs = [...pkg.segments || []].sort((a, b) => a.start - b.start);
    timelineBody.innerHTML = segs.length ? segs.map((s, idx) => {
      const info = behaviorInfo(s.behavior);
      const durMs = s.durationMs || Math.max(10, Math.round((s.end - s.start) * 1e3));
      const pctConf = Math.round((s.confidence || 0.85) * 100);
      return `<tr data-start="${s.start}" data-end="${s.end}" class="pkg-time-row" title="Bấm để xem mẫu khung xương tại mốc ${fmtTimeMs(s.start)}">
        <td class="mono">${idx + 1}</td>
        <td class="mono"><b>${fmtTimeMs(s.start)}</b> <span class="muted small">(${Number(s.start).toFixed(3)}s)</span></td>
        <td class="mono"><b>${fmtTimeMs(s.end)}</b> <span class="muted small">(${Number(s.end).toFixed(3)}s)</span></td>
        <td class="mono">${durMs} ms</td>
        <td>
          <span class="badge"><i style="background:${info.color}"></i>${escapeHtml(info.label)}</span>
          ${info.group === "ai" ? '<span class="ai-tag">AI</span>' : ""}
        </td>
        <td class="small muted">${escapeHtml([s.jointAngles, s.stepHint || info.stepHint].filter(Boolean).join(" · ") || "–")}</td>
        <td><b>${pctConf}%</b></td>
      </tr>`;
    }).join("") : `<tr><td colspan="7" class="muted">Chưa có dữ liệu thời gian.</td></tr>`;
  }
  const scrubber2 = $("#pkgReplayScrubber");
  const dur = pkg.duration || Math.max(1, ...(pkg.segments || []).map((s) => s.end || 0));
  if (scrubber2) {
    scrubber2.max = dur;
    scrubber2.value = 0;
  }
  drawSampleReplayAt(0);
}
function toggleSampleReplay() {
  if (replayPlaying) {
    stopSampleReplay();
  } else {
    startSampleReplay();
  }
}
function startSampleReplay() {
  const pkg = getSelectedCatalogPkg();
  if (!pkg) return;
  replayPlaying = true;
  replayLastTs = performance.now();
  if ($("#pkgReplayPlayBtn")) $("#pkgReplayPlayBtn").textContent = "⏸ Tạm dừng mẫu";
  const dur = pkg.duration || Math.max(3, ...(pkg.segments || []).map((s) => s.end || 3));
  const loop = (now) => {
    if (!replayPlaying) return;
    const dt = (now - replayLastTs) / 1e3;
    replayLastTs = now;
    replayTime += dt;
    if (replayTime > dur) replayTime = 0;
    drawSampleReplayAt(replayTime);
    replayRaf = requestAnimationFrame(loop);
  };
  replayRaf = requestAnimationFrame(loop);
}
function stopSampleReplay() {
  replayPlaying = false;
  cancelAnimationFrame(replayRaf);
  if ($("#pkgReplayPlayBtn")) $("#pkgReplayPlayBtn").textContent = "▶ Phát mẫu phân tích";
}
function drawSampleReplayAt(t) {
  const pkg = getSelectedCatalogPkg();
  const canvas3 = $("#pkgSampleReplayCanvas");
  if (!pkg || !canvas3) return;
  if (canvas3.width !== 640) {
    canvas3.width = 640;
    canvas3.height = 360;
  }
  const dur = pkg.duration || Math.max(3, ...(pkg.segments || []).map((s) => s.end || 3));
  const clampedT = clamp(t, 0, dur);
  if ($("#pkgReplayScrubber") && document.activeElement !== $("#pkgReplayScrubber")) {
    $("#pkgReplayScrubber").value = clampedT;
  }
  if ($("#pkgReplayTime")) {
    $("#pkgReplayTime").textContent = `${fmtTimeMs(clampedT)} / ${fmtTimeMs(dur)}`;
  }
  const activeSegs = (pkg.segments || []).filter((s) => clampedT >= s.start && clampedT <= s.end);
  const activeLabels = activeSegs.map((s) => ({ behavior: s.behavior, confidence: s.confidence || 0.9 }));
  let kp = null;
  if (pkg.frames?.length) {
    const frames = pkg.frames;
    let near = frames[0];
    let bestDiff = Infinity;
    for (const f of frames) {
      const d = Math.abs(f.t - clampedT);
      if (d < bestDiff) {
        bestDiff = d;
        near = f;
      }
    }
    const p = near?.persons?.[0];
    if (p?.kp) {
      kp = p.kp.map(([x, y, score]) => ({ x, y, score: score ?? 0.9 }));
    }
  }
  if (!kp && pkg.steps?.length) {
    const stepIdx = Math.min(pkg.steps.length - 1, Math.floor(clampedT / Math.max(0.1, dur) * pkg.steps.length));
    const nextIdx = (stepIdx + 1) % pkg.steps.length;
    const localProgress = clampedT / Math.max(0.1, dur) * pkg.steps.length - stepIdx;
    const aKp = pkg.steps[stepIdx]?.keypoints || defaultStandingKeypoints(stepIdx);
    const bKp = pkg.steps[nextIdx]?.keypoints || aKp;
    kp = aKp.map((a, i) => {
      const b = bKp[i] || a;
      return {
        x: a.x + (b.x - a.x) * localProgress,
        y: a.y + (b.y - a.y) * localProgress,
        score: 0.95
      };
    });
  }
  if (!kp) kp = defaultStandingKeypoints(0);
  const xs = kp.map((k) => k.x);
  const ys = kp.map((k) => k.y);
  const minX = Math.min(...xs) - 24;
  const minY = Math.min(...ys) - 28;
  const maxX = Math.max(...xs) + 24;
  const maxY = Math.max(...ys) + 24;
  const ctx = canvas3.getContext("2d");
  ctx.fillStyle = "#0d1520";
  ctx.fillRect(0, 0, canvas3.width, canvas3.height);
  const persons = [{
    personId: 1,
    keypoints: kp,
    box: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
    labels: activeLabels.length ? activeLabels : [{ behavior: "standing", confidence: 0.9 }]
  }];
  const hud = activeSegs.length ? [{ color: "#38bdf8", text: `Mốc ${fmtTimeMs(clampedT)}: ${activeSegs.map((s) => behaviorInfo(s.behavior).label).join(" · ")}` }] : [{ color: "#94a3b8", text: `Mốc ${fmtTimeMs(clampedT)}: Đang phát mô phỏng khung xương` }];
  drawOverlay(canvas3, persons, [], 0.2, null, { skeleton: true, hud });
  $$("#pkgTimelineTableBody tr[data-start]").forEach((tr) => {
    const s = Number(tr.dataset.start);
    const e = Number(tr.dataset.end);
    tr.classList.toggle("is-current", clampedT >= s && clampedT <= e);
  });
}
function initLearnerSection() {
  const s = store.settings;
  if ($("#useLearned")) $("#useLearned").checked = s.useLearned;
  if ($("#selfTrain")) $("#selfTrain").checked = s.selfTrain;
  if ($("#learnThreshold")) $("#learnThreshold").value = Math.round(s.learnThreshold * 100);
  if ($("#learnThresholdOut")) $("#learnThresholdOut").textContent = `${Math.round(s.learnThreshold * 100)}%`;
  $("#useLearned")?.addEventListener("change", (e) => store.saveSettings({ useLearned: e.target.checked }));
  $("#selfTrain")?.addEventListener("change", (e) => store.saveSettings({ selfTrain: e.target.checked }));
  $("#learnThreshold")?.addEventListener("input", (e) => {
    const v = Number(e.target.value) / 100;
    if ($("#learnThresholdOut")) $("#learnThresholdOut").textContent = `${e.target.value}%`;
    store.saveSettings({ learnThreshold: v });
  });
  $("#trainBtn")?.addEventListener("click", () => runTraining($("#trainAlgo").value));
  $("#applyLearnedBtn")?.addEventListener("click", () => {
    try {
      const n = applyToFrames();
      toast(`Đã áp dụng: ${n} đoạn hành vi đã học trên video hiện tại.`, "ok");
    } catch (err) {
      toast(err.message, "warn", 5e3);
    }
  });
  $("#packExport")?.addEventListener("click", exportPack);
  $("#packImport")?.addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const r = await importPack(f);
      toast(`Đã nhập ${r.classes} hành vi, ${r.samples} mẫu. Đang huấn luyện…`, "ok");
      await runTraining("auto");
    } catch (err) {
      toast(err.message, "error", 6e3);
    }
  });
  $("#learnList")?.addEventListener("click", (e) => {
    const li = e.target.closest("li[data-key]");
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (!li || !act) return;
    const key = li.dataset.key;
    const label = behaviorInfo(key).label;
    if (act === "rename") {
      const name = prompt("Tên mới cho hành vi:", label);
      if (name && name.trim()) {
        renameClass(key, name);
        store.setResults({ segments: store.segments, frames: store.frames, meta: store.meta });
      }
    } else if (act === "clear") {
      if (confirm(`Xoá toàn bộ mẫu của “${label}” (giữ lại tên)?`)) clearSamplesOf(key);
    } else if (act === "delete") {
      if (confirm(`Xoá hành vi “${label}” cùng mọi mẫu đã học?`)) removeClass(key);
    }
  });
  $("#tvBtn")?.addEventListener("click", () => {
    const name = $("#tvName").value.trim();
    const from = parseTime($("#tvFrom").value);
    const to = parseTime($("#tvTo").value);
    const personId = $("#tvPerson").value === "" ? null : Number($("#tvPerson").value);
    if (!name) {
      toast("Nhập tên hành vi.", "warn");
      return;
    }
    if (from == null || to == null || to <= from) {
      toast("Khoảng thời gian không hợp lệ (vd: 0:12 đến 0:18).", "warn");
      return;
    }
    teachRange({ name, personId, from, to, addSegment: $("#tvRelabel").checked });
  });
  const dlg = $("#teachDialog");
  if (dlg) {
    store.on("teach-segment", (seg) => {
      if (!hasKeypoints(store.frames)) {
        toast("Kết quả này không có toạ độ khung xương. Hãy phân tích lại video.", "warn", 6e3);
        return;
      }
      pendingSegment = seg;
      $("#teachInfo").textContent = `${personLabel(seg.personId, seg.source)} · ${fmtTimeMs(seg.start)} – ${fmtTimeMs(seg.end)} · hiện gán: ${behaviorInfo(seg.behavior).label}`;
      $("#teachDlgName").value = "";
      dlg.showModal();
      $("#teachDlgName").focus();
    });
    dlg.addEventListener("close", () => {
      if (dlg.returnValue !== "save" || !pendingSegment) return;
      const seg = pendingSegment;
      pendingSegment = null;
      const name = $("#teachDlgName").value.trim();
      if (!name) return;
      const relabel = $("#teachDlgRelabel").checked;
      const ok = teachRange({ name, personId: seg.personId, from: seg.start, to: seg.end, addSegment: false });
      if (ok && relabel) {
        const { id, ...rest } = seg;
        store.removeSegment(id);
        store.addSegments([{ ...rest, behavior: ok.key, confidence: 1 }]);
      }
    });
  }
  $("#discoverBtn")?.addEventListener("click", runDiscovery);
  $("#discoverList")?.addEventListener("click", onDiscoverClick);
  store.on("learner", render);
  store.on("results", refreshPersons);
  render(summary());
  refreshPersons();
}
function teachRange({ name, personId, from, to, addSegment }) {
  try {
    const { key, n } = teachFromFrames(name, { personId, from, to });
    toast(`Đã thêm ${n} mẫu cho “${behaviorInfo(key).label}”.`, "ok");
    if (addSegment && personId != null) {
      store.addSegments([{ personId, behavior: key, start: from, end: to, confidence: 1, source: "video" }]);
    }
    runTraining("auto");
    return { key, n };
  } catch (err) {
    toast(err.message, "warn", 6e3);
    return null;
  }
}
async function runTraining(algo) {
  if (training) return;
  training = true;
  const wrap = $("#trainProgressWrap");
  const fill = $("#trainProgressFill");
  const text = $("#trainProgressText");
  if (wrap) wrap.hidden = false;
  if (fill) fill.style.width = "0%";
  if (text) text.textContent = "Chuẩn bị dữ liệu…";
  if ($("#trainBtn")) $("#trainBtn").disabled = true;
  try {
    const m = await train({
      algo,
      onProgress: (p) => {
        const ratio = p.epochs ? p.epoch / p.epochs : 0;
        if (fill) fill.style.width = `${Math.round(ratio * 100)}%`;
        if (text) text.textContent = p.text || `Vòng ${p.epoch}/${p.epochs} · loss ${p.loss?.toFixed(3) ?? "–"} · đúng ${pct(p.acc)} · kiểm định ${pct(p.valAcc)}${p.stopped ? " · dừng sớm" : ""}`;
      }
    });
    if (fill) fill.style.width = "100%";
    if ($("#trainResult")) $("#trainResult").innerHTML = describeModel(m);
    toast("Huấn luyện xong.", "ok");
  } catch (err) {
    if ($("#trainResult")) $("#trainResult").textContent = err.message;
    toast(err.message, "warn", 5e3);
  } finally {
    training = false;
    if ($("#trainBtn")) $("#trainBtn").disabled = false;
    setTimeout(() => {
      if (wrap) wrap.hidden = true;
    }, 1200);
  }
}
var pct = (v) => v == null ? "–" : `${Math.round(v * 100)}%`;
function describeModel(m) {
  if (!m) return '<span class="muted">Chưa có mô hình.</span>';
  const names = m.keys.map((k) => escapeHtml(behaviorInfo(k).label)).join(", ");
  return `Mô hình <b>${m.type.toUpperCase()}</b> · ${m.keys.length} hành vi (${names}) · ${m.nTrain} mẫu huấn luyện` + (m.type === "mlp" ? ` · đúng trên tập huấn luyện ${pct(m.trainAcc)} · kiểm định ${pct(m.valAcc)} (${m.nVal} mẫu)` : "") + ` · ${new Date(m.trainedAt).toLocaleString("vi-VN")}`;
}
function render(sum) {
  const list = $("#learnList");
  if (!list) return;
  if (!sum.classes.length) {
    list.innerHTML = '<li class="muted">Chưa có hành vi tự dạy nào. Bạn có thể dạy từ Camera (mục Học chuyển động), từ Video, hoặc dùng “Khám phá” bên dưới.</li>';
  } else {
    const trained = new Set(sum.model?.keys || []);
    list.innerHTML = sum.classes.map((c) => `
      <li data-key="${c.key}">
        <i class="swatch" style="background:${c.color}"></i>
        <span class="grow"><b>${escapeHtml(c.label)}</b>
          <small class="muted">${c.count} mẫu${trained.has(c.key) ? " · đã huấn luyện" : c.count >= 3 ? " · chưa huấn luyện" : " · cần ≥ 3 mẫu"}</small></span>
        <button class="btn btn-ghost btn-sm" data-act="rename">Đổi tên</button>
        <button class="btn btn-ghost btn-sm" data-act="clear">Xoá mẫu</button>
        <button class="btn btn-ghost btn-sm danger" data-act="delete">Xoá</button>
      </li>`).join("");
  }
  if ($("#learnedNames")) $("#learnedNames").innerHTML = sum.classes.map((c) => `<option value="${escapeHtml(c.label)}"></option>`).join("");
  if ($("#trainResult")) $("#trainResult").innerHTML = (sum.dirty && sum.total ? '<span class="warn-text">Có mẫu mới chưa được huấn luyện. </span>' : "") + describeModel(sum.model);
}
function refreshPersons() {
  const el = $("#tvPerson");
  if (!el) return;
  const ids = [...new Set(store.frames.flatMap((f) => f.persons.map((p) => p.id)))].sort((a, b) => a - b);
  el.innerHTML = ids.length ? ids.map((id) => `<option value="${id}">${escapeHtml(personLabel(id, "video"))}</option>`).join("") : '<option value="">(chưa có)</option>';
}
async function runDiscovery() {
  const status = $("#discoverStatus");
  const btn = $("#discoverBtn");
  if (!btn || !status) return;
  btn.disabled = true;
  status.textContent = "Đang trích đặc trưng…";
  try {
    const res = await discover({
      k: Number($("#discoverK").value) || 0,
      onProgress: (p) => {
        status.textContent = `${p.text}…`;
      }
    });
    status.textContent = `Tìm thấy ${res.k} cụm chuyển động (độ tách cụm ${res.score.toFixed(2)}). Cụm có “độ mới” cao là ứng viên hành vi mới.`;
    renderClusters(res.clusters);
  } catch (err) {
    status.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
}
function renderClusters(clusters) {
  const el = $("#discoverList");
  if (!el) return;
  el.innerHTML = clusters.map((c, i) => {
    const rule = c.rule.length ? c.rule.map((r) => `${escapeHtml(behaviorInfo(r.key).label)} ${Math.round(r.share * 100)}%`).join(", ") : "không khớp luật nào";
    const novelty = c.learned ? "đã học" : c.novelty > 0.5 ? "cao" : c.novelty > 0.25 ? "trung bình" : "thấp";
    const runs = c.runs.map((r) => `<button class="chip" data-seek="${r.start}">#${r.personId} ${fmtTime(r.start, false)}–${fmtTime(r.end, false)}</button>`).join("") || '<span class="muted small">Không có đoạn liên tục đủ dài.</span>';
    return `<article class="cluster ${c.novelty > 0.5 && !c.learned ? "is-new" : ""}" data-id="${c.id}">
      <header>
        <b>Cụm ${i + 1}</b>
        <span class="muted small">${c.size} mẫu (${Math.round(c.share * 100)}%) · độ mới: <b>${novelty}</b></span>
      </header>
      <p class="small">Luật có sẵn: ${rule}${c.learned ? ` · trùng hành vi đã học <b>${escapeHtml(behaviorInfo(c.learned.key).label)}</b> (${Math.round(c.learned.share * 100)}%)` : ""}</p>
      <div class="chips">${runs}</div>
      <div class="transport-row">
        <input type="text" list="learnedNames" placeholder="Đặt tên để học…" data-name />
        <button class="btn btn-primary btn-sm" data-learn>Học</button>
      </div>
    </article>`;
  }).join("");
}
async function onDiscoverClick(e) {
  const seek = e.target.closest("[data-seek]");
  if (seek) {
    seekTo(parseFloat(seek.dataset.seek), { play: true });
    return;
  }
  const btn = e.target.closest("[data-learn]");
  if (!btn) return;
  const card = btn.closest(".cluster");
  const name = card.querySelector("[data-name]").value.trim();
  if (!name) {
    toast("Đặt tên cho cụm trước khi học.", "warn");
    return;
  }
  try {
    const { key, n } = learnCluster(Number(card.dataset.id), name);
    toast(`Đã thêm ${n} mẫu vào “${behaviorInfo(key).label}”.`, "ok");
    card.classList.add("is-learned");
    btn.disabled = true;
    await runTraining("auto");
  } catch (err) {
    toast(err.message, "warn");
  }
}

// js/system-ui.js
var metricsTimer = null;
function initSystemUi() {
  bindPerfSettings();
  bindAiSettingsSection();
  renderHardware();
  renderBench(loadBenchmark());
  renderProfileDetail();
  $("#benchBtn")?.addEventListener("click", async () => {
    const btn = $("#benchBtn");
    btn.disabled = true;
    try {
      const data = await runBenchmark((text) => {
        $("#benchStatus").textContent = text;
      });
      renderBench(data);
      $("#benchStatus").textContent = data.best ? `Nhanh nhất: ${data.best.toUpperCase()}. ${store.settings.backend === "auto" ? "Sẽ dùng backend này ở chế độ Tự động." : ""}` : "Không backend nào chạy được mô hình (kiểm tra kết nối mạng để tải mô hình).";
      if (store.settings.backend === "auto" && inference.ready) reinit("Đã chuyển sang backend nhanh nhất.");
    } catch (err) {
      $("#benchStatus").textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });
  $("#perfLogBtn")?.addEventListener("click", exportPerfLog);
  store.on("hardware", () => {
    renderHardware();
    renderProfileDetail();
  });
  store.on("power", renderProfileDetail);
  store.on("adaptive", renderProfileDetail);
  store.on("inference-info", renderProfileDetail);
  store.on("settings", syncAiSettingsUi);
  store.on("switch-tab", (tab) => tab === "system" ? startMetrics() : stopMetrics());
}
function bindPerfSettings() {
  const s = store.settings;
  const map = [
    ["#perfProfile", "perfProfile", "value"],
    ["#backendSel", "backend", "value"],
    ["#threadSel", "threadMode", "value"],
    ["#renderModeSel", "camRenderMode", "value"],
    ["#interpToggle", "interpolate", "checked"],
    ["#adaptiveToggle", "adaptive", "checked"],
    ["#pauseHiddenToggle", "pauseHidden", "checked"],
    ["#batteryToggle", "batterySaver", "checked"]
  ];
  map.forEach(([sel, key, prop]) => {
    const el = $(sel);
    if (!el) return;
    el[prop] = s[key];
    el.addEventListener("change", () => {
      const prev = store.settings[key];
      store.saveSettings({ [key]: el[prop] });
      onPerfChanged(key, prev);
    });
  });
  const sr = $("#smoothRange");
  if (sr) {
    sr.value = Math.round(s.smoothing * 100);
    $("#smoothOut").textContent = `${sr.value}%`;
    sr.addEventListener("input", () => {
      $("#smoothOut").textContent = `${sr.value}%`;
      store.saveSettings({ smoothing: Number(sr.value) / 100 });
    });
  }
}
function onPerfChanged(key) {
  if (key === "perfProfile") {
    const activeKey = activeProfileKey();
    const p = PROFILES[activeKey];
    store.saveSettings({ sampleInterval: p.sampleInterval });
    syncAiSettingsUi();
    if (isLowTierCapped()) {
      toast("Máy yếu: giới hạn ở mức Trung bình.", "warn", 4e3);
    } else {
      reinit(`Đã chọn: ${p.label}`);
    }
    if (isLowTierCapped()) reinit();
  } else if (key === "backend" || key === "threadMode") {
    if (inference.mode === "main" && resolvedThreadMode() === "main" && inference.ready && key === "backend") {
      toast("Tải lại trang (F5) để đổi backend.", "warn", 4e3);
    } else {
      reinit();
    }
  }
  renderProfileDetail();
}
function bindAiSettingsSection() {
  syncAiSettingsUi();
  const minScoreEl = $("#setMinScore");
  if (minScoreEl) {
    minScoreEl.addEventListener("input", (e) => {
      const out = $("#setMinScoreOut");
      if (out) out.textContent = Number(e.target.value).toFixed(2);
    });
  }
  const provEl = $("#setLlmProvider");
  if (provEl) {
    provEl.addEventListener("change", (e) => {
      const p = PRESETS[e.target.value];
      if (!p) return;
      if ($("#setLlmEndpoint")) $("#setLlmEndpoint").value = p.baseUrl;
      if ($("#setLlmModel")) $("#setLlmModel").value = p.model;
    });
  }
  $("#testLlmBtn")?.addEventListener("click", async () => {
    const out = $("#llmTestResult");
    if (!out) return;
    out.textContent = "Đang kiểm tra…";
    out.className = "muted small";
    const r = await testLlmConnection(readAiFormSettings());
    out.textContent = r.message;
    out.className = `small ${r.ok ? "ok-text" : "err-text"}`;
    if (r.models?.length && $("#modelList")) {
      $("#modelList").innerHTML = r.models.slice(0, 40).map((m) => `<option value="${escapeHtml(m)}">`).join("");
    }
  });
  $("#saveSystemAiSettingsBtn")?.addEventListener("click", () => {
    const prev = { ...store.settings };
    const next = readAiFormSettings();
    store.saveSettings(next);
    const modelChanged = prev.modelType !== next.modelType || prev.detectObjects !== next.detectObjects;
    if (modelChanged && inference.ready) {
      reinit("Đã lưu.");
    } else {
      toast("Đã lưu.", "ok");
    }
  });
  hasProxy().then((ok) => {
    const note = $("#proxyNote");
    if (note) {
      note.innerHTML = ok ? '<span class="ok-text">✓ server.py đang chạy</span>' : "Chưa chạy server.py (link YouTube/TikTok/FB cần server).";
    }
  });
}
function syncAiSettingsUi() {
  const s = store.settings;
  if ($("#setModelType")) $("#setModelType").value = s.modelType || "multi";
  if ($("#setMinScore")) $("#setMinScore").value = s.minPoseScore ?? 0.25;
  if ($("#setMinScoreOut")) $("#setMinScoreOut").textContent = Number(s.minPoseScore ?? 0.25).toFixed(2);
  if ($("#setSampleInterval")) $("#setSampleInterval").value = String(s.sampleInterval ?? 0.1);
  if ($("#setDetectObjects")) $("#setDetectObjects").checked = !!s.detectObjects;
  if ($("#setLlmProvider")) $("#setLlmProvider").value = s.llmProvider || "gemini";
  if ($("#setLlmEndpoint")) $("#setLlmEndpoint").value = s.llmEndpoint || PRESETS.gemini.baseUrl;
  if ($("#setLlmModel")) $("#setLlmModel").value = s.llmModel || PRESETS.gemini.model;
  if ($("#setLlmKey")) $("#setLlmKey").value = s.llmKey || "";
  if ($("#setGoogleSearch")) $("#setGoogleSearch").checked = s.enableGoogleSearch !== false;
}
function readAiFormSettings() {
  return {
    modelType: $("#setModelType")?.value || "multi",
    minPoseScore: Number($("#setMinScore")?.value || 0.25),
    sampleInterval: Number($("#setSampleInterval")?.value || 0.1),
    detectObjects: !!$("#setDetectObjects")?.checked,
    detectFaces: false,
    faceEmotion: false,
    faceRecog: false,
    llmProvider: $("#setLlmProvider")?.value || "gemini",
    llmEndpoint: ($("#setLlmEndpoint")?.value || PRESETS.gemini.baseUrl).trim(),
    llmModel: ($("#setLlmModel")?.value || PRESETS.gemini.model).trim(),
    llmKey: ($("#setLlmKey")?.value || "").trim(),
    enableGoogleSearch: $("#setGoogleSearch") ? !!$("#setGoogleSearch").checked : true
  };
}
function reinit(message) {
  if (!inference.ready) {
    if (message) toast(message, "ok");
    return;
  }
  if (store.analyzing) {
    toast("Thay đổi sẽ áp dụng ở lần phân tích sau.", "warn");
    return;
  }
  inference.init(modelConfig()).then((info) => toast(message || `Đang dùng ${info.backend} · ${info.mode === "worker" ? "Web Worker" : "luồng chính"}.`, "ok")).catch((err) => toast(err.message, "error", 6e3));
}
function renderProfileDetail() {
  const rt = runtime();
  const p = PROFILES[rt.key];
  const capped = isLowTierCapped();
  const why = capped ? ' <span class="warn-text">(giới hạn máy yếu)</span>' : store.settings.perfProfile === "auto" ? power.batteryLow ? " (tự chọn vì pin yếu)" : hw.tier ? ` (tự chọn cho ${TIER_LABEL[hw.tier].toLowerCase()})` : "" : "";
  const el = $("#profileDetail");
  if (!el) return;
  el.innerHTML = `<b>${p.label}</b>${why} · ${rt.poseDim}px` + (rt.level ? ` · <span class="warn-text">giảm tải ${rt.level}/3</span>` : "") + (inference.ready ? ` · ${inference.backend} (${inference.mode === "worker" ? "worker" : "luồng chính"})` : "");
}
function renderHardware() {
  if (!hw.ready || !$("#hwTable")) return;
  const yes = (v) => v ? '<span class="ok-text">Có</span>' : '<span class="muted">Không</span>';
  const rows = [
    ["Hệ điều hành", `${escapeHtml(hw.os)}${hw.arch ? ` · ${escapeHtml(hw.arch)}` : ""}`],
    ["Trình duyệt", escapeHtml(hw.browser)],
    ["CPU (luồng logic)", hw.cores ?? "Không rõ"],
    ["RAM (ước lượng)", hw.memoryGB ? `≥ ${hw.memoryGB} GB` : "Trình duyệt không cung cấp"],
    ["GPU", `${escapeHtml(hw.gpu.renderer)}${hw.gpu.software ? ' <span class="warn-text">(giả lập bằng phần mềm)</span>' : ""}`],
    ["WebGL", hw.gpu.webgl ? `WebGL ${hw.gpu.webgl} · texture tối đa ${hw.gpu.maxTexture}px` : '<span class="warn-text">Không có</span>'],
    ["WebGPU", hw.webgpu ? `Có${hw.webgpuInfo ? ` · ${escapeHtml(hw.webgpuInfo)}` : ""}` : '<span class="muted">Không</span>'],
    ["WASM SIMD", yes(hw.wasmSimd)],
    ["WASM đa luồng", hw.wasmThreads ? '<span class="ok-text">Có</span>' : '<span class="muted">Không (cần chạy server.py --isolate)</span>'],
    ["Web Worker + OffscreenCanvas", `${yes(hw.worker)} / ${yes(hw.offscreenCanvas)}`],
    ["Đồng bộ khung video (rVFC)", yes(hw.videoFrameCallback)],
    ["Màn hình", hw.screen]
  ];
  $("#hwTable").innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
  const badge = $("#tierBadge");
  if (badge) {
    badge.textContent = TIER_LABEL[hw.tier];
    badge.dataset.tier = hw.tier;
  }
  if ($("#osTips")) $("#osTips").innerHTML = osTips();
}
function osTips() {
  const os = hw.os.toLowerCase();
  const tips = [];
  if (hw.gpu.software || !hw.gpu.webgl) {
    tips.push("Chưa dùng GPU: bật “Tăng tốc phần cứng” trong trình duyệt.");
  }
  if (os.startsWith("windows")) {
    tips.push("Laptop 2 GPU: chọn “High performance” cho trình duyệt.");
  } else if (os.includes("mac")) {
    tips.push("Cấp quyền camera trong Privacy & Security.");
  } else if (os.includes("android") || os.includes("ios")) {
  }
  if (hw.tier === "low") {
    tips.push("Máy yếu: mức Cao tự giới hạn về Trung bình.");
  }
  return tips.map((t) => `<p>${t}</p>`).join("");
}
function renderBench(data) {
  const el = $("#benchTable");
  if (!el) return;
  if (!data?.results?.length) {
    el.innerHTML = "";
    return;
  }
  const stale = data.fingerprint !== hw.fingerprint;
  el.innerHTML = `<table class="mini-table">
    <thead><tr><th>Backend</th><th>Trung vị</th><th>p95</th><th>Khung/giây</th><th>Ghi chú</th></tr></thead>
    <tbody>${data.results.map((r) => `<tr class="${r.backend === data.best ? "is-best" : ""}">
      <td>${r.backend.toUpperCase()}</td>
      <td>${r.ok ? `${r.median} ms` : "–"}</td><td>${r.ok ? `${r.p95} ms` : "–"}</td>
      <td>${r.ok ? r.fps : "–"}</td>
      <td>${r.ok ? r.backend === data.best ? "★ nhanh nhất" : "" : escapeHtml(r.note || "không chạy được")}</td></tr>`).join("")}
    </tbody></table>
    <p class="muted small">Đo lúc ${new Date(data.at).toLocaleString("vi-VN")}${stale ? ' — <span class="warn-text">trên cấu hình khác, nên đo lại</span>' : ""}.</p>`;
}
function startMetrics() {
  stopMetrics();
  renderProfileDetail();
  const tick2 = () => {
    renderMetrics();
    drawSpark();
  };
  tick2();
  metricsTimer = setInterval(tick2, 500);
}
function stopMetrics() {
  clearInterval(metricsTimer);
  metricsTimer = null;
}
function renderMetrics() {
  const el = $("#metrics");
  if (!el) return;
  const s = inference.stats;
  const mem = s.memory || {};
  const rt = runtime();
  const heap = performance.memory ? `${round(performance.memory.usedJSHeapSize / 1048576, 0)} / ${round(performance.memory.jsHeapSizeLimit / 1048576, 0)} MB` : "Không hỗ trợ";
  const items = [
    ["Backend", inference.ready ? `${inference.backend} · ${inference.mode === "worker" ? "worker" : "luồng chính"}` : "chưa khởi tạo"],
    ["Hồ sơ hiệu năng", `${PROFILES[rt.key].label}${isLowTierCapped() ? " (Giới hạn máy yếu)" : ""}${rt.level ? ` · giảm tải ${rt.level}` : ""}`],
    ["Ảnh tư thế thực tế", `${s.poseDim || rt.poseDim}px · gửi worker ${rt.inputWidth}px`],
    ["Khởi tạo AI", s.startupMs ? `${round(s.startupMs / 1e3, 1)} giây` : "–"],
    ["Suy luận TB", s.calls ? `${round(s.emaMs, 1)} ms` : "–"],
    ["Suy luận p95", s.calls ? `${round(inference.p95(), 1)} ms` : "–"],
    ["Phân tích/giây (Mục tiêu ≥10/s)", live.inferFps ? `${round(live.inferFps, 1)} /s` : "–"],
    ["Hiển thị FPS (Mục tiêu ≥14 FPS)", live.renderFps ? `${round(live.renderFps, 1)} FPS` : "–"],
    ["Camera", live.source === "camera" && live.cameraFps ? `${live.cameraRes} @ ${round(live.cameraFps, 0)} fps` : "–"],
    ["Tensor", mem.numTensors != null ? `${mem.numTensors} · ${round(mem.numBytes / 1048576, 1)} MB` : "–"],
    ["Bộ nhớ JS", heap],
    ["Pin", power.level != null ? `${Math.round(power.level * 100)}%${power.charging ? " · đang sạc" : ""}` : "Không rõ"],
    ["Log CSV", `${perfLogSize()} dòng`]
  ];
  el.innerHTML = items.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("");
}
function drawSpark() {
  const c = $("#perfSpark");
  if (!c) return;
  const w = c.clientWidth || 600;
  if (c.width !== w) c.width = w;
  const h = c.height;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, w, h);
  const data = inference.stats.samples;
  if (data.length < 2) {
    ctx.fillStyle = "#6d7f8f";
    ctx.font = "12px system-ui";
    ctx.fillText("Chưa có dữ liệu — bật camera hoặc phân tích video.", 8, h / 2);
    return;
  }
  const budget = 1e3 / runtime().targetFps;
  const max = Math.max(budget * 1.5, ...data) * 1.1;
  const y = (v) => h - v / max * (h - 6) - 3;
  ctx.strokeStyle = "rgba(255,93,115,.6)";
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, y(budget));
  ctx.lineTo(w, y(budget));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(255,93,115,.8)";
  ctx.font = "11px system-ui";
  ctx.fillText(`ngân sách ${Math.round(budget)} ms`, 6, y(budget) - 4);
  ctx.strokeStyle = "#f2b134";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  data.forEach((v, i) => {
    const x = i / (data.length - 1) * w;
    i ? ctx.lineTo(x, y(v)) : ctx.moveTo(x, y(v));
  });
  ctx.stroke();
}

// js/theme-ui.js
var THEME_KEY = "behaviorlens-theme";
function initThemeUi() {
  const button = document.getElementById("themeToggle");
  const apply2 = (theme) => {
    const light = theme === "light";
    document.documentElement.dataset.theme = light ? "light" : "dark";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", light ? "#ffffff" : "#0a1017");
    const label = light ? "Chuyển sang chế độ tối" : "Chuyển sang chế độ sáng";
    button?.setAttribute("aria-label", label);
    button?.setAttribute("title", label);
    button?.setAttribute("aria-pressed", String(light));
  };
  apply2(document.documentElement.dataset.theme || "dark");
  button?.addEventListener("click", () => {
    const theme = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    apply2(theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
    }
  });
  window.addEventListener("storage", (event) => {
    if (event.key === THEME_KEY) apply2(event.newValue);
  });
}

// js/app.js
var TABS = ["video", "camera", "learn", "system"];
var NO_RESULTS = /* @__PURE__ */ new Set(["learn", "system"]);
var warmModel = () => inference.init(modelConfig()).catch((e) => console.warn("Tải trước mô hình thất bại:", e.message));
async function init() {
  initThemeUi();
  if ($("#appVersion")) $("#appVersion").textContent = `Phiên bản ${APP_VERSION}`;
  await initPackageStore().catch((e) => console.warn("Khởi tạo kho gói dữ liệu:", e));
  initCamera();
  initTabs();
  initModelStatus();
  if ("serviceWorker" in navigator && window.isSecureContext) {
    navigator.serviceWorker.register(new URL("../asset-cache.js", import.meta.url)).catch((err) => console.warn("Không lưu được bộ nhớ đệm AI:", err.message));
  }
  initPlayer();
  initUpload();
  initResults();
  initChatbot();
  initImportExport();
  fixSavedLlmSettings();
  initShortcuts();
  initLearnUi();
  initSystemUi();
  store.on("inference-info", (info) => {
    const wanted = store.settings.backend;
    if (wanted !== "auto" && info.backend !== wanted) {
      toast(`Backend ${wanted} không chạy được trên máy này — đang dùng ${info.backend}. Chi tiết ở tab Hệ thống.`, "warn", 6e3);
    }
  });
  store.on("adaptive", ({ level, direction }) => {
    toast(direction === "down" ? `Máy đang tải cao — tự điều chỉnh mức ${level}/3 để giữ ≥10 phân tích/s và ≥14 FPS.` : `Máy đã rảnh hơn — tăng lại chất lượng (mức ${level}/3).`, direction === "down" ? "warn" : "info", 2500);
  });
  initLearner().catch((e) => console.warn("Không đọc được dữ liệu học:", e));
  await detectHardware().catch((e) => console.warn("Không nhận diện được phần cứng:", e));
  if (hw.ready && hw.tier === "low" && store.settings.perfProfile === "auto") {
    toast(`Nhận diện: ${TIER_LABEL.low} (${hw.cores || "?"} luồng CPU). Đã chọn hồ sơ Tiết kiệm tối ưu (≥10 phân tích/s, ≥14 FPS).`, "info", 5500);
  }
  warmModel();
}
function initTabs() {
  const select = (name) => {
    if (!TABS.includes(name)) name = "video";
    $$(".tab").forEach((t) => {
      const on = t.dataset.tab === name;
      t.classList.toggle("is-active", on);
      t.setAttribute("aria-selected", on);
    });
    TABS.forEach((tab) => {
      const panel = $(`#panel-${tab}`);
      if (panel) panel.hidden = name !== tab;
    });
    if ($("#resultsSection")) $("#resultsSection").hidden = NO_RESULTS.has(name);
    const btn = $(`.tab[data-tab="${name}"]`);
    if (btn) {
      if ($("#pageTitle")) $("#pageTitle").textContent = btn.dataset.title;
      if ($("#mobilePageTitle")) $("#mobilePageTitle").textContent = btn.querySelector("span")?.textContent || name;
      if ($("#pageSub")) $("#pageSub").textContent = btn.dataset.sub;
    }
    window.scrollTo(0, 0);
  };
  $$(".tab").forEach((t) => t.addEventListener("click", () => {
    if (t.dataset.tab !== "camera" && isCameraRunning()) {
      toast("Camera vẫn đang chạy ở nền. Bấm “Tắt camera” nếu không dùng nữa.", "info");
    }
    $(".app")?.classList.remove("is-sidebar-open");
    store.emit("switch-tab", t.dataset.tab);
  }));
  store.on("switch-tab", select);
  $("#mobileSettingsBtn")?.addEventListener("click", () => store.emit("switch-tab", "system"));
  const setSidebarOpen = (open2) => {
    const appEl = $(".app");
    if (!appEl) return;
    const next = typeof open2 === "boolean" ? open2 : !appEl.classList.contains("is-sidebar-open");
    appEl.classList.toggle("is-sidebar-open", next);
  };
  $("#sidebarToggleBtn")?.addEventListener("click", () => setSidebarOpen());
  $("#sidebarCloseBtn")?.addEventListener("click", () => setSidebarOpen(false));
  $("#sidebarBackdrop")?.addEventListener("click", () => setSidebarOpen(false));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $(".app")?.classList.contains("is-sidebar-open")) {
      setSidebarOpen(false);
    }
  });
}
function initModelStatus() {
  const el = $("#modelStatus");
  if (!el) return;
  store.on("model-status", ({ state: state2, text }) => {
    el.dataset.state = state2;
    el.textContent = text;
  });
  store.on("model-warning", (msg) => toast(msg, "warn", 6e3));
}
function initImportExport() {
  const btn = $("#exportBtn");
  const menu = $("#exportMenu");
  if (!btn || !menu) return;
  const close = () => {
    menu.hidden = true;
    btn.setAttribute("aria-expanded", "false");
  };
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    btn.setAttribute("aria-expanded", String(!menu.hidden));
  });
  document.addEventListener("click", close);
  menu.addEventListener("click", (e) => {
    const kind = e.target.closest("[data-export]")?.dataset.export;
    if (!kind) return;
    if (kind === "json-all") exportJSON({ filtered: false });
    if (kind === "json-filtered") exportJSON({ filtered: true });
    if (kind === "csv") exportCSV();
    close();
  });
  const input = $("#jsonInput");
  input?.addEventListener("change", async () => {
    const f = input.files?.[0];
    if (f) await importJSONFile(f);
    input.value = "";
  });
  store.on("import-json-file", (file) => importJSONFile(file));
}
function fixSavedLlmSettings() {
  const { settings: fixed, notes } = normalizeLlmSettings(store.settings);
  if (!notes.length) return;
  store.saveSettings({ llmKey: fixed.llmKey, llmEndpoint: fixed.llmEndpoint, llmModel: fixed.llmModel });
}
function initShortcuts() {
  document.addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea, select, button, [contenteditable], dialog")) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if ($("#panel-video")?.hidden) return;
    const map = {
      " ": togglePlay,
      k: togglePlay,
      s: stopVideo,
      ArrowLeft: () => skip(-5),
      ArrowRight: () => skip(5),
      ",": () => stepFrame(-1),
      ".": () => stepFrame(1),
      j: () => jumpEvent(-1),
      l: () => jumpEvent(1)
    };
    const fn = map[e.key] || map[e.key.toLowerCase?.()];
    if (fn) {
      e.preventDefault();
      fn();
    }
  });
}
init().catch((error) => {
  console.error("Khởi động ứng dụng:", error);
  store.emit("model-status", { state: "error", text: "Lỗi khởi động ứng dụng" });
  toast("Không khởi động được ứng dụng: " + error.message, "error", 15e3);
});
export {
  AI_COLORS,
  APP_NAME,
  APP_VERSION,
  AnalysisService,
  BEHAVIORS,
  BehaviorEngine,
  CDN,
  CORE_BEHAVIORS,
  DEFAULT_SETTINGS,
  HAND_SKELETON,
  HEAD_SKELETON,
  InferenceService,
  KP,
  LEARNED_COLORS,
  PERSON_COLORS,
  PROFILES,
  SKELETON,
  SegmentBuilder,
  TIER_LABEL,
  TaskScheduler,
  UNKNOWN_BEHAVIOR,
  activeProfileKey,
  adaptTick,
  addUserRecordedVideo,
  addVideoSourceItem,
  answerLocal,
  applyPackageToWorkspace,
  attachVideoSource,
  backendOrder,
  behaviorInfo,
  buildActionStepsAndDraftName,
  canUseWorker,
  clearVideoStage,
  compactFace,
  computeHandsSkeleton,
  computeHeadSkeleton,
  createZipBlob,
  currentTime,
  defaultStandingKeypoints,
  deletePackage,
  detectHardware,
  evaluatePoseAccuracy,
  expandFace,
  exportPackageZip,
  exportPerfLog,
  extractPostureAngles,
  extractZip,
  fitStage,
  getOverlayCanvas,
  getPackage,
  getUserVideoUrl,
  getVideo,
  getVideoSourceBlobUrl,
  handleCommand,
  hasVideo,
  hw,
  importPackageZip,
  inference,
  initChatbot,
  initFaces,
  initPackageStore,
  initPackages,
  initPlayer,
  isLowTierCapped,
  isPlatformVideoUrl,
  jumpEvent,
  listPeople,
  live,
  loadBenchmark,
  logPerf,
  modelConfig,
  packageStore,
  parseVideoUrl,
  perfLogSize,
  perfSummary,
  personColor,
  personLabel,
  personName,
  power,
  preparePlatformVideo,
  promptApprovePackagePopup,
  refineDraftWithGemini,
  registerAiBehavior,
  removeUserRecordedVideo,
  removeVideoSourceItem,
  renamePackage,
  renderLanes,
  resetAdaptive,
  resetChat,
  resolvePlatformVideo,
  resolvedThreadMode,
  runBenchmark,
  runtime,
  savePackage,
  seekTo,
  seekVideoFrame,
  seekVideoWithRecovery,
  send,
  skip,
  stepFrame,
  stopVideo,
  store,
  togglePlay,
  unavailablePlatformStats,
  videoErrorMessage,
  waitForMedia
};
