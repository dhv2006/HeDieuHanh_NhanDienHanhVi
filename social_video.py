"""Resolve a single public platform video to a same-origin, seekable stream.

yt-dlp is optional and runs in a bounded subprocess with no user config,
plugins, login cookies, downloads or playlists. Metadata lives only in RAM.
"""
import importlib.util
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys
import threading
import time
from urllib.parse import parse_qs, urlsplit
from public_egress import public_proxy
from video_proxy import public_target, relay

ROOT = Path(__file__).resolve().parent
SLOTS = threading.BoundedSemaphore(1)
LOCK = threading.Lock()
SOURCES = {}
TTL = 2 * 60 * 60
FAMILIES = ('youtube.com', 'youtu.be', 'tiktok.com', 'facebook.com', 'fb.watch', 'fb.com')
# A single HTTP MP4/WebM asset; video-only is sufficient for behavior analysis.
# HLS/DASH manifests and format merging would require an additional media pipeline.
FORMAT = ('best[ext=mp4][vcodec^=avc1][protocol^=http][protocol!*=dash][height<=720]/'
          'bestvideo[ext=mp4][vcodec^=avc1][protocol^=http][protocol!*=dash][height<=720]/'
          'best[ext=mp4][vcodec!=none][protocol^=http][protocol!*=dash][height<=720]/'
          'bestvideo[ext=mp4][vcodec!=none][protocol^=http][protocol!*=dash][height<=720]/'
          'best[ext=webm][vcodec!=none][protocol^=http][protocol!*=dash][height<=720]/'
          'bestvideo[ext=webm][vcodec!=none][protocol^=http][protocol!*=dash][height<=720]')


class VideoLinkError(Exception):
    def __init__(self, message, status=422):
        super().__init__(message)
        self.status = status


def validate_page(url):
    if not isinstance(url, str) or len(url) > 4096:
        raise VideoLinkError('Liên kết video không hợp lệ.', 400)
    try:
        p = urlsplit(url.strip())
        if p.scheme not in ('http', 'https') or p.username or p.password or p.port not in (None, 80, 443):
            raise ValueError()
        host = (p.hostname or '').lower()
        if not any(host == family or host.endswith('.' + family) for family in FAMILIES):
            raise ValueError()
        if host.endswith('youtube.com') and p.path == '/playlist':
            raise VideoLinkError('Hãy gửi một video hoặc Shorts cụ thể, không dùng playlist.', 400)
        return p.geturl()
    except ValueError:
        raise VideoLinkError('Nhận liên kết YouTube, TikTok hoặc Facebook công khai.', 400) from None


def extractor_command():
    env_python = ROOT / '.video-env' / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
    if env_python.is_file() and (ROOT / '.video-env' / 'runtime.json').is_file():
        return [str(env_python), '-m', 'yt_dlp']
    if importlib.util.find_spec('yt_dlp'):
        return [sys.executable, '-m', 'yt_dlp']
    executable = shutil.which('yt-dlp')
    if executable:
        return [executable]
    raise VideoLinkError('Máy chủ chưa cài bộ đọc liên kết video. Chạy setup_video_urls.bat trên laptop (macOS/Linux: python3 tools/install_video_urls.py), rồi khởi động lại server.py.', 503)


def runtime_options():
    node = shutil.which('node')
    if not node:
        try:
            node = json.loads((ROOT / '.video-env' / 'runtime.json').read_text(encoding='utf-8')).get('node')
            if not node or not Path(node).is_file():
                node = None
        except (OSError, ValueError):
            pass
    return ['--js-runtimes', 'node:' + node] if node else []


def extraction_error(stderr):
    text = stderr.lower()
    if 'not a bot' in text or 'captcha' in text or 'confirm you' in text:
        return 'Nền tảng yêu cầu xác minh chống bot khi máy chủ lấy video. Video vẫn có thể công khai; hãy thử lại sau hoặc tải file lên để phân tích.'
    if any(s in text for s in ('sign in', 'login', 'log in', 'private video', 'not available', 'confirm you', 'captcha')):
        return 'Nền tảng yêu cầu đăng nhập/xác minh hoặc video không công khai. Hãy dùng video công khai khác hoặc tải file lên.'
    if 'requested format' in text or 'no video formats' in text:
        return 'Video này chưa có nguồn MP4/WebM tương thích để phân tích. Hãy tải file MP4 lên.'
    return 'Chưa lấy được video từ nền tảng. Kiểm tra liên kết video cụ thể; thử cập nhật bộ đọc bằng setup_video_urls.bat hoặc tải file lên.'


