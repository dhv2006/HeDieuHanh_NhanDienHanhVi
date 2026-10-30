// =========================================================
// packages.js — Hệ quản trị CSDL Gói Phân tích Chuỗi Động tác,
// Danh sách Nguồn Video/Link, Video Quay từ Camera & Xuất/Nhập .ZIP
// =========================================================
import { store } from './store.js';
import { dbGet, dbSet } from './db.js';
import { registerAiBehavior, behaviorInfo } from './config.js';
import { buildActionStepsAndDraftName, defaultStandingKeypoints } from './behavior.js';
import { createZipBlob, extractZip } from './zip-io.js';
import { uid, fmtTimeMs, safeFileName, downloadBlob, toast, round } from './utils.js';
import { llmReady, chat } from './llm.js';

const DB_PACKAGES_KEY = 'packages-v3';
const DB_SOURCES_KEY = 'video-sources-v3';
const DB_USER_VIDEOS_KEY = 'user-camera-videos-v3';

const memVideoBlobs = new Map(); // Lưu URL tạm của file video tải lên trong phiên

function emitPackages() {
  store.emit('packages', packageStore.packages);
  store.emit('packages-changed', packageStore.packages);
}

function emitVideoSources() {
  store.emit('video-sources', packageStore.videoSources);
  store.emit('video-sources-changed', packageStore.videoSources);
}

function emitUserVideos() {
  store.emit('user-videos', packageStore.userVideos);
  store.emit('user-videos-changed', packageStore.userVideos);
}

function normalizeStep(st, idx = 0) {
  const label = st.label || st.title || `Bước ${st.stepNumber || idx + 1}`;
  const instruction = st.instruction || st.description || `Thực hiện: ${label}`;
  const jointDetail = st.jointDetail || st.jointAngles || '';
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
    startMs: st.startMs ?? Math.round((st.start ?? 0) * 1000),
    endMs: st.endMs ?? Math.round((st.end ?? 1.5) * 1000),
    keypoints: st.keypoints || defaultStandingKeypoints(idx % 3),
  };
}

function normalizeSegment(s) {
  const jointDetail = s.jointDetail || s.jointAngles || '';
  const instruction = s.instruction || s.stepHint || '';
  return {
    ...s,
    jointDetail,
    jointAngles: jointDetail,
    instruction,
    stepHint: instruction,
    startMs: s.startMs ?? Math.round((s.start || 0) * 1000),
    endMs: s.endMs ?? Math.round((s.end || 0) * 1000),
    durationMs: s.durationMs ?? Math.max(1, Math.round(((s.end || 0) - (s.start || 0)) * 1000)),
  };
}

