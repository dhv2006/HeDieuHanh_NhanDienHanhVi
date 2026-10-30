// =========================================================
// player.js — Trình phát video (chiếm 2/3 chiều dọc màn hình),
// bộ điều khiển Qua, Lại, Phát/Tạm dừng, Stop, Tốc độ, Phân tích,
// và vẽ lại khung xương (Thân + Đầu + 21 khớp Bàn tay) đồng bộ mili-giây.
// =========================================================
import { personLabel } from './face.js';
import { store } from './store.js';
import { $, fmtTime, fmtTimeMs, clamp, toast } from './utils.js';
import { BEHAVIORS, behaviorInfo, personColor } from './config.js';
import { drawOverlay, drawHudOnly, syncCanvas, clearOverlay } from './overlay.js';
import { interpolatePersons } from './smoothing.js';
import { runtime, live } from './perf.js';

const FRAME_STEP = 1 / 30;
const HAS_RVFC = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;

let video, canvas, scrubber, lanesEl, playBtn, curEl, durEl, overlayToggle;
let playheadEl = null;
let laneSegments = [];
let rafId = null;
let lastTimeEmit = 0;
let renderFrames = [];
let renderDirty = true;
let fpsCount = 0;
let fpsT0 = performance.now();

export function initPlayer() {
  video = $('#video');
  canvas = $('#videoOverlay');
  scrubber = $('#scrubber');
  lanesEl = $('#lanes');
  playBtn = $('#playBtn');
  curEl = $('#curTime');
  durEl = $('#durTime');
  overlayToggle = $('#overlayToggle');

  $('#transport')?.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    ({
      play: togglePlay,
      stop: stopVideo,
      back5: () => skip(-5),
      fwd5: () => skip(5),
      'frame-back': () => stepFrame(-1),
      'frame-fwd': () => stepFrame(1),
      'prev-event': () => jumpEvent(-1),
      'next-event': () => jumpEvent(1),
    })[act]?.();
  });

  video.addEventListener('loadedmetadata', onMetadata);
  video.addEventListener('play', () => {
    playBtn?.classList.add('is-playing');
    playBtn?.setAttribute('aria-label', 'Tạm dừng');
    uiLoop();
  });
  video.addEventListener('pause', () => {
    playBtn?.classList.remove('is-playing');
    playBtn?.setAttribute('aria-label', 'Phát');
    cancelAnimationFrame(rafId);
    tick();
    drawAt(video.currentTime);
  });
  video.addEventListener('seeked', () => { tick(); drawAt(video.currentTime); });
  video.addEventListener('ended', tick);

  if (HAS_RVFC) {
    const onFrame = (_now, meta) => {
      drawAt(meta.mediaTime);
      countFps();
      video.requestVideoFrameCallback(onFrame);
    };
    video.requestVideoFrameCallback(onFrame);
  }

  scrubber?.addEventListener('input', () => {
    if (!hasVideo()) return;
    video.currentTime = parseFloat(scrubber.value);
  });
  $('#rateSelect')?.addEventListener('change', (e) => {
    video.playbackRate = parseFloat(e.target.value);
    toast(`Tốc độ phát video: ${e.target.value}×`, 'info', 1800);
  });
  overlayToggle?.addEventListener('change', () => drawAt(video.currentTime));

  lanesEl?.addEventListener('click', (e) => {
    const seg = e.target.closest('.lane-seg');
    if (seg) { seekTo(parseFloat(seg.dataset.start)); return; }
    const track = e.target.closest('.lane-track');
    if (track && hasVideo()) {
      const r = track.getBoundingClientRect();
      seekTo(clamp((e.clientX - r.left) / r.width, 0, 1) * laneDuration());
    }
  });

  store.on('filtered', (list) => {
    laneSegments = list.filter((s) => s.source === 'video');
    renderLanes();
  });
  store.on('live-segments', (list) => {
    laneSegments = list.filter((s) => s.source === 'video');
    renderLanes();
  });
  store.on('results', () => { renderDirty = true; drawAt(video?.currentTime || 0); });
  store.on('settings', () => { renderDirty = true; });
}

