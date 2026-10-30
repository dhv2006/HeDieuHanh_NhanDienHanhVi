"""Short-lived, loopback-only HTTP proxy for the video extractor.

Every HTTP request and HTTPS CONNECT pins a public IP. In particular, a short
link redirect cannot make the extractor fetch localhost or cloud metadata.
No TLS interception; the extractor validates remote certificates itself.
"""
import contextlib
import http.client
import http.server
import select
import socket
import threading
import time
from video_proxy import public_connection, public_target


class EgressHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_CONNECT(self):
        upstream = None
        established = False
        try:
            _, port, address = public_target('https://' + self.path)
            upstream = socket.create_connection((address, port), timeout=15)
            self.send_response(200, 'Connection established')
            self.end_headers()
            established = True
            self.connection.settimeout(15)
            upstream.settimeout(15)
            deadline = time.monotonic() + 85
            while time.monotonic() < deadline:
                ready, _, _ = select.select([self.connection, upstream], [], [], 15)
                if not ready:
                    break
                for source in ready:
                    data = source.recv(65536)
                    if not data:
                        return
                    (upstream if source is self.connection else self.connection).sendall(data)
        except (OSError, ValueError, http.client.HTTPException):
            if not established:
                self.send_error(403, 'Public HTTP(S) servers only')
        finally:
            self.close_connection = True
            if upstream:
                upstream.close()

    def do_GET(self):
        self.forward()

    def do_HEAD(self):
        self.forward()

    def do_POST(self):
        self.forward()

    def forward(self):
        conn = response = None
        sent = False
        try:
            if self.headers.get('Transfer-Encoding'):
                raise ValueError('Chunked request not supported')
            size = int(self.headers.get('Content-Length') or 0)
            if not 0 <= size <= 1024 * 1024:
                raise ValueError('Request too large')
            self.connection.settimeout(15)
            body = self.rfile.read(size) if size else None
            if body is not None and len(body) != size:
                raise ValueError('Incomplete request')
            parsed, conn = public_connection(self.path)
            headers = {k: v for k, v in self.headers.items()
                       if k.lower() not in ('host', 'connection', 'proxy-authorization',
                                           'proxy-connection', 'transfer-encoding', 'accept-encoding', 'content-length')}
            headers['Accept-Encoding'] = 'identity'
            path = parsed.path or '/'
            if parsed.query:
                path += '?' + parsed.query
            conn.request(self.command, path, body=body, headers=headers)
            response = conn.getresponse()
            self.send_response(response.status)
            for key, value in response.getheaders():
                if key.lower() not in ('connection', 'transfer-encoding', 'keep-alive', 'proxy-authenticate'):
                    self.send_header(key, value)
            self.send_header('Connection', 'close')
            self.end_headers()
            sent = True
            if self.command != 'HEAD':
                while chunk := response.read(65536):
                    self.wfile.write(chunk)
        except (OSError, ValueError, http.client.HTTPException):
            if not sent:
                self.send_error(403, 'Public HTTP(S) servers only')
        finally:
            self.close_connection = True
            if response:
                response.close()
            if conn:
                conn.close()


class EgressServer(http.server.ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self):
        self.slots = threading.BoundedSemaphore(16)
        super().__init__(('127.0.0.1', 0), EgressHandler)

    def process_request(self, request, client_address):
        if not self.slots.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self.slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.slots.release()


@contextlib.contextmanager
def public_proxy():
    server = EgressServer()
    thread = threading.Thread(target=server.serve_forever, kwargs={'poll_interval': .1}, daemon=True)
    thread.start()
    try:
        yield 'http://127.0.0.1:' + str(server.server_port)
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=1)
