// =========================================================
// config.js — Hằng số dùng chung toàn ứng dụng (v3.0)
//  • Chỉ giữ bộ hành vi gốc cốt lõi + nhãn con do AI tạo sinh tức thì
//  • Bổ sung khung xương bàn tay (21 khớp) & khung xương đầu-cổ
//  • Đã loại bỏ hoàn toàn mô hình khuôn mặt & cảm xúc
// =========================================================

export const APP_NAME = 'behavior-analysis';
export const APP_VERSION = '3.0.4';

/**
 * Danh mục hành vi gốc rút gọn (không để tràn lan).
 * Trong quá trình phân tích, Model AI sẽ tự động tạo sinh thêm các
 * nhãn hành động chi tiết (group: 'ai') theo từng mili-giây và đưa lên bảng.
 */
export const CORE_BEHAVIORS = {
  standing:    { label: 'Đứng chuẩn bị',         color: '#5ab8e8', group: 'posture', core: true },
  walking:     { label: 'Đi bộ / Di chuyển',     color: '#6fd08c', group: 'posture', core: true },
  running:     { label: 'Chạy',                  color: '#e8d14a', group: 'posture', core: true },
  sitting:     { label: 'Ngồi',                  color: '#a98bf5', group: 'posture', core: true },
  squatting:   { label: 'Hạ trọng tâm (Squat)',  color: '#c58af0', group: 'posture', core: true },
  bending:     { label: 'Cúi / Gập thân',        color: '#f0914a', group: 'posture', core: true },
  jumping:     { label: 'Bật nhảy',              color: '#ffd166', group: 'action',  core: true },
  hand_action: { label: 'Động tác tay & bàn tay', color: '#3fd6c6', group: 'action',  core: true },
  head_motion: { label: 'Chuyển động đầu & cổ',  color: '#b8c0ff', group: 'action',  core: true },
  falling:     { label: 'Té ngã (Cảnh báo)',     color: '#ff5d73', group: 'event',   core: true, alert: true },
};

export const BEHAVIORS = { ...CORE_BEHAVIORS };

export const AI_COLORS = [
  '#3dd6c6', '#f5b83d', '#ff8fab', '#7ee0a0', '#9bf6ff', '#d4a5ff',
  '#ffd166', '#8ee3ef', '#c7e86a', '#ff9f80', '#a0c4ff', '#f7b267',
];

export const LEARNED_COLORS = ['#ff8fab', '#9bf6ff', '#caffbf', '#fdffb6', '#bdb2ff', '#ffc6ff', '#a0c4ff', '#ffd6a5'];

export const UNKNOWN_BEHAVIOR = { label: 'Chuyển động khác', color: '#9aa7b2', group: 'ai' };

let aiColorCursor = 0;

/** Đăng ký nhãn hành động do AI tạo sinh tức thì trong lúc phân tích */
export function registerAiBehavior(key, label, extra = {}) {
  if (!key) return null;
  if (!BEHAVIORS[key]) {
    const color = extra.color || AI_COLORS[aiColorCursor++ % AI_COLORS.length];
    BEHAVIORS[key] = {
      label: label || key,
      color,
      group: extra.group || 'ai',
      isAiGenerated: extra.group !== 'learned' && !CORE_BEHAVIORS[key],
      parentBehavior: extra.parentBehavior || null,
      jointDetail: extra.jointDetail || '',
      instruction: extra.instruction || '',
    };
  } else if (label && BEHAVIORS[key].isAiGenerated) {
    BEHAVIORS[key].label = label;
    if (extra.jointDetail) BEHAVIORS[key].jointDetail = extra.jointDetail;
    if (extra.instruction) BEHAVIORS[key].instruction = extra.instruction;
  }
  return BEHAVIORS[key];
}

export function behaviorInfo(key) {
  return BEHAVIORS[key] || { ...UNKNOWN_BEHAVIOR, label: key, isAiGenerated: true };
}

