// =========================================================
// upload.js — Nhập video (Link YouTube, TikTok, FB, MP4... / File tải sẵn / File .ZIP),
// quản lý danh sách video & link (cho phép Mở lại / Xóa),
// phân tích AI độ chính xác mili-giây (hiển thị nhãn tức thì lên bảng),
// đóng gói chuỗi động tác & mở Popup duyệt tên nháp do AI đề xuất.
// =========================================================
import { store } from './store.js';
import { $, toast, fmtTime, fmtTimeMs, round, escapeHtml, uid } from './utils.js';
import { inference } from './inference.js';
import { BehaviorEngine, SegmentBuilder, buildActionStepsAndDraftName } from './behavior.js';
import { drawOverlay, syncCanvas } from './overlay.js';
import { getVideo, clearVideoStage } from './player.js';
import { runtime, modelConfig, logPerf, live } from './perf.js';
import { selfTrain } from './learner.js';
import { TaskScheduler } from './task-scheduler.js';
import {
  packageStore, importPackageZip, exportPackageZip, promptApprovePackagePopup, applyPackageToWorkspace,
} from './packages.js';
import {
  parseVideoUrl, isPlatformVideoUrl, resolvePlatformVideo, preparePlatformVideo,
  attachVideoSource, waitForMedia, seekVideoFrame, seekVideoWithRecovery, videoErrorMessage,
} from './video-source.js';

const VIDEO_EXT = /\.(mp4|m4v|webm|mov|mkv|ogv|ogg)$/i;
const ZIP_EXT = /\.zip$/i;
let currentUrl = null;
let cancelRequested = false;
let opening = false;
let openingController = null;
let analysisController = null;

// Lưu tạm File cục bộ trong phiên để bấm "Mở" từ danh sách video tải lên hoạt động tức thì
const sessionFiles = new Map();

export function initUpload() {
  const input = $('#videoInput');
  const dz = $('#dropzone');

  input?.addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    input.value = '';
    if (!f) return;
    await handleIncomingFile(f);
  });

  if (dz) {
    ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('is-over'); }));
    dz.addEventListener('drop', async (e) => {
      const files = [...(e.dataTransfer?.files || [])];
      if (!files.length) return;
      for (const f of files) {
        await handleIncomingFile(f);
      }
    });
  }

  $('#analyzeBtn')?.addEventListener('click', analyzeVideo);
  $('#cancelBtn')?.addEventListener('click', () => { cancelRequested = true; analysisController?.abort(); });
  $('#videoUrlForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    openVideoUrl($('#videoUrlInput').value);
  });
  $('#videoUrlCancelBtn')?.addEventListener('click', () => openingController?.abort());

  // Nút tải gói dữ liệu hiện hành về máy (.ZIP) ngay ở khu vực Video
  $('#downloadCurrentPkgZipBtn')?.addEventListener('click', async () => {
    const latest = packageStore.packages[0];
    if (latest) {
      await exportPackageZip(latest);
    } else if (store.segments.length) {
      const draft = buildActionStepsAndDraftName(store.segments, store.frames, store.media.name || 'video');
      const pkg = await promptApprovePackagePopup({
        ...draft,
        mediaName: store.media.name || 'video',
        duration: store.media.duration || 0,
        segments: store.segments,
        frames: store.frames,
      });
      if (pkg) await exportPackageZip(pkg);
    } else {
      toast('Chưa có gói dữ liệu phân tích nào. Hãy phân tích video hoặc tải lên file .ZIP.', 'warn');
    }
  });

  // Sự kiện danh sách video đã tải lên & link đã nhập
  $('#videoSourceList')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = btn.dataset.id;
    const item = packageStore.videoSources.find((v) => v.id === id);
    if (!item) return;

    if (btn.dataset.act === 'delete-source') {
      const isCurrent = store.media.name && (store.media.name === item.name || store.media.pageUrl === item.url);
      await packageStore.removeVideoSource(id);
      sessionFiles.delete(id);
      if (isCurrent) {
        clearVideoStage();
        store.clearSource('video');
      }
      toast(`Đã xóa “${item.name}” khỏi danh sách video.`, 'info');
      renderVideoSourceList();
    } else if (btn.dataset.act === 'open-source') {
      if (item.type === 'url' && item.url) {
        $('#videoUrlInput').value = item.url;
        await openVideoUrl(item.url);
      } else if (sessionFiles.has(id)) {
        await openVideo(sessionFiles.get(id), id);
      } else if (item.packageId) {
        const pkg = packageStore.getPackage(item.packageId);
        if (pkg) {
          applyPackageToWorkspace(pkg);
          toast(`Đã nạp dữ liệu phân tích của gói “${pkg.name}”.`, 'ok');
        }
      } else {
        toast('File video cục bộ này thuộc phiên trước — hãy chọn lại file từ máy của bạn.', 'warn');
      }
    }
  });

  store.on('video-sources', renderVideoSourceList);
  renderVideoSourceList();
}

