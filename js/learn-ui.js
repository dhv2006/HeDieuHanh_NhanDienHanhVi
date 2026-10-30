// =========================================================
// learn-ui.js — Giao diện tab "Dữ liệu phân tích" (đổi tên từ "Học hành vi"):
//   1. Danh mục các Phân tích (Analysis Packages Catalog):
//      • Khi bấm vào từng phân tích, hiển thị:
//        (a) Bảng các nhãn hành vi có trong phân tích
//        (b) Mẫu video phân tích (mô phỏng khung xương theo thời gian thực)
//            kèm Bảng các hành vi được liệt kê theo thứ tự thời gian của video
//      • Cho phép tải về máy (.ZIP), nhập file .ZIP, đổi tên, xóa, hoặc đưa vào Camera hướng dẫn.
//   2. Duy trì đầy đủ chức năng Học hành vi (KNN / MLP, dạy từ khoảng video, tự khám phá cụm).
// =========================================================
import { store } from './store.js';
import { personLabel } from './face.js';
import { $, $$, toast, escapeHtml, fmtTime, fmtTimeMs, parseTime, clamp } from './utils.js';
import { behaviorInfo } from './config.js';
import {
  summary, train, removeClass, renameClass, clearSamplesOf, teachFromFrames,
  discover, learnCluster, applyToFrames, exportPack, importPack, ensureClass,
} from './learner.js';
import { hasKeypoints } from './features.js';
import { seekTo } from './player.js';
import { drawOverlay } from './overlay.js';
import { defaultStandingKeypoints } from './behavior.js';
import {
  packageStore, exportPackageZip, importPackageZip, applyPackageToWorkspace,
} from './packages.js';

let pendingSegment = null;
let training = false;
let selectedCatalogPkgId = null;

// Trình phát mẫu phân tích khung xương trong tab "Dữ liệu phân tích"
let replayPlaying = false;
let replayTime = 0;
let replayRaf = null;
let replayLastTs = 0;

export function initLearnUi() {
  initCatalogSection();
  initLearnerSection();
}

