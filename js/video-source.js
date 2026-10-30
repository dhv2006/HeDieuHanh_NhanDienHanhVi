export function parseVideoUrl(value) {
  const url = new URL(value.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Chỉ nhận URL video HTTP/HTTPS không chứa tài khoản/mật khẩu.');
  }
  const host = url.hostname.toLowerCase();
  if (/(^|\.)vimeo\.com$/.test(host)) {
    throw new Error('Trang này chưa được hỗ trợ. Hãy dùng URL trực tiếp MP4/WebM hoặc tải file lên.');
  }
  return url;
}

export const isPlatformVideoUrl = (url) => /(^|\.)(youtube\.com|youtu\.be|tiktok\.com|facebook\.com|fb\.watch|fb\.com)$/.test(url.hostname.toLowerCase());

export function videoErrorMessage(error) {
  if (error instanceof TypeError && /fetch|network|load failed/i.test(error.message)) {
    return 'Không kết nối được tới máy chủ video. Kiểm tra server.py đang chạy và kết nối localhost/Cloudflare, rồi thử lại.';
  }
  return error?.message || 'Không đọc được video.';
}

export async function resolvePlatformVideo(url, signal) {
  const response = await fetch('video-resolve', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: url.href }), signal,
  }).catch((error) => { signal?.throwIfAborted(); throw new Error(videoErrorMessage(error)); });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) {
    throw new Error(result?.error || 'Chức năng liên kết YouTube/TikTok/Facebook cần máy chủ server.py bản mới. Khởi động lại máy chủ trên laptop rồi thử lại.');
  }
  if (typeof result.src !== 'string' || !/^\/video-media\?token=[A-Za-z0-9_-]+$/.test(result.src)) {
    throw new Error('Máy chủ chưa trả về nguồn video hợp lệ.');
  }
  return { src: result.src, name: String(result.name || 'Video từ liên kết'), videoOnly: !!result.videoOnly };
}

// Optional complete-file mode. Streaming analysis does not call this endpoint.
export async function preparePlatformVideo(source, signal, onProgress = () => {}) {
  const url = new URL(source, location.href);
  if (url.origin !== location.origin || url.pathname !== '/video-media' || url.searchParams.get('cached') === '1') return null;
  const token = url.searchParams.get('token');
  if (!token || !/^[A-Za-z0-9_-]+$/.test(token)) throw new Error('Nguồn video không hợp lệ.');
  const endpoint = 'video-prepare?token=' + encodeURIComponent(token);
  const deadline = Date.now() + 210000;
  let method = 'POST';
  while (true) {
    signal?.throwIfAborted();
    if (Date.now() >= deadline) throw new Error('Chuẩn bị video quá lâu. Hãy thử lại hoặc tải file lên.');
    const request = new AbortController();
    const abort = () => request.abort(signal.reason);
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => request.abort(new Error('Máy chủ video không phản hồi. Kiểm tra kết nối rồi thử lại.')), 10000);
    let result;
    try {
      const response = await fetch(endpoint, { method, signal: request.signal, cache: 'no-store' });
      result = await response.json().catch(() => null);
      if (!response.ok || !result) throw new Error(result?.error || 'Cần khởi động lại server.py bản mới để chuẩn bị video URL.');
    } catch (error) {
      signal?.throwIfAborted();
      throw new Error(videoErrorMessage(error));
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
    if (result.state === 'error') throw new Error(result.error || 'Không tải đủ video để phân tích.');
    if (result.state === 'ready') return '/video-media?token=' + token + '&cached=1';
    if (result.state !== 'loading') throw new Error('Trạng thái chuẩn bị video không hợp lệ.');
    onProgress(result.received || 0, result.total || 0);
    await new Promise((resolve, reject) => {
      const cleanup = () => signal?.removeEventListener('abort', abortWait);
      const abortWait = () => { clearTimeout(wait); cleanup(); reject(signal.reason); };
      const wait = setTimeout(() => { cleanup(); resolve(); }, 350);
      signal?.addEventListener('abort', abortWait, { once: true });
      if (signal?.aborted) abortWait();
    });
    method = 'GET';
  }
}

export function waitForMedia(video, event, timeout = 15000, signal) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener(event, done);
      video.removeEventListener('error', fail);
      signal?.removeEventListener('abort', abort);
    };
    const done = () => { cleanup(); resolve(); };
    const fail = () => {
      cleanup();
      const messages = {
        1: 'Đã hủy tải video.',
        2: 'Kết nối tải video bị gián đoạn.',
        3: 'Không giải mã được khung video.',
        4: 'Nguồn hoặc định dạng video không đọc được.',
      };
      const error = new Error(messages[video.error?.code] || 'Không đọc được video: kiểm tra URL, định dạng và quyền truy cập.');
      error.mediaCode = video.error?.code || null;
      reject(error);
    };
    const abort = () => { cleanup(); reject(signal.reason || new DOMException('Đã hủy mở video.', 'AbortError')); };
    const timer = setTimeout(() => {
      cleanup();
      const error = new Error('Video phản hồi quá lâu. Kiểm tra kết nối hoặc mở lại URL.');
      error.mediaTimeout = true;
      reject(error);
    }, timeout);
    video.addEventListener(event, done, { once: true });
    video.addEventListener('error', fail, { once: true });
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}

export async function seekVideoFrame(video, t, signal) {
  signal?.throwIfAborted();
  const mediaError = video.error;
  if (mediaError) {
    const error = new Error(`Không đọc được video (mã ${mediaError.code}). Mở lại nguồn video.`);
    error.mediaCode = mediaError.code;
    throw error;
  }
  if (Math.abs(video.currentTime - t) < 0.001 && video.readyState >= 2) return;
  // Cancel event listeners even if assigning currentTime itself throws.
  const pending = new AbortController();
  const abort = () => pending.abort(signal.reason);
  signal?.addEventListener('abort', abort, { once: true });
  const waiting = waitForMedia(video, 'seeked', 15000, pending.signal);
  try {
    try { video.currentTime = t; }
    catch (error) { pending.abort(error); }
    await waiting;
  } finally { signal?.removeEventListener('abort', abort); }
}

// Retry only interrupted/timed-out media reads; AI/decoder errors stay errors.
// Recovery must finish before grabbing pixels so frames keep the correct time.
export async function seekVideoWithRecovery(video, t, signal, recover) {
  try { await seekVideoFrame(video, t, signal); }
  catch (error) {
    signal?.throwIfAborted();
    if (!recover || !(error.mediaCode === 2 || error.mediaTimeout)) throw error;
    if (!await recover(error)) throw error;
    signal?.throwIfAborted();
    await seekVideoFrame(video, t, signal);
  }
}

export async function attachVideoSource(video, source, remote = false, signal) {
  signal?.throwIfAborted();
  video.pause();
  video.crossOrigin = remote ? 'anonymous' : null;
  const loaded = waitForMedia(video, 'loadeddata', 15000, signal);
  video.src = source;
  video.load();
  await loaded;
  // Playback alone does not prove AI can read pixels (CORS).
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, 1, 1);
  ctx.getImageData(0, 0, 1, 1);
}
