// =========================================================
// chatbot.js — Trợ lý AI Hướng dẫn Động tác & Phân tích (Tiếng Việt)
//   • Hoạt động bằng Model AI (Google Gemini miễn phí / LLM) thay vì chế độ local cũ
//   • Chỉ đưa thông tin số liệu phân tích khi người dùng hỏi đến
//   • Đưa ra hướng dẫn động tác bằng chữ tiếng Việt rõ ràng, dễ hiểu nhanh chóng cho con người
//   • Tích hợp Tìm kiếm trên Google (Google Search Grounding + /api/google-search)
//     khi người dùng hỏi các thông tin liên quan đến phân tích qua video hoặc camera
//   • Kết nối trực tiếp với đường dẫn gọi Chatbot ở dưới màn hình Camera & có các câu gợi ý ở dưới
// =========================================================
import { store } from './store.js';
import { $, escapeHtml, fmtTime, fmtTimeMs, normalizeVi, parseTime } from './utils.js';
import { CORE_BEHAVIORS, behaviorInfo } from './config.js';
import { seekTo, hasVideo } from './player.js';
import { setFilter, resetFilters, getFiltered } from './results.js';
import { exportJSON, exportCSV } from './json-io.js';
import { inference } from './inference.js';
import { perfSummary, TIER_LABEL } from './perf.js';
import { personLabel } from './face.js';
import { llmReady, chat, searchGoogleWeb } from './llm.js';
import { packageStore } from './packages.js';
import { initChatDrawer, setChatHidden } from './chat-drawer.js';

const MAX_HISTORY = 10;
const history = [];
let busy = false;
let conversation = 0;
let requestController = null;
let currentTab = 'video';

const GREETING = 'Xin chào! Hỏi tôi cách tập động tác hoặc kết quả phân tích.';

export function initChatbot() {
  const form = $('#chatForm');
  const text = $('#chatText');

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (busy) return;
    send(text.value);
    text.value = '';
    autoGrow(text);
  });

  text?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  text?.addEventListener('input', () => autoGrow(text));

  $('#chatSuggest')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (btn) send(btn.dataset.q || btn.textContent);
  });

  $('#chatLog')?.addEventListener('click', (e) => {
    const a = e.target.closest('a.t');
    if (a) { e.preventDefault(); seekTo(parseFloat(a.dataset.t)); }
  });

  initChatDrawer();
  $('#chatReset')?.addEventListener('click', resetChat);

  store.on('settings', updateModeLabel);
  store.on('results', renderSuggestions);
  store.on('packages', renderSuggestions);
  store.on('switch-tab', (tab) => {
    currentTab = tab;
    renderSuggestions();
  });

  // Sự kiện gọi từ đường dẫn dưới màn hình Camera
  store.on('ask-chatbot', (question) => {
    setChatHidden(false);
    $('#chatText')?.focus();
    if (question) send(question);
  });

  store.on('fall-alert', ({ persons, t }) => {
    addMessage('bot', `**Cảnh báo an toàn:** Người ${persons.map((p) => `#${p}`).join(', ')} có dấu hiệu té ngã trên camera lúc ${fmtTimeMs(t)}.`);
  });

  renderSuggestions();
  updateModeLabel();
  addMessage('bot', GREETING);
}

export function resetChat() {
  conversation++;
  requestController?.abort();
  requestController = null;
  busy = false;
  history.length = 0;
  $('#chatLog')?.replaceChildren();
  if ($('#chatText')) {
    $('#chatText').value = '';
    autoGrow($('#chatText'));
  }
  setChatHidden(false);
  renderSuggestions();
  updateModeLabel();
  addMessage('bot', GREETING);
  $('#chatText')?.focus();
}