function onMetadata() {
  const { videoWidth: w, videoHeight: h, duration } = video;
  store.media = { ...store.media, duration, width: w, height: h };
  fitStage($('#videoStage'), w, h);
  syncCanvas(canvas, video, runtime().canvasMax);
  if (scrubber) scrubber.max = duration || 0;
  if (durEl) durEl.textContent = fmtTimeMs(duration || 0);
  renderLanes();
  tick();
}

/** Khung hình video chiếm ~2/3 chiều dọc màn hình (66vh) theo đúng yêu cầu */
export function fitStage(stage, w, h) {
  if (!stage || !w || !h) return;
  stage.style.aspectRatio = `${w} / ${h}`;
  stage.style.width = `min(100%, calc(66vh * ${(w / h).toFixed(4)}))`;
}

export const hasVideo = () => !!video?.currentSrc && video.readyState >= 1;
export const getVideo = () => video;
export const getOverlayCanvas = () => canvas;
export const currentTime = () => (hasVideo() ? video.currentTime : 0);

export function togglePlay() {
  if (!hasVideo() || store.analyzing) return;
  video.paused ? video.play() : video.pause();
}

/** Nút STOP: dừng phát và đưa video về 00:00.000 */
export function stopVideo() {
  if (!hasVideo() || store.analyzing) return;
  video.pause();
  video.currentTime = 0;
  tick();
  drawAt(0);
}

export function clearVideoStage() {
  if (!video) return;
  video.pause();
  video.removeAttribute('src');
  video.load();
  clearOverlay(canvas);
  if ($('#videoStage')) $('#videoStage').hidden = true;
  if ($('#dropEmpty')) $('#dropEmpty').hidden = false;
  $('#dropzone')?.classList.remove('has-video');
  if ($('#analyzeBtn')) $('#analyzeBtn').disabled = true;
  if (curEl) curEl.textContent = '00:00.000';
  if (durEl) durEl.textContent = '00:00.000';
  store.media = { name: null, duration: 0, width: 0, height: 0, size: 0 };
}

export function seekTo(t, { play = false } = {}) {
  if (!hasVideo()) {
    toast('Chưa có video để tua. Hãy tải video lên hoặc chọn từ danh sách.', 'warn');
    return false;
  }
  if (store.analyzing) {
    toast('Đang phân tích — hãy đợi xong rồi tua.', 'warn');
    return false;
  }
  store.emit('switch-tab', 'video');
  video.currentTime = clamp(t, 0, video.duration || t);
  if (play) video.play();
  return true;
}

export function skip(delta) { if (hasVideo()) seekTo(video.currentTime + delta); }

export function stepFrame(dir) {
  if (!hasVideo()) return;
  video.pause();
  seekTo(video.currentTime + dir * FRAME_STEP);
}

export function jumpEvent(dir) {
  if (!hasVideo()) return;
  const starts = [...new Set(laneSegments.map((s) => s.start))].sort((a, b) => a - b);
  if (!starts.length) { toast('Chưa có sự kiện nào trên dòng thời gian.', 'warn'); return; }
  const cur = video.currentTime;
  const target = dir > 0 ? starts.find((s) => s > cur + 0.05) : [...starts].reverse().find((s) => s < cur - 0.15);
  if (target === undefined) toast(dir > 0 ? 'Đã tới sự kiện cuối cùng.' : 'Đã ở sự kiện đầu tiên.');
  else seekTo(target);
}

function uiLoop() {
  tick();
  if (!HAS_RVFC) { drawAt(video.currentTime); countFps(); }
  if (!video.paused && !video.ended) rafId = requestAnimationFrame(uiLoop);
}

function countFps() {
  fpsCount++;
  const now = performance.now();
  if (now - fpsT0 >= 1000) {
    if (!video.paused) { live.renderFps = (fpsCount * 1000) / (now - fpsT0); live.source = 'video'; }
    fpsCount = 0;
    fpsT0 = now;
  }
}

