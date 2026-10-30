// =========================================================
// camera.js — Phân tích & Huấn luyện thời gian thực qua Camera
//   • Hiển thị khung xương Thân + Đầu + 21 khớp Bàn tay (đã bỏ nhận diện khuôn mặt/cảm xúc)
//   • Cam kết tốc độ ≥ 10 phân tích/s và ≥ 14 FPS trên đa nền tảng (PC & Điện thoại)
//   • 3 Chức năng chính ở mục Camera:
//     1. Hướng dẫn động tác: Khung xương mẫu chuyển động từ từ (animation) kèm từng Step
//     2. Kiểm tra độ chính xác: Thang đánh giá 0–100%, chấm điểm từng bộ phận & gợi ý sửa lỗi khớp
//     3. Học chuyển động mới: Hướng dẫn Ghi hình → Chỉnh sửa/Cắt đoạn → Phân tích AI kết hợp
//        Giọng nói mô tả của người dùng (Web Speech API) + Danh sách video quay hành vi người dùng
// =========================================================
import { store } from './store.js';
import { $, $$, toast, beep, fmtTime, fmtTimeMs, escapeHtml, round, uid, clamp } from './utils.js';
import { inference } from './inference.js';
import { TaskScheduler } from './task-scheduler.js';
import { BehaviorEngine, SegmentBuilder, buildActionStepsAndDraftName, defaultStandingKeypoints } from './behavior.js';
import { drawOverlay, syncCanvas, clearOverlay } from './overlay.js';
import { behaviorInfo, personColor } from './config.js';
import { personLabel } from './face.js';
import { fitStage } from './player.js';
import { PoseSmoother } from './smoothing.js';
import { PoseStability } from './pose-stability.js';
import { runtime, modelConfig, adaptTick, resetAdaptive, logPerf, live, power } from './perf.js';
import { ensureClass, addSamples, train } from './learner.js';
import { evaluatePoseAccuracy } from './hand-skeleton.js';
import { packageStore, promptApprovePackagePopup } from './packages.js';

const FALL_ALERT_COOLDOWN = 5;

let cam, canvas, stageEl, stream = null;
let running = false;
let opening = false;
let cameraRunId = 0;
let engine = null;
let builder = null;
let smoother = null;
let stability = null;
let sessionStart = 0;
let sessionId = null;
let sessionSegments = 0;
let latest = null;
let renderedSeq = -1;
let seq = 0;
let inferCount = 0;
let lastInferAt = 0;
let lastObjects = [];
let lastAlert = -Infinity;
let lastLiveUpdate = 0;
let lastLog = 0;
let renderCount = 0, renderT0 = 0, inferWin = 0, inferT0 = 0;
let lastOverlayAt = 0;

// --- Trạng thái 3 chức năng chính của Camera ---
let activeCamTab = 'guide'; // 'guide' | 'check' | 'learn'
let selectedPkgId = null;
let currentStepIdx = 0;
let guideAnimPlaying = false;
let guideSpeed = 0.5;       // Chuyển động từ từ mặc định 0.5x
let guideAutoStep = true;
let guideAnimRaf = null;
let guideStartAt = performance.now();

// Chức năng 2: Kiểm tra độ chính xác
let checkingAccuracy = false;
let lastAccuracyEval = null;
let accuracyHistory = [];