/** Tạo dữ liệu mẫu mặc định để người dùng có thể thử ngay Hướng dẫn & Kiểm tra ở Camera */
function createSamplePackages() {
  const kpNeutral = defaultStandingKeypoints('neutral');
  const kpSide = defaultStandingKeypoints('arms_side');
  const kpUp = defaultStandingKeypoints('arms_up');
  const kpSquat = defaultStandingKeypoints('squat');
  const kpHeadRight = defaultStandingKeypoints('head_turn_right');

  registerAiBehavior('ai_neutral_stance', 'AI: Tư thế đứng thẳng chuẩn bị (Thân 0°)', {
    parentBehavior: 'standing',
    jointDetail: 'Đầu 0°/0° · Tay T 172° · Tay P 172° · Thân 0°',
    instruction: 'Đứng thẳng hai chân rộng bằng vai, mắt nhìn thẳng, hai bàn tay thả lỏng.',
  });
  registerAiBehavior('ai_arms_horizontal', 'AI: Dang ngang hai cánh tay & xòe bàn tay (Góc vai 90°)', {
    parentBehavior: 'hand_action',
    jointDetail: 'Đầu 0°/0° · Tay T 175° · Tay P 175° · Vai 90°',
    instruction: 'Nâng đồng thời hai cánh tay sang ngang tầm vai (90°), duỗi thẳng khuỷu tay và mở 5 ngón bàn tay.',
  });
  registerAiBehavior('ai_raise_both_hands', 'AI: Vươn cao hai tay qua đầu (Góc khuỷu 168°)', {
    parentBehavior: 'hand_action',
    jointDetail: 'Đầu -5°/0° · Tay T 168° · Tay P 168° · Thân 0°',
    instruction: 'Đưa hai cánh tay vươn thẳng lên cao qua đầu, lòng bàn tay hướng vào nhau, giữ trục cổ thẳng.',
  });
  registerAiBehavior('ai_squat_knee', 'AI: Hạ trọng tâm Squat & giữ tay trước ngực (Góc gối 95°)', {
    parentBehavior: 'squatting',
    jointDetail: 'Đầu +4°/0° · Tay T 110° · Tay P 110° · Gối 95°',
    instruction: 'Đẩy hông ra sau, gập hai đầu gối xuống góc ~95°, hai bàn tay đưa ra trước ngực giữ thăng bằng.',
  });
  registerAiBehavior('ai_head_turn_right', 'AI: Xoay khung xương đầu sang phải & duỗi tay phải', {
    parentBehavior: 'head_motion',
    jointDetail: 'Đầu 0°/-28° · Tay P 170° · Thân 0°',
    instruction: 'Giữ hai vai cố định, xoay đầu sang phải 28° kết hợp nâng thẳng cánh tay và bàn tay phải.',
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
            labels: [st.parentBehavior || 'standing', st.behavior],
            kp: st.keypoints.map((k) => [k.x, k.y, k.score]),
          }],
        });
      }
    }
    return frames;
  };

  const steps1 = [
    normalizeStep({
      stepNumber: 1,
      behavior: 'ai_neutral_stance',
      parentBehavior: 'standing',
      label: 'Tư thế đứng thẳng chuẩn bị',
      instruction: 'Bước 1: Đứng thẳng tự nhiên, hai chân mở rộng bằng vai, khung xương đầu giữ thẳng, hai bàn tay thả lỏng.',
      jointDetail: 'Đầu 0° · Tay T 172° · Tay P 172° · Thân 0°',
      start: 0, end: 1.5, startMs: 0, endMs: 1500,
      keypoints: kpNeutral,
    }, 0),
    normalizeStep({
      stepNumber: 2,
      behavior: 'ai_arms_horizontal',
      parentBehavior: 'hand_action',
      label: 'Dang ngang hai tay & mở bàn tay (90°)',
      instruction: 'Bước 2: Từ từ nâng hai cánh tay sang ngang bằng vai (90°), duỗi thẳng khuỷu tay và mở các đốt ngón tay.',
      jointDetail: 'Đầu 0° · Tay T 175° · Tay P 175° · Vai 90°',
      start: 1.5, end: 3.2, startMs: 1500, endMs: 3200,
      keypoints: kpSide,
    }, 1),
    normalizeStep({
      stepNumber: 3,
      behavior: 'ai_raise_both_hands',
      parentBehavior: 'hand_action',
      label: 'Vươn cao hai bàn tay qua đầu',
      instruction: 'Bước 3: Đưa tiếp hai cánh tay và bàn tay vươn thẳng lên cao qua đầu, hít sâu, giữ thân người thẳng.',
      jointDetail: 'Đầu -5° · Tay T 168° · Tay P 168° · Thân 0°',
      start: 3.2, end: 5.0, startMs: 3200, endMs: 5000,
      keypoints: kpUp,
    }, 2),
    normalizeStep({
      stepNumber: 4,
      behavior: 'ai_squat_knee',
      parentBehavior: 'squatting',
      label: 'Hạ trọng tâm Squat (Góc gối 95°)',
      instruction: 'Bước 4: Hạ hai tay về trước ngực đồng thời gập hai gối xuống góc ~95°, giữ lưng thẳng và đầu nhìn về trước.',
      jointDetail: 'Đầu +4° · Tay T 110° · Tay P 110° · Gối 95°',
      start: 5.0, end: 7.2, startMs: 5000, endMs: 7200,
      keypoints: kpSquat,
    }, 3),
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
      source: 'video',
      keyframeKp: st.keypoints,
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
      source: 'video',
      keyframeKp: st.keypoints,
    }),
  ]);

  const steps2 = [
    normalizeStep({
      stepNumber: 1,
      behavior: 'ai_neutral_stance',
      parentBehavior: 'standing',
      label: 'Đứng thẳng chuẩn bị',
      instruction: 'Bước 1: Đứng thẳng, cố định trục vai và hông, mắt nhìn thẳng về camera.',
      jointDetail: 'Đầu 0° · Tay T 172° · Tay P 172°',
      start: 0, end: 1.4, startMs: 0, endMs: 1400,
      keypoints: kpNeutral,
    }, 0),
    normalizeStep({
      stepNumber: 2,
      behavior: 'ai_head_turn_right',
      parentBehavior: 'head_motion',
      label: 'Xoay khung xương đầu sang phải & duỗi tay phải',
      instruction: 'Bước 2: Xoay đầu sang phải khoảng 28° đồng thời nâng thẳng cánh tay và bàn tay phải ngang vai.',
      jointDetail: 'Đầu -28° · Tay P 170° · Thân 0°',
      start: 1.4, end: 3.4, startMs: 1400, endMs: 3400,
      keypoints: kpHeadRight,
    }, 1),
    normalizeStep({
      stepNumber: 3,
      behavior: 'ai_raise_both_hands',
      parentBehavior: 'hand_action',
      label: 'Thu đầu về giữa & vươn hai tay lên cao',
      instruction: 'Bước 3: Xoay đầu trở lại chính diện và vươn thẳng cả hai cánh tay lên cao qua đầu.',
      jointDetail: 'Đầu 0° · Tay T 168° · Tay P 168°',
      start: 3.4, end: 5.2, startMs: 3400, endMs: 5200,
      keypoints: kpUp,
    }, 2),
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
      source: 'video',
      keyframeKp: st.keypoints,
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
      source: 'video',
      keyframeKp: st.keypoints,
    }),
  ]);

  return [
    {
      id: 'sample-warmup-squat',
      name: 'Chuỗi động tác mẫu: Khởi động Tay - Đầu & Hạ trọng tâm Squat',
      summary: 'Bài tập khởi động 4 bước kết hợp dang tay, vươn tay qua đầu và hạ trọng tâm Squat.',
      createdAt: new Date().toISOString(),
      source: 'video',
      mediaName: 'mau_khoi_dong_squat.mp4',
      duration: 7.2,
      durationMs: 7200,
      voiceTranscript: '',
      steps: steps1,
      segments: segs1,
      frames: makeFrames(steps1),
    },
    {
      id: 'sample-head-hand-coord',
      name: 'Chuỗi động tác mẫu: Phối hợp Xoay Đầu & Chuyển động Bàn tay',
      summary: 'Bài tập phối hợp xoay khung xương đầu 28° kết hợp duỗi thẳng cánh tay và vươn hai tay.',
      createdAt: new Date().toISOString(),
      source: 'video',
      mediaName: 'mau_phoi_hop_dau_tay.mp4',
      duration: 5.2,
      durationMs: 5200,
      voiceTranscript: '',
      steps: steps2,
      segments: segs2,
      frames: makeFrames(steps2),
    },
  ];
}