// =========================================================
// 1. DANH MỤC CÁC PHÂN TÍCH & CHI TIẾT GÓI PHÂN TÍCH
// =========================================================
function initCatalogSection() {
  $('#catalogZipInput')?.addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const pkg = await importPackageZip(f);
      selectedCatalogPkgId = pkg.id;
      renderCatalog();
      renderSelectedPackageDetail();
      toast(`Đã nhập gói phân tích “${pkg.name}” vào Danh mục.`, 'ok');
    } catch (err) {
      toast(`Lỗi nhập file .ZIP: ${err.message}`, 'error', 6000);
    }
  });

  $('#packageCatalogList')?.addEventListener('click', async (e) => {
    const actBtn = e.target.closest('button[data-pkg-act]');
    const card = e.target.closest('[data-pkg-id]');
    if (!card) return;
    const id = card.dataset.pkgId;
    const pkg = packageStore.getPackage(id);
    if (!pkg) return;

    if (actBtn) {
      e.stopPropagation();
      const act = actBtn.dataset.pkgAct;
      if (act === 'zip') {
        await exportPackageZip(pkg);
      } else if (act === 'camera') {
        store.emit('select-package-for-camera', pkg);
        toast(`Đã chuyển gói “${pkg.name}” sang mục Camera Hướng dẫn.`, 'ok');
      } else if (act === 'workspace') {
        applyPackageToWorkspace(pkg);
        store.emit('switch-tab', 'video');
        toast(`Đã nạp dữ liệu phân tích “${pkg.name}” sang màn hình Video.`, 'ok');
      } else if (act === 'rename') {
        const nextName = prompt('Nhập tên mới cho gói dữ liệu phân tích:', pkg.name);
        if (nextName && nextName.trim()) {
          await packageStore.renamePackage(pkg.id, nextName.trim());
          renderCatalog();
          renderSelectedPackageDetail();
          toast('Đã đổi tên gói phân tích.', 'ok');
        }
      } else if (act === 'delete') {
        if (confirm(`Xóa gói phân tích “${pkg.name}” khỏi cơ sở dữ liệu?`)) {
          await packageStore.removePackage(pkg.id);
          if (selectedCatalogPkgId === pkg.id) {
            selectedCatalogPkgId = packageStore.packages[0]?.id || null;
          }
          renderCatalog();
          renderSelectedPackageDetail();
          toast('Đã xóa gói phân tích.', 'info');
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

  // Điều khiển trình phát mẫu video phân tích (Replay Canvas)
  $('#pkgReplayPlayBtn')?.addEventListener('click', toggleSampleReplay);
  $('#pkgReplayStopBtn')?.addEventListener('click', () => {
    stopSampleReplay();
    replayTime = 0;
    drawSampleReplayAt(0);
  });
  $('#pkgReplayScrubber')?.addEventListener('input', (e) => {
    replayTime = Number(e.target.value) || 0;
    drawSampleReplayAt(replayTime);
  });

  // Bấm vào dòng trên Bảng thời gian của gói phân tích để tua mẫu video tới đúng giây đó
  $('#pkgTimelineTableBody')?.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-start]');
    if (!tr) return;
    replayTime = Number(tr.dataset.start) || 0;
    drawSampleReplayAt(replayTime);
  });

  store.on('packages', () => {
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
  const listEl = $('#packageCatalogList');
  if (!listEl) return;
  const pkgs = packageStore.packages || [];
  const countBadge = $('#catalogCountBadge');
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
    const created = pkg.createdAt ? new Date(pkg.createdAt).toLocaleString('vi-VN') : '';
    return `<article class="catalog-card ${isSel ? 'is-selected' : ''}" data-pkg-id="${escapeHtml(pkg.id)}">
      <div class="catalog-card-main">
        <div class="catalog-card-title-row">
          <span class="src-badge src-zip">Gói Phân Tích</span>
          <h4 class="catalog-title">${escapeHtml(pkg.name)}</h4>
          <span class="mono muted small">⏱ ${dur} · ${segCount} mốc thời gian · ${stepCount} Step</span>
        </div>
        <p class="small muted">${escapeHtml(pkg.summary || '')}</p>
        ${pkg.voiceTranscript ? `<p class="small voice-quote">🎙 Giọng nói người dùng: “${escapeHtml(pkg.voiceTranscript)}”</p>` : ''}
        <div class="small muted">Nguồn: <b>${escapeHtml(pkg.mediaName || 'video')}</b> · Lưu lúc: ${escapeHtml(created)}</div>
      </div>
      <div class="catalog-card-actions">
        <button type="button" class="btn btn-primary btn-sm" data-pkg-act="camera">Đưa vào Camera tập</button>
        <button type="button" class="btn btn-secondary btn-sm" data-pkg-act="zip">⬇ Tải .ZIP</button>
        <button type="button" class="btn btn-ghost btn-sm" data-pkg-act="workspace">Mở ở tab Video</button>
        <button type="button" class="btn btn-ghost btn-sm" data-pkg-act="rename">Đổi tên</button>
        <button type="button" class="btn btn-ghost btn-sm danger-text" data-pkg-act="delete">✕</button>
      </div>
    </article>`;
  }).join('');
}

function renderSelectedPackageDetail() {
  const pkg = getSelectedCatalogPkg();
  const detailWrap = $('#packageDetailSection');
  if (!detailWrap) return;

  if (!pkg) {
    detailWrap.hidden = true;
    return;
  }
  detailWrap.hidden = false;

  if ($('#selectedPkgTitle')) $('#selectedPkgTitle').textContent = pkg.name;
  if ($('#selectedPkgMeta')) {
    $('#selectedPkgMeta').textContent = `Nguồn: ${pkg.mediaName || 'video'} · Thời lượng: ${fmtTimeMs(pkg.duration || 0)} · Tổng ${pkg.segments?.length || 0} phân đoạn hành vi`;
  }
  if ($('#selectedPkgSummary')) $('#selectedPkgSummary').textContent = pkg.summary || '';

  // (A) Bảng các nhãn hành vi có trong phân tích
  const summaryBody = $('#pkgBehaviorSummaryTableBody');
  if (summaryBody) {
    const agg = {};
    (pkg.segments || []).forEach((s) => {
      const a = (agg[s.behavior] ||= {
        count: 0,
        totalMs: 0,
        confSum: 0,
        sampleAngles: s.jointAngles || '',
        sampleHint: s.stepHint || '',
      });
      a.count++;
      const dMs = s.durationMs || Math.max(10, Math.round((s.end - s.start) * 1000));
      a.totalMs += dMs;
      a.confSum += s.confidence || 0.85;
      if (!a.sampleAngles && s.jointAngles) a.sampleAngles = s.jointAngles;
      if (!a.sampleHint && s.stepHint) a.sampleHint = s.stepHint;
    });

    const entries = Object.entries(agg);
    summaryBody.innerHTML = entries.length ? entries.map(([k, st]) => {
      const info = behaviorInfo(k);
      const isAi = info.group === 'ai';
      const typeLabel = isAi ? '<span class="type-pill type-ai">⚡ Nhãn con AI</span>' : '<span class="type-pill type-core">Hành vi gốc</span>';
      return `<tr>
        <td><span class="badge"><i style="background:${info.color}"></i>${escapeHtml(info.label)}</span></td>
        <td>${typeLabel}</td>
        <td><b>${st.count}</b> lần</td>
        <td class="mono">${(st.totalMs / 1000).toFixed(2)}s (${st.totalMs}ms)</td>
        <td>${Math.round((st.confSum / st.count) * 100)}%</td>
        <td class="small muted">${escapeHtml(st.sampleHint || info.stepHint || st.sampleAngles || '–')}</td>
      </tr>`;
    }).join('') : `<tr><td colspan="6" class="muted">Chưa có nhãn hành vi nào trong phân tích này.</td></tr>`;
  }

  // (B) Bảng mẫu video phân tích liệt kê các hành vi theo thời gian của video
  const timelineBody = $('#pkgTimelineTableBody');
  if (timelineBody) {
    const segs = [...(pkg.segments || [])].sort((a, b) => a.start - b.start);
    timelineBody.innerHTML = segs.length ? segs.map((s, idx) => {
      const info = behaviorInfo(s.behavior);
      const durMs = s.durationMs || Math.max(10, Math.round((s.end - s.start) * 1000));
      const pctConf = Math.round((s.confidence || 0.85) * 100);
      return `<tr data-start="${s.start}" data-end="${s.end}" class="pkg-time-row" title="Bấm để xem mẫu khung xương tại mốc ${fmtTimeMs(s.start)}">
        <td class="mono">${idx + 1}</td>
        <td class="mono"><b>${fmtTimeMs(s.start)}</b> <span class="muted small">(${Number(s.start).toFixed(3)}s)</span></td>
        <td class="mono"><b>${fmtTimeMs(s.end)}</b> <span class="muted small">(${Number(s.end).toFixed(3)}s)</span></td>
        <td class="mono">${durMs} ms</td>
        <td>
          <span class="badge"><i style="background:${info.color}"></i>${escapeHtml(info.label)}</span>
          ${info.group === 'ai' ? '<span class="ai-tag">AI</span>' : ''}
        </td>
        <td class="small muted">${escapeHtml([s.jointAngles, s.stepHint || info.stepHint].filter(Boolean).join(' · ') || '–')}</td>
        <td><b>${pctConf}%</b></td>
      </tr>`;
    }).join('') : `<tr><td colspan="7" class="muted">Chưa có dữ liệu thời gian.</td></tr>`;
  }

  const scrubber = $('#pkgReplayScrubber');
  const dur = pkg.duration || Math.max(1, ...(pkg.segments || []).map((s) => s.end || 0));
  if (scrubber) {
    scrubber.max = dur;
    scrubber.value = 0;
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
  if ($('#pkgReplayPlayBtn')) $('#pkgReplayPlayBtn').textContent = '⏸ Tạm dừng mẫu';
  const dur = pkg.duration || Math.max(3, ...(pkg.segments || []).map((s) => s.end || 3));

  const loop = (now) => {
    if (!replayPlaying) return;
    const dt = (now - replayLastTs) / 1000;
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
  if ($('#pkgReplayPlayBtn')) $('#pkgReplayPlayBtn').textContent = '▶ Phát mẫu phân tích';
}

function drawSampleReplayAt(t) {
  const pkg = getSelectedCatalogPkg();
  const canvas = $('#pkgSampleReplayCanvas');
  if (!pkg || !canvas) return;
  if (canvas.width !== 640) {
    canvas.width = 640;
    canvas.height = 360;
  }

  const dur = pkg.duration || Math.max(3, ...(pkg.segments || []).map((s) => s.end || 3));
  const clampedT = clamp(t, 0, dur);
  if ($('#pkgReplayScrubber') && document.activeElement !== $('#pkgReplayScrubber')) {
    $('#pkgReplayScrubber').value = clampedT;
  }
  if ($('#pkgReplayTime')) {
    $('#pkgReplayTime').textContent = `${fmtTimeMs(clampedT)} / ${fmtTimeMs(dur)}`;
  }

  // Tìm các nhãn đang diễn ra tại thời điểm clampedT
  const activeSegs = (pkg.segments || []).filter((s) => clampedT >= s.start && clampedT <= s.end);
  const activeLabels = activeSegs.map((s) => ({ behavior: s.behavior, confidence: s.confidence || 0.9 }));

  // Nội suy khung xương từ frames hoặc steps của gói phân tích
  let kp = null;
  if (pkg.frames?.length) {
    const frames = pkg.frames;
    let near = frames[0];
    let bestDiff = Infinity;
    for (const f of frames) {
      const d = Math.abs(f.t - clampedT);
      if (d < bestDiff) { bestDiff = d; near = f; }
    }
    const p = near?.persons?.[0];
    if (p?.kp) {
      kp = p.kp.map(([x, y, score]) => ({ x, y, score: score ?? 0.9 }));
    }
  }
  if (!kp && pkg.steps?.length) {
    const stepIdx = Math.min(pkg.steps.length - 1, Math.floor((clampedT / Math.max(0.1, dur)) * pkg.steps.length));
    const nextIdx = (stepIdx + 1) % pkg.steps.length;
    const localProgress = ((clampedT / Math.max(0.1, dur)) * pkg.steps.length) - stepIdx;
    const aKp = pkg.steps[stepIdx]?.keypoints || defaultStandingKeypoints(stepIdx);
    const bKp = pkg.steps[nextIdx]?.keypoints || aKp;
    kp = aKp.map((a, i) => {
      const b = bKp[i] || a;
      return {
        x: a.x + (b.x - a.x) * localProgress,
        y: a.y + (b.y - a.y) * localProgress,
        score: 0.95,
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

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0d1520';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const persons = [{
    personId: 1,
    keypoints: kp,
    box: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
    labels: activeLabels.length ? activeLabels : [{ behavior: 'standing', confidence: 0.9 }],
  }];

  const hud = activeSegs.length
    ? [{ color: '#38bdf8', text: `Mốc ${fmtTimeMs(clampedT)}: ${activeSegs.map((s) => behaviorInfo(s.behavior).label).join(' · ')}` }]
    : [{ color: '#94a3b8', text: `Mốc ${fmtTimeMs(clampedT)}: Đang phát mô phỏng khung xương` }];

  drawOverlay(canvas, persons, [], 0.2, null, { skeleton: true, hud });

  // Đánh dấu dòng tương ứng trong bảng thời gian
  $$('#pkgTimelineTableBody tr[data-start]').forEach((tr) => {
    const s = Number(tr.dataset.start);
    const e = Number(tr.dataset.end);
    tr.classList.toggle('is-current', clampedT >= s && clampedT <= e);
  });
}

// =========================================================
// 2. DUY TRÌ CHỨC NĂNG HỌC HÀNH VI (KNN / MLP / KHÁM PHÁ CỤM)
// =========================================================
function initLearnerSection() {
  const s = store.settings;
  if ($('#useLearned')) $('#useLearned').checked = s.useLearned;
  if ($('#selfTrain')) $('#selfTrain').checked = s.selfTrain;
  if ($('#learnThreshold')) $('#learnThreshold').value = Math.round(s.learnThreshold * 100);
  if ($('#learnThresholdOut')) $('#learnThresholdOut').textContent = `${Math.round(s.learnThreshold * 100)}%`;

  $('#useLearned')?.addEventListener('change', (e) => store.saveSettings({ useLearned: e.target.checked }));
  $('#selfTrain')?.addEventListener('change', (e) => store.saveSettings({ selfTrain: e.target.checked }));
  $('#learnThreshold')?.addEventListener('input', (e) => {
    const v = Number(e.target.value) / 100;
    if ($('#learnThresholdOut')) $('#learnThresholdOut').textContent = `${e.target.value}%`;
    store.saveSettings({ learnThreshold: v });
  });

  $('#trainBtn')?.addEventListener('click', () => runTraining($('#trainAlgo').value));
  $('#applyLearnedBtn')?.addEventListener('click', () => {
    try {
      const n = applyToFrames();
      toast(`Đã áp dụng: ${n} đoạn hành vi đã học trên video hiện tại.`, 'ok');
    } catch (err) { toast(err.message, 'warn', 5000); }
  });

  $('#packExport')?.addEventListener('click', exportPack);
  $('#packImport')?.addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const r = await importPack(f);
      toast(`Đã nhập ${r.classes} hành vi, ${r.samples} mẫu. Đang huấn luyện…`, 'ok');
      await runTraining('auto');
    } catch (err) { toast(err.message, 'error', 6000); }
  });

  $('#learnList')?.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-key]');
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!li || !act) return;
    const key = li.dataset.key;
    const label = behaviorInfo(key).label;
    if (act === 'rename') {
      const name = prompt('Tên mới cho hành vi:', label);
      if (name && name.trim()) {
        renameClass(key, name);
        store.setResults({ segments: store.segments, frames: store.frames, meta: store.meta });
      }
    } else if (act === 'clear') {
      if (confirm(`Xoá toàn bộ mẫu của “${label}” (giữ lại tên)?`)) clearSamplesOf(key);
    } else if (act === 'delete') {
      if (confirm(`Xoá hành vi “${label}” cùng mọi mẫu đã học?`)) removeClass(key);
    }
  });

  $('#tvBtn')?.addEventListener('click', () => {
    const name = $('#tvName').value.trim();
    const from = parseTime($('#tvFrom').value);
    const to = parseTime($('#tvTo').value);
    const personId = $('#tvPerson').value === '' ? null : Number($('#tvPerson').value);
    if (!name) { toast('Nhập tên hành vi.', 'warn'); return; }
    if (from == null || to == null || to <= from) { toast('Khoảng thời gian không hợp lệ (vd: 0:12 đến 0:18).', 'warn'); return; }
    teachRange({ name, personId, from, to, addSegment: $('#tvRelabel').checked });
  });

  const dlg = $('#teachDialog');
  if (dlg) {
    store.on('teach-segment', (seg) => {
      if (!hasKeypoints(store.frames)) {
        toast('Kết quả này không có toạ độ khung xương. Hãy phân tích lại video.', 'warn', 6000);
        return;
      }
      pendingSegment = seg;
      $('#teachInfo').textContent = `${personLabel(seg.personId, seg.source)} · ${fmtTimeMs(seg.start)} – ${fmtTimeMs(seg.end)} · hiện gán: ${behaviorInfo(seg.behavior).label}`;
      $('#teachDlgName').value = '';
      dlg.showModal();
      $('#teachDlgName').focus();
    });
    dlg.addEventListener('close', () => {
      if (dlg.returnValue !== 'save' || !pendingSegment) return;
      const seg = pendingSegment;
      pendingSegment = null;
      const name = $('#teachDlgName').value.trim();
      if (!name) return;
      const relabel = $('#teachDlgRelabel').checked;
      const ok = teachRange({ name, personId: seg.personId, from: seg.start, to: seg.end, addSegment: false });
      if (ok && relabel) {
        const { id, ...rest } = seg;
        store.removeSegment(id);
        store.addSegments([{ ...rest, behavior: ok.key, confidence: 1 }]);
      }
    });
  }

  $('#discoverBtn')?.addEventListener('click', runDiscovery);
  $('#discoverList')?.addEventListener('click', onDiscoverClick);

  store.on('learner', render);
  store.on('results', refreshPersons);
  render(summary());
  refreshPersons();
}