function autoGrow(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.max(38, Math.min(el.scrollHeight, 120))}px`;
}

function updateModeLabel() {
  const st = store.settings;
  const el = $('#chatMode');
  if (!el) return;
  if (llmReady(st)) {
    el.textContent = st.llmModel || 'gemini-2.5-flash';
  } else {
    el.textContent = 'Chưa có API Key';
  }
}

// ---------- Câu gợi ý ở dưới Chatbot (Thay đổi thông minh theo tab Camera / Video / Dữ liệu) ----------
function renderSuggestions() {
  const el = $('#chatSuggest');
  if (!el) return;
  const latestPkg = packageStore.packages?.[0];
  const pkgName = latestPkg?.name || 'chuỗi động tác hiện tại';

  let qs = [];
  if (currentTab === 'camera') {
    qs = [
      'Hướng dẫn từng bước',
      'Tư thế tay & đầu chuẩn?',
      'Sửa lỗi lệch vai',
      'Lưu ý an toàn',
    ];
  } else if (currentTab === 'learn') {
    qs = [
      'Hướng dẫn từng bước',
      'Giải thích các nhãn',
      'Bài tập tương tự',
      'Cách dùng file .ZIP',
    ];
  } else {
    if (store.segments.length) {
      qs = [
        'Hướng dẫn động tác',
        'Kết quả phân tích',
        'Tóm tắt các bước',
        'Tra cứu kỹ thuật',
      ];
    } else {
      qs = [
        'Hướng dẫn cho người mới',
        'Kỹ thuật Squat đúng',
        'Cách nhập video',
        'Hiệu năng máy',
      ];
    }
  }

  el.innerHTML = qs.map((q) => `<button type="button" data-q="${escapeHtml(q)}">${escapeHtml(q)}</button>`).join('');
}

// ---------- Hiển thị tin nhắn ----------
function addMessage(role, text, { raw = false } = {}) {
  const log = $('#chatLog');
  if (!log) return null;
  const el = document.createElement('div');
  el.className = `msg msg-${role}`;
  el.innerHTML = raw ? text : renderMarkdown(text, true);
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
  return el;
}

function renderMarkdown(text, linkTimes = true) {
  let html = escapeHtml(text)
    .replace(/\{\{t:([\d.]+)\}\}/g, (_, t) => `<a class="t" href="#" data-t="${t}">${fmtTimeMs(parseFloat(t))}</a>`)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  if (linkTimes) {
    html = html.replace(/(^|[^\d:">])(\d{1,2}:\d{2}(?:\.\d{1,3})?)(?![\d<])/g, (m, pre, ts) => {
      const t = parseTime(ts);
      return t == null ? m : `${pre}<a class="t" href="#" data-t="${t}">${ts}</a>`;
    });
  }

  const lines = html.split('\n');
  const out = [];
  let inList = false;
  for (const line of lines) {
    const m = line.match(/^\s*[-•*]\s+(.*)/);
    if (m) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${m[1]}</li>`);
    } else {
      if (inList) { out.push('</ul>'); inList = false; }
      if (line.trim()) out.push(`<p>${line}</p>`);
    }
  }
  if (inList) out.push('</ul>');
  return out.join('');
}

// ---------- Xử lý câu hỏi ----------
export async function send(input) {
  const q = String(input || '').trim();
  if (!q || busy) return;
  addMessage('user', q);

  // 1. Lệnh điều khiển trình phát nhanh (tua video, lọc bảng, xuất file)
  const command = handleCommand(q);
  if (command) {
    addMessage('bot', command);
    remember(q, command);
    return;
  }

  busy = true;
  const session = conversation;
  const controller = (requestController = new AbortController());
  const typing = addMessage('bot', '<span class="msg-typing">Đang trả lời…</span>', { raw: true });

  try {
    const answer = await answerWithAiModelAndGoogle(q, controller.signal);
    if (session !== conversation || controller.signal.aborted) return;
    if (typing) typing.innerHTML = renderMarkdown(answer, true);
    remember(q, answer);
  } catch (err) {
    if (session !== conversation || controller.signal.aborted) return;
    console.error(err);
    const guided = await buildSmartVietnameseResponse(q, controller.signal);
    if (typing) {
      typing.innerHTML = renderMarkdown(guided, true);
    }
    remember(q, guided);
  } finally {
    if (session === conversation) {
      busy = false;
      requestController = null;
      const log = $('#chatLog');
      if (log) log.scrollTop = log.scrollHeight;
    }
  }
}