export const packageStore = {
  packages: [],      // Danh sách các gói dữ liệu phân tích (Nhãn chuỗi động tác)
  videoSources: [],  // Danh sách video tải lên & link đã nhập (YouTube, TikTok, FB, ZIP…)
  userVideos: [],    // Danh sách video quay hành vi người dùng từ Camera
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
  },
};

export async function initPackages() {
  const savedPkgs = await dbGet(DB_PACKAGES_KEY);
  if (Array.isArray(savedPkgs) && savedPkgs.length) {
    packageStore.packages = savedPkgs.map((p) => ({
      ...p,
      steps: (p.steps || []).map((st, idx) => normalizeStep(st, idx)),
      segments: (p.segments || []).map((s) => normalizeSegment(s)),
    }));
  } else {
    packageStore.packages = createSamplePackages();
    await dbSet(DB_PACKAGES_KEY, packageStore.packages);
  }

  // Đăng ký toàn bộ các nhãn AI có trong các gói đã lưu
  for (const pkg of packageStore.packages) {
    for (const seg of pkg.segments || []) {
      if (seg.isAiGenerated || String(seg.behavior).startsWith('ai_')) {
        const stepMatch = (pkg.steps || []).find((st) => st.behavior === seg.behavior);
        registerAiBehavior(seg.behavior, stepMatch ? `AI: ${stepMatch.label}` : seg.label || seg.behavior, {
          parentBehavior: seg.parentBehavior,
          jointDetail: seg.jointDetail,
          instruction: seg.instruction,
        });
      }
    }
  }

  const savedSources = await dbGet(DB_SOURCES_KEY);
  packageStore.videoSources = Array.isArray(savedSources) ? savedSources : [];

  const savedUserVids = await dbGet(DB_USER_VIDEOS_KEY);
  packageStore.userVideos = Array.isArray(savedUserVids) ? savedUserVids : [];

  packageStore.selectedPackageId = packageStore.packages[0]?.id || null;

  // Đồng bộ từ máy chủ SQLite nếu server.py đang chạy
  syncFromServer().catch(() => {});

  emitPackages();
  emitVideoSources();
  emitUserVideos();
}