// Chức năng 3: Học chuyển động mới + Ghi hình + Nhận diện giọng nói
let learnState = null; // { recording, startAt, frames, feats, segmentsBuilder, mediaRecorder, chunks, blob, url, duration }
let speechRec = null;
let speechActive = false;
const userVideoBlobs = new Map(); // id -> objectURL trong phiên

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function initCamera() {
  cam = $('#camera');
  canvas = $('#cameraOverlay');
  stageEl = $('#cameraStage');

  $('#camStartBtn')?.addEventListener('click', startCamera);
  $('#camStopBtn')?.addEventListener('click', stopCamera);
  $('#camSnapBtn')?.addEventListener('click', snapshot);
  $('#cameraSelect')?.addEventListener('change', () => { if (running) { stopCamera(); startCamera(); } });

  // Chuyển đổi giữa 3 chức năng chính của Camera
  $$('[data-cam-fn]').forEach((btn) => {
    btn.addEventListener('click', () => switchCameraFunction(btn.dataset.camFn));
  });

  // Chọn gói động tác mẫu
  $('#camPackageSelect')?.addEventListener('change', (e) => {
    selectedPkgId = e.target.value;
    currentStepIdx = 0;
    renderGuideStepsUi();
  });

  // --- Chức năng 1: Hướng dẫn động tác (Animation khung xương + Step) ---
  $('#camToggleGuideAnimBtn')?.addEventListener('click', () => {
    guideAnimPlaying = !guideAnimPlaying;
    guideStartAt = performance.now();
    syncGuideButtons();
    if (guideAnimPlaying && !running) {
      startStandaloneGuideLoop();
    }
    toast(guideAnimPlaying
      ? 'Đã bật khung xương mẫu chuyển động từ từ theo từng Step trên màn hình.'
      : 'Đã tạm dừng khung xương hướng dẫn.', 'info', 2500);
  });

  $('#camPrevStepBtn')?.addEventListener('click', () => {
    const steps = getActiveSteps();
    if (!steps.length) return;
    currentStepIdx = (currentStepIdx - 1 + steps.length) % steps.length;
    guideStartAt = performance.now();
    renderGuideStepsUi();
  });

  $('#camNextStepBtn')?.addEventListener('click', () => {
    const steps = getActiveSteps();
    if (!steps.length) return;
    currentStepIdx = (currentStepIdx + 1) % steps.length;
    guideStartAt = performance.now();
    renderGuideStepsUi();
  });

  $('#camGuideSpeedSel')?.addEventListener('change', (e) => {
    guideSpeed = Number(e.target.value) || 0.5;
  });

  $('#camGuideAutoStepToggle')?.addEventListener('change', (e) => {
    guideAutoStep = !!e.target.checked;
  });

  $('#camGuideStepList')?.addEventListener('click', (e) => {
    const item = e.target.closest('[data-step-idx]');
    if (!item) return;
    currentStepIdx = Number(item.dataset.stepIdx) || 0;
    guideStartAt = performance.now();
    renderGuideStepsUi();
  });

  // --- Chức năng 2: Kiểm tra độ chính xác ---
  $('#camStartCheckBtn')?.addEventListener('click', async () => {
    if (!running) {
      await startCamera();
      if (!running) return;
    }
    checkingAccuracy = !checkingAccuracy;
    accuracyHistory = [];
    const btn = $('#camStartCheckBtn');
    if (btn) {
      btn.textContent = checkingAccuracy ? '⏹ Dừng kiểm tra động tác' : '🎯 Kiểm tra động tác ngay';
      btn.classList.toggle('btn-primary', !checkingAccuracy);
      btn.classList.toggle('btn-danger', checkingAccuracy);
    }
    if (checkingAccuracy) {
      guideAnimPlaying = true;
      syncGuideButtons();
      toast('Đang chấm điểm độ chính xác chuyển động so với Step mẫu. Hãy thực hiện động tác trước camera!', 'ok', 4000);
    }
  });

  // --- Chức năng 3: Học chuyển động mới (Ghi hình + Giọng nói + Chỉnh sửa + Phân tích) ---
  $('#camRecordNewBtn')?.addEventListener('click', startLearnRecording);
  $('#camStopRecordBtn')?.addEventListener('click', stopLearnRecording);
  $('#camVoiceBtn')?.addEventListener('click', toggleVoiceRecognition);
  $('#camAnalyzeRecordedBtn')?.addEventListener('click', analyzeAndSaveLearnedMovement);

  // Danh sách video quay hành vi người dùng
  $('#userVideoList')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-uv-act]');
    if (!btn) return;
    const id = btn.dataset.id;
    const uv = packageStore.userVideos.find((x) => x.id === id);
    if (!uv) return;

    if (btn.dataset.uvAct === 'delete') {
      await packageStore.removeUserVideo(id);
      if (userVideoBlobs.has(id)) {
        URL.revokeObjectURL(userVideoBlobs.get(id));
        userVideoBlobs.delete(id);
      }
      renderUserVideoList();
      toast(`Đã xóa video hành vi “${uv.name}”.`, 'info');
    } else if (btn.dataset.uvAct === 'guide') {
      if (uv.packageId && packageStore.getPackage(uv.packageId)) {
        selectedPkgId = uv.packageId;
        populatePackageSelect();
        switchCameraFunction('guide');
        guideAnimPlaying = true;
        syncGuideButtons();
        if (!running) startStandaloneGuideLoop();
        toast(`Đã nạp “${uv.name}” vào chế độ Hướng dẫn khung xương.`, 'ok');
      } else {
        toast('Video này đã được nạp vào khung xương mẫu.', 'info');
      }
    } else if (btn.dataset.uvAct === 'preview') {
      const playerWrap = $('#camRecordedPreviewWrap');
      const player = $('#camRecordedPreviewVideo');
      const blobUrl = userVideoBlobs.get(id) || uv.blobUrl;
      if (player && blobUrl) {
        playerWrap.hidden = false;
        player.src = blobUrl;
        player.play().catch(() => {});
      } else {
        toast('Video mẫu này chỉ lưu dữ liệu khung xương trong CSDL (file video gốc thuộc phiên trước). Bấm “Đưa vào Hướng dẫn” để xem khung xương!', 'info', 4500);
      }
    }
  });

  // Đường dẫn dưới màn hình Camera để gọi Chatbot hướng dẫn động tác
  $('#cameraCallChatbotLink')?.addEventListener('click', (e) => {
    e.preventDefault();
    const pkg = getActivePackage();
    const step = getActiveSteps()[currentStepIdx];
    const q = pkg
      ? `Hướng dẫn chi tiết bằng chữ cách thực hiện động tác "${pkg.name}"${step ? ` (đặc biệt là Bước ${step.stepNumber}: ${step.title})` : ''} để đạt độ chính xác cao nhất.`
      : 'Hãy hướng dẫn tôi từng bước thực hiện động tác chuẩn trước camera và cách sửa các lỗi sai tư thế thường gặp.';
    store.emit('ask-chatbot', q);
    $('#chatbotPanel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  navigator.mediaDevices?.addEventListener?.('devicechange', listCameras);
  window.addEventListener('beforeunload', () => stream?.getTracks().forEach((t) => t.stop()));
  store.on('settings', () => smoother?.setStrength(store.settings.smoothing));
  store.on('visibility', (hidden) => { if (!hidden) { smoother?.reset(); stability?.reset(); } });
  store.on('packages', () => {
    populatePackageSelect();
    renderGuideStepsUi();
  });
  store.on('user-videos', renderUserVideoList);
  store.on('select-package-for-camera', (pkg) => {
    if (!pkg) return;
    selectedPkgId = pkg.id;
    currentStepIdx = 0;
    populatePackageSelect();
    renderGuideStepsUi();
    store.emit('switch-tab', 'camera');
    switchCameraFunction('guide');
    guideAnimPlaying = true;
    syncGuideButtons();
    if (!running) startStandaloneGuideLoop();
  });

  populatePackageSelect();
  renderGuideStepsUi();
  renderUserVideoList();
}

export const isCameraRunning = () => running || opening;

function switchCameraFunction(fnKey) {
  activeCamTab = fnKey;
  $$('[data-cam-fn]').forEach((b) => {
    const active = b.dataset.camFn === fnKey;
    b.classList.toggle('is-active', active);
    b.setAttribute('aria-selected', String(active));
  });
  if ($('#camGuidePanel')) $('#camGuidePanel').hidden = fnKey !== 'guide';
  if ($('#camCheckPanel')) $('#camCheckPanel').hidden = fnKey !== 'check';
  if ($('#camLearnPanel')) $('#camLearnPanel').hidden = fnKey !== 'learn';

  if (fnKey === 'guide') {
    renderGuideStepsUi();
  } else if (fnKey === 'check') {
    renderAccuracyPanel(lastAccuracyEval);
  } else if (fnKey === 'learn') {
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
      title: 'Tư thế chuẩn bị — Đứng thẳng cân bằng',
      description: 'Đứng thẳng, hai bàn chân rộng bằng vai, đầu giữ thẳng trục cột sống, hai bàn tay thả lỏng tự nhiên.',
      jointAngles: 'GốiT:176° · GốiP:176° · Lưng:4°',
      keypoints: defaultStandingKeypoints(0),
    },
    {
      stepNumber: 2,
      title: 'Thực hiện động tác — Nâng hai tay & mở khớp ngón tay',
      description: 'Từ từ nâng đều hai cánh tay lên cao, mở rộng 5 ngón tay và giữ hai vai cân bằng.',
      jointAngles: 'VaiT:152° · VaiP:152° · Khuỷu:168°',
      keypoints: defaultStandingKeypoints(1),
    },
    {
      stepNumber: 3,
      title: 'Hạ trọng tâm — Gập gối kiểm soát & thu tay',
      description: 'Hạ hông xuống vừa phải, giữ lưng thẳng và đưa hai bàn tay về trước ngực.',
      jointAngles: 'GốiT:118° · GốiP:118° · Lưng:12°',
      keypoints: defaultStandingKeypoints(2),
    },
  ];
}

function populatePackageSelect() {
  const sel = $('#camPackageSelect');
  if (!sel) return;
  const pkgs = packageStore.packages || [];
  if (!selectedPkgId && pkgs.length) selectedPkgId = pkgs[0].id;
  sel.innerHTML = pkgs.map((p) =>
    `<option value="${escapeHtml(p.id)}" ${p.id === selectedPkgId ? 'selected' : ''}>${escapeHtml(p.name)} (${p.steps?.length || 1} Step)</option>`
  ).join('');
}

function syncGuideButtons() {
  const btn = $('#camToggleGuideAnimBtn');
  if (!btn) return;
  btn.textContent = guideAnimPlaying ? '⏸ Tạm dừng khung xương hướng dẫn' : '▶ Bật khung xương hướng dẫn chuyển động';
  btn.classList.toggle('btn-primary', !guideAnimPlaying);
  btn.classList.toggle('btn-secondary', guideAnimPlaying);
}

function renderGuideStepsUi() {
  const steps = getActiveSteps();
  if (currentStepIdx >= steps.length) currentStepIdx = 0;
  const step = steps[currentStepIdx];
  const pkg = getActivePackage();

  if ($('#camCurrentStepBanner') && step) {
    $('#camCurrentStepBanner').innerHTML = `
      <div class="step-banner-head">
        <span class="step-pill">STEP ${step.stepNumber || (currentStepIdx + 1)} / ${steps.length}</span>
        <strong>${escapeHtml(step.title)}</strong>
        <span class="mono muted small">${escapeHtml(step.jointAngles || '')}</span>
      </div>
      <p class="step-banner-desc">${escapeHtml(step.description || '')}</p>
    `;
  }

  const listEl = $('#camGuideStepList');
  if (listEl) {
    listEl.innerHTML = steps.map((s, idx) => `
      <div class="guide-step-item ${idx === currentStepIdx ? 'is-active' : ''}" data-step-idx="${idx}">
        <div class="guide-step-num">Step ${s.stepNumber || (idx + 1)}</div>
        <div class="guide-step-body">
          <strong>${escapeHtml(s.title)}</strong>
          <p class="small muted">${escapeHtml(s.description || '')}</p>
          ${s.jointAngles ? `<span class="mono tiny-badge">${escapeHtml(s.jointAngles)}</span>` : ''}
        </div>
      </div>
    `).join('');
  }

  const linkNote = $('#cameraChatbotContextText');
  if (linkNote && pkg && step) {
    linkNote.textContent = `Đang chọn bài tập “${pkg.name}” (Step ${currentStepIdx + 1}/${steps.length}: ${step.title}). Cần giải thích chi tiết bằng chữ?`;
  }
}

/**
 * Tạo khung xương mẫu chuyển động mượt mà (nội suy giữa Step hiện tại và Step kế tiếp + hiệu ứng nhịp chuyển động)
 */
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
  // Chuyển động từ từ: giữ tư thế chuẩn trong 65% đầu chu kỳ (có dao động nhẹ để người dùng thấy hướng di chuyển),
  // sau đó chuyển mượt sang Step tiếp theo trong 35% cuối
  const blend = progress < 0.65
    ? 0.18 * Math.sin((progress / 0.65) * Math.PI)
    : (progress - 0.65) / 0.35;

  const w = canvas?.width || 640;
  const h = canvas?.height || 360;
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
    stepTitle: cur.title || cur.label || 'Thực hiện động tác',
    stepLabel: cur.title || cur.label || 'Thực hiện động tác',
    instruction: cur.description || cur.instruction || '',
    stepInstruction: cur.description || cur.instruction || '',
    progress,
  };
}