async function handleIncomingFile(file) {
  if (ZIP_EXT.test(file.name) || file.type === 'application/zip' || file.type === 'application/x-zip-compressed') {
    try {
      const pkg = await importPackageZip(file);
      applyPackageToWorkspace(pkg);
      await packageStore.addVideoSource({
        id: 'src_' + uid(),
        name: `[Gói ZIP] ${pkg.name}`,
        type: 'zip',
        size: file.size,
        packageId: pkg.id,
        addedAt: new Date().toISOString(),
      });
      toast(`Đã nhập gói dữ liệu .ZIP “${pkg.name}” (${pkg.segments?.length || 0} nhãn hành vi, ${pkg.steps?.length || 0} bước).`, 'ok', 6000);
    } catch (err) {
      toast(`Lỗi đọc file .ZIP: ${err.message}`, 'error', 6000);
    }
    return;
  }
  if (/\.json$/i.test(file.name)) {
    store.emit('import-json-file', file);
    return;
  }
  if (file.type.startsWith('video/') || VIDEO_EXT.test(file.name)) {
    await openVideo(file);
    return;
  }
  toast('Hãy chọn file Video (MP4, WebM, MOV, MKV) hoặc gói cơ sở dữ liệu .ZIP / .JSON.', 'warn');
}

export async function openVideo(file, existingId = null) {
  if (store.analyzing) { toast('Đang phân tích — hãy dừng trước khi mở video khác.', 'warn'); return; }
  if (!file.type.startsWith('video/') && !VIDEO_EXT.test(file.name)) {
    toast(`“${file.name}” không phải file video.`, 'error');
    return;
  }
  if (opening) return;
  const sourceId = existingId || ('src_' + uid());
  sessionFiles.set(sourceId, file);
  const url = URL.createObjectURL(file);
  await openSource({ id: sourceId, name: file.name, size: file.size, src: url, blob: true, sourceType: 'file' });
}

export async function openVideoUrl(value) {
  if (opening || store.analyzing) { toast('Hãy dừng phân tích trước khi mở nguồn khác.', 'warn'); return; }
  try {
    const url = parseVideoUrl(value);
    const platform = isPlatformVideoUrl(url);
    await openSource({
      id: 'src_' + uid(),
      name: decodeURIComponent(url.pathname.split('/').pop() || url.hostname || 'video-url'),
      size: 0,
      src: url.href,
      originalUrl: url.href,
      remote: true,
      platform,
      sourceType: 'url',
    });
  } catch (err) {
    toast(err.message, 'error', 7000);
  }
}