function teachRange({ name, personId, from, to, addSegment }) {
  try {
    const { key, n } = teachFromFrames(name, { personId, from, to });
    toast(`Đã thêm ${n} mẫu cho “${behaviorInfo(key).label}”.`, 'ok');
    if (addSegment && personId != null) {
      store.addSegments([{ personId, behavior: key, start: from, end: to, confidence: 1, source: 'video' }]);
    }
    runTraining('auto');
    return { key, n };
  } catch (err) {
    toast(err.message, 'warn', 6000);
    return null;
  }
}

async function runTraining(algo) {
  if (training) return;
  training = true;
  const wrap = $('#trainProgressWrap');
  const fill = $('#trainProgressFill');
  const text = $('#trainProgressText');
  if (wrap) wrap.hidden = false;
  if (fill) fill.style.width = '0%';
  if (text) text.textContent = 'Chuẩn bị dữ liệu…';
  if ($('#trainBtn')) $('#trainBtn').disabled = true;
  try {
    const m = await train({
      algo,
      onProgress: (p) => {
        const ratio = p.epochs ? p.epoch / p.epochs : 0;
        if (fill) fill.style.width = `${Math.round(ratio * 100)}%`;
        if (text) text.textContent = p.text || `Vòng ${p.epoch}/${p.epochs} · loss ${p.loss?.toFixed(3) ?? '–'} · đúng ${pct(p.acc)} · kiểm định ${pct(p.valAcc)}${p.stopped ? ' · dừng sớm' : ''}`;
      },
    });
    if (fill) fill.style.width = '100%';
    if ($('#trainResult')) $('#trainResult').innerHTML = describeModel(m);
    toast('Huấn luyện xong.', 'ok');
  } catch (err) {
    if ($('#trainResult')) $('#trainResult').textContent = err.message;
    toast(err.message, 'warn', 5000);
  } finally {
    training = false;
    if ($('#trainBtn')) $('#trainBtn').disabled = false;
    setTimeout(() => { if (wrap) wrap.hidden = true; }, 1200);
  }
}

