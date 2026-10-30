// =========================================================
// results.js — Hai bảng phân tích chính:
//   1. Bảng Hành vi Gốc tinh gọn & Nhãn Con do Model AI Tạo Sinh Tức Thì
//   2. Bảng Thời gian Cụ thể (Giây & Mili-giây) của Từng Nhãn trong Video
// =========================================================
import { store } from './store.js';
import { personLabel, personName } from './face.js';
import { $, $$, fmtTime, fmtTimeMs, parseTime, escapeHtml, normalizeVi, debounce } from './utils.js';
import { CORE_BEHAVIORS, behaviorInfo, personColor } from './config.js';
import { seekTo } from './player.js';

const PAGE_SIZE = 60;

const state = {
  behaviors: new Set(),
  person: '',
  source: '',
  from: null,
  to: null,
  minConf: 0,
  search: '',
  sortKey: 'start',
  sortDir: 1,
  page: 1,
};

export function initResults() {
  $('#behaviorChips')?.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const key = chip.dataset.behavior;
    state.behaviors.has(key) ? state.behaviors.delete(key) : state.behaviors.add(key);
    apply(true);
  });

  // Bấm vào nút lọc trên Bảng 1 (Bảng Hành vi Gốc & Nhãn AI Tạo Sinh)
  $('#coreBehaviorTableBody')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-filter-behavior]');
    if (!btn) return;
    const key = btn.dataset.filterBehavior;
    state.behaviors.has(key) ? state.behaviors.delete(key) : state.behaviors.add(key);
    apply(true);
  });

  $('#fPerson')?.addEventListener('change', (e) => { state.person = e.target.value; apply(true); });
  $('#fSource')?.addEventListener('change', (e) => { state.source = e.target.value; apply(true); });
  $('#fConf')?.addEventListener('input', (e) => {
    state.minConf = Number(e.target.value);
    if ($('#fConfOut')) $('#fConfOut').textContent = `${state.minConf}%`;
    apply(true);
  });
  const timeInput = (el, key) => el?.addEventListener('input', debounce(() => {
    const v = parseTime(el.value);
    const invalid = el.value.trim() !== '' && v === null;
    el.setAttribute('aria-invalid', invalid);
    el.style.borderColor = invalid ? 'var(--danger)' : '';
    state[key] = invalid ? null : v;
    apply(true);
  }, 250));
  timeInput($('#fFrom'), 'from');
  timeInput($('#fTo'), 'to');
  $('#fSearch')?.addEventListener('input', debounce((e) => { state.search = e.target.value; apply(true); }, 200));
  $('#fReset')?.addEventListener('click', resetFilters);

  // Sắp xếp theo cột ở Bảng 2
  $('#resultTable thead')?.addEventListener('click', (e) => {
    const th = e.target.closest('th[data-sort]');
    if (!th) return;
    const key = th.dataset.sort;
    state.sortDir = state.sortKey === key ? -state.sortDir : 1;
    state.sortKey = key;
    apply();
  });

  // Bấm dòng ở Bảng 2 để tua video tới đúng mili-giây đó
  $('#resultBody')?.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const seg = store.segments.find((s) => s.id === tr.dataset.id);
    if (!seg) return;
    if (e.target.closest('.row-del')) {
      store.removeSegment(seg.id);
      return;
    }
    if (e.target.closest('.row-teach')) {
      store.emit('teach-segment', seg);
      return;
    }
    if (seg.source === 'camera') return;
    seekTo(seg.start);
  });
  $('#resultBody')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('tr[data-id]')) e.target.click();
  });

  $('#pager')?.addEventListener('click', (e) => {
    const p = e.target.closest('[data-page]')?.dataset.page;
    if (p) { state.page = Number(p); apply(); }
  });

  store.on('results', () => { refreshPersonOptions(); apply(); });
  store.on('live-segments', () => { apply(); });
  store.on('names', () => { refreshPersonOptions(); apply(); });
  store.on('time', highlightCurrent);
  refreshPersonOptions();
  apply();
}