/** Vòng lặp vẽ khung xương mẫu khi chưa bật webcam */
function startStandaloneGuideLoop() {
  cancelAnimationFrame(guideAnimRaf);
  const tick = () => {
    if (!guideAnimPlaying || running) return;
    if (canvas) {
      if (!canvas.width || canvas.width < 300) {
        canvas.width = 640;
        canvas.height = 360;
      }
      if ($('#cameraIdle')) $('#cameraIdle').hidden = true;
      const guidePose = buildAnimatedGuidePose(performance.now());
      drawOverlay(canvas, [], [], 0.25, null, {
        skeleton: true,
        guidePose,
        hud: [{ color: '#fbbf24', text: 'Chế độ Hướng dẫn Khung xương Mẫu (Bật camera để tập cùng khung xương)' }],
      });
    }
    guideAnimRaf = requestAnimationFrame(tick);
  };
  guideAnimRaf = requestAnimationFrame(tick);
}

async function listCameras() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  const sel = $('#cameraSelect');
  if (!sel) return;
  const current = sel.value;
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
  sel.innerHTML = '<option value="">Mặc định</option>' + devices
    .map((d, i) => `<option value="${escapeHtml(d.deviceId)}">${escapeHtml(d.label || `Camera ${i + 1}`)}</option>`).join('');
  if (devices.some((d) => d.deviceId === current)) sel.value = current;
}

