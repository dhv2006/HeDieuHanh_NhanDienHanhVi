// =========================================================
// llm.js — Kết nối Model AI Gemini (Miễn phí) & LLM + Tìm kiếm Google
//   • Ưu tiên Google Gemini API miễn phí (gemini-2.5-flash / gemini-2.0-flash)
//   • Hỗ trợ Google Search Grounding (tìm kiếm trên Google khi người dùng hỏi)
//   • Hỗ trợ thêm OpenAI / Groq / Claude
// =========================================================

export const PRESETS = {
  gemini:   { provider: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.5-flash', key: true },
  openai:   { provider: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', key: true },
  groq:     { provider: 'openai', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', key: true },
  anthropic:{ provider: 'anthropic', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-4-20250514', key: true },
};

const DEFAULT_OPENAI = 'https://api.openai.com/v1';
const GEMINI_FALLBACK_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

let proxyState = null;
let proxyProbe = null;
export async function hasProxy() {
  if (proxyState === true) return true;
  if (!proxyProbe) proxyProbe = (async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);
      try {
        const r = await fetch('llm-proxy?ping=1', { cache: 'no-store', signal: controller.signal });
        proxyState = r.ok && (await r.json().catch(() => ({}))).proxy === 'behavior-analysis' ? true : null;
        return proxyState === true;
      } catch { /* thử lại */ }
      finally { clearTimeout(timer); }
    }
    return false;
  })();
  const pending = proxyProbe;
  try { return await pending; }
  finally { if (proxyProbe === pending) proxyProbe = null; }
}
export const proxyInUse = () => proxyState === true;

async function apiFetch(url, init = {}) {
  init.signal?.throwIfAborted();
  const proxy = await hasProxy();
  init.signal?.throwIfAborted();
  if (proxy) {
    try { return await fetch(`llm-proxy?url=${encodeURIComponent(url)}`, init); }
    catch (error) {
      if (init.signal?.aborted) throw error;
      proxyState = null;
    }
  }
  return fetch(url, init);
}

/** Tra cứu thông tin trên Google thông qua máy chủ (bổ trợ cho AI khi người dùng hỏi) */
export async function searchGoogleWeb(query, signal) {
  try {
    const res = await fetch('/api/google-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal,
    });
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    return Array.isArray(data?.results) ? data.results : [];
  } catch {
    return [];
  }
}

const looksLikeUrl = (v) => /^(https?:\/\/|localhost[:/]|\d{1,3}(\.\d{1,3}){3}[:/])/i.test((v || '').trim());

export function isPrivateHost(url) {
  try {
    const h = new URL(url).hostname;
    return h === 'localhost' || h === '0.0.0.0' || h.endsWith('.local') || h === '[::1]'
      || /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h);
  } catch { return false; }
}

/**
 * Chuẩn hoá cấu hình AI: bỏ chế độ local cũ, mặc định dùng Gemini AI miễn phí
 */