async function openSource(source) {
  const video = getVideo();
  const oldSrc = video.currentSrc;
  const oldRemote = video.crossOrigin;
  const platformUrl = source.platform ? new URL(source.src) : null;
  opening = true;
  openingController = new AbortController();
  const signal = openingController.signal;
  const timeout = setTimeout(() => openingController?.abort(new Error('Mở video quá lâu. Hãy thử lại hoặc tải file lên.')), 90000);
  if ($('#analyzeBtn')) $('#analyzeBtn').disabled = true;
  if ($('#videoUrlBtn')) $('#videoUrlBtn').disabled = true;
  if ($('#videoUrlInput')) $('#videoUrlInput').disabled = true;
  if ($('#videoUrlMode')) $('#videoUrlMode').disabled = true;
  if ($('#videoUrlCancelBtn')) $('#videoUrlCancelBtn').hidden = false;
  if ($('#videoUrlStatus')) $('#videoUrlStatus').textContent = source.platform ? 'Đang lấy video từ liên kết (YouTube/TikTok/FB)…' : 'Đang mở video…';
  try {
    if (source.platform) {
      const resolved = await resolvePlatformVideo(platformUrl, signal);
      source = { ...source, ...resolved, remote: false };
      if ($('#videoUrlStatus')) $('#videoUrlStatus').textContent = 'Đang mở “' + source.name + '”…';
    }
    try {
      await attachVideoSource(video, source.src, source.remote, signal);
    } catch (err) {
      if (signal.aborted) throw err;
      if (platformUrl) {
        if ($('#videoUrlStatus')) $('#videoUrlStatus').textContent = 'Nguồn video chưa đọc được, đang thử lại…';
        const resolved = await resolvePlatformVideo(platformUrl, signal);
        source = { ...source, ...resolved };
        try { await attachVideoSource(video, source.src, false, signal); }
        catch (retryError) {
          if (signal.aborted) throw retryError;
          throw new Error('Nền tảng chưa cho đọc nguồn video hoặc định dạng không tương thích. Thử lại sau hoặc tải file MP4 lên.');
        }
      } else {
        if (!source.remote) throw err;
        const pingController = new AbortController();
        const cancelPing = () => pingController.abort();
        signal.addEventListener('abort', cancelPing, { once: true });
        const pingTimer = setTimeout(cancelPing, 3000);
        const ping = await fetch('video-proxy?ping=1', { signal: pingController.signal }).then((r) => r.json()).catch(() => null);
        clearTimeout(pingTimer);
        signal.removeEventListener('abort', cancelPing);
        signal.throwIfAborted();
        if (!ping?.videoProxy) throw new Error('Máy chủ video chặn CORS hoặc URL không đọc được. Chạy bằng server.py để dùng proxy URL, hoặc tải file lên.');
        await attachVideoSource(video, 'video-proxy?url=' + encodeURIComponent(source.src), false, signal);
      }
    }
    await commitSource({ ...source, pageUrl: platformUrl?.href || source.originalUrl || null });
    if ($('#videoUrlStatus')) {
      $('#videoUrlStatus').textContent = source.videoOnly
        ? 'Đã mở video. Bấm “Phân tích” trên thanh điều khiển để AI trích xuất khung xương & tạo nhãn mili-giây.'
        : 'Đã mở video thành công. Bấm nút “Phân tích” để bắt đầu.';
    }
  } catch (err) {
    if (source.blob) URL.revokeObjectURL(source.src);
    if (oldSrc) { video.crossOrigin = oldRemote; video.src = oldSrc; video.load(); }
    else { video.removeAttribute('src'); video.load(); }
    const message = err.name === 'AbortError' ? 'Đã hủy mở video.' : videoErrorMessage(err);
    if ($('#videoUrlStatus')) $('#videoUrlStatus').textContent = message;
    toast(message, err.name === 'AbortError' ? 'info' : 'error', 7000);
  } finally {
    clearTimeout(timeout);
    openingController = null;
    opening = false;
    if ($('#videoUrlBtn')) $('#videoUrlBtn').disabled = false;
    if ($('#videoUrlInput')) $('#videoUrlInput').disabled = false;
    if ($('#videoUrlMode')) $('#videoUrlMode').disabled = false;
    if ($('#videoUrlCancelBtn')) $('#videoUrlCancelBtn').hidden = true;
    if ($('#analyzeBtn')) $('#analyzeBtn').disabled = !store.media.name;
  }
}