function remember(q, a) {
  history.push(
    { role: 'user', content: q },
    { role: 'assistant', content: a.replace(/\{\{t:([\d.]+)\}\}/g, (_, t) => fmtTimeMs(parseFloat(t))) }
  );
  while (history.length > MAX_HISTORY * 2) history.shift();
}

const SYSTEM_PROMPT = `Bạn là Huấn luyện viên AI & Chuyên gia Phân tích Chuyển động Cơ thể của hệ thống nhận diện hành vi qua Video và Camera.
NGUYÊN TẮC QUAN TRỌNG BẮT BUỘC TUÂN THỦ:
1. Ngôn ngữ: Tiếng Việt. Trả lời CỰC NGẮN GỌN (tối đa 5–6 dòng, mỗi dòng 1 ý), không mở bài/kết bài, không lặp lại câu hỏi.
2. CHỈ đưa các số liệu thống kê/bảng phân tích khi người dùng thực sự hỏi về kết quả phân tích, thời gian, hoặc nhãn hành vi. Không tự ý liệt kê số liệu dài dòng nếu người dùng chỉ hỏi cách tập hoặc hỏi kiến thức.
3. Khi hướng dẫn động tác: liệt kê **Step 1**, **Step 2**... mỗi bước 1 câu ngắn (bộ phận + góc chuẩn).
4. Khi hỏi kiến thức bên ngoài: dùng kết quả Google, chỉ kèm tối đa 1–2 link nguồn.
5. Ghi mốc thời gian dạng mm:ss.mmm (ví dụ 00:02.450) để người dùng có thể bấm vào tua video.`;

async function answerWithAiModelAndGoogle(q, signal) {
  const qn = normalizeVi(q);
  const asksAnalysis = /(phan tich|ket qua|tom tat|nhan|thoi gian|giay|mili|bao nhieu|ai lam gi|thong ke|trong video|trong camera|do chinh xac)/.test(qn);
  const needsWebSearch = store.settings.enableGoogleSearch !== false && (
    /(google|tim kiem|tra cuu|ky thuat|loi ich|bai tap|la gi|cach tap|chuan khoa hoc|video|camera|huong dan)/.test(qn)
  );

  // Tìm kiếm trên Google qua server endpoint để bổ sung ngữ cảnh thực tế
  let webResults = [];
  if (needsWebSearch) {
    webResults = await searchGoogleWeb(q, signal).catch(() => []);
  }

  // Nếu người dùng đã cấu hình API Key cho Gemini / LLM → gọi trực tiếp Model AI
  if (llmReady(store.settings)) {
    const contextParts = [
      `=== BÀI TẬP / GÓI ĐỘNG TÁC ĐANG CHỌN ===\n${buildActivePackageGuideContext()}`,
    ];
    if (asksAnalysis || store.segments.length) {
      contextParts.push(`=== DỮ LIỆU PHÂN TÍCH KHUNG XƯƠNG HIỆN TẠI (CHỈ DÙNG KHI ĐƯỢC HỎI) ===\n${buildAnalysisContext()}`);
    }
    if (webResults.length) {
      contextParts.push(`=== KẾT QUẢ TÌM KIẾM GOOGLE LIÊN QUAN ===\n${webResults.map((r, i) => `${i + 1}. ${r.title}: ${r.snippet} (${r.url})`).join('\n')}`);
    }
    contextParts.push(`=== THÔNG TIN HỆ THỐNG ===\n${buildAppContext()}`);

    const fullSystem = `${SYSTEM_PROMPT}\n\n${contextParts.join('\n\n')}`;
    return chat(store.settings, fullSystem, [...history, { role: 'user', content: q }], {
      signal,
      useGoogleSearch: store.settings.enableGoogleSearch !== false,
    });
  }

  // Nếu chưa nhập Gemini API Key: kết hợp bộ tổng hợp AI Khung xương + kết quả Google Search thực tế
  return buildSmartVietnameseResponse(q, signal, webResults);
}

/**
 * Phản hồi thông minh bằng tiếng Việt (hướng dẫn động tác dễ hiểu + chỉ đưa phân tích khi được hỏi + kèm kết quả Google Search)
 */