export function normalizeLlmSettings(input) {
  const s = { ...input };
  const notes = [];
  s.llmApiKey = (s.llmApiKey || s.llmKey || '').trim();
  s.llmKey = s.llmApiKey;
  s.llmBaseUrl = (s.llmBaseUrl || s.llmEndpoint || '').trim();
  s.llmEndpoint = s.llmBaseUrl;
  s.llmModel = (s.llmModel || '').trim();

  // Chuyển cấu hình 'local' cũ sang 'gemini' theo yêu cầu mới
  if (!s.llmProvider || s.llmProvider === 'local') {
    s.llmProvider = 'gemini';
    if (!s.llmModel) s.llmModel = 'gemini-2.5-flash';
  }

  // Nếu người dùng nhập API key dạng AIza... (Google Gemini) thì tự động chọn provider gemini
  if (/^AIza[0-9A-Za-z\-_]{20,}/.test(s.llmApiKey) && s.llmProvider !== 'gemini') {
    s.llmProvider = 'gemini';
    if (!s.llmModel || !s.llmModel.startsWith('gemini')) s.llmModel = 'gemini-2.5-flash';
  }

  if (s.llmProvider === 'gemini') {
    if (looksLikeUrl(s.llmApiKey)) {
      s.llmApiKey = '';
      notes.push('Ô API key đang chứa đường link — hãy dán Gemini API Key (bắt đầu bằng AIza…).');
    }
    if (!s.llmModel) s.llmModel = 'gemini-2.5-flash';
  } else if (s.llmProvider === 'openai') {
    if (looksLikeUrl(s.llmApiKey)) {
      const url = /^https?:\/\//i.test(s.llmApiKey) ? s.llmApiKey : `http://${s.llmApiKey}`;
      if (!s.llmBaseUrl || s.llmBaseUrl === DEFAULT_OPENAI) {
        s.llmBaseUrl = url;
        notes.push(`Đã chuyển địa chỉ máy chủ “${url}” sang ô Base URL.`);
      } else {
        notes.push('Ô API key đang chứa một địa chỉ web — đã xoá.');
      }
      s.llmApiKey = '';
    }
    if (!s.llmBaseUrl) s.llmBaseUrl = DEFAULT_OPENAI;
    if (!/^https?:\/\//i.test(s.llmBaseUrl)) s.llmBaseUrl = `http://${s.llmBaseUrl}`;
    s.llmBaseUrl = s.llmBaseUrl.replace(/\/+$/, '').replace(/\/chat\/completions$/, '');
  } else if (s.llmProvider === 'anthropic' && looksLikeUrl(s.llmApiKey)) {
    s.llmApiKey = '';
    notes.push('Ô API key đang chứa một địa chỉ web — Claude cần key dạng “sk-ant-…”.');
  }
  return { settings: s, notes };
}

export function needsKey(s) {
  if (s.llmProvider === 'gemini' || s.llmProvider === 'anthropic') return true;
  if (s.llmProvider === 'openai') return !isPrivateHost(s.llmBaseUrl || DEFAULT_OPENAI);
  return true;
}

export function llmReady(s) {
  if (!s) return false;
  return !needsKey(s) || !!(s.llmApiKey || s.llmKey);
}

function endpoint(s) {
  return (s.llmBaseUrl || s.llmEndpoint || DEFAULT_OPENAI).replace(/\/+$/, '');
}

function headersFor(s) {
  const h = { 'content-type': 'application/json' };
  const key = s.llmApiKey || s.llmKey;
  if (key) h.authorization = `Bearer ${key}`;
  return h;
}

/**
 * Gọi Google Gemini Native API (hỗ trợ Google Search Grounding miễn phí)
 */
async function callGeminiNative(s, system, messages, { maxTokens = 1200, useGoogleSearch = false, signal } = {}) {
  const apiKey = s.llmApiKey || s.llmKey;
  const preferred = s.llmModel && s.llmModel.startsWith('gemini') ? s.llmModel : 'gemini-2.5-flash';
  const candidates = [preferred, ...GEMINI_FALLBACK_MODELS.filter((m) => m !== preferred)];

  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String(m.content || '') }],
  }));

  let lastErr = null;
  for (const model of candidates) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const bodyObj = {
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: {
        temperature: 0.25,
        maxOutputTokens: maxTokens,
      },
    };
    if (useGoogleSearch) {
      bodyObj.tools = [{ google_search: {} }];
    }

    let res = await apiFetch(url, {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(bodyObj),
    });

    // Nếu model hoặc gói miễn phí không hỗ trợ tham số google_search tool trực tiếp, thử gọi lại không kèm tools
    if (!res.ok && useGoogleSearch && (res.status === 400 || res.status === 404)) {
      delete bodyObj.tools;
      res = await apiFetch(url, {
        method: 'POST',
        signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(bodyObj),
      });
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || `HTTP ${res.status}`;
      lastErr = httpError(res.status, msg, s);
      // Nếu lỗi 404 (model chưa mở trên vùng này), thử model Gemini tiếp theo
      if (res.status === 404 || /not found|not supported/i.test(msg)) continue;
      throw lastErr;
    }

    const cand = data.candidates?.[0];
    const parts = cand?.content?.parts || [];
    let text = parts.map((p) => p.text || '').join('\n').trim() || '(Không có nội dung phản hồi)';

    // Trích xuất nguồn tìm kiếm Google (nếu có groundingMetadata)
    const chunks = cand?.groundingMetadata?.groundingChunks || [];
    const webSources = chunks
      .map((c) => c.web)
      .filter((w) => w && w.uri && w.title)
      .slice(0, 4);
    if (webSources.length) {
      text += '\n\n**Nguồn tham khảo từ Google:**\n' + webSources.map((w) => `- ${w.title}: ${w.uri}`).join('\n');
    }
    return text;
  }
  throw lastErr || new Error('Không gọi được Gemini API.');
}

