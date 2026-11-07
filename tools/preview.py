"""Start/stop this checkout's loopback preview without killing other servers."""
import argparse
import functools
import hashlib
import http.server
import json
import os
import pathlib
import secrets
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
import webbrowser

ROOT = pathlib.Path(__file__).resolve().parents[1]
IDENTITY = hashlib.sha256(str(ROOT).casefold().encode()).hexdigest()[:20]


def request(port, path, token=None):
    headers = {'Authorization': f'Bearer {token}'} if token else {}
    req = urllib.request.Request(f'http://127.0.0.1:{port}{path}',
                                 data=b'' if token else None, headers=headers)
    with urllib.request.urlopen(req, timeout=1) as response:
        return json.load(response)


def running(port):
    try:
        status = request(port, '/__preview/status')
        return isinstance(status, dict) and status.get('checkout') == IDENTITY
    except (OSError, ValueError):
        return False


def serve(port, state_file):
    token = secrets.token_urlsafe(32)

    class Handler(http.server.SimpleHTTPRequestHandler):
        def end_headers(self):
            self.send_header('Cache-Control', 'no-store')
            super().end_headers()

        def reply(self, value, status=200):
            body = json.dumps(value).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path == '/__preview/status':
                self.reply({'checkout': IDENTITY, 'pid': os.getpid()})
            else:
                super().do_GET()

        def do_POST(self):
            if self.path != '/__preview/stop':
                self.reply({'error': 'Not found'}, 404)
            elif not secrets.compare_digest(self.headers.get('Authorization', ''), f'Bearer {token}'):
                self.reply({'error': 'Forbidden'}, 403)
            else:
                self.reply({'stopping': True})
                threading.Thread(target=self.server.shutdown, daemon=True).start()

    class Server(http.server.ThreadingHTTPServer):
        allow_reuse_address = False

        def server_bind(self):
            if os.name == 'nt':
                self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
            super().server_bind()

    server = Server(
        ('127.0.0.1', port), functools.partial(Handler, directory=str(ROOT)))
    state_file.write_text(json.dumps({'token': token, 'pid': os.getpid()}), encoding='utf-8')
    try:
        server.serve_forever(poll_interval=.1)
    finally:
        server.server_close()
        try:
            if json.loads(state_file.read_text(encoding='utf-8'))['token'] == token:
                state_file.unlink()
        except (OSError, ValueError, KeyError):
            pass


def main():
    parser = argparse.ArgumentParser()
    action = parser.add_mutually_exclusive_group()
    action.add_argument('--serve', action='store_true')
    action.add_argument('--stop', action='store_true')
    action.add_argument('--status', action='store_true')
    parser.add_argument('--no-open', action='store_true')
    parser.add_argument('--port', type=int, default=4173)
    args = parser.parse_args()
    state_file = pathlib.Path(tempfile.gettempdir()) / f'inho-preview-{IDENTITY}-{args.port}.json'
    url = f'http://localhost:{args.port}'
    if args.serve:
        serve(args.port, state_file)
        return 0
    if args.status:
        print(f'{"Running" if running(args.port) else "Stopped"}: {url}')
        return 0
    if args.stop:
        if not running(args.port):
            print('This preview is already stopped. No other process was touched.')
            return 0
        try:
            token = json.loads(state_file.read_text(encoding='utf-8'))['token']
            request(args.port, '/__preview/stop', token)
        except (OSError, ValueError, KeyError) as error:
            print(f'Could not stop this preview: {error}')
            return 1
        for _ in range(40):
            if not running(args.port):
                print('Preview stopped.')
                return 0
            time.sleep(.1)
        print('Shutdown has not completed. Try again shortly.')
        return 1
    if not running(args.port):
        log_file = state_file.with_suffix('.log')
        with log_file.open('a', encoding='utf-8') as log:
            process = subprocess.Popen(
                [sys.executable, str(pathlib.Path(__file__).resolve()), '--serve', '--port', str(args.port)],
                cwd=ROOT, stdout=log, stderr=log, stdin=subprocess.DEVNULL,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        for _ in range(50):
            if running(args.port):
                break
            if process.poll() is not None:
                print(f'Could not start preview. Port {args.port} may be in use. Details: {log_file}')
                return 1
            time.sleep(.1)
        else:
            print(f'Preview did not become ready. Details: {log_file}')
            return 1
    print(f'Preview running: {url}\nUse preview-stop.bat to stop it.')
    if not args.no_open:
        webbrowser.open(url)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