def resolve(url):
    url = validate_page(url)
    command = extractor_command()
    if not SLOTS.acquire(blocking=False):
        raise VideoLinkError('Máy chủ đang mở một liên kết khác. Thử lại sau ít giây.', 429)
    try:
        with public_proxy() as proxy:
            args = command + ['--ignore-config', '--no-plugin-dirs', '--no-playlist',
                '--playlist-items', '1', '--no-cache-dir', '--no-warnings', '--skip-download',
                '--dump-single-json', '--socket-timeout', '15', '--retries', '1',
                '--extractor-retries', '1', '--proxy', proxy,
                '--use-extractors', 'youtube.*,tiktok.*,facebook.*,generic',
                '--format', FORMAT] + runtime_options() + ['--', url]
            result = subprocess.run(args, capture_output=True, text=True, encoding='utf-8',
                errors='replace', timeout=75, cwd=ROOT,
                creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        if result.returncode:
            raise VideoLinkError(extraction_error(result.stderr))
        if len(result.stdout) > 8 * 1024 * 1024:
            raise VideoLinkError('Thông tin video quá lớn. Hãy dùng một video cụ thể.')
        info = json.loads(result.stdout)
        if not isinstance(info, dict):
            raise VideoLinkError('Thông tin video không hợp lệ.')
        if info.get('_type') in ('playlist', 'multi_video') or info.get('entries') is not None:
            raise VideoLinkError('Hãy gửi liên kết một video cụ thể, không dùng trang cá nhân/playlist.')
        if info.get('is_live') or info.get('live_status') in ('is_live', 'is_upcoming') or info.get('has_drm'):
            raise VideoLinkError('Chỉ phân tích video đã đăng, không hỗ trợ livestream hoặc video DRM.')
        media_url = info.get('url')
        if not isinstance(media_url, str) or not media_url or len(media_url) > 16384 or info.get('protocol') not in ('http', 'https') or info.get('ext') not in ('mp4', 'webm'):
            raise VideoLinkError('Không có nguồn video trực tiếp tương thích. Hãy tải file MP4 lên.')
        public_target(media_url)
        raw_headers = info.get('http_headers')
        if not isinstance(raw_headers, dict):
            raw_headers = {}
        headers = {k: v for k, v in raw_headers.items()
                   if k.lower() in ('user-agent', 'referer', 'origin', 'accept')
                   and isinstance(v, str) and len(v) < 4096 and '\r' not in v and '\n' not in v}
        token = secrets.token_urlsafe(24)
        now = time.monotonic()
        with LOCK:
            for old in list(SOURCES):
                if SOURCES[old]['expires'] <= now:
                    del SOURCES[old]
            while len(SOURCES) >= 64:
                SOURCES.pop(next(iter(SOURCES)))
            SOURCES[token] = {'url': media_url, 'headers': headers, 'expires': now + TTL}
        name = str(info.get('title') or 'Video từ liên kết')[:180]
        return {'src': '/video-media?token=' + token, 'name': name,
                'videoOnly': info.get('acodec') == 'none'}
    except subprocess.TimeoutExpired:
        raise VideoLinkError('Nền tảng phản hồi quá lâu. Thử lại hoặc tải file video lên.', 504) from None
    except (ValueError, OSError, TypeError):
        raise VideoLinkError('Không đọc được nguồn video công khai. Kiểm tra kết nối hoặc tải file lên.') from None
    finally:
        SLOTS.release()


def resolve_request(handler):
    if not handler._proxy_allowed():
        return handler._json(403, {'error': 'Máy chủ chỉ phục vụ máy này và mạng nội bộ.'})
    try:
        if handler.headers.get('Transfer-Encoding'):
            raise VideoLinkError('Yêu cầu không hợp lệ.', 400)
        size = int(handler.headers.get('Content-Length') or 0)
        if not 0 < size <= 8192:
            raise VideoLinkError('Liên kết video quá dài hoặc bị thiếu.', 400)
        handler.connection.settimeout(10)
        body = handler.rfile.read(size)
        if len(body) != size:
            raise VideoLinkError('Yêu cầu không hoàn chỉnh.', 400)
        payload = json.loads(body)
        if not isinstance(payload, dict):
            raise VideoLinkError('Yêu cầu không hợp lệ.', 400)
        return handler._json(200, resolve(payload.get('url')))
    except VideoLinkError as err:
        return handler._json(err.status, {'error': str(err)})
    except (ValueError, OSError):
        return handler._json(400, {'error': 'Yêu cầu video không hợp lệ.'})


def media_request(handler):
    query = parse_qs(urlsplit(handler.path).query)
    token = (query.get('token') or [''])[0]
    if query.get('cached') == ['1']:
        from video_cache import serve
        return serve(handler, token)
    with LOCK:
        source = SOURCES.get(token)
        if source and source['expires'] <= time.monotonic():
            del SOURCES[token]
            source = None
    if not source:
        return handler._json(410, {'error': 'Liên kết video đã hết hạn. Mở lại URL để tiếp tục.'})
    return relay(handler, source)