export const DEFAULT_SETTINGS = {
  // --- Phân tích & Mô hình AI ---
  modelType: 'multipose',     // 'multipose' | 'thunder'
  detectHands: true,          // Bật khung xương bàn tay 21 khớp
  detectHeadSkeleton: true,   // Bật khung xương đầu & cổ
  detectObjects: false,       // Tắt mặc định nhận diện đồ vật để dồn tài nguyên cho khung xương & tay
  sampleInterval: 0.1,        // 100ms (0.100s) — phân tích độ chính xác mili-giây
  minScore: 0.28,
  minSegment: 0.2,            // Bắt được cả các pha động tác ngắn (200ms)
  mergeGap: 0.25,
  alertSound: true,
  exportKeypoints: true,

  // --- Hiệu năng / hệ thống ---
  perfProfile: 'auto',        // 'auto' | 'eco' | 'balanced' | 'quality'
  backend: 'auto',            // 'auto' | 'webgpu' | 'webgl' | 'wasm' | 'cpu'
  threadMode: 'auto',         // 'auto' | 'worker' | 'main'
  camRenderMode: 'auto',      // 'auto' | 'sync' | 'live'
  smoothing: 0.45,            // Làm mượt khung xương One-Euro
  interpolate: true,          // Nội suy khung xương khi xem lại video
  adaptive: true,             // Tự điều chỉnh tải để giữ ≥ 10 phân tích/s và ≥ 14 FPS
  pauseHidden: true,
  batterySaver: true,

  // --- Giao diện ---
  theme: 'auto',
  liteUi: 'auto',

  // --- Học hành vi / Dữ liệu phân tích ---
  useLearned: true,
  learnThreshold: 0.7,
  selfTrain: false,

  // --- Model AI Gemini & Chatbot ---
  llmProvider: 'gemini',
  llmApiKey: '',
  llmModel: 'gemini-2.5-flash',
  llmBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
  enableGoogleSearch: true,
};

/**
 * Hồ sơ hiệu năng đã tối ưu (đã loại bỏ hoàn toàn mô hình khuôn mặt nặng):
 *  - eco (Máy yếu): đảm bảo ≥ 10–20 phân tích/s và hiển thị ≥ 14–30 FPS, chất lượng phân tích mạnh
 *  - balanced (Trung bình — mức giới hạn tối đa cho máy yếu để giữ ổn định khung xương)
 *  - quality (Chất lượng cao — dành cho máy trung bình / mạnh)
 */
export const PROFILES = {
  eco: {
    label: 'Thấp',
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
    objectInterval: 1.5,
  },
  balanced: {
    label: 'Trung bình',
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
    objectInterval: 0.8,
  },
  quality: {
    label: 'Cao',
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
    objectInterval: 0.5,
  },
};

export const CDN = 'https://cdn.jsdelivr.net/npm/';

// Chỉ số 17 khớp cơ thể của MoveNet (chuẩn COCO)
export const KP = {
  nose: 0, lEye: 1, rEye: 2, lEar: 3, rEar: 4,
  lShoulder: 5, rShoulder: 6, lElbow: 7, rElbow: 8,
  lWrist: 9, rWrist: 10, lHip: 11, rHip: 12,
  lKnee: 13, rKnee: 14, lAnkle: 15, rAnkle: 16,
};

// Khung xương thân & chân (không vẽ mặt cảm xúc, chỉ vẽ khung xương đầu riêng)
export const SKELETON = [
  [5, 6], [5, 7], [7, 9], [6, 8], [8, 10],
  [5, 11], [6, 12], [11, 12],
  [11, 13], [13, 15], [12, 14], [14, 16],
];

// Kết nối xương đầu (Mũi - Mắt - Tai)
export const HEAD_SKELETON = [
  [0, 1], [0, 2], [1, 2], [1, 3], [2, 4],
];

// Kết nối 21 khớp bàn tay (chuẩn MediaPipe Hands: Cổ tay 0 + 5 ngón tay × 4 khớp)
export const HAND_SKELETON = [
  // Ngón cái (Thumb)
  [0, 1], [1, 2], [2, 3], [3, 4],
  // Ngón trỏ (Index)
  [0, 5], [5, 6], [6, 7], [7, 8],
  // Ngón giữa (Middle)
  [0, 9], [9, 10], [10, 11], [11, 12],
  // Ngón áp út (Ring)
  [0, 13], [13, 14], [14, 15], [15, 16],
  // Ngón út (Pinky)
  [0, 17], [17, 18], [18, 19], [19, 20],
  // Khung lòng bàn tay (Palm arch)
  [5, 9], [9, 13], [13, 17],
];

export const PERSON_COLORS = ['#f2b134', '#5ab8e8', '#6fd08c', '#ee6fb6', '#a98bf5', '#f0914a', '#3fd6c6'];
export const personColor = (id) => PERSON_COLORS[(Math.abs(Number(id) || 0)) % PERSON_COLORS.length];