const pct = (v) => (v == null ? '–' : `${Math.round(v * 100)}%`);

function describeModel(m) {
  if (!m) return '<span class="muted">Chưa có mô hình.</span>';
  const names = m.keys.map((k) => escapeHtml(behaviorInfo(k).label)).join(', ');
  return `Mô hình <b>${m.type.toUpperCase()}</b> · ${m.keys.length} hành vi (${names}) · ${m.nTrain} mẫu huấn luyện`
    + (m.type === 'mlp' ? ` · đúng trên tập huấn luyện ${pct(m.trainAcc)} · kiểm định ${pct(m.valAcc)} (${m.nVal} mẫu)` : '')
    + ` · ${new Date(m.trainedAt).toLocaleString('vi-VN')}`;
}

function render(sum) {
  const list = $('#learnList');
  if (!list) return;
  if (!sum.classes.length) {
    list.innerHTML = '<li class="muted">Chưa có hành vi tự dạy nào. Bạn có thể dạy từ Camera (mục Học chuyển động), từ Video, hoặc dùng “Khám phá” bên dưới.</li>';
  } else {
    const trained = new Set(sum.model?.keys || []);
    list.innerHTML = sum.classes.map((c) => `
      <li data-key="${c.key}">
        <i class="swatch" style="background:${c.color}"></i>
        <span class="grow"><b>${escapeHtml(c.label)}</b>
          <small class="muted">${c.count} mẫu${trained.has(c.key) ? ' · đã huấn luyện' : c.count >= 3 ? ' · chưa huấn luyện' : ' · cần ≥ 3 mẫu'}</small></span>
        <button class="btn btn-ghost btn-sm" data-act="rename">Đổi tên</button>
        <button class="btn btn-ghost btn-sm" data-act="clear">Xoá mẫu</button>
        <button class="btn btn-ghost btn-sm danger" data-act="delete">Xoá</button>
      </li>`).join('');
  }
  if ($('#learnedNames')) $('#learnedNames').innerHTML = sum.classes.map((c) => `<option value="${escapeHtml(c.label)}"></option>`).join('');
  if ($('#trainResult')) $('#trainResult').innerHTML = (sum.dirty && sum.total ? '<span class="warn-text">Có mẫu mới chưa được huấn luyện. </span>' : '') + describeModel(sum.model);
}

