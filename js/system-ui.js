// =========================================================
// system-ui.js — Tab "Hệ thống":
//   1. Thông tin Phần cứng & Hệ điều hành
//   2. Tối ưu Hiệu năng Đa nền tảng (giới hạn máy yếu ở mức Trung bình nếu chọn Cao;
//      setting Yếu đảm bảo chất lượng phân tích mạnh ≥ 10 phân tích/s và ≥ 14 FPS)
//   3. Giám sát Thời gian thực & Xuất file Log CSV
//   4. Đề mục riêng: Cài đặt Mô hình AI Khung xương & Google Gemini API (gộp từ nút Setting góc phải cũ)
// =========================================================
import { store } from './store.js';
import { $, toast, escapeHtml, round } from './utils.js';
import { PROFILES } from './config.js';
import { inference } from './inference.js';
import { PRESETS, testLlmConnection, hasProxy } from './llm.js';
import {
  hw, power, live, TIER_LABEL, runtime, activeProfileKey, isLowTierCapped,
  resolvedThreadMode, backendOrder, modelConfig, runBenchmark, loadBenchmark,
  exportPerfLog, perfLogSize,
} from './perf.js';

let metricsTimer = null;

export function initSystemUi() {
  bindPerfSettings();
  bindAiSettingsSection();
  renderHardware();
  renderBench(loadBenchmark());
  renderProfileDetail();

  $('#benchBtn')?.addEventListener('click', async () => {
    const btn = $('#benchBtn');
    btn.disabled = true;
    try {
      const data = await runBenchmark((text) => { $('#benchStatus').textContent = text; });
      renderBench(data);
      $('#benchStatus').textContent = data.best
        ? `Nhanh nhất: ${data.best.toUpperCase()}. ${store.settings.backend === 'auto' ? 'Sẽ dùng backend này ở chế độ Tự động.' : ''}`
        : 'Không backend nào chạy được mô hình (kiểm tra kết nối mạng để tải mô hình).';
      if (store.settings.backend === 'auto' && inference.ready) reinit('Đã chuyển sang backend nhanh nhất.');
    } catch (err) {
      $('#benchStatus').textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

  $('#perfLogBtn')?.addEventListener('click', exportPerfLog);

  store.on('hardware', () => { renderHardware(); renderProfileDetail(); });
  store.on('power', renderProfileDetail);
  store.on('adaptive', renderProfileDetail);
  store.on('inference-info', renderProfileDetail);
  store.on('settings', syncAiSettingsUi);
  store.on('switch-tab', (tab) => (tab === 'system' ? startMetrics() : stopMetrics()));
}

// ---------- 1. Cài đặt Hiệu năng ----------
function bindPerfSettings() {
  const s = store.settings;
  const map = [
    ['#perfProfile', 'perfProfile', 'value'],
    ['#backendSel', 'backend', 'value'],
    ['#threadSel', 'threadMode', 'value'],
    ['#renderModeSel', 'camRenderMode', 'value'],
    ['#interpToggle', 'interpolate', 'checked'],
    ['#adaptiveToggle', 'adaptive', 'checked'],
    ['#pauseHiddenToggle', 'pauseHidden', 'checked'],
    ['#batteryToggle', 'batterySaver', 'checked'],
  ];
  map.forEach(([sel, key, prop]) => {
    const el = $(sel);
    if (!el) return;
    el[prop] = s[key];
    el.addEventListener('change', () => {
      const prev = store.settings[key];
      store.saveSettings({ [key]: el[prop] });
      onPerfChanged(key, prev);
    });
  });
  const sr = $('#smoothRange');
  if (sr) {
    sr.value = Math.round(s.smoothing * 100);
    $('#smoothOut').textContent = `${sr.value}%`;
    sr.addEventListener('input', () => {
      $('#smoothOut').textContent = `${sr.value}%`;
      store.saveSettings({ smoothing: Number(sr.value) / 100 });
    });
  }
}

function onPerfChanged(key) {
  if (key === 'perfProfile') {
    const activeKey = activeProfileKey();
    const p = PROFILES[activeKey];
    store.saveSettings({ sampleInterval: p.sampleInterval });
    syncAiSettingsUi();
    if (isLowTierCapped()) {
      toast('Máy yếu: giới hạn ở mức Trung bình.', 'warn', 4000);
    } else {
      reinit(`Đã chọn: ${p.label}`);
    }
    if (isLowTierCapped()) reinit();
  } else if (key === 'backend' || key === 'threadMode') {
    if (inference.mode === 'main' && resolvedThreadMode() === 'main' && inference.ready && key === 'backend') {
      toast('Tải lại trang (F5) để đổi backend.', 'warn', 4000);
    } else {
      reinit();
    }
  }
  renderProfileDetail();
}

// ---------- 2. Đề mục riêng: Cài đặt Mô hình AI & Gemini API (Gộp từ góc trên bên phải) ----------
function bindAiSettingsSection() {
  syncAiSettingsUi();

  const minScoreEl = $('#setMinScore');
  if (minScoreEl) {
    minScoreEl.addEventListener('input', (e) => {
      const out = $('#setMinScoreOut');
      if (out) out.textContent = Number(e.target.value).toFixed(2);
    });
  }

  const provEl = $('#setLlmProvider');
  if (provEl) {
    provEl.addEventListener('change', (e) => {
      const p = PRESETS[e.target.value];
      if (!p) return;
      if ($('#setLlmEndpoint')) $('#setLlmEndpoint').value = p.baseUrl;
      if ($('#setLlmModel')) $('#setLlmModel').value = p.model;
    });
  }

  $('#testLlmBtn')?.addEventListener('click', async () => {
    const out = $('#llmTestResult');
    if (!out) return;
    out.textContent = 'Đang kiểm tra…';
    out.className = 'muted small';
    const r = await testLlmConnection(readAiFormSettings());
    out.textContent = r.message;
    out.className = `small ${r.ok ? 'ok-text' : 'err-text'}`;
    if (r.models?.length && $('#modelList')) {
      $('#modelList').innerHTML = r.models.slice(0, 40).map((m) => `<option value="${escapeHtml(m)}">`).join('');
    }
  });

  $('#saveSystemAiSettingsBtn')?.addEventListener('click', () => {
    const prev = { ...store.settings };
    const next = readAiFormSettings();
    store.saveSettings(next);

    const modelChanged = prev.modelType !== next.modelType || prev.detectObjects !== next.detectObjects;
    if (modelChanged && inference.ready) {
      reinit('Đã lưu.');
    } else {
      toast('Đã lưu.', 'ok');
    }
  });

  hasProxy().then((ok) => {
    const note = $('#proxyNote');
    if (note) {
      note.innerHTML = ok
        ? '<span class="ok-text">✓ server.py đang chạy</span>'
        : 'Chưa chạy server.py (link YouTube/TikTok/FB cần server).';
    }
  });
}

function syncAiSettingsUi() {
  const s = store.settings;
  if ($('#setModelType')) $('#setModelType').value = s.modelType || 'multi';
  if ($('#setMinScore')) $('#setMinScore').value = s.minPoseScore ?? 0.25;
  if ($('#setMinScoreOut')) $('#setMinScoreOut').textContent = Number(s.minPoseScore ?? 0.25).toFixed(2);
  if ($('#setSampleInterval')) $('#setSampleInterval').value = String(s.sampleInterval ?? 0.1);
  if ($('#setDetectObjects')) $('#setDetectObjects').checked = !!s.detectObjects;
  if ($('#setLlmProvider')) $('#setLlmProvider').value = s.llmProvider || 'gemini';
  if ($('#setLlmEndpoint')) $('#setLlmEndpoint').value = s.llmEndpoint || PRESETS.gemini.baseUrl;
  if ($('#setLlmModel')) $('#setLlmModel').value = s.llmModel || PRESETS.gemini.model;
  if ($('#setLlmKey')) $('#setLlmKey').value = s.llmKey || '';
  if ($('#setGoogleSearch')) $('#setGoogleSearch').checked = s.enableGoogleSearch !== false;
}

function readAiFormSettings() {
  return {
    modelType: $('#setModelType')?.value || 'multi',
    minPoseScore: Number($('#setMinScore')?.value || 0.25),
    sampleInterval: Number($('#setSampleInterval')?.value || 0.1),
    detectObjects: !!$('#setDetectObjects')?.checked,
    detectFaces: false,
    faceEmotion: false,
    faceRecog: false,
    llmProvider: $('#setLlmProvider')?.value || 'gemini',
    llmEndpoint: ($('#setLlmEndpoint')?.value || PRESETS.gemini.baseUrl).trim(),
    llmModel: ($('#setLlmModel')?.value || PRESETS.gemini.model).trim(),
    llmKey: ($('#setLlmKey')?.value || '').trim(),
    enableGoogleSearch: $('#setGoogleSearch') ? !!$('#setGoogleSearch').checked : true,
  };
}

/** Khởi tạo lại dịch vụ suy luận nếu nó đang chạy */
function reinit(message) {
  if (!inference.ready) { if (message) toast(message, 'ok'); return; }
  if (store.analyzing) { toast('Thay đổi sẽ áp dụng ở lần phân tích sau.', 'warn'); return; }
  inference.init(modelConfig())
    .then((info) => toast(message || `Đang dùng ${info.backend} · ${info.mode === 'worker' ? 'Web Worker' : 'luồng chính'}.`, 'ok'))
    .catch((err) => toast(err.message, 'error', 6000));
}

function renderProfileDetail() {
  const rt = runtime();
  const p = PROFILES[rt.key];
  const capped = isLowTierCapped();
  const why = capped
    ? ' <span class="warn-text">(giới hạn máy yếu)</span>'
    : store.settings.perfProfile === 'auto'
      ? (power.batteryLow ? ' (tự chọn vì pin yếu)' : hw.tier ? ` (tự chọn cho ${TIER_LABEL[hw.tier].toLowerCase()})` : '')
      : '';
  const el = $('#profileDetail');
  if (!el) return;
  el.innerHTML = `<b>${p.label}</b>${why} · ${rt.poseDim}px`
    + (rt.level ? ` · <span class="warn-text">giảm tải ${rt.level}/3</span>` : '')
    + (inference.ready ? ` · ${inference.backend} (${inference.mode === 'worker' ? 'worker' : 'luồng chính'})` : '');
}

// ---------- Phần cứng ----------
function renderHardware() {
  if (!hw.ready || !$('#hwTable')) return;
  const yes = (v) => (v ? '<span class="ok-text">Có</span>' : '<span class="muted">Không</span>');
  const rows = [
    ['Hệ điều hành', `${escapeHtml(hw.os)}${hw.arch ? ` · ${escapeHtml(hw.arch)}` : ''}`],
    ['Trình duyệt', escapeHtml(hw.browser)],
    ['CPU (luồng logic)', hw.cores ?? 'Không rõ'],
    ['RAM (ước lượng)', hw.memoryGB ? `≥ ${hw.memoryGB} GB` : 'Trình duyệt không cung cấp'],
    ['GPU', `${escapeHtml(hw.gpu.renderer)}${hw.gpu.software ? ' <span class="warn-text">(giả lập bằng phần mềm)</span>' : ''}`],
    ['WebGL', hw.gpu.webgl ? `WebGL ${hw.gpu.webgl} · texture tối đa ${hw.gpu.maxTexture}px` : '<span class="warn-text">Không có</span>'],
    ['WebGPU', hw.webgpu ? `Có${hw.webgpuInfo ? ` · ${escapeHtml(hw.webgpuInfo)}` : ''}` : '<span class="muted">Không</span>'],
    ['WASM SIMD', yes(hw.wasmSimd)],
    ['WASM đa luồng', hw.wasmThreads ? '<span class="ok-text">Có</span>' : '<span class="muted">Không (cần chạy server.py --isolate)</span>'],
    ['Web Worker + OffscreenCanvas', `${yes(hw.worker)} / ${yes(hw.offscreenCanvas)}`],
    ['Đồng bộ khung video (rVFC)', yes(hw.videoFrameCallback)],
    ['Màn hình', hw.screen],
  ];
  $('#hwTable').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  const badge = $('#tierBadge');
  if (badge) {
    badge.textContent = TIER_LABEL[hw.tier];
    badge.dataset.tier = hw.tier;
  }
  if ($('#osTips')) $('#osTips').innerHTML = osTips();
}

function osTips() {
  const os = hw.os.toLowerCase();
  const tips = [];
  if (hw.gpu.software || !hw.gpu.webgl) {
    tips.push('Chưa dùng GPU: bật “Tăng tốc phần cứng” trong trình duyệt.');
  }
  if (os.startsWith('windows')) {
    tips.push('Laptop 2 GPU: chọn “High performance” cho trình duyệt.');
  } else if (os.includes('mac')) {
    tips.push('Cấp quyền camera trong Privacy & Security.');
  } else if (os.includes('android') || os.includes('ios')) {
      }
  if (hw.tier === 'low') {
    tips.push('Máy yếu: mức Cao tự giới hạn về Trung bình.');
  }
  return tips.map((t) => `<p>${t}</p>`).join('');
}

// ---------- Benchmark ----------
function renderBench(data) {
  const el = $('#benchTable');
  if (!el) return;
  if (!data?.results?.length) { el.innerHTML = ''; return; }
  const stale = data.fingerprint !== hw.fingerprint;
  el.innerHTML = `<table class="mini-table">
    <thead><tr><th>Backend</th><th>Trung vị</th><th>p95</th><th>Khung/giây</th><th>Ghi chú</th></tr></thead>
    <tbody>${data.results.map((r) => `<tr class="${r.backend === data.best ? 'is-best' : ''}">
      <td>${r.backend.toUpperCase()}</td>
      <td>${r.ok ? `${r.median} ms` : '–'}</td><td>${r.ok ? `${r.p95} ms` : '–'}</td>
      <td>${r.ok ? r.fps : '–'}</td>
      <td>${r.ok ? (r.backend === data.best ? '★ nhanh nhất' : '') : escapeHtml(r.note || 'không chạy được')}</td></tr>`).join('')}
    </tbody></table>
    <p class="muted small">Đo lúc ${new Date(data.at).toLocaleString('vi-VN')}${stale ? ' — <span class="warn-text">trên cấu hình khác, nên đo lại</span>' : ''}.</p>`;
}

// ---------- Giám sát ----------
function startMetrics() {
  stopMetrics();
  renderProfileDetail();
  const tick = () => { renderMetrics(); drawSpark(); };
  tick();
  metricsTimer = setInterval(tick, 500);
}

function stopMetrics() {
  clearInterval(metricsTimer);
  metricsTimer = null;
}

function renderMetrics() {
  const el = $('#metrics');
  if (!el) return;
  const s = inference.stats;
  const mem = s.memory || {};
  const rt = runtime();
  const heap = performance.memory ? `${round(performance.memory.usedJSHeapSize / 1048576, 0)} / ${round(performance.memory.jsHeapSizeLimit / 1048576, 0)} MB` : 'Không hỗ trợ';
  const items = [
    ['Backend', inference.ready ? `${inference.backend} · ${inference.mode === 'worker' ? 'worker' : 'luồng chính'}` : 'chưa khởi tạo'],
    ['Hồ sơ hiệu năng', `${PROFILES[rt.key].label}${isLowTierCapped() ? ' (Giới hạn máy yếu)' : ''}${rt.level ? ` · giảm tải ${rt.level}` : ''}`],
    ['Ảnh tư thế thực tế', `${s.poseDim || rt.poseDim}px · gửi worker ${rt.inputWidth}px`],
    ['Khởi tạo AI', s.startupMs ? `${round(s.startupMs / 1000, 1)} giây` : '–'],
    ['Suy luận TB', s.calls ? `${round(s.emaMs, 1)} ms` : '–'],
    ['Suy luận p95', s.calls ? `${round(inference.p95(), 1)} ms` : '–'],
    ['Phân tích/giây (Mục tiêu ≥10/s)', live.inferFps ? `${round(live.inferFps, 1)} /s` : '–'],
    ['Hiển thị FPS (Mục tiêu ≥14 FPS)', live.renderFps ? `${round(live.renderFps, 1)} FPS` : '–'],
    ['Camera', live.source === 'camera' && live.cameraFps ? `${live.cameraRes} @ ${round(live.cameraFps, 0)} fps` : '–'],
    ['Tensor', mem.numTensors != null ? `${mem.numTensors} · ${round(mem.numBytes / 1048576, 1)} MB` : '–'],
    ['Bộ nhớ JS', heap],
    ['Pin', power.level != null ? `${Math.round(power.level * 100)}%${power.charging ? ' · đang sạc' : ''}` : 'Không rõ'],
    ['Log CSV', `${perfLogSize()} dòng`],
  ];
  el.innerHTML = items.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
}

function drawSpark() {
  const c = $('#perfSpark');
  if (!c) return;
  const w = c.clientWidth || 600;
  if (c.width !== w) c.width = w;
  const h = c.height;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  const data = inference.stats.samples;
  if (data.length < 2) {
    ctx.fillStyle = '#6d7f8f';
    ctx.font = '12px system-ui';
    ctx.fillText('Chưa có dữ liệu — bật camera hoặc phân tích video.', 8, h / 2);
    return;
  }
  const budget = 1000 / runtime().targetFps;
  const max = Math.max(budget * 1.5, ...data) * 1.1;
  const y = (v) => h - (v / max) * (h - 6) - 3;
  ctx.strokeStyle = 'rgba(255,93,115,.6)';
  ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(0, y(budget)); ctx.lineTo(w, y(budget)); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,93,115,.8)';
  ctx.font = '11px system-ui';
  ctx.fillText(`ngân sách ${Math.round(budget)} ms`, 6, y(budget) - 4);
  ctx.strokeStyle = '#f2b134';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  data.forEach((v, i) => {
    const x = (i / (data.length - 1)) * w;
    i ? ctx.lineTo(x, y(v)) : ctx.moveTo(x, y(v));
  });
  ctx.stroke();
}
