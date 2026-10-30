// =========================================================
// face-ui.js — Tab "Khuôn mặt"
//   • bật/tắt 3 mô hình (dò mặt, biểu cảm, nhận dạng) và ngưỡng
//   • trạng thái tải từng mô hình
//   • danh sách người đã đăng ký: đổi tên, xoá, thêm mẫu từ ảnh
//   • thống kê cảm xúc theo từng người trong kết quả hiện tại
// =========================================================
import { store } from './store.js';
import { $, toast, escapeHtml } from './utils.js';
import { BEHAVIORS } from './config.js';
import { inference } from './inference.js';
import { modelConfig } from './perf.js';
import { listPeople, enrollFace, renamePerson, removePerson, clearPeople, cropThumb, personLabel } from './face.js';
import { isCameraRunning } from './camera.js';

const MODELS = [
  { key: 'detect', setting: 'detectFaces', name: 'BlazeFace', role: 'Dò vị trí khuôn mặt' },
  { key: 'emotion', setting: 'faceEmotion', name: 'Emotion CNN', role: '7 biểu cảm' },
  { key: 'recog', setting: 'faceRecog', name: 'FaceRes', role: 'Nhận dạng, tuổi, giới tính' },
];

const ICON_EDIT = '<svg viewBox="0 0 24 24"><path d="M4 17.2V20h2.8l8.3-8.3-2.8-2.8zM19.7 7.1a1 1 0 0 0 0-1.4l-1.4-1.4a1 1 0 0 0-1.4 0l-1.1 1.1 2.8 2.8z"/></svg>';
const ICON_DEL = '<svg viewBox="0 0 24 24"><path d="M9 3h6l1 2h4v2H4V5h4zm-3 6h12l-1 12H7z"/></svg>';

export function initFaceUi() {
  bindSettings();
  renderModels();
  renderPeople(listPeople());
  renderEmoStats();

  store.on('faces-db', renderPeople);
  store.on('inference-info', renderModels);
  store.on('settings', renderModels);
  store.on('results', () => { if (!$('#panel-faces').hidden) renderEmoStats(); });
  store.on('names', () => { if (!$('#panel-faces').hidden) renderEmoStats(); });
  store.on('switch-tab', (tab) => { if (tab === 'faces') { renderEmoStats(); renderModels(); } });

  $('#faceRetryBtn').addEventListener('click', async () => {
    if (store.analyzing) { toast('Đang phân tích video — thử lại sau khi xong.', 'warn'); return; }
    const btn = $('#faceRetryBtn');
    btn.disabled = true;
    try {
      inference.terminate();                 // huỷ worker cũ → tải lại mô hình từ đầu
      await inference.init(modelConfig());
      renderModels();
      toast(inference.faces?.errors?.length ? 'Vẫn chưa tải được — xem chi tiết lỗi.' : 'Đã tải xong mô hình khuôn mặt.', inference.faces?.errors?.length ? 'warn' : 'ok');
      if (isCameraRunning()) toast('Tắt rồi bật lại camera để dùng mô hình mới.', 'info');
    } catch (err) {
      toast(err.message, 'error', 6000);
    } finally {
      btn.disabled = false;
    }
  });

  $('#clearPeopleBtn').addEventListener('click', async () => {
    if (!listPeople().length) return;
    if (!confirm('Xoá toàn bộ khuôn mặt đã đăng ký trên máy này?')) return;
    await clearPeople();
    toast('Đã xoá dữ liệu khuôn mặt.', 'ok');
  });

  $('#peopleList').addEventListener('click', async (e) => {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    const id = li.dataset.id;
    const person = listPeople().find((p) => p.id === id);
    if (!person) return;
    if (e.target.closest('.del')) {
      if (confirm(`Xoá “${person.name}” khỏi danh sách nhận dạng?`)) await removePerson(id);
    } else if (e.target.closest('.ren')) {
      const name = prompt('Tên mới:', person.name);
      if (name && name.trim()) await renamePerson(id, name);
    }
  });

  $('#photoInput').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (files.length) await enrollFromPhotos(files);
  });
}

// ---------------------------------------------------------
// Cài đặt
// ---------------------------------------------------------
function bindSettings() {
  const s = store.settings;
  const toggles = [
    ['#faceDetectToggle', 'detectFaces'],
    ['#faceEmotionToggle', 'faceEmotion'],
    ['#faceRecogToggle', 'faceRecog'],
  ];
  const syncDisabled = () => {
    $('#faceEmotionToggle').disabled = !store.settings.detectFaces;
    $('#faceRecogToggle').disabled = !store.settings.detectFaces;
    const enrollBtn = $('#faceEnrollBtn');
    if (enrollBtn) enrollBtn.disabled = !isCameraRunning() || !store.settings.detectFaces || !store.settings.faceRecog;
  };
  toggles.forEach(([sel, key]) => {
    const el = $(sel);
    el.checked = !!s[key];
    el.addEventListener('change', () => {
      store.saveSettings({ [key]: el.checked });
      syncDisabled();
      reloadModels();
    });
  });
  syncDisabled();

  const range = (sel, out, key, fmt) => {
    const el = $(sel);
    el.value = Math.round(s[key] * 100);
    $(out).textContent = fmt(el.value);
    el.addEventListener('input', () => {
      $(out).textContent = fmt(el.value);
      store.saveSettings({ [key]: Number(el.value) / 100 });
    });
  };
  range('#faceThreshold', '#faceThresholdOut', 'faceMatch', (v) => `${v}%`);
  range('#emotionMinRange', '#emotionMinOut', 'emotionMin', (v) => `${v}%`);
}