async function commitSource(source) {
  const prevName = store.media.name;
  const hasVideoResults = store.segments.some((s) => s.source === 'video');
  const importedFor = store.meta.mediaName;

  if (currentUrl && currentUrl !== source.src) URL.revokeObjectURL(currentUrl);
  currentUrl = source.blob ? source.src : null;
  const video = getVideo();
  store.media = {
    id: source.id,
    name: source.name,
    size: source.size,
    duration: video.duration,
    width: video.videoWidth,
    height: video.videoHeight,
    pageUrl: source.pageUrl,
  };

  if ($('#videoStage')) $('#videoStage').hidden = false;
  if ($('#dropEmpty')) $('#dropEmpty').hidden = true;
  $('#dropzone')?.classList.add('has-video');
  if ($('#analyzeBtn')) $('#analyzeBtn').disabled = false;

  // Lưu vào danh sách video đã tải lên / link đã nhập
  const existing = packageStore.videoSources.find((v) =>
    (source.pageUrl && v.url === source.pageUrl) || (!source.pageUrl && v.name === source.name && v.type === 'file'));
  if (!existing) {
    await packageStore.addVideoSource({
      id: source.id || ('src_' + uid()),
      name: source.name,
      type: source.sourceType || (source.pageUrl ? 'url' : 'file'),
      url: source.pageUrl || null,
      size: source.size || 0,
      duration: round(video.duration || 0, 2),
      addedAt: new Date().toISOString(),
    });
  } else if (source.blob && sessionFiles.has(source.id)) {
    sessionFiles.set(existing.id, sessionFiles.get(source.id));
  }

  const belongs = importedFor === source.name || prevName === source.name;
  if (hasVideoResults && !belongs) {
    store.clearSource('video');
    toast('Đã mở video mới — sẵn sàng phân tích.', 'info');
  } else {
    toast(`Đã mở “${source.name}”.`, 'ok');
  }
  store.emit('media', store.media);
}

/** Hiển thị danh sách video tải lên & link video đã nhập kèm nút Xóa */
export function renderVideoSourceList() {
  const listEl = $('#videoSourceList');
  if (!listEl) return;
  const items = packageStore.videoSources;
  const countEl = $('#videoSourceCount');
  if (countEl) countEl.textContent = `${items.length} mục`;

  if (!items.length) {
    listEl.innerHTML = `<p class="muted small empty-note">Chưa có video tải lên hoặc link nào được lưu. Khi bạn tải video MP4/WebM, gói .ZIP hoặc nhập link YouTube/TikTok/FB, danh sách sẽ hiện tại đây để mở lại hoặc xóa.</p>`;
    return;
  }

  listEl.innerHTML = items.map((item) => {
    const badge = item.type === 'url'
      ? '<span class="src-badge src-url">Link Video</span>'
      : item.type === 'zip'
        ? '<span class="src-badge src-zip">Gói .ZIP</span>'
        : '<span class="src-badge src-file">Video Tải Lên</span>';
    const metaParts = [];
    if (item.duration) metaParts.push(`Thời lượng: ${fmtTimeMs(item.duration)}`);
    if (item.size) metaParts.push(`${(item.size / 1048576).toFixed(1)} MB`);
    if (item.url) metaParts.push(escapeHtml(item.url.slice(0, 68)) + (item.url.length > 68 ? '…' : ''));
    return `<div class="source-item" data-id="${escapeHtml(item.id)}">
      <div class="source-info">
        ${badge}
        <strong class="source-title">${escapeHtml(item.name)}</strong>
        <span class="muted small">${metaParts.join(' · ')}</span>
      </div>
      <div class="source-actions">
        <button type="button" class="btn btn-ghost btn-sm" data-act="open-source" data-id="${escapeHtml(item.id)}">Mở</button>
        <button type="button" class="btn btn-ghost btn-sm danger-text" data-act="delete-source" data-id="${escapeHtml(item.id)}" title="Xóa khỏi danh sách">✕ Xóa</button>
      </div>
    </div>`;
  }).join('');
}