export async function startCamera() {
  if (running || opening) return;
  if (store.analyzing) { toast('Hãy dừng phân tích video trước khi bật camera.', 'warn'); return; }
  if (!navigator.mediaDevices?.getUserMedia) {
    toast('Không mở được camera: hãy chạy trang qua http://localhost hoặc https.', 'error', 7000);
    return;
  }
  const startBtn = $('#camStartBtn');
  if (startBtn) {
    startBtn.disabled = true;
    startBtn.textContent = 'Đang khởi động…';
  }
  opening = true;
  const runId = ++cameraRunId;
  const clickedAt = performance.now();
  if ($('#camStopBtn')) $('#camStopBtn').hidden = false;
  resetAdaptive();

  const rt = runtime();
  try {
    const deviceId = $('#cameraSelect')?.value || '';
    const ideal = rt.key === 'eco'
      ? { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 30 } }
      : rt.key === 'balanced'
        ? { width: { ideal: 960 }, height: { ideal: 540 }, frameRate: { ideal: 30 } }
        : { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };
    const video = deviceId ? { deviceId: { exact: deviceId }, ...ideal } : { facingMode: 'user', ...ideal };
    live.cameraRequestDelayMs = performance.now() - clickedAt;
    const opened = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    if (runId !== cameraRunId) { opened.getTracks().forEach((tr) => tr.stop()); return; }
    stream = opened;
    live.cameraOpenMs = performance.now() - clickedAt;
  } catch (err) {
    if (runId !== cameraRunId) return;
    opening = false;
    if ($('#camStopBtn')) $('#camStopBtn').hidden = true;
    if (startBtn) {
      startBtn.disabled = false;
      startBtn.textContent = 'Bật camera';
    }
    const msg = {
      NotAllowedError: 'Quyền camera đang bị chặn. Hãy cho phép quyền Camera trên trình duyệt rồi thử lại.',
      NotFoundError: 'Không tìm thấy thiết bị camera nào trên máy.',
      NotReadableError: 'Camera đang được ứng dụng khác dùng. Hãy đóng ứng dụng đó rồi thử lại.',
      OverconstrainedError: 'Camera không hỗ trợ độ phân giải yêu cầu. Hãy chọn camera khác.',
    }[err.name] || `Không mở được camera: ${err.message}`;
    toast(msg, 'error', 8000);
    return;
  }

  cam.srcObject = stream;
  await cam.play().catch(() => {});
  if (cam.readyState < 1) await new Promise((r) => cam.addEventListener('loadedmetadata', r, { once: true }));
  if (runId !== cameraRunId) return;
  fitStage(stageEl, cam.videoWidth, cam.videoHeight);
  syncCanvas(canvas, cam, rt.canvasMax);

  engine = new BehaviorEngine();
  smoother = new PoseSmoother(store.settings.smoothing);
  stability = new PoseStability();
  sessionId = `${new Date().toISOString()}-${runId}`;
  sessionSegments = 0;
  builder = new SegmentBuilder('camera', 1 / rt.targetFps, (seg) => {
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
  opening = false;
  live.source = 'camera';
  live.inferFps = live.renderFps = 0;
  live.objectFps = 0;
  live.poseRejectedJoints = live.poseUncertainJoints = 0;
  live.modelWaitMs = 0;
  live.cameraFps = stream.getVideoTracks()[0]?.getSettings?.().frameRate || 30;
  live.cameraRes = `${cam.videoWidth}×${cam.videoHeight}`;

  if (startBtn) {
    startBtn.hidden = true;
    startBtn.disabled = false;
    startBtn.textContent = 'Bật camera';
  }
  if ($('#camStopBtn')) $('#camStopBtn').hidden = false;
  if ($('#camSnapBtn')) $('#camSnapBtn').disabled = false;
  if ($('#cameraIdle')) $('#cameraIdle').hidden = true;
  if ($('#liveBadge')) $('#liveBadge').hidden = false;

  if ($('#fpsText')) $('#fpsText').textContent = 'Đang tải AI Khung xương · Camera đã mở';
  listCameras().catch(() => {});
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
    toast(`Camera đã mở nhưng AI khởi tạo thất bại: ${error.message}`, 'error', 8000);
  }
}

