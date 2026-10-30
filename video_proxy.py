"""Bounded-memory relay for public HTTP(S) videos, with byte-range support.

Resolve and pin the public IP on each hop; preserve TLS hostname verification.
No cookies, credentials or requests to local/private networks are forwarded.
"""
import http.client
import ipaddress
import re
import socket
import ssl
from urllib.parse import urlsplit, urljoin


def public_target(url):
    parsed = urlsplit(url)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError('Cần URL video HTTP/HTTPS công khai, không chứa tài khoản.')
    if parsed.port not in (None, 80, 443):
        raise ValueError('URL video chỉ hỗ trợ cổng 80/443.')
    port = parsed.port or (443 if parsed.scheme == 'https' else 80)
    addresses = socket.getaddrinfo(parsed.hostname, port, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
        raise ValueError('Proxy URL chỉ nhận máy chủ công khai; địa chỉ nội bộ bị từ chối.')
    return parsed, port, addresses[0][4][0]


def public_connection(url):
    """Dial the validated IP once; HTTPS still verifies the original hostname."""
    parsed, port, address = public_target(url)
    cls = http.client.HTTPSConnection if parsed.scheme == 'https' else http.client.HTTPConnection
    conn = cls(parsed.hostname, port, timeout=20)
    raw = socket.create_connection((address, port), timeout=20)
    try:
        conn.sock = ssl.create_default_context().wrap_socket(raw, server_hostname=parsed.hostname) if parsed.scheme == 'https' else raw
        return parsed, conn
    except Exception:
        raw.close()
        conn.close()
        raise


def open_video(url, range_header=None, source_headers=None):
    if range_header and not re.fullmatch(r'bytes=\d*-\d*', range_header):
        raise ValueError('Range không hợp lệ.')
    for _ in range(5):
        parsed, conn = public_connection(url)
        try:
            headers = {'User-Agent': 'BehaviorLens-video/2.2', 'Accept-Encoding': 'identity'}
            for key, value in (source_headers or {}).items():
                if key.lower() in ('user-agent', 'referer', 'origin', 'accept') and isinstance(value, str) and '\r' not in value and '\n' not in value:
                    headers[key] = value
            if range_header:
                headers['Range'] = range_header
            path = parsed.path or '/'
            if parsed.query:
                path += '?' + parsed.query
            conn.request('GET', path, headers=headers)
            response = conn.getresponse()
            if response.status in (301, 302, 303, 307, 308):
                location = response.getheader('Location')
                response.close()
                conn.close()
                if not location:
                    raise ValueError('Chuyển hướng không có địa chỉ đích.')
                url = urljoin(url, location)
                continue
            content_type = response.getheader('Content-Type', '').split(';')[0].lower()
            if response.status in (200, 206) and not (content_type.startswith('video/') or content_type in ('application/octet-stream', 'binary/octet-stream')):
                raise ValueError('URL không trả về file video trực tiếp.')
            return conn, response
        except Exception:
            conn.close()
            raise
    raise ValueError('Video chuyển hướng quá nhiều lần.')


def relay(handler, source=None):
    from urllib.parse import parse_qs
    q = parse_qs(urlsplit(handler.path).query)
    if not handler._proxy_allowed():
        return handler._json(403, {'error': 'Proxy chỉ phục vụ máy này và mạng nội bộ.'})
    if q.get('ping'):
        return handler._json(200, {'videoProxy': True})
    conn = response = None
    sent = False
    try:
        if source:
            conn, response = open_video(source['url'], handler.headers.get('Range'), source.get('headers'))
        else:
            conn, response = open_video((q.get('url') or [''])[0], handler.headers.get('Range'))
        handler.send_response(response.status)
        for key in ('Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges'):
            value = response.getheader(key)
            if value:
                handler.send_header(key, value)
        handler.send_header('Connection', 'close')
        handler.end_headers()
        sent = True
        handler.close_connection = True
        while True:
            chunk = response.read(64 * 1024)
            if not chunk:
                break
            handler.wfile.write(chunk)
    except (BrokenPipeError, ConnectionResetError):
        pass  # browser changed source or seek position
    except Exception as error:
        if not sent:
            handler._json(502, {'error': str(error)})
        else:
            handler.close_connection = True
    finally:
        if response:
            response.close()
        if conn:
            conn.close()