let reloadTimer = null;
/** Đổi bộ mô hình → khởi tạo lại dịch vụ suy luận (gom nhiều lần bấm liên tiếp thành 1) */
function reloadModels() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    if (!inference.ready) { renderModels(); return; }
    if (store.analyzing) { toast('Thay đổi sẽ áp dụng ở lần phân tích sau.', 'warn'); return; }
    inference.init(modelConfig())
      .then(() => {
        renderModels();
        if (isCameraRunning()) toast('Đã cập nhật mô hình khuôn mặt — camera dùng ngay cấu hình mới.', 'ok');
      })
      .catch((err) => toast(err.message, 'error', 6000));
  }, 400);
}

// ---------------------------------------------------------
// Trạng thái mô hình
// ---------------------------------------------------------
function renderModels() {
  const st = inference.faces || null;
  const s = store.settings;
  let loaded = 0, wanted = 0;
  $('#faceModelState').innerHTML = MODELS.map((m) => {
    const want = s.detectFaces && (m.key === 'detect' || s[m.setting]);
    if (want) wanted++;
    let cls = 'is-off', state = 'Tắt';
    if (want && !inference.ready) { cls = 'is-off'; state = 'Chờ tải'; }
    else if (want && st?.[m.key]) { cls = 'is-on'; state = 'Đã tải'; loaded++; }
    else if (want) { cls = 'is-err'; state = 'Lỗi tải'; }
    return `<li class="${cls}"><span class="dot"></span><span><b>${m.name}</b> <span class="muted small">· ${m.role}</span></span><span class="state">${state}</span></li>`;
  }).join('') + (st?.errors?.length ? `<li class="is-err"><span class="dot"></span><span class="small">${escapeHtml(st.errors.join(' · '))}<br>
      <span class="muted">Kiểm tra mạng có truy cập được GitHub không (mạng trường/công ty đôi khi chặn). Cách chắc chắn nhất: chạy <code>python tools/download_offline.py</code> một lần để có bản offline.</span></span></li>` : '');

  $('#faceRetryBtn').hidden = !(inference.ready && s.detectFaces && loaded < wanted);
  const badge = $('#faceModelBadge');
  if (!s.detectFaces) { badge.className = 'pill'; badge.textContent = 'Đang tắt'; }
  else if (!inference.ready) { badge.className = 'pill'; badge.textContent = 'Chưa tải'; }
  else if (loaded === wanted) { badge.className = 'pill pill-ok'; badge.textContent = `${loaded}/${wanted} sẵn sàng`; }
  else { badge.className = 'pill pill-bad'; badge.textContent = `${loaded}/${wanted} sẵn sàng`; }
}

// ---------------------------------------------------------
// Người đã đăng ký
// ---------------------------------------------------------
function renderPeople(people) {
  const el = $('#peopleList');
  $('#peopleCount').textContent = people.length ? `${people.length} người` : '';
  $('#clearPeopleBtn').disabled = !people.length;
  if (!people.length) {
    el.innerHTML = '<li class="muted small">Chưa có ai. Đăng ký ở tab Camera (quay trực tiếp) hoặc thêm từ ảnh bên dưới.</li>';
    return;
  }
  el.innerHTML = people.map((p) => {
    const avatar = p.thumb
      ? `<img src="${p.thumb}" alt="" />`
      : `<span class="ph">${escapeHtml(p.name.slice(0, 1).toUpperCase())}</span>`;
    return `<li data-id="${p.id}">${avatar}
      <div class="who"><b title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</b><span class="muted small">${p.count} mẫu${p.migrated ? ' · <span class="warn-text" title="Dữ liệu từ bản cũ được chuyển đổi xấp xỉ. Đăng ký lại (cùng tên) để nhận dạng chính xác nhất.">nên đăng ký lại</span>' : ''}</span></div>
      <div class="acts"><button class="ren" title="Đổi tên" aria-label="Đổi tên">${ICON_EDIT}</button><button class="del" title="Xoá" aria-label="Xoá">${ICON_DEL}</button></div></li>`;
  }).join('');
}