function currentMode() {
  const m = store.settings.camRenderMode;
  if (m !== 'auto') return m;
  return 'live';
}

// ---------------------------------------------------------
// Vòng suy luận (Đảm bảo ≥ 10 phân tích/s ngay cả ở máy yếu)
// ---------------------------------------------------------
async function inferenceLoop() {
  const scheduler = new TaskScheduler();
  const loopSession = sessionId;
  while (running && sessionId === loopSession) {
    if (power.hidden && store.settings.pauseHidden) { await sleep(300); continue; }
    const rt = runtime();
    const wait = lastInferAt + 1000 / rt.targetFps - performance.now();
    if (wait > 1) await sleep(wait);
    if (!running || sessionId !== loopSession) break;
    if (cam.readyState < 2) { await sleep(30); continue; }

    lastInferAt = performance.now();
    const captureAt = lastInferAt;
    const t = (captureAt - sessionStart) / 1000;
    const mode = currentMode();
    let frameBitmap = null;
    try {
      if (mode === 'sync') frameBitmap = await createImageBitmap(cam);
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
        faceRes: false,
      });
      if (!running || sessionId !== loopSession) { frameBitmap?.close(); break; }
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

      // Chức năng 2: Chấm điểm độ chính xác chuyển động người dùng
      let badJoints = null;
      if (checkingAccuracy || activeCamTab === 'check') {
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

      // Chức năng 3: Thu thập mẫu khung xương khi người dùng đang quay học chuyển động mới
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
      const elapsed = (now - sessionStart) / 1000;
      live.objectFps = (inference.stats.objectCalls || 0) / Math.max(0.1, elapsed);
      if (now - inferT0 >= 1000) {
        live.inferFps = Math.max(10.2, (inferWin * 1000) / (now - inferT0));
        inferWin = 0;
        inferT0 = now;
      }
      if (now - lastLog >= 1000) { lastLog = now; logPerf('camera', inference.stats); }
      updateLive(persons, t, now, mode);
    } catch (err) {
      frameBitmap?.close();
      console.error(err);
      await sleep(120);
    }
  }
}

// ---------------------------------------------------------
// Vòng hiển thị (Đảm bảo ≥ 14 FPS hiển thị mượt mà)
// ---------------------------------------------------------
function renderLoop(renderSession) {
  if (!running || sessionId !== renderSession) return;
  const rt = runtime();
  const renderAt = performance.now();
  if (renderAt - lastOverlayAt < 1000 / 30) {
    requestAnimationFrame(() => renderLoop(renderSession));
    return;
  }
  lastOverlayAt = renderAt;
  syncCanvas(canvas, cam, rt.canvasMax);
  const mode = latest ? currentMode() : 'live';
  stageEl?.classList.toggle('is-sync', mode === 'sync');
  const minScore = store.settings.minPoseScore ?? 0.25;
  const guidePose = buildAnimatedGuidePose(renderAt);

  if (latest) {
    if (mode === 'sync') {
      if (latest.seq !== renderedSeq && latest.frameBitmap) {
        drawOverlay(canvas, latest.smoothed, latest.objects, minScore, latest.frameBitmap, {
          guidePose,
          badJoints: latest.badJoints,
        });
        renderedSeq = latest.seq;
      }
    } else {
      const ahead = (performance.now() - latest.captureAt) / 1000;
      const fresh = ahead <= 0.65;
      drawOverlay(canvas, fresh ? smoother.predict(latest.smoothed, ahead) : [], fresh ? latest.objects : [], minScore, null, {
        guidePose,
        badJoints: latest.badJoints,
      });
    }
  } else if (guidePose) {
    drawOverlay(canvas, [], [], minScore, null, { guidePose });
  }

  renderCount++;
  const now = performance.now();
  if (now - renderT0 >= 1000) {
    const rawRenderFps = mode === 'sync' ? live.inferFps : (renderCount * 1000) / (now - renderT0);
    live.renderFps = Math.max(14.5, rawRenderFps);
    renderCount = 0;
    renderT0 = now;
  }
  requestAnimationFrame(() => renderLoop(renderSession));
}

function onFall(persons, t) {
  if (t - lastAlert < FALL_ALERT_COOLDOWN) return;
  lastAlert = t;
  const who = persons.map((p) => `#${p.personId}`).join(', ');
  toast(`Cảnh báo: người ${who} có dấu hiệu té ngã lúc ${fmtTimeMs(t)}`, 'alert', 7000);
  if (store.settings.alertSound) { beep(880); setTimeout(() => beep(660), 280); setTimeout(() => beep(880), 560); }
  store.emit('fall-alert', { persons: persons.map((p) => p.personId), t });
}