/**
 * Gọi hội thoại AI. Hỗ trợ Gemini Native (kèm Google Search), OpenAI-compatible và Anthropic.
 */
export async function chat(s, system, messages, { maxTokens = 1200, useGoogleSearch = false, signal } = {}) {
  try {
    const apiKey = s.llmApiKey || s.llmKey || '';
    if (s.llmProvider === 'gemini' || /^AIza/.test(apiKey)) {
      return await callGeminiNative(s, system, messages, { maxTokens, useGoogleSearch, signal });
    }
    if (s.llmProvider === 'anthropic') {
      const res = await apiFetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({ model: s.llmModel || 'claude-sonnet-4-20250514', max_tokens: maxTokens, system, messages }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw httpError(res.status, data?.error?.message, s);
      return (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim() || '(không có nội dung)';
    }
    const model = s.llmModel || 'gpt-4o-mini';
    const res = await apiFetch(`${endpoint(s)}/chat/completions`, {
      method: 'POST',
      signal,
      headers: headersFor(s),
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: system }, ...messages],
        temperature: 0.3,
        max_tokens: maxTokens,
        stream: false,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw httpError(res.status, data?.error?.message || data?.error, s);
    return data.choices?.[0]?.message?.content?.trim() || '(không có nội dung)';
  } catch (err) {
    signal?.throwIfAborted();
    throw friendly(err, s);
  }
}

export async function testConnection(s) {
  try {
    const apiKey = s.llmApiKey || s.llmKey || '';
    if (s.llmProvider === 'gemini' || /^AIza/.test(apiKey)) {
      if (!apiKey) {
        return {
          ok: false,
          message: 'Hãy dán Google Gemini API Key miễn phí (bắt đầu bằng AIza…) vào ô API Key rồi thử lại.',
          models: GEMINI_FALLBACK_MODELS,
        };
      }
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
      const res = await apiFetch(url);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw httpError(res.status, data?.error?.message, s);
      const models = (data.models || [])
        .map((m) => String(m.name || '').replace(/^models\//, ''))
        .filter((m) => /^gemini-(2\.5|2\.0|1\.5)-(flash|pro)/.test(m));
      return {
        ok: true,
        message: `Kết nối Google Gemini miễn phí thành công! (${models.length || 'nhiều'} model khả dụng, sẵn sàng phân tích & tìm kiếm Google).`,
        models: models.length ? models : GEMINI_FALLBACK_MODELS,
      };
    }
    if (s.llmProvider === 'anthropic') {
      await chat(s, 'Trả lời đúng một từ: OK', [{ role: 'user', content: 'ping' }], { maxTokens: 5 });
      return { ok: true, message: `Kết nối Claude thành công (model ${s.llmModel || 'claude-sonnet-4-20250514'}).`, models: [] };
    }
    const res = await apiFetch(`${endpoint(s)}/models`, { headers: headersFor(s) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw httpError(res.status, data?.error?.message || data?.error, s);
    const models = (data.data || data.models || []).map((m) => m.id || m.name).filter(Boolean);
    return {
      ok: true,
      message: `Kết nối thành công tới ${new URL(endpoint(s)).host}. ${models.length ? `Có ${models.length} model.` : ''}`,
      models,
    };
  } catch (err) {
    const e = friendly(err, s);
    return { ok: false, message: e.message, models: [] };
  }
}

export const testLlmConnection = testConnection;

function httpError(status, detail) {
  const e = new Error(typeof detail === 'string' ? detail : `HTTP ${status}`);
  e.status = status;
  e.raw = detail;
  return e;
}

function friendly(err, s) {
  if (err.friendly) return err;
  let msg;
  if (err.status === 400 && /api.?key|key not valid/i.test(err.message || '')) {
    msg = 'Gemini API Key không hợp lệ. Hãy lấy key miễn phí tại aistudio.google.com/apikey rồi dán vào mục Hệ thống → Cài đặt AI.';
  } else if (err.status === 401 || err.status === 403) {
    msg = `API key bị từ chối (${err.message || err.status}). Hãy kiểm tra lại API key trong tab Hệ thống → Cài đặt AI.`;
  } else if (err.status === 429) {
    msg = 'Đã chạm giới hạn tốc độ gọi API miễn phí (429). Vui lòng đợi vài giây rồi thử lại.';
  } else {
    msg = err.message || String(err);
  }
  const e = new Error(msg);
  e.friendly = true;
  e.status = err.status;
  return e;
}