function refreshPersons() {
  const el = $('#tvPerson');
  if (!el) return;
  const ids = [...new Set(store.frames.flatMap((f) => f.persons.map((p) => p.id)))].sort((a, b) => a - b);
  el.innerHTML = ids.length
    ? ids.map((id) => `<option value="${id}">${escapeHtml(personLabel(id, 'video'))}</option>`).join('')
    : '<option value="">(chưa có)</option>';
}

async function runDiscovery() {
  const status = $('#discoverStatus');
  const btn = $('#discoverBtn');
  if (!btn || !status) return;
  btn.disabled = true;
  status.textContent = 'Đang trích đặc trưng…';
  try {
    const res = await discover({
      k: Number($('#discoverK').value) || 0,
      onProgress: (p) => { status.textContent = `${p.text}…`; },
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
  const el = $('#discoverList');
  if (!el) return;
  el.innerHTML = clusters.map((c, i) => {
    const rule = c.rule.length
      ? c.rule.map((r) => `${escapeHtml(behaviorInfo(r.key).label)} ${Math.round(r.share * 100)}%`).join(', ')
      : 'không khớp luật nào';
    const novelty = c.learned ? 'đã học' : c.novelty > 0.5 ? 'cao' : c.novelty > 0.25 ? 'trung bình' : 'thấp';
    const runs = c.runs.map((r) => `<button class="chip" data-seek="${r.start}">#${r.personId} ${fmtTime(r.start, false)}–${fmtTime(r.end, false)}</button>`).join('')
      || '<span class="muted small">Không có đoạn liên tục đủ dài.</span>';
    return `<article class="cluster ${c.novelty > 0.5 && !c.learned ? 'is-new' : ''}" data-id="${c.id}">
      <header>
        <b>Cụm ${i + 1}</b>
        <span class="muted small">${c.size} mẫu (${Math.round(c.share * 100)}%) · độ mới: <b>${novelty}</b></span>
      </header>
      <p class="small">Luật có sẵn: ${rule}${c.learned ? ` · trùng hành vi đã học <b>${escapeHtml(behaviorInfo(c.learned.key).label)}</b> (${Math.round(c.learned.share * 100)}%)` : ''}</p>
      <div class="chips">${runs}</div>
      <div class="transport-row">
        <input type="text" list="learnedNames" placeholder="Đặt tên để học…" data-name />
        <button class="btn btn-primary btn-sm" data-learn>Học</button>
      </div>
    </article>`;
  }).join('');
}

async function onDiscoverClick(e) {
  const seek = e.target.closest('[data-seek]');
  if (seek) { seekTo(parseFloat(seek.dataset.seek), { play: true }); return; }
  const btn = e.target.closest('[data-learn]');
  if (!btn) return;
  const card = btn.closest('.cluster');
  const name = card.querySelector('[data-name]').value.trim();
  if (!name) { toast('Đặt tên cho cụm trước khi học.', 'warn'); return; }
  try {
    const { key, n } = learnCluster(Number(card.dataset.id), name);
    toast(`Đã thêm ${n} mẫu vào “${behaviorInfo(key).label}”.`, 'ok');
    card.classList.add('is-learned');
    btn.disabled = true;
    await runTraining('auto');
  } catch (err) {
    toast(err.message, 'warn');
  }
}

export { ensureClass };