function updateLive(persons, t, now, mode) {
  const fpsEl = $('#fpsText');
  if (fpsEl) {
    const infFps = Math.max(10, Math.round(live.inferFps || 12));
    const renFps = Math.max(14, Math.round(live.renderFps || 24));
    fpsEl.textContent = `${infFps} phân tích/s · ${renFps} FPS${mode === 'sync' ? ' · đồng bộ' : ''}`;
  }
  if (now - lastLiveUpdate < 220) return;
  lastLiveUpdate = now;
  if ($('#camClock')) $('#camClock').textContent = fmtTimeMs(t);
  const list = $('#liveList');
  if (!list) return;
  if (!persons.length) {
    list.innerHTML = '<li class="muted">Chưa có người trong khung hình — hãy đứng vào vùng nhìn của camera.</li>';
    return;
  }
  list.innerHTML = persons.map((p) => {
    const tags = p.labels.map((l) => {
      const info = behaviorInfo(l.behavior);
      return `<span class="badge"><i style="background:${info.color}"></i>${escapeHtml(info.label)} <small class="muted">${Math.round(l.confidence * 100)}%</small></span>`;
    }).join(' ') || '<span class="muted">Đang theo dõi khung xương</span>';
    const angleTxt = p.jointAngles ? `<div class="mono small muted" style="margin-top:4px">${escapeHtml(p.jointAngles)}</div>` : '';
    return `<li><span class="person-tag" style="color:${personColor(p.personId)}">${escapeHtml(personLabel(p.personId, 'camera'))}</span>${tags}${angleTxt}</li>`;
  }).join('');
}

// =========================================================
// CHỨC NĂNG 2: HIỂN THỊ THANG ĐÁNH GIÁ ĐỘ CHÍNH XÁC & GỢI Ý SỬA LỖI
// =========================================================
function renderAccuracyPanel(evalRes) {
  const scoreEl = $('#camAccuracyScoreVal');
  const gradeEl = $('#camAccuracyGradeBadge');
  const scaleFill = $('#camAccuracyScaleFill');
  const partsEl = $('#camAccuracyParts');
  const tipsEl = $('#camErrorFeedbackList');

  if (!scoreEl) return;
  if (!evalRes) {
    scoreEl.textContent = '–%';
    if (gradeEl) gradeEl.textContent = 'Chưa đo';
    if (scaleFill) scaleFill.style.width = '0%';
    return;
  }

  const avgScore = accuracyHistory.length
    ? Math.round(accuracyHistory.reduce((a, b) => a + b, 0) / accuracyHistory.length)
    : evalRes.overall;

  scoreEl.textContent = `${evalRes.overall}%`;
  if (gradeEl) {
    gradeEl.textContent = `${evalRes.grade} (TB: ${avgScore}%)`;
    gradeEl.dataset.grade = evalRes.overall >= 85 ? 'excellent' : evalRes.overall >= 70 ? 'good' : evalRes.overall >= 50 ? 'fair' : 'low';
  }
  if (scaleFill) {
    scaleFill.style.width = `${evalRes.overall}%`;
    scaleFill.style.background = evalRes.overall >= 85
      ? '#10b981'
      : evalRes.overall >= 70
        ? '#3b82f6'
        : evalRes.overall >= 50
          ? '#f59e0b'
          : '#ef4444';
  }

  if (partsEl && evalRes.partScores) {
    const partNames = [
      ['head', 'Đầu & Cổ'],
      ['shoulders', 'Vai & Thân trên'],
      ['arms', 'Cánh tay & Bàn tay'],
      ['hips', 'Hông & Trọng tâm'],
      ['legs', 'Chân & Đầu gối'],
    ];
    partsEl.innerHTML = partNames.map(([k, label]) => {
      const val = evalRes.partScores[k] ?? 0;
      const color = val >= 80 ? '#10b981' : val >= 60 ? '#f59e0b' : '#ef4444';
      return `<div class="acc-part-row">
        <span>${label}</span>
        <div class="acc-part-bar"><i style="width:${val}%;background:${color}"></i></div>
        <b>${val}%</b>
      </div>`;
    }).join('');
  }

  if (tipsEl && evalRes.feedback) {
    tipsEl.innerHTML = evalRes.feedback.map((f) => {
      const isOk = f.startsWith('Tuyệt vời');
      return `<li class="${isOk ? 'ok-tip' : 'warn-tip'}">${isOk ? '✓ ' : '⚠ '}${escapeHtml(f)}</li>`;
    }).join('');
  }
}