export const initPackageStore = initPackages;

async function syncFromServer() {
  const res = await fetch('/api/packages', { cache: 'no-store' }).catch(() => null);
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
          segments: (p.segments || []).map((s) => normalizeSegment(s)),
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

export async function savePackage(pkg) {
  const entry = {
    ...pkg,
    id: pkg.id || `pkg_${Date.now()}_${uid()}`,
    createdAt: pkg.createdAt || new Date().toISOString(),
    steps: (pkg.steps || []).map((st, idx) => normalizeStep(st, idx)),
    segments: (pkg.segments || []).map((s) => normalizeSegment(s)),
  };
  const idx = packageStore.packages.findIndex((p) => p.id === entry.id);
  if (idx >= 0) packageStore.packages[idx] = entry;
  else packageStore.packages.unshift(entry);

  packageStore.selectedPackageId = entry.id;
  await dbSet(DB_PACKAGES_KEY, packageStore.packages);

  // Gửi lưu vào CSDL SQLite & thư mục trên server.py (nếu có)
  fetch('/api/packages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  }).catch(() => {});

  emitPackages();
  return entry;
}

export async function deletePackage(id) {
  packageStore.packages = packageStore.packages.filter((p) => p.id !== id);
  if (packageStore.selectedPackageId === id) {
    packageStore.selectedPackageId = packageStore.packages[0]?.id || null;
  }
  await dbSet(DB_PACKAGES_KEY, packageStore.packages);
  fetch(`/api/packages?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
  emitPackages();
}

export async function renamePackage(id, newName) {
  const pkg = packageStore.packages.find((p) => p.id === id);
  if (!pkg || !newName.trim()) return;
  pkg.name = newName.trim();
  await savePackage(pkg);
}

export function getPackage(id) {
  return packageStore.packages.find((p) => p.id === id) || packageStore.packages[0] || null;
}

/**
 * Nạp một gói dữ liệu phân tích lên không gian làm việc (Bảng hành vi & Bảng timeline mili-giây)
 */
export function applyPackageToWorkspace(pkg) {
  if (!pkg) return;
  packageStore.selectedPackageId = pkg.id;
  for (const s of pkg.segments || []) {
    if (s.isAiGenerated || String(s.behavior).startsWith('ai_')) {
      const stMatch = (pkg.steps || []).find((st) => st.behavior === s.behavior);
      registerAiBehavior(s.behavior, stMatch ? `AI: ${stMatch.label || stMatch.title}` : s.behaviorLabel || s.behavior, {
        parentBehavior: s.parentBehavior,
        jointDetail: s.jointDetail || s.jointAngles,
        instruction: s.instruction || s.stepHint,
      });
    }
  }
  store.setResults({
    segments: (pkg.segments || []).map((s) => normalizeSegment(s)),
    frames: pkg.frames || [],
    meta: {
      analyzedAt: pkg.createdAt,
      source: pkg.source || 'video',
      mediaName: pkg.mediaName || pkg.name,
      packageId: pkg.id,
      packageName: pkg.name,
    },
  });
  if (pkg.duration) {
    store.media = { ...store.media, name: pkg.mediaName || pkg.name, duration: pkg.duration };
    store.emit('media', store.media);
  }
}

// ---------------------------------------------------------
// Quản lý Danh sách Video tải lên & Link đã nhập (Yêu cầu 3)
// ---------------------------------------------------------
export async function addVideoSourceItem({ id: customId, name, type, kind, url = null, blobUrl = null, file = null, size = 0, duration = 0, packageId = null }) {
  const id = customId || `src_${Date.now()}_${uid()}`;
  let resolvedBlobUrl = blobUrl || null;
  if (file instanceof Blob) {
    resolvedBlobUrl = URL.createObjectURL(file);
    memVideoBlobs.set(id, resolvedBlobUrl);
  } else if (resolvedBlobUrl) {
    memVideoBlobs.set(id, resolvedBlobUrl);
  }
  const resolvedKind = kind || type || (url ? 'url' : 'file');
  // Tránh trùng lặp cùng tên/link vừa thêm
  packageStore.videoSources = packageStore.videoSources.filter(
    (s) => !(s.name === name && s.url === url && (s.kind || s.type) === resolvedKind)
  );
  const item = {
    id,
    name: name || 'Video phân tích',
    type: resolvedKind,
    kind: resolvedKind,
    url: url || null,
    blobUrl: resolvedBlobUrl,
    size: size || (file?.size ?? 0),
    duration: duration || 0,
    packageId: packageId || null,
    createdAt: Date.now(),
    addedAt: new Date().toISOString(),
  };
  packageStore.videoSources.unshift(item);
  if (packageStore.videoSources.length > 50) packageStore.videoSources.pop();
  await dbSet(DB_SOURCES_KEY, packageStore.videoSources);
  emitVideoSources();
  return item;
}

export function getVideoSourceBlobUrl(id) {
  return memVideoBlobs.get(id) || null;
}

export async function removeVideoSourceItem(id) {
  if (memVideoBlobs.has(id)) {
    URL.revokeObjectURL(memVideoBlobs.get(id));
    memVideoBlobs.delete(id);
  }
  packageStore.videoSources = packageStore.videoSources.filter((s) => s.id !== id);
  await dbSet(DB_SOURCES_KEY, packageStore.videoSources);
  emitVideoSources();
}

// ---------------------------------------------------------
// Quản lý Video quay hành vi người dùng từ Camera (Yêu cầu 2)
// ---------------------------------------------------------
export async function addUserRecordedVideo({ id: customId, name, blob, blobUrl: existingBlobUrl, duration, trimStart = 0, trimEnd = 0, voiceNote = '', voiceTranscript = '', packageId = null, steps = [] }) {
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
  const transcript = voiceNote || voiceTranscript || '';
  const entry = {
    id,
    name: name || `Video học chuyển động (${new Date().toLocaleTimeString('vi-VN')})`,
    duration: round(duration || 0, 2),
    trimStart: round(trimStart || 0, 2),
    trimEnd: round(trimEnd || duration || 0, 2),
    voiceNote: transcript,
    voiceTranscript: transcript,
    packageId,
    stepsCount: steps.length,
    createdAt: Date.now(),
    blobUrl: resolvedBlobUrl || dataUrl,
    dataUrl,
  };
  packageStore.userVideos.unshift(entry);
  if (packageStore.userVideos.length > 25) packageStore.userVideos.pop();
  await dbSet(DB_USER_VIDEOS_KEY, packageStore.userVideos);
  emitUserVideos();
  return entry;
}

export function getUserVideoUrl(entry) {
  if (!entry) return null;
  if (memVideoBlobs.has(entry.id)) return memVideoBlobs.get(entry.id);
  return entry.blobUrl || entry.dataUrl || null;
}

export async function removeUserRecordedVideo(id) {
  if (memVideoBlobs.has(id)) {
    URL.revokeObjectURL(memVideoBlobs.get(id));
    memVideoBlobs.delete(id);
  }
  packageStore.userVideos = packageStore.userVideos.filter((v) => v.id !== id);
  await dbSet(DB_USER_VIDEOS_KEY, packageStore.userVideos);
  emitUserVideos();
}

// ---------------------------------------------------------
// Nhờ Gemini AI đặt tên nháp & chuẩn hóa nhãn / lời mô tả giọng nói
// ---------------------------------------------------------
export async function refineDraftWithGemini({ draftName, steps, segments, voiceTranscript = '', mediaName = '' }) {
  if (!llmReady(store.settings)) {
    if (voiceTranscript.trim()) {
      const cleanVoice = voiceTranscript.trim();
      const updatedName = `Động tác: ${cleanVoice.slice(0, 55)}`;
      const updatedSteps = steps.map((st, idx) => normalizeStep({
        ...st,
        instruction: `${st.instruction} (Ghi chú giọng nói: "${cleanVoice}")`,
      }, idx));
      return { draftName: updatedName, steps: updatedSteps, aiRefined: false };
    }
    return { draftName, steps, aiRefined: false };
  }

  try {
    const stepSummary = steps.map((s) => `- Bước ${s.stepNumber} (${fmtTimeMs(s.start)} -> ${fmtTimeMs(s.end)}): ${s.label} | ${s.jointDetail}`).join('\n');
    const sys = `Bạn là chuyên gia AI phân tích chuyển động cơ thể và huấn luyện động tác.
Hãy dựa trên chuỗi nhãn động học (mili-giây) và lời mô tả giọng nói của người dùng (nếu có) để:
1. Đặt một tên nháp ngắn gọn, rõ nghĩa bằng tiếng Việt cho chuỗi động tác này.
2. Viết lại nhãn và lời hướng dẫn từng bước (steps) thật chuẩn xác, dễ hiểu để người tập làm theo.
Trả về ĐÚNG định dạng JSON hợp lệ (không bọc markdown):
{"draftName": "Tên chuỗi động tác...", "steps": [{"stepNumber": 1, "label": "Tên bước...", "instruction": "Hướng dẫn chi tiết dễ hiểu..."}]}`;

    const userMsg = `Tên video/nguồn: ${mediaName || 'Không rõ'}
Lời mô tả bằng giọng nói của người dùng: ${voiceTranscript || '(Không có)'}
Tên nháp ban đầu: ${draftName}
Các bước phát hiện theo mili-giây:
${stepSummary}`;

    const raw = await chat(store.settings, sys, [{ role: 'user', content: userMsg }], { maxTokens: 700 });
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
          instruction: newInst,
        });
        return normalizeStep({ ...st, label: newLabel, instruction: newInst }, i);
      });
      return { draftName: newName, steps: newSteps, aiRefined: true };
    }
  } catch (err) {
    console.warn('Gemini đặt tên nháp dự phòng:', err.message);
  }
  return { draftName, steps, aiRefined: false };
}

// ---------------------------------------------------------
// Xuất Gói Phân tích ra Thư mục .ZIP & Nhập từ .ZIP (Yêu cầu 3 & 6)
// ---------------------------------------------------------
export function exportPackageZip(pkg) {
  if (!pkg) {
    toast('Chưa có gói dữ liệu phân tích để tải về.', 'warn');
    return;
  }
  const folder = safeFileName(pkg.name || 'goi_phan_tich_dong_tac');
  const manifest = {
    app: 'behavior-analysis',
    version: '3.0.0',
    packageId: pkg.id,
    packageName: pkg.name,
    createdAt: pkg.createdAt,
    mediaName: pkg.mediaName || null,
    duration: pkg.duration || 0,
    durationMs: pkg.durationMs || Math.round((pkg.duration || 0) * 1000),
    totalSegments: (pkg.segments || []).length,
    totalSteps: (pkg.steps || []).length,
    totalFrames: (pkg.frames || []).length,
    voiceTranscript: pkg.voiceTranscript || '',
  };

  // Tạo bảng CSV thời gian mili-giây
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csvHeader = ['stt', 'start_time_ms', 'end_time_ms', 'start_sec', 'end_sec', 'duration_ms', 'person_id', 'type', 'behavior_key', 'behavior_label', 'joint_angles', 'step_instruction', 'confidence'];
  const csvRows = (pkg.segments || []).map((s, i) => [
    i + 1,
    fmtTimeMs(s.start),
    fmtTimeMs(s.end),
    s.start,
    s.end,
    s.durationMs ?? Math.round((s.end - s.start) * 1000),
    s.personId,
    s.isAiGenerated ? 'AI_SUB_LABEL' : 'CORE_BEHAVIOR',
    s.behavior,
    behaviorInfo(s.behavior).label,
    s.jointDetail || s.jointAngles || '',
    s.instruction || s.stepHint || '',
    s.confidence,
  ].map(esc).join(','));

  const entries = [
    { path: `${folder}/manifest.json`, content: JSON.stringify(manifest, null, 2) },
    { path: `${folder}/analysis_package.json`, content: JSON.stringify(pkg, null, 2) },
    { path: `${folder}/guide_steps.json`, content: JSON.stringify(pkg.steps || [], null, 2) },
    { path: `${folder}/keypoints_frames.json`, content: JSON.stringify(pkg.frames || []) },
    { path: `${folder}/timeline_miligiay.csv`, content: '\uFEFF' + [csvHeader.join(','), ...csvRows].join('\n') },
  ];

  const zipBlob = createZipBlob(entries);
  downloadBlob(`${folder}.zip`, zipBlob);
  toast(`Đã đóng gói thư mục CSDL và tải về "${folder}.zip".`, 'ok');
}

/**
 * Giải nén và nạp gói dữ liệu phân tích từ file .ZIP người dùng tải lên
 */
export async function importPackageZip(file) {
  const zip = await extractZip(file);
  const pkgText = zip.textOf('analysis_package.json') || zip.textOf('analysis.json') || zip.textOf('.json');
  if (!pkgText) {
    throw new Error('File .ZIP không chứa dữ liệu phân tích (analysis_package.json).');
  }
  const raw = JSON.parse(pkgText);
  const segments = (Array.isArray(raw.segments) ? raw.segments : []).map((s) => normalizeSegment(s));
  const frames = Array.isArray(raw.frames) ? raw.frames : [];
  let steps = (Array.isArray(raw.steps) ? raw.steps : []).map((st, idx) => normalizeStep(st, idx));

  if (!steps.length && segments.length) {
    steps = buildActionStepsAndDraftName(segments, frames, raw.mediaName || file.name).steps;
  }

  for (const s of segments) {
    if (s.isAiGenerated || String(s.behavior).startsWith('ai_')) {
      const stMatch = steps.find((st) => st.behavior === s.behavior);
      registerAiBehavior(s.behavior, stMatch ? `AI: ${stMatch.label}` : s.behaviorLabel || s.behavior, {
        parentBehavior: s.parentBehavior,
        jointDetail: s.jointDetail,
        instruction: s.instruction,
      });
    }
  }

  const pkg = await savePackage({
    id: raw.id || `pkg_${Date.now()}_${uid()}`,
    name: raw.name || raw.packageName || file.name.replace(/\.zip$/i, ''),
    summary: raw.summary || '',
    createdAt: raw.createdAt || new Date().toISOString(),
    source: raw.source || 'video',
    mediaName: raw.mediaName || file.name,
    duration: raw.duration || raw.media?.duration || Math.max(0, ...segments.map((s) => s.end), 0),
    durationMs: raw.durationMs || Math.round((raw.duration || 0) * 1000),
    voiceTranscript: raw.voiceTranscript || '',
    steps,
    segments,
    frames,
  });

  // Kiểm tra nếu trong file .ZIP có đính kèm cả file video (.mp4 / .webm / .mov)
  const videoEntry = zip.blobOf(/\.(mp4|webm|mov|m4v)$/i);

  await addVideoSourceItem({
    name: `${pkg.name} (Gói ZIP)`,
    kind: 'zip',
    duration: pkg.duration,
    packageId: pkg.id,
    file: videoEntry?.blob || null,
  });

  applyPackageToWorkspace(pkg);
  pkg.videoBlob = videoEntry || null;

  toast(`Đã nạp gói dữ liệu .ZIP "${pkg.name}" (${segments.length} nhãn hành động, ${steps.length} bước).`, 'ok', 5000);
  return pkg;
}

/**
 * Hiển thị Popup duyệt tên gói phân tích do AI đặt nháp (Yêu cầu 3)
 */
export async function promptApprovePackagePopup({ segments = [], frames = [], mediaName = '', duration = 0, source = 'video', voiceNote = '', voiceTranscript = '' }) {
  const transcript = voiceNote || voiceTranscript || '';
  const normSegments = segments.map((s) => normalizeSegment(s));
  const { draftName, steps } = buildActionStepsAndDraftName(normSegments, frames, mediaName);

  const dlg = document.getElementById('packageApproveDialog');
  const nameInput = document.getElementById('pkgDraftNameInput') || document.getElementById('pkgApproveName');
  const summaryInput = document.getElementById('pkgDraftSummaryInput');
  const previewStatsEl = document.getElementById('pkgDraftPreviewStats') || document.getElementById('pkgApproveSummary');
  const cancelBtn = document.getElementById('pkgCancelBtn');
  const approveBtn = document.getElementById('pkgApproveBtn');
  const approveZipBtn = document.getElementById('pkgApproveZipBtn');

  if (!dlg || !nameInput) {
    return savePackage({
      name: draftName,
      source,
      mediaName,
      duration,
      durationMs: Math.round((duration || 0) * 1000),
      voiceTranscript: transcript,
      steps,
      segments: normSegments,
      frames,
    });
  }

  nameInput.value = draftName;
  const aiSubCount = normSegments.filter((s) => s.isAiGenerated).length;
  const defaultSummary = transcript
    ? `Mô tả giọng nói: "${transcript}" — Gồm ${steps.length} bước động tác (${normSegments.length} nhãn phân tích).`
    : `Chuỗi ${steps.length} bước động tác (${aiSubCount} nhãn con chi tiết do AI tạo sinh trong ${fmtTimeMs(duration || 0)}).`;
  if (summaryInput) summaryInput.value = defaultSummary;

  const renderPreview = (stepList, badgeText) => {
    if (!previewStatsEl) return;
    const stepsHtml = stepList.slice(0, 6).map((st) => `
      <div style="margin-top:4px;font-size:12px;">
        • <b>Bước ${st.stepNumber} (${fmtTimeMs(st.start)} → ${fmtTimeMs(st.end)}):</b> ${st.label}
        <span class="muted">— ${st.instruction}</span>
      </div>
    `).join('');
    previewStatsEl.innerHTML = `
      <div><b>Trạng thái AI:</b> ${badgeText}</div>
      <div>Đã phân tích <b>${fmtTimeMs(duration || 0)}</b> · Tổng <b>${normSegments.length}</b> mốc nhãn (<b>${aiSubCount}</b> nhãn con AI) · <b>${stepList.length}</b> bước hướng dẫn:</div>
      ${stepsHtml}
    `;
  };

  renderPreview(steps, llmReady(store.settings) ? '⏳ Đang nhờ Gemini AI tinh chỉnh tên nháp…' : '✨ AI Động học đã đặt tên nháp tự động');

  if (!dlg.open) dlg.showModal();
  nameInput.focus();
  nameInput.select();

  let currentSteps = steps;
  refineDraftWithGemini({ draftName, steps, segments: normSegments, voiceTranscript: transcript, mediaName }).then((res) => {
    if (res.aiRefined && dlg.open) {
      if (nameInput.value === draftName) nameInput.value = res.draftName;
      currentSteps = res.steps;
      renderPreview(currentSteps, '✨ Gemini AI đã đặt tên nháp & chuẩn hóa bước hướng dẫn');
    }
  }).catch(() => {});

  return new Promise((resolve) => {
    let resolved = false;
    const finish = async (mode) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      if (dlg.open) dlg.close();
      if (mode === 'cancel') {
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
        durationMs: Math.round((duration || 0) * 1000),
        voiceTranscript: transcript,
        steps: currentSteps,
        segments: normSegments,
        frames,
      });
      toast(`Đã đóng gói và lưu vào CSDL: "${saved.name}"`, 'ok', 4500);
      if (mode === 'zip') {
        exportPackageZip(saved);
      }
      resolve(saved);
    };

    const onCancel = () => finish('cancel');
    const onApprove = () => finish('save');
    const onApproveZip = () => finish('zip');
    const onDialogClose = () => {
      if (!resolved) finish('save');
    };

    const cleanup = () => {
      cancelBtn?.removeEventListener('click', onCancel);
      approveBtn?.removeEventListener('click', onApprove);
      approveZipBtn?.removeEventListener('click', onApproveZip);
      dlg.removeEventListener('close', onDialogClose);
    };

    cancelBtn?.addEventListener('click', onCancel);
    approveBtn?.addEventListener('click', onApprove);
    approveZipBtn?.addEventListener('click', onApproveZip);
    dlg.addEventListener('close', onDialogClose);
  });
}
