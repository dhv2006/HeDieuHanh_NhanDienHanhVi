// =========================================================
// json-io.js — Xuất / Nhập kết quả dạng JSON (và xuất CSV)
// =========================================================
import { store } from './store.js';
import { APP_NAME, APP_VERSION, BEHAVIORS, LEARNED_COLORS, behaviorInfo } from './config.js';
import { downloadText, readFileAsText, safeFileName, toast, round, clamp } from './utils.js';
import { getFiltered, describeFilters } from './results.js';

/** Tạo đối tượng JSON để xuất */
export function buildExport({ filtered = false } = {}) {
  const segs = filtered ? getFiltered() : [...store.segments].sort((a, b) => a.start - b.start);
  const s = store.settings;

  const byBehavior = {};
  segs.forEach((x) => {
    const b = (byBehavior[x.behavior] ||= { label: behaviorInfo(x.behavior).label, count: 0, seconds: 0 });
    b.count++;
    b.seconds = round(b.seconds + (x.end - x.start), 2);
  });

  const data = {
    app: APP_NAME,
    version: APP_VERSION,
    exportedAt: new Date().toISOString(),
    media: {
      name: store.media.name || store.meta.mediaName || null,
      duration: store.media.duration ? round(store.media.duration, 2) : null,
      width: store.media.width || null,
      height: store.media.height || null,
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
      filter: filtered ? describeFilters() || 'không lọc' : null,
    },
    behaviors: Object.fromEntries(Object.entries(BEHAVIORS).map(([k, v]) => [k, v.label])),
    summary: {
      segments: segs.length,
      persons: new Set(segs.map((x) => x.personId)).size,
      byBehavior,
    },
    segments: segs.map(({ personId, behavior, start, end, confidence, source, session }) => ({
      personId, behavior, start, end, confidence, source, ...(session ? { session } : {}),
    })),
  };

  if (!filtered && store.frames.length) {
    data.frames = s.exportKeypoints
      ? store.frames
      : store.frames.map((f) => ({ t: f.t, persons: f.persons.map(({ id, box, labels, f: face, fo }) => ({ id, box, labels, ...(face ? { f: face } : {}), ...(fo ? { fo } : {}) })) }));
  }
  // Tên người đã nhận ra (không kèm vector khuôn mặt — dữ liệu sinh trắc chỉ nằm trên máy)
  if (store.names && Object.keys(store.names).length) data.names = { ...store.names };
  return data;
}

export function exportJSON({ filtered = false } = {}) {
  if (!store.segments.length) {
    toast('Chưa có kết quả để xuất.', 'warn');
    return;
  }
  const data = buildExport({ filtered });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const name = `hanh-vi_${safeFileName(data.media.name)}_${stamp}${filtered ? '_loc' : ''}.json`;
  downloadText(name, JSON.stringify(data, null, 2));
  toast(`Đã xuất ${data.segments.length} đoạn ra ${name}`, 'ok');
}

export function exportCSV() {
  const segs = getFiltered();
  if (!segs.length) {
    toast('Không có dòng nào để xuất.', 'warn');
    return;
  }
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = ['start_s', 'end_s', 'duration_s', 'person', 'behavior', 'behavior_label', 'confidence', 'source'];
  const lines = segs.map((x) => [
    x.start, x.end, round(x.end - x.start, 2), x.personId, x.behavior,
    behaviorInfo(x.behavior).label, x.confidence, x.source,
  ].map(esc).join(','));
  const stamp = new Date().toISOString().slice(0, 10);
  // \uFEFF giúp Excel đọc đúng tiếng Việt (UTF-8)
  downloadText(`hanh-vi_${safeFileName(store.media.name)}_${stamp}.csv`, '\uFEFF' + [header.join(','), ...lines].join('\n'), 'text/csv');
  toast(`Đã xuất ${segs.length} dòng CSV.`, 'ok');
}

