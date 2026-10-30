#!/usr/bin/env python3
"""
server.py — Máy chủ đa nền tảng (Windows, macOS, Linux, Android/iOS qua LAN):
  • Phục vụ ứng dụng web với kiểu MIME chuẩn
  • Tải & giải mã video từ YouTube, TikTok, Facebook, Instagram, MP4...
  • Hệ quản trị CSDL SQLite (`database/behavior_analysis.db`) + Lưu thư mục gói dữ liệu (`database/packages/<id>/`)
  • Endpoint `/api/google-search` hỗ trợ AI Chatbot tìm kiếm thông tin trên Google/Web
  • Proxy `/llm-proxy` cho Google Gemini API & LLM
"""
import argparse
import html
import http.server
import json
import os
import re
import shutil
import socketserver
import sqlite3
import sys
import threading
import urllib.error
import urllib.parse
import urllib.request
import webbrowser

MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".wasm": "application/wasm",
    ".bin": "application/octet-stream",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".zip": "application/zip",
    ".md": "text/markdown; charset=utf-8",
}

DB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "database")
DB_PATH = os.path.join(DB_DIR, "behavior_analysis.db")
PKG_DIR = os.path.join(DB_DIR, "packages")
_db_lock = threading.Lock()


def init_db():
    os.makedirs(PKG_DIR, exist_ok=True)
    with _db_lock, sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS analysis_packages (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                created_at TEXT,
                duration REAL,
                media_name TEXT,
                folder_path TEXT,
                payload_json TEXT NOT NULL
            )
            """
        )
        conn.commit()


def safe_slug(text):
    s = re.sub(r"[^a-zA-Z0-9_-]+", "-", str(text or "package")).strip("-")
    return s[:64] or "package"


def save_package_to_db(pkg):
    init_db()
    pkg_id = str(pkg.get("id") or "pkg_default")
    name = str(pkg.get("name") or "Gói phân tích")
    folder_name = f"{safe_slug(pkg_id)}_{safe_slug(name)}"
    folder_path = os.path.join(PKG_DIR, folder_name)
    os.makedirs(folder_path, exist_ok=True)

    # Ghi các file thành phần vào thư mục lưu trữ trên máy chủ
    with open(os.path.join(folder_path, "package.json"), "w", encoding="utf-8") as f:
        json.dump(pkg, f, ensure_ascii=False, indent=2)
    with open(os.path.join(folder_path, "steps_guide.json"), "w", encoding="utf-8") as f:
        json.dump(pkg.get("steps") or [], f, ensure_ascii=False, indent=2)
    with open(os.path.join(folder_path, "frames_skeleton.json"), "w", encoding="utf-8") as f:
        json.dump(pkg.get("frames") or [], f, ensure_ascii=False)

    csv_lines = ["id,personId,behavior,subLabel,startSec,endSec,startMs,endMs,durationMs,confidence,jointAngles,stepHint"]
    for s in pkg.get("segments") or []:
        row = [
            s.get("id", ""),
            s.get("personId", 1),
            s.get("behavior", ""),
            s.get("subLabel", ""),
            s.get("start", 0),
            s.get("end", 0),
            s.get("startMs", 0),
            s.get("endMs", 0),
            s.get("durationMs", 0),
            s.get("confidence", 0),
            s.get("jointAngles", ""),
            s.get("stepHint", ""),
        ]
        csv_lines.append(",".join('"' + str(v).replace('"', '""') + '"' for v in row))
    with open(os.path.join(folder_path, "segments_ms.csv"), "w", encoding="utf-8-sig") as f:
        f.write("\n".join(csv_lines))

    payload_str = json.dumps(pkg, ensure_ascii=False)
    with _db_lock, sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO analysis_packages
            (id, name, created_at, duration, media_name, folder_path, payload_json)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                pkg_id,
                name,
                pkg.get("createdAt") or "",
                float(pkg.get("duration") or 0),
                pkg.get("mediaName") or "",
                folder_path,
                payload_str,
            ),
        )
        conn.commit()
    return folder_path


def list_packages_from_db():
    init_db()
    with _db_lock, sqlite3.connect(DB_PATH) as conn:
        cur = conn.execute("SELECT payload_json FROM analysis_packages ORDER BY created_at DESC")
        out = []
        for (raw,) in cur.fetchall():
            try:
                out.append(json.loads(raw))
            except Exception:
                pass
        return out


def delete_package_from_db(pkg_id):
    init_db()
    with _db_lock, sqlite3.connect(DB_PATH) as conn:
        cur = conn.execute("SELECT folder_path FROM analysis_packages WHERE id = ?", (pkg_id,))
        row = cur.fetchone()
        if row and row[0] and os.path.isdir(row[0]):
            shutil.rmtree(row[0], ignore_errors=True)
        conn.execute("DELETE FROM analysis_packages WHERE id = ?", (pkg_id,))
        conn.commit()


def search_web_query(query):
    """Tìm kiếm thông tin kỹ thuật động tác / phân tích trên Web & Wikipedia tiếng Việt"""
    results = []
    q = (query or "").strip()
    if not q:
        return results

    # 1. Wikipedia Tiếng Việt API
    try:
        wiki_url = (
            "https://vi.wikipedia.org/w/api.php?action=query&list=search&utf8=1&format=json&srlimit=3&srsearch="
            + urllib.parse.quote(q)
        )
        req = urllib.request.Request(wiki_url, headers={"User-Agent": "behavior-analysis-ai/3.0"})
        with urllib.request.urlopen(req, timeout=4) as r:
            data = json.loads(r.read().decode("utf-8", errors="ignore"))
            for item in data.get("query", {}).get("search", []):
                title = item.get("title", "")
                snippet = re.sub(r"<[^>]+>", "", html.unescape(item.get("snippet", "")))
                page_url = f"https://vi.wikipedia.org/wiki/{urllib.parse.quote(title.replace(' ', '_'))}"
                if title and snippet:
                    results.append({"title": f"{title} — Wikipedia", "snippet": snippet, "url": page_url})
    except Exception:
        pass

    # 2. DuckDuckGo Lite / Instant Answer API
    try:
        ddg_url = "https://api.duckduckgo.com/?format=json&no_html=1&skip_disambig=1&q=" + urllib.parse.quote(q)
        req = urllib.request.Request(ddg_url, headers={"User-Agent": "behavior-analysis-ai/3.0"})
        with urllib.request.urlopen(req, timeout=4) as r:
            data = json.loads(r.read().decode("utf-8", errors="ignore"))
            if data.get("AbstractText"):
                results.append({
                    "title": data.get("Heading") or "Thông tin tổng hợp",
                    "snippet": data.get("AbstractText"),
                    "url": data.get("AbstractURL") or f"https://www.google.com/search?q={urllib.parse.quote(q)}",
                })
            for topic in (data.get("RelatedTopics") or [])[:3]:
                if isinstance(topic, dict) and topic.get("Text") and topic.get("FirstURL"):
                    results.append({
                        "title": topic.get("Text")[:65],
                        "snippet": topic.get("Text"),
                        "url": topic.get("FirstURL"),
                    })
    except Exception:
        pass

    # Luôn kèm liên kết tra cứu trực tiếp trên Google Search
    results.append({
        "title": "Xem trên Google",
        "snippet": "",
        "url": f"https://www.google.com/search?q={urllib.parse.quote(q)}",
    })
    return results[:5]


class Handler(http.server.SimpleHTTPRequestHandler):
    isolate = False

    def _proxy_allowed(self):
        import ipaddress
        try:
            ip = ipaddress.ip_address(self.client_address[0].replace("::ffff:", ""))
            return ip.is_loopback or ip.is_private or ip.is_link_local
        except ValueError:
            return False

    def do_GET(self):
        path_only = self.path.split("?", 1)[0]
        if path_only == "/api/packages":
            return self._json(200, {"ok": True, "packages": list_packages_from_db()})
        if path_only == "/video-prepare":
            from video_cache import prepare_request
            return prepare_request(self)
        if path_only == "/video-media":
            from social_video import media_request
            return media_request(self)
        if path_only == "/video-proxy":
            from video_proxy import relay
            return relay(self)
        if self.path.startswith("/llm-proxy"):
            return self._proxy("GET")
        return super().do_GET()

    def do_POST(self):
        path_only = self.path.split("?", 1)[0]
        if path_only == "/api/packages":
            try:
                n = int(self.headers.get("Content-Length") or 0)
                body = json.loads(self.rfile.read(n).decode("utf-8")) if n else {}
                folder = save_package_to_db(body)
                return self._json(200, {"ok": True, "folder": folder})
            except Exception as e:
                return self._json(500, {"ok": False, "error": str(e)})
        if path_only == "/api/google-search":
            try:
                n = int(self.headers.get("Content-Length") or 0)
                body = json.loads(self.rfile.read(n).decode("utf-8")) if n else {}
                results = search_web_query(body.get("query") or "")
                return self._json(200, {"ok": True, "results": results})
            except Exception as e:
                return self._json(200, {"ok": False, "results": [], "error": str(e)})
        if path_only == "/video-prepare":
            from video_cache import prepare_request
            return prepare_request(self)
        if path_only == "/video-resolve":
            from social_video import resolve_request
            return resolve_request(self)
        if self.path.startswith("/llm-proxy"):
            return self._proxy("POST")
        self.send_error(405)

    def do_DELETE(self):
        path_only = self.path.split("?", 1)[0]
        if path_only == "/api/packages":
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            pkg_id = (q.get("id") or [""])[0]
            if pkg_id:
                delete_package_from_db(pkg_id)
            return self._json(200, {"ok": True})
        self.send_error(405)

    def _proxy(self, method):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        if q.get("ping"):
            return self._json(200, {"ok": True, "proxy": "behavior-analysis"})
        if not self._proxy_allowed():
            return self._json(403, {"error": {"message": "Proxy chỉ phục vụ máy này và mạng nội bộ.", "proxy": True}})
        target = (q.get("url") or [""])[0]
        if not target.startswith(("http://", "https://")):
            return self._json(400, {"error": {"message": "Thiếu hoặc sai tham số url."}})
        body = None
        if method == "POST":
            n = int(self.headers.get("Content-Length") or 0)
            body = self.rfile.read(n) if n else b""
        fwd = {
            k: v
            for k, v in self.headers.items()
            if k.lower() in ("content-type", "authorization", "x-api-key", "x-goog-api-key", "anthropic-version", "anthropic-beta")
        }
        fwd["User-Agent"] = "behavior-analysis-proxy/3.0"
        req = urllib.request.Request(target, data=body, headers=fwd, method=method)
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                data, status, ctype = r.read(), r.status, r.headers.get("Content-Type", "application/json")
        except urllib.error.HTTPError as e:
            data, status, ctype = e.read(), e.code, e.headers.get("Content-Type", "application/json")
        except Exception as e:
            return self._json(
                502,
                {"error": {"message": f"Proxy không kết nối được tới {urllib.parse.urlparse(target).netloc}: {e}", "proxy": True}},
            )
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("X-LLM-Proxy", "1")
        self.end_headers()
        self.wfile.write(data)

    def _json(self, status, obj):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def guess_type(self, path):
        ext = os.path.splitext(path)[1].lower()
        return MIME.get(ext) or super().guess_type(path)

    def end_headers(self):
        if self.isolate:
            self.send_header("Cross-Origin-Opener-Policy", "same-origin")
            self.send_header("Cross-Origin-Embedder-Policy", "credentialless")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        if "--quiet" not in sys.argv:
            super().log_message(fmt, *args)


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main():
    ap = argparse.ArgumentParser(description="Máy chủ cho ứng dụng Phân tích hành vi & Hướng dẫn động tác AI")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--host", default="127.0.0.1", help="0.0.0.0 để máy khác trong mạng LAN truy cập")
    ap.add_argument("--isolate", action="store_true", help="bật COOP/COEP cho WASM đa luồng")
    ap.add_argument("--no-browser", action="store_true")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()

    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    init_db()
    Handler.isolate = args.isolate

    port = args.port
    for _ in range(10):
        try:
            httpd = Server((args.host, port), Handler)
            break
        except OSError:
            port += 1
    else:
        sys.exit("Không tìm được cổng trống.")

    url = f"http://localhost:{port}/"
    print(f"Ứng dụng đang chạy tại {url}  (Ctrl+C để dừng)")
    if args.isolate:
        print("Đã bật Cross-Origin Isolation: WASM đa luồng khả dụng.")
    if not args.no_browser:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nĐã dừng.")


if __name__ == "__main__":
    main()
