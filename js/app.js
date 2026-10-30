// =========================================================
// app.js — Điểm khởi động: nối các module, 4 tab chính:
//   • Video (Phân tích chính + Nhập Link/File/ZIP + Bảng Hành vi Gốc & AI + Bảng Thời gian Mili-giây)
//   • Camera (3 chức năng: Hướng dẫn khung xương Step, Kiểm tra độ chính xác, Học chuyển động kèm Giọng nói)
//   • Dữ liệu phân tích (Danh mục các Phân tích + Bảng nhãn + Mẫu video phân tích theo thời gian + Học hành vi)
//   • Hệ thống (Phần cứng, Tối ưu đa nền tảng ≥10 phân tích/s & ≥14 FPS, Log CSV, và Cài đặt AI/Gemini riêng biệt)
// =========================================================
import { store } from './store.js';
import { $, $$, toast } from './utils.js';
import { initPlayer, togglePlay, stopVideo, skip, stepFrame, jumpEvent } from './player.js';
import { initUpload } from './upload.js';
import { initCamera, isCameraRunning } from './camera.js';
import { initResults } from './results.js';
import { initChatbot } from './chatbot.js';
import { exportJSON, exportCSV, importJSONFile } from './json-io.js';
import { inference } from './inference.js';
import { detectHardware, modelConfig, TIER_LABEL, hw } from './perf.js';
import { initLearner } from './learner.js';
import { initLearnUi } from './learn-ui.js';
import { initSystemUi } from './system-ui.js';
import { initPackageStore } from './packages.js';
import { APP_VERSION } from './config.js';
import { normalizeLlmSettings } from './llm.js';
import { initThemeUi } from './theme-ui.js';

const TABS = ['video', 'camera', 'learn', 'system'];
// Tab Dữ liệu phân tích và Hệ thống có giao diện bảng riêng nên ẩn bảng kết quả chung
const NO_RESULTS = new Set(['learn', 'system']);

const warmModel = () => inference.init(modelConfig()).catch((e) => console.warn('Tải trước mô hình thất bại:', e.message));

async function init() {
  initThemeUi();
  if ($('#appVersion')) $('#appVersion').textContent = `Phiên bản ${APP_VERSION}`;
  await initPackageStore().catch((e) => console.warn('Khởi tạo kho gói dữ liệu:', e));

  initCamera();
  initTabs();
  initModelStatus();
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register(new URL('../asset-cache.js', import.meta.url)).catch((err) => console.warn('Không lưu được bộ nhớ đệm AI:', err.message));
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

  store.on('inference-info', (info) => {
    const wanted = store.settings.backend;
    if (wanted !== 'auto' && info.backend !== wanted) {
      toast(`Backend ${wanted} không chạy được trên máy này — đang dùng ${info.backend}. Chi tiết ở tab Hệ thống.`, 'warn', 6000);
    }
  });
  store.on('adaptive', ({ level, direction }) => {
    toast(direction === 'down'
      ? `Máy đang tải cao — tự điều chỉnh mức ${level}/3 để giữ ≥10 phân tích/s và ≥14 FPS.`
      : `Máy đã rảnh hơn — tăng lại chất lượng (mức ${level}/3).`, direction === 'down' ? 'warn' : 'info', 2500);
  });

  initLearner().catch((e) => console.warn('Không đọc được dữ liệu học:', e));
  await detectHardware().catch((e) => console.warn('Không nhận diện được phần cứng:', e));
  if (hw.ready && hw.tier === 'low' && store.settings.perfProfile === 'auto') {
    toast(`Nhận diện: ${TIER_LABEL.low} (${hw.cores || '?'} luồng CPU). Đã chọn hồ sơ Tiết kiệm tối ưu (≥10 phân tích/s, ≥14 FPS).`, 'info', 5500);
  }
  warmModel();
}