/** Thêm mẫu khuôn mặt từ 1 hoặc nhiều ảnh */
async function enrollFromPhotos(files) {
  const name = $('#photoName').value.trim();
  const status = $('#photoStatus');
  if (!name) { toast('Nhập tên người trước khi chọn ảnh.', 'warn'); $('#photoName').focus(); return; }
  if (!store.settings.detectFaces || !store.settings.faceRecog) {
    toast('Hãy bật “Phát hiện khuôn mặt” và “Nhận dạng người quen” ở trên.', 'warn', 5000);
    return;
  }
  status.textContent = 'Đang tải mô hình…';
  try {
    await inference.init(modelConfig());
  } catch (err) {
    status.textContent = err.message;
    return;
  }
  if (!inference.faces?.recog) { status.textContent = 'Mô hình nhận dạng (FaceRes) chưa tải được — xem trạng thái ở trên.'; return; }

  const descs = [];
  let thumb = null;
  const problems = [];
  for (const [i, file] of files.entries()) {
    status.textContent = `Đang xử lý ảnh ${i + 1}/${files.length}…`;
    let img;
    try {
      img = await loadImage(file);
      const w = Math.min(img.naturalWidth, 1024);
      const res = await inference.detect(img, {
        inputWidth: w, maxPoses: 1, withObjects: false,
        withFaces: true, faceRes: true, faceResMax: 1, faceMax: 3,
      });
      const faces = (res.faces || []).sort((a, b) => b.box[2] - a.box[2]);
      if (!faces.length) { problems.push(`${file.name}: không thấy khuôn mặt`); continue; }
      const f = faces[0];
      if (!f.desc) { problems.push(`${file.name}: khuôn mặt quá nhỏ`); continue; }
      if (faces.length > 1) problems.push(`${file.name}: có ${faces.length} mặt, đã lấy mặt lớn nhất`);
      descs.push(f.desc);
      if (!thumb) thumb = cropThumb(img, f.box);
    } catch (err) {
      problems.push(`${file.name}: ${err.message}`);
    } finally {
      if (img?.src?.startsWith('blob:')) URL.revokeObjectURL(img.src);
    }
  }
  if (!descs.length) {
    status.innerHTML = `<span class="warn-text">Không lấy được mẫu nào.</span> ${escapeHtml(problems.join('; '))}`;
    return;
  }
  try {
    const total = await enrollFace(name, descs, thumb);
    status.innerHTML = `<span class="ok-text">Đã thêm ${descs.length} mẫu cho “${escapeHtml(name)}” (tổng ${total}).</span>${problems.length ? ` <span class="muted">${escapeHtml(problems.join('; '))}</span>` : ''}`;
    toast(`Đã đăng ký khuôn mặt “${name}”.`, 'ok');
  } catch (err) {
    status.textContent = err.message;
  }
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('không đọc được ảnh'));
    img.src = URL.createObjectURL(file);
  });
}

// ---------------------------------------------------------
// Thống kê cảm xúc theo người
// ---------------------------------------------------------
function renderEmoStats() {
  const el = $('#emoStats');
  const emoKeys = Object.keys(BEHAVIORS).filter((k) => BEHAVIORS[k].group === 'face');
  const segs = store.segments.filter((s) => emoKeys.includes(s.behavior));
  if (!segs.length) {
    el.innerHTML = `<p class="muted small">Chưa có dữ liệu cảm xúc. Phân tích một video có khuôn mặt nhìn rõ, hoặc bật camera.
      Biểu cảm “bình thường” không được ghi thành đoạn. Cần mặt rõ, xác suất ≥ ${Math.round(Math.max(0.65, store.settings.emotionMin) * 100)}%, hơn lớp thứ hai ≥ 12 điểm % và giữ ổn định; chưa đạt thì hiển thị “Chưa đủ chắc chắn”.</p>`;
    return;
  }
  const byPerson = new Map();
  for (const s of segs) {
    const key = `${s.source}|${s.personId}`;
    if (!byPerson.has(key)) byPerson.set(key, { source: s.source, personId: s.personId, total: 0, per: {} });
    const p = byPerson.get(key);
    const d = Math.max(0, s.end - s.start);
    p.total += d;
    p.per[s.behavior] = (p.per[s.behavior] || 0) + d;
  }
  const rows = [...byPerson.values()].sort((a, b) => b.total - a.total).slice(0, 12).map((p) => {
    const parts = emoKeys.filter((k) => p.per[k]).map((k) => {
      const share = p.per[k] / p.total;
      const info = BEHAVIORS[k];
      return `<i style="width:${(share * 100).toFixed(1)}%;background:${info.color}" title="${info.label}: ${p.per[k].toFixed(1)} s (${Math.round(share * 100)}%)">${share > 0.12 ? info.emoji || '' : ''}</i>`;
    }).join('');
    const src = p.source === 'camera' ? ' <span class="muted small">(camera)</span>' : '';
    return `<div class="emo-person"><span>${escapeHtml(personLabel(p.personId, p.source))}${src}</span><div class="emo-stack">${parts}</div></div>`;
  }).join('');
  const used = emoKeys.filter((k) => segs.some((s) => s.behavior === k));
  const legend = used.map((k) => `<span><i style="background:${BEHAVIORS[k].color}"></i>${BEHAVIORS[k].emoji || ''} ${BEHAVIORS[k].label}</span>`).join('');
  el.innerHTML = rows + `<div class="emo-legend">${legend}</div>`;
}