// ---------- API cho các module khác ----------
export function getFiltered() {
  const q = normalizeVi(state.search);
  const list = store.segments.filter((s) => {
    if (state.behaviors.size && !state.behaviors.has(s.behavior)) return false;
    if (state.person !== '' && String(s.personId) !== state.person) return false;
    if (state.source && s.source !== state.source) return false;
    if (state.from != null && s.end < state.from) return false;
    if (state.to != null && s.start > state.to) return false;
    if (s.confidence * 100 < state.minConf) return false;
    if (q) {
      const info = behaviorInfo(s.behavior);
      const hay = normalizeVi(`${info.label} ${s.subLabel || ''} ${s.jointAngles || ''} ${s.behavior} nguoi ${s.personId} #${s.personId} ${s.source} ${personName(s.source, s.personId) || ''}`);
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const k = state.sortKey;
  const val = (s) => (k === 'duration' ? s.end - s.start : k === 'behavior' ? behaviorInfo(s.behavior).label : s[k]);
  return list.sort((a, b) => {
    const va = val(a), vb = val(b);
    const c = typeof va === 'string' ? va.localeCompare(vb, 'vi') : va - vb;
    return (c || a.start - b.start) * state.sortDir;
  });
}

export function setFilter({ behaviors, person, source, from, to, minConf, search } = {}) {
  if (behaviors) state.behaviors = new Set(behaviors);
  if (person !== undefined) state.person = person === null ? '' : String(person);
  if (source !== undefined) state.source = source || '';
  if (from !== undefined) state.from = from;
  if (to !== undefined) state.to = to;
  if (minConf !== undefined) state.minConf = minConf;
  if (search !== undefined) state.search = search;
  syncInputs();
  apply(true);
}

export function resetFilters() {
  Object.assign(state, { behaviors: new Set(), person: '', source: '', from: null, to: null, minConf: 0, search: '', page: 1 });
  syncInputs();
  apply();
}

export function describeFilters() {
  const parts = [];
  if (state.behaviors.size) parts.push([...state.behaviors].map((b) => behaviorInfo(b).label).join(', '));
  if (state.person !== '') parts.push(`người #${state.person}`);
  if (state.source) parts.push(state.source === 'video' ? 'nguồn video' : 'nguồn camera');
  if (state.from != null || state.to != null) parts.push(`${fmtTimeMs(state.from ?? 0)}–${state.to != null ? fmtTimeMs(state.to) : 'cuối'}`);
  if (state.minConf) parts.push(`tin cậy ≥ ${state.minConf}%`);
  if (state.search) parts.push(`“${state.search}”`);
  return parts.join('; ');
}

// ---------- Nội bộ ----------
function syncInputs() {
  if ($('#fPerson')) $('#fPerson').value = state.person;
  if ($('#fSource')) $('#fSource').value = state.source;
  if ($('#fFrom')) $('#fFrom').value = state.from != null ? fmtTime(state.from) : '';
  if ($('#fTo')) $('#fTo').value = state.to != null ? fmtTime(state.to) : '';
  if ($('#fConf')) $('#fConf').value = state.minConf;
  if ($('#fConfOut')) $('#fConfOut').textContent = `${state.minConf}%`;
  if ($('#fSearch')) $('#fSearch').value = state.search;
  $$('#fFrom, #fTo').forEach((el) => { el.style.borderColor = ''; el.removeAttribute('aria-invalid'); });
}

function refreshPersonOptions() {
  const sel = $('#fPerson');
  if (!sel) return;
  const persons = store.persons();
  sel.innerHTML = '<option value="">Tất cả</option>' + persons.map((p) => `<option value="${p}">${escapeHtml(personLabel(p))}</option>`).join('');
  if (persons.map(String).includes(state.person)) sel.value = state.person;
  else state.person = '';
}

function apply(resetPage = false) {
  if (resetPage) state.page = 1;
  const list = getFiltered();
  store.emit('filtered', list);
  renderChips();
  renderCoreAndAiBehaviorTable();
  renderSummary(list);
  renderTimelineTable(list);
}

const GROUPS = [
  { key: 'core', label: 'Hành vi gốc', test: (info) => info.group === 'core' || info.group === 'body' },
  { key: 'ai', label: 'Nhãn con AI tạo sinh tức thì', test: (info) => info.group === 'ai' },
  { key: 'learned', label: 'Đã học', test: (info) => info.group === 'learned' },
];

function renderChips() {
  const el = $('#behaviorChips');
  if (!el) return;
  const counts = {};
  store.segments.forEach((s) => { counts[s.behavior] = (counts[s.behavior] || 0) + 1; });
  // Chỉ giữ danh sách hành vi gốc tinh gọn + các nhãn AI thực tế đã phát sinh
  const keys = [...new Set([...Object.keys(CORE_BEHAVIORS), ...Object.keys(counts)])];
  const chip = (k) => {
    const info = behaviorInfo(k);
    return `<button class="chip" data-behavior="${escapeHtml(k)}" aria-pressed="${state.behaviors.has(k)}" style="--c:${info.color}">
      <i style="background:${info.color}"></i>${escapeHtml(info.label)} <small>${counts[k] || 0}</small></button>`;
  };
  el.innerHTML = GROUPS.map((g) => {
    const ks = keys.filter((k) => g.test(behaviorInfo(k)));
    return ks.length ? `<div class="chip-group"><span class="chip-group-label">${g.label}</span>${ks.map(chip).join('')}</div>` : '';
  }).join('');
}

/**
 * BẢNG 1: Bảng thể hiện các Hành vi Gốc tinh gọn (10 hành vi gốc)
 * + các Nhãn Con được Model AI tạo sinh tức thì qua phân tích khung xương
 */
function renderCoreAndAiBehaviorTable() {
  const tbody = $('#coreBehaviorTableBody');
  if (!tbody) return;

  const agg = {};
  store.segments.forEach((s) => {
    const item = (agg[s.behavior] ||= {
      count: 0,
      totalMs: 0,
      confSum: 0,
      firstStart: s.start,
      sampleAngles: s.jointAngles || '',
      sampleHint: s.stepHint || '',
    });
    item.count++;
    const durMs = s.durationMs || Math.max(10, Math.round((s.end - s.start) * 1000));
    item.totalMs += durMs;
    item.confSum += s.confidence || 0.75;
    if (s.start < item.firstStart) item.firstStart = s.start;
    if (!item.sampleAngles && s.jointAngles) item.sampleAngles = s.jointAngles;
    if (!item.sampleHint && s.stepHint) item.sampleHint = s.stepHint;
  });

  // Hiển thị: 10 hành vi gốc + mọi nhãn AI/Đã học có xuất hiện (tạo sinh tức thì)
  const coreKeys = Object.keys(CORE_BEHAVIORS);
  const dynamicKeys = Object.keys(agg).filter((k) => !CORE_BEHAVIORS[k]);
  const allKeys = [...dynamicKeys, ...coreKeys];

  const aiCountEl = $('#aiGeneratedCountBadge');
  if (aiCountEl) {
    aiCountEl.textContent = `${dynamicKeys.length} nhãn AI tạo sinh · ${store.segments.length} phân đoạn`;
  }

  tbody.innerHTML = allKeys.map((k) => {
    const info = behaviorInfo(k);
    const stat = agg[k];
    const isAi = info.group === 'ai';
    const isLearned = info.group === 'learned';
    const activeFilter = state.behaviors.has(k);
    const typeBadge = isAi
      ? '<span class="type-pill type-ai">⚡ AI Tạo sinh tức thì</span>'
      : isLearned
        ? '<span class="type-pill type-learned">★ Đã học</span>'
        : '<span class="type-pill type-core">Hành vi gốc</span>';
    const avgConf = stat ? `${Math.round((stat.confSum / stat.count) * 100)}%` : '–';
    const totalSec = stat ? `${(stat.totalMs / 1000).toFixed(2)}s (${stat.totalMs}ms)` : '0.00s';
    const guide = stat?.sampleHint || info.stepHint || stat?.sampleAngles || 'Chờ AI phân tích khung xương…';
    return `<tr class="${stat ? 'has-data' : 'is-idle'} ${isAi ? 'row-ai-generated' : ''}">
      <td>
        <span class="badge"><i style="background:${info.color}"></i>${escapeHtml(info.label)}</span>
      </td>
      <td>${typeBadge}</td>
      <td><b>${stat ? stat.count : 0}</b> lần</td>
      <td class="mono">${totalSec}</td>
      <td>${avgConf}</td>
      <td class="small muted">${escapeHtml(guide)}</td>
      <td>
        <button type="button" class="btn btn-ghost btn-sm ${activeFilter ? 'is-active' : ''}" data-filter-behavior="${escapeHtml(k)}">
          ${activeFilter ? 'Đang lọc ✓' : 'Lọc nhãn'}
        </button>
      </td>
    </tr>`;
  }).join('');
}

function renderSummary(list) {
  const el = $('#summary');
  if (!el) return;
  const all = store.segments;
  const persons = new Set(all.map((s) => s.personId)).size;
  const falls = all.filter((s) => behaviorInfo(s.behavior).alert).length;
  const aiCount = all.filter((s) => behaviorInfo(s.behavior).group === 'ai').length;
  const html = [
    list.length === all.length
      ? `<span>Tổng cộng <b>${all.length}</b> mốc nhãn hành vi (độ phân giải mili-giây)</span>`
      : `<span>Hiển thị <b>${list.length}</b> / <b>${all.length}</b> nhãn</span>`,
    `<span><b>${aiCount}</b> nhãn con chi tiết do AI tạo sinh</span>`,
    `<span><b>${persons}</b> người</span>`,
    store.media.duration ? `<span>Thời lượng video: <b>${fmtTimeMs(store.media.duration)}</b></span>` : '',
    falls ? `<span class="alert"><b>${falls}</b> cảnh báo té ngã</span>` : '',
  ].filter(Boolean);
  el.innerHTML = html.join('');
}

/**
 * BẢNG 2: Bảng ghi thời gian cụ thể (Giây & Mili-giây) của từng nhãn trong video
 */
function renderTimelineTable(list) {
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  state.page = Math.min(state.page, pages);
  const rows = list.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);

  const emptyEl = $('#tableEmpty');
  if (emptyEl) {
    emptyEl.hidden = list.length > 0;
    emptyEl.textContent = store.segments.length
      ? 'Không có nhãn nào khớp bộ lọc. Bấm “Xoá lọc” để xem tất cả.'
      : 'Chưa có dữ liệu. Hãy tải video / dán link rồi bấm “Phân tích”, hoặc tải lên file .ZIP.';
  }

  $$('#resultTable th[data-sort]').forEach((th) => {
    th.setAttribute('aria-sort', th.dataset.sort === state.sortKey ? (state.sortDir > 0 ? 'ascending' : 'descending') : 'none');
  });

  const tbody = $('#resultBody');
  if (!tbody) return;
  tbody.innerHTML = rows.map((s) => {
    const info = behaviorInfo(s.behavior);
    const pct = Math.round((s.confidence || 0.78) * 100);
    const canSeek = s.source !== 'camera';
    const durMs = s.durationMs || Math.max(10, Math.round((s.end - s.start) * 1000));
    const detail = [s.jointAngles, s.stepHint || info.stepHint].filter(Boolean).join(' · ');
    return `<tr data-id="${escapeHtml(s.id)}" tabindex="0" class="${info.alert ? 'is-alert' : ''}" title="${canSeek ? 'Bấm để tua video tới đúng mili-giây này' : 'Phiên camera'}">
      <td class="mono"><b>${fmtTimeMs(s.start)}</b> <span class="muted small">(${s.start.toFixed(3)}s)</span></td>
      <td class="mono"><b>${fmtTimeMs(s.end)}</b> <span class="muted small">(${s.end.toFixed(3)}s)</span></td>
      <td class="mono">${durMs} ms <span class="muted small">(${(durMs / 1000).toFixed(2)}s)</span></td>
      <td style="color:${personColor(s.personId)};font-weight:600">${escapeHtml(personLabel(s.personId, s.source))}</td>
      <td>
        <span class="badge"><i style="background:${info.color}"></i>${escapeHtml(info.label)}</span>
        ${info.group === 'ai' ? '<span class="ai-tag">AI</span>' : ''}
      </td>
      <td class="small muted">${escapeHtml(detail || 'Khung xương chuẩn')}</td>
      <td><span class="conf-cell"><span class="bar"><span style="width:${pct}%"></span></span>${pct}%</span></td>
      <td class="row-actions">
        <button class="row-teach" ${canSeek ? '' : 'disabled'} title="Dạy hệ thống từ đoạn này">Dạy</button>
        <button class="row-del" title="Xoá dòng này" aria-label="Xoá dòng">✕</button>
      </td>
    </tr>`;
  }).join('');

  const pager = $('#pager');
  if (pager) {
    pager.innerHTML = pages > 1
      ? `<button class="btn btn-ghost btn-sm" data-page="${state.page - 1}" ${state.page === 1 ? 'disabled' : ''}>Trang trước</button>
         <span>Trang ${state.page} / ${pages}</span>
         <button class="btn btn-ghost btn-sm" data-page="${state.page + 1}" ${state.page === pages ? 'disabled' : ''}>Trang sau</button>`
      : '';
  }
  highlightCurrent(null);
}

let lastT = -1;
function highlightCurrent(t) {
  if (t === null) t = lastT; else lastT = t;
  $$('#resultBody tr[data-id]').forEach((tr) => {
    const s = store.segments.find((x) => x.id === tr.dataset.id);
    tr.classList.toggle('is-current', !!s && s.source === 'video' && t >= s.start && t <= s.end);
  });
}