// ---------- Chuyển đổi 4 Tab chính ----------
function initTabs() {
  const select = (name) => {
    if (!TABS.includes(name)) name = 'video';
    $$('.tab').forEach((t) => {
      const on = t.dataset.tab === name;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on);
    });
    TABS.forEach((tab) => {
      const panel = $(`#panel-${tab}`);
      if (panel) panel.hidden = name !== tab;
    });
    if ($('#resultsSection')) $('#resultsSection').hidden = NO_RESULTS.has(name);
    const btn = $(`.tab[data-tab="${name}"]`);
    if (btn) {
      if ($('#pageTitle')) $('#pageTitle').textContent = btn.dataset.title;
      if ($('#mobilePageTitle')) $('#mobilePageTitle').textContent = btn.querySelector('span')?.textContent || name;
      if ($('#pageSub')) $('#pageSub').textContent = btn.dataset.sub;
    }
    window.scrollTo(0, 0);
  };
  $$('.tab').forEach((t) => t.addEventListener('click', () => {
    if (t.dataset.tab !== 'camera' && isCameraRunning()) {
      toast('Camera vẫn đang chạy ở nền. Bấm “Tắt camera” nếu không dùng nữa.', 'info');
    }
    $('.app')?.classList.remove('is-sidebar-open');
    store.emit('switch-tab', t.dataset.tab);
  }));
  store.on('switch-tab', select);
  $('#mobileSettingsBtn')?.addEventListener('click', () => store.emit('switch-tab', 'system'));

  // Nút không viền ở bên trái logo: kéo ngăn chức năng bên trái ra & làm mờ (blur) phần còn lại
  const setSidebarOpen = (open) => {
    const appEl = $('.app');
    if (!appEl) return;
    const next = typeof open === 'boolean' ? open : !appEl.classList.contains('is-sidebar-open');
    appEl.classList.toggle('is-sidebar-open', next);
  };
  $('#sidebarToggleBtn')?.addEventListener('click', () => setSidebarOpen());
  $('#sidebarCloseBtn')?.addEventListener('click', () => setSidebarOpen(false));
  $('#sidebarBackdrop')?.addEventListener('click', () => setSidebarOpen(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('.app')?.classList.contains('is-sidebar-open')) {
      setSidebarOpen(false);
    }
  });
}

// ---------- Trạng thái mô hình ----------
function initModelStatus() {
  const el = $('#modelStatus');
  if (!el) return;
  store.on('model-status', ({ state, text }) => {
    el.dataset.state = state;
    el.textContent = text;
  });
  store.on('model-warning', (msg) => toast(msg, 'warn', 6000));
}

// ---------- Xuất / Nhập ----------
function initImportExport() {
  const btn = $('#exportBtn');
  const menu = $('#exportMenu');
  if (!btn || !menu) return;
  const close = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    btn.setAttribute('aria-expanded', String(!menu.hidden));
  });
  document.addEventListener('click', close);
  menu.addEventListener('click', (e) => {
    const kind = e.target.closest('[data-export]')?.dataset.export;
    if (!kind) return;
    if (kind === 'json-all') exportJSON({ filtered: false });
    if (kind === 'json-filtered') exportJSON({ filtered: true });
    if (kind === 'csv') exportCSV();
    close();
  });

  const input = $('#jsonInput');
  input?.addEventListener('change', async () => {
    const f = input.files?.[0];
    if (f) await importJSONFile(f);
    input.value = '';
  });
  store.on('import-json-file', (file) => importJSONFile(file));
}

function fixSavedLlmSettings() {
  const { settings: fixed, notes } = normalizeLlmSettings(store.settings);
  if (!notes.length) return;
  store.saveSettings({ llmKey: fixed.llmKey, llmEndpoint: fixed.llmEndpoint, llmModel: fixed.llmModel });
}

// ---------- Phím tắt ----------
function initShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select, button, [contenteditable], dialog')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if ($('#panel-video')?.hidden) return;
    const map = {
      ' ': togglePlay,
      k: togglePlay,
      s: stopVideo,
      ArrowLeft: () => skip(-5),
      ArrowRight: () => skip(5),
      ',': () => stepFrame(-1),
      '.': () => stepFrame(1),
      j: () => jumpEvent(-1),
      l: () => jumpEvent(1),
    };
    const fn = map[e.key] || map[e.key.toLowerCase?.()];
    if (fn) {
      e.preventDefault();
      fn();
    }
  });
}

init().catch((error) => {
  console.error('Khởi động ứng dụng:', error);
  store.emit('model-status', { state: 'error', text: 'Lỗi khởi động ứng dụng' });
  toast('Không khởi động được ứng dụng: ' + error.message, 'error', 15000);
});