export async function analyzeVideo() {
  const video = getVideo();
  if (opening) return;
  if (!video.currentSrc) { toast('Hãy tải video lên hoặc dán link video trước.', 'warn'); return; }
  if (store.analyzing || live.source === 'camera') { toast('Hãy tắt camera trước khi phân tích video.', 'warn'); return; }
  if (video.readyState < 1) {
    try { await waitForMedia(video, 'loadedmetadata'); }
    catch (err) { toast(err.message, 'error'); return; }
  }
  const duration = video.duration;
  if (!Number.isFinite(duration) || duration <= 0) {
    toast('Không xác định được thời lượng video. Hãy thử chuyển video sang MP4.', 'error');
    return;
  }

  store.analyzing = true;
  cancelRequested = false;
  analysisController = new AbortController();
  const signal = analysisController.signal;
  video.pause();
  const urlMode = $('#videoUrlMode')?.value || 'stream';
  let recoveries = 0;
  setBusy(true, 'Đang chuẩn bị video…');
  try {
    if (urlMode === 'cache') {
      const prepared = await preparePlatformVideo(video.currentSrc, signal, (received, total) => {
        const mb = (v) => (v / 1048576).toFixed(1);
        setProgress(0, `Đang tải đủ video trên máy chủ: ${mb(received)}${total ? ' / ' + mb(total) : ''} MB…`);
      });
      if (prepared) await attachVideoSource(video, prepared, false, signal);
    } else {
      const src = new URL(video.currentSrc);
      if (src.origin === location.origin && src.pathname === '/video-media' && src.searchParams.has('cached')) {
        src.searchParams.delete('cached');
        await attachVideoSource(video, src.href, false, signal);
      }
    }
    signal.throwIfAborted();
    setProgress(0, 'Đang khởi tạo mô hình AI Khung xương (Thân + Đầu + Bàn tay)…');
    await inference.init(modelConfig());
    signal.throwIfAborted();
  } catch (err) {
    if (cancelRequested) toast('Đã dừng chuẩn bị phân tích.', 'info');
    else {
      console.error(err);
      const message = videoErrorMessage(err);
      if ($('#videoUrlStatus')) $('#videoUrlStatus').textContent = message;
      toast(message, 'error', 7000);
    }
    setBusy(false);
    store.analyzing = false;
    analysisController = null;
    return;
  }

  const rt = runtime();
  const step = Number(store.settings.sampleInterval) || 0.1; // Mặc định 100ms (0.1s)
  const minScore = store.settings.minPoseScore ?? 0.25;
  const modelType = store.settings.modelType;
  const engine = new BehaviorEngine();
  const st = store.settings;
  const scheduler = new TaskScheduler();
  const builder = new SegmentBuilder('video', step);
  const frames = [];
  const canvas = $('#videoOverlay');
  const total = Math.floor(duration / step) + 1;
  const started = performance.now();
  let falls = 0;
  let lastObjects = [];
  let lastLog = 0;
  let lastLiveEmit = 0;

  inference.resetTracker();
  inference.resetStats();
  video.pause();
  store.analyzing = true;
  syncCanvas(canvas, video, rt.canvasMax);

  // Xử lý kết quả của 1 mẫu & cập nhật bảng tức thì theo thời gian thực
  const handle = (job, res) => {
    if (job.withObjects) lastObjects = res.objects;
    const persons = engine.analyze(res.poses, lastObjects, job.t);
    builder.push(job.t, persons);
    falls += persons.filter((p) => p.newFall).length;
    frames.push(compactFrame(job.t, persons));

    if (job.preview) {
      drawOverlay(canvas, persons, lastObjects, minScore, job.preview);
      job.preview.close?.();
    }

    const done = job.i + 1;
    const now = performance.now();
    const elapsed = (now - started) / 1000;
    const eta = (elapsed / done) * (total - done);
    live.inferFps = done / Math.max(0.05, elapsed);
    live.renderFps = Math.max(14, live.inferFps * 1.35);

    // Cập nhật tức thì (real-time) các nhãn do AI tạo sinh lên 2 bảng phía dưới
    if (now - lastLiveEmit >= 160 || done === total) {
      lastLiveEmit = now;
      const liveSegs = builder.snapshotLive(job.t);
      store.segments = [...store.segments.filter((s) => s.source !== 'video'), ...liveSegs];
      store.emit('live-segments', store.segments);
    }

    setProgress(
      done / total,
      `${Math.round((done / total) * 100)}% · ${fmtTimeMs(job.t)} / ${fmtTimeMs(duration)} · ${(done / Math.max(0.05, elapsed)).toFixed(1)} mẫu/s · còn ~${Math.ceil(eta)}s`
    );
    if (elapsed - lastLog >= 1) { lastLog = elapsed; logPerf('video', inference.stats); }
  };

  let inflight = null;
  let failed = false;
  let failure = null;
  let stage = 'video';
  let attemptedTime = 0;
  const recover = async () => {
    if (urlMode !== 'stream' || recoveries >= 3 || video.currentSrc.startsWith('blob:')) return false;
    recoveries++;
    setProgress(frames.length / total, `Kết nối video gián đoạn ở ${fmtTimeMs(attemptedTime)}. Đang nối lại (${recoveries}/3)…`);
    const retry = new AbortController();
    const abort = () => retry.abort(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => retry.abort(new Error('Nối lại video quá lâu.')), 30000);
    try {
      let src = video.currentSrc;
      if (store.media.pageUrl) src = (await resolvePlatformVideo(new URL(store.media.pageUrl), retry.signal)).src;
      else {
        const url = new URL(src);
        if (url.origin === location.origin && ['/video-media', '/video-proxy'].includes(url.pathname)) {
          url.searchParams.set('retry', String(Date.now()));
          src = url.href;
        }
      }
      await attachVideoSource(video, src, video.crossOrigin === 'anonymous', retry.signal);
      return true;
    } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
  };

  try {
    for (let i = 0; i < total && !cancelRequested; i++) {
      const t = Math.min(i * step, Math.max(0, duration - 0.005));
      attemptedTime = t;
      stage = 'video';
      await seekVideoWithRecovery(video, t, signal, recover);
      stage = 'analysis';
      const tasks = scheduler.plan(t, rt, st);
      const grabbed = await inference.grab(video, rt.inputWidth);
      const job = {
        i,
        t,
        withObjects: tasks.withObjects,
        preview: i % rt.previewEvery === 0
          ? await createImageBitmap(video, { resizeWidth: canvas.width, resizeHeight: canvas.height }).catch(() => null)
          : null,
      };
      if (inflight) {
        const previous = inflight;
        inflight = null;
        try { handle(previous.job, await resultOf(previous.promise)); }
        catch (err) { grabbed.bitmap.close?.(); job.preview?.close(); previous.job.preview?.close(); throw err; }
      }
      inflight = {
        job,
        promise: inference.detectGrabbed(grabbed, {
          timestampMs: Math.round(t * 1000),
          withObjects: job.withObjects,
          maxPoses: rt.maxPoses,
          withFaces: false,
          faceRes: false,
        }).then((value) => ({ value }), (error) => ({ error })),
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
      failure = { stage, atSeconds: round(attemptedTime, 3), message: err.message, mediaCode: video.error?.code || null };
      console.error(err);
      const message = `Dừng ở ${fmtTimeMs(attemptedTime)}: ${err.message}`;
      if ($('#videoUrlStatus')) $('#videoUrlStatus').textContent = message;
      toast(message, 'error', 10000);
    }
  } finally {
    if (inflight) {
      const previous = inflight;
      inflight = null;
      try { handle(previous.job, await resultOf(previous.promise)); }
      catch (err) {
        if (!cancelRequested && !failed) {
          failed = true;
          failure = { stage: 'analysis', atSeconds: previous.job.t, message: err.message, mediaCode: null };
        }
      } finally { previous.job.preview?.close(); }
    }
    analysisController = null;
  }

  const segments = builder.finalize().map((s) => {
    const end = Math.min(s.end, round(duration, 3));
    const endMs = Math.round(end * 1000);
    return { ...s, end, endMs, durationMs: Math.max(10, endMs - (s.startMs || Math.round(s.start * 1000))) };
  });
  store.analyzing = false;
  store.setResults({
    segments: [...store.segments.filter((s) => s.source !== 'video'), ...segments],
    frames,
    meta: {
      analyzedAt: new Date().toISOString(),
      source: 'video',
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
      streamRecoveries: recoveries,
    },
  });
  setBusy(false);
  await seekVideoFrame(video, 0).catch(() => {});

  const secs = (performance.now() - started) / 1000;
  const speed = duration / Math.max(0.1, secs);
  if (cancelRequested || failed) {
    toast(`Kết quả chưa đầy đủ. Giữ lại ${segments.length} nhãn hành vi đã phân tích.`, 'warn');
  } else {
    if ($('#videoUrlStatus')) {
      $('#videoUrlStatus').textContent = `Hoàn tất phân tích (${segments.length} nhãn mili-giây). Đang đóng gói & đề xuất tên nháp bằng AI…`;
    }
    toast(`Phân tích hoàn tất trong ${secs.toFixed(1)}s (tốc độ ${speed.toFixed(1)}×): ${segments.length} nhãn hành vi.`, 'ok', 5000);
  }
  if (falls) toast(`Phát hiện ${falls} lần té ngã — xem trên dòng thời gian.`, 'alert', 7000);

  if (!cancelRequested && !failed && store.settings.selfTrain) {
    selfTrain().catch(() => 0);
  }

  // Đóng gói tất cả nhãn & khung xương vào 1 nhãn chuỗi động tác cha, AI đặt tên nháp và mở Popup để người dùng duyệt/đổi tên
  if (segments.length > 0 && !cancelRequested) {
    const draft = buildActionStepsAndDraftName(segments, frames, store.media.name || 'video');
    await promptApprovePackagePopup({
      ...draft,
      mediaName: store.media.name || 'video',
      sourceUrl: store.media.pageUrl || null,
      duration: round(duration, 3),
      segments,
      frames,
    });
  }
}

async function resultOf(promise) {
  const r = await promise;
  if (r.error) throw r.error;
  return r.value;
}

const r1 = (v) => Math.round(v * 10) / 10;

function compactFrame(t, persons) {
  return {
    t: round(t, 3),
    tMs: Math.round(t * 1000),
    persons: persons.map((p) => {
      const o = {
        id: p.personId,
        box: [r1(p.box.x), r1(p.box.y), r1(p.box.w), r1(p.box.h)],
        labels: p.labels.map((l) => l.behavior),
      };
      if (p.keypoints) o.kp = p.keypoints.map((k) => [r1(k.x), r1(k.y), round(k.score, 2)]);
      return o;
    }),
  };
}

function setBusy(busy, text = '') {
  if ($('#analyzeBtn')) $('#analyzeBtn').hidden = busy;
  if ($('#cancelBtn')) $('#cancelBtn').hidden = !busy;
  if ($('#progressWrap')) $('#progressWrap').hidden = !busy;
  if ($('#scrubber')) $('#scrubber').disabled = busy;
  if ($('#videoUrlMode')) $('#videoUrlMode').disabled = busy;
  if (busy) setProgress(0, text);
}

function setProgress(ratio, text) {
  if ($('#progressFill')) $('#progressFill').style.width = `${(ratio * 100).toFixed(1)}%`;
  if ($('#progressText')) $('#progressText').textContent = text;
}