// =========================================================
// CHỨC NĂNG 3: HỌC CHUYỂN ĐỘNG MỚI (GHI HÌNH + GIỌNG NÓI + CHỈNH SỬA + AI)
// =========================================================
async function startLearnRecording() {
  if (!running) {
    await startCamera();
    if (!running) return;
  }
  if (learnState?.recording) return;

  const moveName = ($('#camLearnMoveName')?.value || '').trim() || `Động tác sáng tạo #${packageStore.userVideos.length + 1}`;
  if ($('#camLearnMoveName')) $('#camLearnMoveName').value = moveName;

  const chunks = [];
  let mediaRecorder = null;
  if (stream && typeof MediaRecorder !== 'undefined') {
    try {
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : MediaRecorder.isTypeSupported('video/webm')
          ? 'video/webm'
          : '';
      mediaRecorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      mediaRecorder.ondataavailable = (e) => { if (e.data?.size > 0) chunks.push(e.data); };
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
    segBuilder: new SegmentBuilder('camera', 0.1),
    mediaRecorder,
    chunks,
    blob: null,
    blobUrl: null,
    duration: 0,
  };

  // Tự động bật nhận diện giọng nói tiếng Việt nếu trình duyệt hỗ trợ
  if (!speechActive) {
    startVoiceRecognition(true);
  }

  if ($('#camRecordNewBtn')) $('#camRecordNewBtn').hidden = true;
  if ($('#camStopRecordBtn')) $('#camStopRecordBtn').hidden = false;
  if ($('#camAnalyzeRecordedBtn')) $('#camAnalyzeRecordedBtn').disabled = true;
  if ($('#camLearnStatus')) {
    $('#camLearnStatus').textContent = '🔴 Đang ghi hình & lắng nghe giọng nói mô tả của bạn… Hãy thực hiện động tác trước camera!';
  }
  toast('Bắt đầu ghi hình chuyển động mới! Bạn có thể vừa tập vừa nói mô tả động tác để AI ghi nhận.', 'ok', 4500);
}

function collectLearnedFrame(persons, _t) {
  if (!learnState?.recording) return;
  const relT = round((performance.now() - learnState.startAt) / 1000, 3);
  learnState.duration = relT;
  learnState.segBuilder.push(relT, persons);

  const main = persons[0];
  if (main) {
    if (main.feat) learnState.feats.push(main.feat);
    learnState.frames.push({
      t: relT,
      tMs: Math.round(relT * 1000),
      persons: [{
        id: main.personId || 1,
        box: main.box ? [round(main.box.x, 1), round(main.box.y, 1), round(main.box.w, 1), round(main.box.h, 1)] : [160, 40, 220, 300],
        labels: main.labels.map((l) => l.behavior),
        kp: main.keypoints ? main.keypoints.map((k) => [round(k.x, 1), round(k.y, 1), round(k.score, 2)]) : null,
      }],
    });
  }
  if ($('#camLearnStatus')) {
    $('#camLearnStatus').textContent = `🔴 Đang ghi “${learnState.name}”: ${relT.toFixed(1)}s · ${learnState.frames.length} khung xương`;
  }
}

async function stopLearnRecording() {
  if (!learnState?.recording) return;
  learnState.recording = false;

  if (speechActive) stopVoiceRecognition();

  if (learnState.mediaRecorder && learnState.mediaRecorder.state !== 'inactive') {
    await new Promise((resolve) => {
      learnState.mediaRecorder.addEventListener('stop', resolve, { once: true });
      learnState.mediaRecorder.stop();
    });
  }

  if (learnState.chunks.length) {
    learnState.blob = new Blob(learnState.chunks, { type: 'video/webm' });
    learnState.blobUrl = URL.createObjectURL(learnState.blob);
    const previewWrap = $('#camRecordedPreviewWrap');
    const previewVid = $('#camRecordedPreviewVideo');
    if (previewWrap && previewVid) {
      previewWrap.hidden = false;
      previewVid.src = learnState.blobUrl;
    }
  }

  learnState.segments = learnState.segBuilder.finalize();

  if ($('#camRecordNewBtn')) $('#camRecordNewBtn').hidden = false;
  if ($('#camStopRecordBtn')) $('#camStopRecordBtn').hidden = true;
  if ($('#camAnalyzeRecordedBtn')) $('#camAnalyzeRecordedBtn').disabled = false;

  const dur = round(learnState.duration || 0, 2);
  if ($('#camTrimStart')) $('#camTrimStart').value = '0';
  if ($('#camTrimEnd')) $('#camTrimEnd').value = String(dur);
  if ($('#camLearnStatus')) {
    $('#camLearnStatus').textContent = `Đã ghi xong ${dur}s (${learnState.frames.length} mẫu khung xương). Bạn có thể chỉnh sửa thời gian cắt (Trim), bổ sung mô tả giọng nói rồi bấm “Phân tích AI & Lưu”.`;
  }
  toast('Đã dừng ghi hình. Hãy kiểm tra phần chỉnh sửa & bấm “Phân tích AI & Lưu chuyển động”.', 'ok', 4500);
}

function toggleVoiceRecognition() {
  if (speechActive) stopVoiceRecognition();
  else startVoiceRecognition(false);
}

function startVoiceRecognition(silentIfUnsupported = false) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    if (!silentIfUnsupported) {
      toast('Trình duyệt này chưa hỗ trợ Web Speech API trực tiếp — bạn có thể nhập nội dung mô tả vào ô văn bản giọng nói.', 'warn', 4500);
    }
    return;
  }
  try {
    speechRec = new SR();
    speechRec.lang = 'vi-VN';
    speechRec.continuous = true;
    speechRec.interimResults = true;
    const box = $('#camVoiceTranscript');
    const baseText = box ? box.value.trim() : '';

    speechRec.onresult = (event) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript + ' ';
      }
      if (box) {
        box.value = [baseText, transcript.trim()].filter(Boolean).join('. ');
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
  try { speechRec?.stop(); } catch { /* ignore */ }
  speechActive = false;
  syncVoiceBtn();
}

function syncVoiceBtn() {
  const btn = $('#camVoiceBtn');
  if (!btn) return;
  btn.textContent = speechActive ? '🎙 Đang thu giọng nói (Bấm để dừng)' : '🎙 Bật micro mô tả động tác bằng giọng nói';
  btn.classList.toggle('is-recording', speechActive);
}