function tick() {
  if (!video) return;
  const t = video.currentTime || 0;
  if (curEl) curEl.textContent = fmtTimeMs(t);
  if (scrubber && document.activeElement !== scrubber) scrubber.value = t;
  if (playheadEl) playheadEl.style.left = `${(t / (laneDuration() || 1)) * 100}%`;
  const now = performance.now();
  if (now - lastTimeEmit > 100) {
    lastTimeEmit = now;
    store.emit('time', t);
  }
}

// ---------- Vẽ lại khung xương đồng bộ ----------
function buildRenderFrames() {
  renderDirty = false;
  const raw = store.frames;
  const conv = raw.map((f) => ({
    t: f.t,
    persons: f.persons.map((p) => ({
      personId: p.id,
      box: p.box ? { x: p.box[0], y: p.box[1], w: p.box[2], h: p.box[3] } : null,
      labels: (p.labels || []).map((b) => ({ behavior: b })),
      keypoints: p.kp ? p.kp.map(([x, y, score]) => ({ x, y, score })) : null,
    })),
  }));
  const half = Math.round((store.settings.smoothing || 0) * 2);
  if (half > 0) {
    const byId = new Map();
    conv.forEach((f, fi) => f.persons.forEach((p) => {
      if (!p.keypoints) return;
      if (!byId.has(p.personId)) byId.set(p.personId, []);
      byId.get(p.personId).push({ fi, p, orig: p.keypoints.map((k) => ({ ...k })) });
    }));
    byId.forEach((seq) => {
      for (let i = 0; i < seq.length; i++) {
        const lo = Math.max(0, i - half), hi = Math.min(seq.length - 1, i + half);
        seq[i].p.keypoints = seq[i].orig.map((k, j) => {
          let sx = 0, sy = 0, n = 0;
          for (let q = lo; q <= hi; q++) {
            if (Math.abs(conv[seq[q].fi].t - conv[seq[i].fi].t) > half * 0.6) continue;
            const kk = seq[q].orig[j];
            sx += kk.x; sy += kk.y; n++;
          }
          return { x: sx / n, y: sy / n, score: k.score };
        });
      }
    });
  }
  renderFrames = conv;
}

/** Hành vi & nhãn con AI đang diễn ra tại thời điểm t */
function hudAt(t) {
  const by = new Map();
  for (const sg of store.segments) {
    if (sg.source !== 'video' || t < sg.start || t > sg.end) continue;
    const arr = by.get(sg.personId) || [];
    const info = behaviorInfo(sg.behavior);
    arr.push(`${info.emoji ? `${info.emoji} ` : ''}${info.label}`);
    by.set(sg.personId, arr);
  }
  return [...by.entries()].sort((a, b) => a[0] - b[0]).slice(0, 6).map(([id, arr]) => ({
    color: personColor(id),
    text: `${personLabel(id, 'video')}: ${arr.slice(0, 4).join(' · ')}`,
  }));
}

function drawAt(t) {
  if (!video || store.analyzing || !hasVideo()) return;
  syncCanvas(canvas, video, runtime().canvasMax);
  const hud = hudAt(t);
  if (!store.frames.length) { drawHudOnly(canvas, hud); return; }
  if (renderDirty) buildRenderFrames();
  const frames = renderFrames;
  const step = store.meta.sampleInterval || store.settings.sampleInterval || 0.1;

  let lo = 0, hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid].t <= t) lo = mid; else hi = mid - 1;
  }
  const a = frames[lo]?.t <= t ? frames[lo] : null;
  const b = a ? frames[lo + 1] || null : frames[0];

  let persons;
  if (store.settings.interpolate) {
    persons = interpolatePersons(a, b, t, step * 2.0);
  } else {
    const near = !a ? b : !b ? a : (t - a.t <= b.t - t ? a : b);
    persons = near && Math.abs(near.t - t) <= step * 2.0 ? near.persons : [];
  }
  drawOverlay(canvas, persons, [], store.settings.minPoseScore ?? 0.25, null, {
    skeleton: overlayToggle ? overlayToggle.checked : true,
    hud,
  });
}

// ---------- Dòng thời gian hành vi ----------
function laneDuration() {
  return store.media.duration || Math.max(0, ...laneSegments.map((s) => s.end)) || 0;
}

