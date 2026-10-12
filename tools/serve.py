"""確認用のWebサーバー。アプリの画面に必要なファイルだけを見せる。

使い方:
  python3 tools/serve.py                 # このMacだけ（http://127.0.0.1:8765/）
  python3 tools/serve.py 192.168.x.x     # 同じWi-FiのiPadからも開ける

フォルダ内のExcel・PDF・.git などは、許可リストにないので見えない。
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent.parent
ALLOWED_FILES = {"index.html", "sw.js", "manifest.webmanifest"}
ALLOWED_DIRS = {"css", "js", "icons"}
ALLOWED_EXT = {".html", ".css", ".js", ".png", ".webmanifest"}


def allowed(url_path):
    rel = unquote(urlsplit(url_path).path).lstrip("/") or "index.html"
    p = Path(rel)
    if ".." in p.parts or p.suffix not in ALLOWED_EXT:
        return False
    if len(p.parts) == 1:
        return rel in ALLOWED_FILES
    return len(p.parts) == 2 and p.parts[0] in ALLOWED_DIRS


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".webmanifest": "application/manifest+json"}

    def do_GET(self):
        if not allowed(self.path):
            self.send_error(404)
            return
        super().do_GET()

    def do_HEAD(self):
        if not allowed(self.path):
            self.send_error(404)
            return
        super().do_HEAD()

    def list_directory(self, path):
        self.send_error(404)
        return None

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


if __name__ == "__main__":
    host = sys.argv[1] if len(sys.argv) > 1 else "127.0.0.1"
    port = 8765
    server = ThreadingHTTPServer((host, port), partial(Handler, directory=str(ROOT)))
    print(f"http://{host}:{port}/ で公開中（Ctrl+C で停止）", flush=True)
    server.serve_forever()