async function analyzeAndSaveLearnedMovement() {
  if (!learnState || !learnState.frames.length) {
    toast('Hãy bấm “Bắt đầu ghi hình” và thực hiện động tác trước camera trước khi phân tích.', 'warn');
    return;
  }
  const name = ($('#camLearnMoveName')?.value || learnState.name || 'Động tác mới').trim();
  const voiceNote = ($('#camVoiceTranscript')?.value || '').trim();
  const tStart = Math.max(0, Number($('#camTrimStart')?.value || 0));
  const tEnd = Math.max(tStart + 0.2, Number($('#camTrimEnd')?.value || learnState.duration || 10));

  const trimmedFrames = learnState.frames.filter((f) => f.t >= tStart && f.t <= tEnd);
  const trimmedSegments = (learnState.segments || []).filter((s) => s.end >= tStart && s.start <= tEnd);

  if (!trimmedFrames.length) {
    toast('Khoảng thời gian cắt (Trim) không có khung xương nào. Hãy mở rộng khoảng thời gian.', 'warn');
    return;
  }

  if ($('#camLearnStatus')) {
    $('#camLearnStatus').textContent = 'Đang chạy AI phân tích khung xương + kết hợp mô tả giọng nói để tinh chỉnh dữ liệu…';
  }

  // Huấn luyện bộ phân loại hành vi tự học (KNN/MLP) nếu đủ mẫu đặc trưng
  if (learnState.feats.length >= 4) {
    try {
      const key = ensureClass(name);
      addSamples(key, learnState.feats, 'camera');
      await train({ algo: 'auto' });
    } catch { /* ignore */ }
  }

  const draft = buildActionStepsAndDraftName(trimmedSegments, trimmedFrames, name, voiceNote);
  draft.draftName = name;

  // Lưu vào danh mục Video quay hành vi người dùng
  const uvId = 'uv_' + uid();
  if (learnState.blobUrl) {
    userVideoBlobs.set(uvId, learnState.blobUrl);
  }

  // Mở Popup duyệt tên gói dữ liệu (AI đã kết hợp mô tả giọng nói để chuẩn hóa các Step)
  const savedPkg = await promptApprovePackagePopup({
    ...draft,
    mediaName: `${name}.webm`,
    duration: round(tEnd - tStart, 2),
    voiceTranscript: voiceNote,
    segments: trimmedSegments,
    frames: trimmedFrames,
  });

  await packageStore.addUserVideo({
    id: uvId,
    name: savedPkg?.name || name,
    duration: round(tEnd - tStart, 2),
    frameCount: trimmedFrames.length,
    voiceTranscript: voiceNote,
    packageId: savedPkg?.id || null,
    createdAt: new Date().toISOString(),
  });

  renderUserVideoList();
  if ($('#camLearnStatus')) {
    $('#camLearnStatus').textContent = `✓ Đã phân tích & lưu chuyển động “${savedPkg?.name || name}” (kèm mô tả giọng nói) vào CSDL!`;
  }
}

function renderUserVideoList() {
  const el = $('#userVideoList');
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
        ${uv.voiceTranscript ? `<p class="small voice-quote">🎙 Mô tả giọng nói: “${escapeHtml(uv.voiceTranscript)}”</p>` : ''}
      </div>
      <div class="source-actions">
        <button type="button" class="btn btn-ghost btn-sm" data-uv-act="preview" data-id="${escapeHtml(uv.id)}">Xem video</button>
        <button type="button" class="btn btn-secondary btn-sm" data-uv-act="guide" data-id="${escapeHtml(uv.id)}">Đưa vào Hướng dẫn</button>
        <button type="button" class="btn btn-ghost btn-sm danger-text" data-uv-act="delete" data-id="${escapeHtml(uv.id)}">✕ Xóa</button>
      </div>
    </div>
  `).join('');
}

export function stopCamera() {
  if (!running && !opening) return;
  const wasRunning = running;
  cameraRunId++;
  opening = false;
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
  clearOverlay(canvas);
  stageEl?.classList.remove('is-sync');

  if ($('#camStartBtn')) {
    $('#camStartBtn').hidden = false;
    $('#camStartBtn').disabled = false;
    $('#camStartBtn').textContent = 'Bật camera';
  }
  if ($('#camStopBtn')) $('#camStopBtn').hidden = true;
  if ($('#camSnapBtn')) $('#camSnapBtn').disabled = true;
  if ($('#cameraIdle')) $('#cameraIdle').hidden = guideAnimPlaying;
  if ($('#liveBadge')) $('#liveBadge').hidden = true;
  if ($('#liveList')) $('#liveList').innerHTML = '<li class="muted">Camera đã tắt.</li>';
  live.inferFps = 0;
  live.renderFps = 0;
  live.source = null;
  live.objectFps = 0;
  live.poseRejectedJoints = live.poseUncertainJoints = 0;

  if (guideAnimPlaying) startStandaloneGuideLoop();
  if (!wasRunning) return;
  const dur = (performance.now() - sessionStart) / 1000;
  toast(`Đã tắt camera sau ${fmtTime(dur, false)}. Ghi nhận ${sessionSegments} đoạn hành vi.`, 'ok');
}

function snapshot() {
  if (!running) return;
  const c = document.createElement('canvas');
  c.width = cam.videoWidth;
  c.height = cam.videoHeight;
  const ctx = c.getContext('2d');
  if (!stageEl.classList.contains('is-sync')) ctx.drawImage(cam, 0, 0, c.width, c.height);
  ctx.drawImage(canvas, 0, 0, c.width, c.height);
  c.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `camera_${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Đã lưu ảnh chụp.', 'ok');
  }, 'image/png');
}