export function renderLanes() {
  if (!lanesEl) return;
  lanesEl.innerHTML = '';
  playheadEl = null;
  const dur = laneDuration();
  if (!laneSegments.length || !dur) {
    lanesEl.innerHTML = `<p class="lanes-empty">${store.segments.some((s) => s.source === 'video')
      ? 'Không có đoạn nào khớp bộ lọc hiện tại.'
      : 'Chưa có kết quả. Tải video hoặc dán link (YouTube, TikTok, FB) rồi bấm “Phân tích”, hoặc tải lên gói .ZIP.'}</p>`;
    return;
  }
  const order = Object.keys(BEHAVIORS);
  const groupRank = (k) => ({ core: 0, body: 0, ai: 1, learned: 2 }[behaviorInfo(k).group] ?? 0);
  const keys = [...new Set(laneSegments.map((s) => s.behavior))]
    .sort((a, b) => groupRank(a) - groupRank(b) || (order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999));

  const frag = document.createDocumentFragment();
  const rows = [];
  let row = 1;
  keys.forEach((key, idx) => {
    if (groupRank(key) === 1 && (idx === 0 || groupRank(keys[idx - 1]) !== 1)) {
      const h = document.createElement('div');
      h.className = 'lane-group';
      h.style.gridRow = String(row);
      h.textContent = 'Nhãn con chi tiết do AI tạo sinh (Mili-giây)';
      frag.appendChild(h);
      row++;
    }
    rows.push(row++);
  });
  const totalRows = row - 1;
  keys.forEach((key, idx) => {
    const i = rows[idx] - 1;
    const info = behaviorInfo(key);
    const label = document.createElement('div');
    label.className = 'lane-label';
    label.style.gridArea = `${i + 1} / 1`;
    const tag = info.group === 'ai' ? ' <small class="ai-tag">AI</small>' : info.group === 'learned' ? ' <small class="muted">(học)</small>' : '';
    label.innerHTML = `<i style="background:${info.color}"></i>${info.label}${tag}`;
    const track = document.createElement('div');
    track.className = 'lane-track';
    track.style.gridArea = `${i + 1} / 2`;
    const segs = laneSegments.filter((s) => s.behavior === key);
    const people = [...new Set(segs.map((s) => s.personId))].sort((x, y) => x - y);
    const H = Math.max(22, people.length * 9 + 6);
    const rowH = (H - 6) / people.length;
    track.style.height = `${H}px`;
    segs.forEach((s) => {
      const btn = document.createElement('button');
      btn.className = 'lane-seg' + (info.alert ? ' is-alert' : '');
      btn.style.top = `${3 + people.indexOf(s.personId) * rowH}px`;
      btn.style.height = `${Math.max(3, rowH - 1)}px`;
      btn.style.left = `${(s.start / dur) * 100}%`;
      btn.style.width = `${Math.max(0.3, ((s.end - s.start) / dur) * 100)}%`;
      btn.style.background = info.color;
      btn.dataset.start = s.start;
      btn.title = `${personLabel(s.personId, s.source)} · ${info.label} · ${fmtTimeMs(s.start)}–${fmtTimeMs(s.end)} (${s.durationMs || Math.round((s.end - s.start) * 1000)}ms) · ${Math.round(s.confidence * 100)}%`;
      btn.setAttribute('aria-label', btn.title);
      track.appendChild(btn);
    });
    frag.append(label, track);
  });

  const ruler = document.createElement('div');
  ruler.className = 'lanes-ruler';
  ruler.style.gridArea = `${totalRows + 1} / 2`;
  for (let i = 0; i <= 4; i++) {
    const s = document.createElement('span');
    s.textContent = fmtTimeMs((dur * i) / 4);
    ruler.appendChild(s);
  }
  frag.appendChild(ruler);

  const layer = document.createElement('div');
  layer.style.cssText = `grid-column:2;grid-row:1 / ${totalRows + 2};position:relative;pointer-events:none;`;
  playheadEl = document.createElement('div');
  playheadEl.className = 'playhead';
  layer.appendChild(playheadEl);
  frag.appendChild(layer);

  lanesEl.appendChild(frag);
  tick();
}