/** Nhập file JSON: kiểm tra, chuẩn hoá rồi nạp vào store */
export async function importJSONFile(file) {
  let data;
  try {
    data = JSON.parse(await readFileAsText(file));
  } catch (err) {
    toast(`“${file.name}” không phải JSON hợp lệ: ${err.message}`, 'error', 6000);
    return;
  }

  const rawSegs = Array.isArray(data) ? data : data?.segments;
  if (!Array.isArray(rawSegs)) {
    toast('File JSON thiếu mảng “segments”. Hãy dùng file được xuất từ ứng dụng này.', 'error', 6000);
    return;
  }

  // Hành vi chưa có trên máy này (vd. hành vi người khác đã dạy) → đăng ký tên để hiển thị đúng
  if (data.behaviors && typeof data.behaviors === 'object') {
    let i = 0;
    for (const [key, label] of Object.entries(data.behaviors)) {
      if (!BEHAVIORS[key] && typeof label === 'string') {
        BEHAVIORS[key] = { label, color: LEARNED_COLORS[i++ % LEARNED_COLORS.length], group: 'learned' };
      }
    }
  }

  if (data.names && typeof data.names === 'object') {
    store.names = { ...(store.names || {}), ...data.names };
    store.emit('names', store.names);
  }

  let skipped = 0;
  const segments = [];
  for (const r of rawSegs) {
    const seg = normalizeSegment(r);
    if (seg) segments.push(seg); else skipped++;
  }
  if (!segments.length) {
    toast('Không có đoạn hợp lệ nào trong file.', 'error');
    return;
  }

  const frames = Array.isArray(data.frames)
    ? data.frames
        .filter((f) => Number.isFinite(f?.t) && Array.isArray(f.persons))
        .sort((a, b) => a.t - b.t)
    : [];

  let replace = true;
  if (store.segments.length) {
    replace = window.confirm(
      `Đang có ${store.segments.length} đoạn kết quả.\n\nOK: thay thế bằng dữ liệu trong file.\nHuỷ: gộp thêm vào kết quả hiện tại.`,
    );
  }

  const mediaName = data.media?.name || null;
  store.setResults({
    segments: replace ? segments : [...store.segments, ...segments],
    frames: replace ? frames : (frames.length ? frames : store.frames),
    meta: {
      ...(data.analysis || {}),
      mediaName,
      importedAt: new Date().toISOString(),
      sampleInterval: data.analysis?.sampleInterval || store.settings.sampleInterval,
    },
  });
  if (!store.media.duration && data.media?.duration) store.media = { ...store.media, duration: data.media.duration };
  store.emit('media', store.media);

  toast(`Đã nhập ${segments.length} đoạn${skipped ? ` (bỏ qua ${skipped} dòng lỗi)` : ''}.`, 'ok');
  if (mediaName && store.media.name && store.media.name !== mediaName) {
    toast(`Lưu ý: kết quả thuộc video “${mediaName}”, khác video đang mở.`, 'warn', 6000);
  } else if (mediaName && !store.media.name) {
    toast(`Mở video “${mediaName}” để xem lại và tua theo kết quả.`, 'info', 6000);
  }
}

function normalizeSegment(r) {
  if (!r || typeof r !== 'object') return null;
  const start = Number(r.start);
  const end = Number(r.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || start < 0) return null;
  const behavior = String(r.behavior || '').trim();
  if (!behavior) return null;
  const pid = Number(r.personId);
  const conf = Number(r.confidence);
  return {
    personId: Number.isFinite(pid) ? pid : String(r.personId ?? '?'),
    behavior,
    start: round(start, 2),
    end: round(end, 2),
    confidence: Number.isFinite(conf) ? clamp(conf > 1 ? conf / 100 : conf, 0, 1) : 1,
    source: r.source === 'camera' ? 'camera' : 'video',
    ...(r.session ? { session: String(r.session) } : {}),
  };
}