async function buildSmartVietnameseResponse(q, signal, preloadedWeb = null) {
  const qn = normalizeVi(q);
  const asksAnalysis = /(phan tich|ket qua|tom tat|nhan|thoi gian|giay|mili|bao nhieu|thong ke|nguoi|점|danh sach)/.test(qn);
  const asksPerf = /(hieu nang|fps|may yeu|toc do|cau hinh|he thong|muot)/.test(qn);
  const asksGoogle = /(google|tim|tra cuu|ky thuat|khoa hoc|loi ich)/.test(qn);

  const webResults = preloadedWeb || (asksGoogle ? await searchGoogleWeb(q, signal).catch(() => []) : []);
  const pkg = packageStore.packages?.[0];

  const lines = [];

  if (asksPerf) {
    const p = perfSummary(inference);
    lines.push(`- **Máy:** ${p.os} · ${TIER_LABEL[p.tier] || 'Trung bình'}${p.lowTierCapped ? ' (giới hạn Trung bình)' : ''}`);
    lines.push(`- **Mức:** ${p.profile}`);
    lines.push(`- **Tốc độ:** ${p.inferFps || 12} phân tích/s · ${p.renderFps || 24} FPS`);
    return lines.join('\n');
  }

  // Nếu người dùng hỏi thông tin phân tích → cung cấp thông tin phân tích chính xác đến mili-giây
  if (asksAnalysis) {
    if (store.segments.length) {
      const segs = [...store.segments].sort((a, b) => a.start - b.start);
      const aiSegs = segs.filter((s) => behaviorInfo(s.behavior).group === 'ai');
      lines.push(`**${segs.length} nhãn (${aiSegs.length} nhãn AI):**`);
      segs.slice(0, 5).forEach((s) => {
        const info = behaviorInfo(s.behavior);
        const durMs = s.durationMs || Math.round((s.end - s.start) * 1000);
        lines.push(`- {{t:${s.start}}} (${durMs}ms): ${info.label.replace(/^AI:\s*/, '')}`);
      });
      if (segs.length > 5) lines.push(`- … +${segs.length - 5} nhãn (xem bảng thời gian)`);
    } else if (pkg) {
      lines.push(`**${pkg.name}** (${pkg.segments?.length || 0} nhãn):`);
      (pkg.segments || []).slice(0, 5).forEach((s) => {
        const info = behaviorInfo(s.behavior);
        lines.push(`- ${fmtTimeMs(s.start)}: ${info.label.replace(/^AI:\s*/, '')}`);
      });
    } else {
      lines.push('Chưa có dữ liệu. Hãy tải video rồi bấm **Phân tích**.');
    }
  }

  // Luôn đưa ra hướng dẫn thực hiện động tác bằng chữ tiếng Việt dễ hiểu khi người dùng hỏi cách tập / hướng dẫn
  if (!asksAnalysis || /(huong dan|cach|thuc hien|동작|step|buoc|tap|sua loi|tu the)/.test(qn)) {
    const targetPkg = pkg;
    const steps = targetPkg?.steps || [];
    lines.push(`**${targetPkg?.name || 'Động tác'}:**`);
    if (steps.length) {
      steps.forEach((st, idx) => {
        lines.push(`- **Step ${st.stepNumber || (idx + 1)}:** ${String(st.title || st.label || '').replace(/^Bước \d+:\s*/, '')}`);
      });
    } else {
      lines.push('- **Step 1:** Đứng thẳng, chân rộng bằng vai.');
      lines.push('- **Step 2:** Nâng hai tay đều, không nhún vai.');
      lines.push('- **Step 3:** Hạ hông, lưng thẳng, gối theo mũi chân.');
    }
    lines.push('*Bấm **Kiểm tra động tác** ở Camera để chấm điểm.*');
  }

  if (webResults.length) {
    const r = webResults.find((x) => !/google\.com\/search/.test(x.url)) || webResults[0];
    lines.push(`🔎 [${/google\.com\/search/.test(r.url) ? 'Xem trên Google' : r.title}](${r.url})`);
  }

  if (!llmReady(store.settings)) {
    lines.push('*Thêm API Key ở Hệ thống để AI trả lời tốt hơn.*');
  }

  return lines.join('\n');
}

function buildActivePackageGuideContext() {
  const pkg = packageStore.packages?.[0];
  if (!pkg) return 'Chưa có gói động tác mẫu.';
  return [
    `Tên gói động tác: ${pkg.name}`,
    `Tóm tắt: ${pkg.summary || ''}`,
    pkg.voiceTranscript ? `Mô tả bằng giọng nói của người dùng: "${pkg.voiceTranscript}"` : '',
    'Các bước thực hiện (Steps):',
    ...(pkg.steps || []).map((s) => `- Step ${s.stepNumber}: ${s.title} | ${s.description} | Góc khớp: ${s.jointAngles || 'chuẩn'}`),
  ].filter(Boolean).join('\n');
}

function buildAnalysisContext() {
  const segs = [...store.segments].sort((a, b) => a.start - b.start);
  if (!segs.length) return 'Chưa có phân đoạn nào trong phiên hiện tại.';
  return [
    `Nguồn video: ${store.media.name || store.meta.mediaName || 'camera/video'}; thời lượng: ${fmtTimeMs(store.media.duration || 0)}.`,
    `Tổng số phân đoạn mili-giây: ${segs.length}.`,
    'Chi tiết các phân đoạn (Bắt đầu – Kết thúc | Thời lượng ms | Nhãn | Góc khớp | Hướng dẫn):',
    ...segs.slice(0, 180).map((s) => {
      const info = behaviorInfo(s.behavior);
      const durMs = s.durationMs || Math.round((s.end - s.start) * 1000);
      return `${personLabel(s.personId, s.source)} | ${fmtTimeMs(s.start)}–${fmtTimeMs(s.end)} (${durMs}ms) | ${info.label} | ${s.jointAngles || ''} | ${s.stepHint || info.stepHint || ''}`;
    }),
  ].join('\n');
}

function buildAppContext() {
  const p = perfSummary(inference);
  return `Thiết bị: ${p.os}, ${p.browser}, xếp loại ${TIER_LABEL[p.tier] || 'Trung bình'}, hồ sơ ${p.profile}, tốc độ ${p.inferFps || 12} phân tích/s, hiển thị ${p.renderFps || 24} FPS.`;
}

// ---------- Lệnh điều khiển nhanh ----------
const T = (t) => `{{t:${t}}}`;
const has = (qn, re) => re.test(qn);

export function handleCommand(q) {
  const qn = normalizeVi(q);

  if (has(qn, /^(tua|nhay|chuyen|di|phat)\b.*\b(den|toi|ve|tu|luc)\b|^tua\b/)) {
    const tm = qn.match(/(\d+(?:[:.,]\d+){0,2})\s*(phut|giay|s)?/);
    if (tm) {
      let t = parseTime(tm[1].replace(',', '.'));
      if (t != null) {
        if (tm[2] === 'phut' && !tm[1].includes(':')) t *= 60;
        if (!hasVideo()) return 'Chưa mở video nên chưa tua được. Hãy tải video lên trước.';
        seekTo(t, { play: /phat/.test(qn) });
        return `Đã tua video đến mốc ${T(t)}.`;
      }
    }
  }

  if (has(qn, /(xoa|bo|huy) (bo )?loc|hien (thi )?tat ca|reset/)) {
    resetFilters();
    return 'Đã xoá toàn bộ bộ lọc bảng kết quả.';
  }

  if (has(qn, /^(loc|chi (hien|xem|hien thi))\b/)) {
    const found = Object.keys(CORE_BEHAVIORS).filter((k) => qn.includes(normalizeVi(behaviorInfo(k).label)));
    if (found.length) {
      setFilter({ behaviors: found });
      return `Đã lọc theo nhãn **${found.map((k) => behaviorInfo(k).label).join(', ')}**: còn **${getFiltered().length}** phân đoạn.`;
    }
  }

  if (has(qn, /(xuat|export|tai ve|luu)/) && has(qn, /(json|csv)/)) {
    if (has(qn, /csv/)) { exportCSV(); return 'Đã xuất file CSV.'; }
    exportJSON({ filtered: false });
    return 'Đã xuất file JSON.';
  }
  return null;
}

export function unavailablePlatformStats() { return null; }
export function answerLocal(q) { return buildSmartVietnameseResponse(q); }
