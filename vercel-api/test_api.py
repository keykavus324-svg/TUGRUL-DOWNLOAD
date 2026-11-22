"""Vercel proxy API — yerel uçtan uca test.

Gerçek modülü (vercel-api/api/index.py) yükler, Range destekli bir kaynak sunucu
ve uvicorn'u ayağa kaldırır, ardından arayüzün kullanacağı akışı birebir yürütür:

    /api/health → /api/info → /api/resolve → /api/stream (parça parça) → dosya

Çalıştırma:  python vercel-api/test_api.py
"""
from __future__ import annotations

import functools
import importlib.util
import os
import pathlib
import socket
import sys
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = pathlib.Path(__file__).resolve().parent.parent
SAMPLE_DIR = ROOT / "frontend" / "public" / "sample"
SAMPLE = "tugrul-demo.mp4"
CHUNK = 64 * 1024  # küçük parça → çok adımlı birleştirme de test edilir


class RangeHandler(SimpleHTTPRequestHandler):
    """yt-dlp'nin generic çıkarıcısı ve /api/stream için Range destekli sunucu."""

    def do_GET(self) -> None:  # noqa: N802
        path = pathlib.Path(self.translate_path(self.path))
        if not path.is_file():
            self.send_error(404)
            return
        size = path.stat().st_size
        rng = self.headers.get("Range", "")
        if rng.startswith("bytes="):
            a, _, b = rng[6:].partition("-")
            start = int(a or 0)
            end = int(b) if b else size - 1
            end = min(end, size - 1)
            self.send_response(206)
            self.send_header("Content-Type", "video/mp4")
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            self.send_header("Content-Length", str(end - start + 1))
            self.end_headers()
            with path.open("rb") as fh:
                fh.seek(start)
                self.wfile.write(fh.read(end - start + 1))
            return
        self.send_response(200)
        self.send_header("Content-Type", "video/mp4")
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(size))
        self.end_headers()
        with path.open("rb") as fh:
            self.wfile.write(fh.read())

    def log_message(self, *args) -> None:  # sessiz
        pass


def free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def main() -> int:
    import httpx
    import uvicorn

    # 1) kaynak sunucu
    origin_port = free_port()
    origin = ThreadingHTTPServer(
        ("127.0.0.1", origin_port),
        functools.partial(RangeHandler, directory=str(SAMPLE_DIR)),
    )
    threading.Thread(target=origin.serve_forever, daemon=True).start()
    media_url = f"http://127.0.0.1:{origin_port}/{SAMPLE}"

    # 2) API (gerçek modül)
    os.environ["TUG_EXTRA_HOSTS"] = "127.0.0.1"
    os.environ["TUG_CHUNK"] = str(CHUNK)
    os.environ["TUG_SECRET"] = "local-test-secret"
    spec = importlib.util.spec_from_file_location(
        "tug_api", str(ROOT / "vercel-api" / "api" / "index.py")
    )
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    api_port = free_port()
    config = uvicorn.Config(mod.app, host="127.0.0.1", port=api_port, log_level="warning")
    server = uvicorn.Server(config)
    threading.Thread(target=server.run, daemon=True).start()
    base = f"http://127.0.0.1:{api_port}"

    for _ in range(100):
        try:
            httpx.get(f"{base}/api/health", timeout=1.0)
            break
        except Exception:
            time.sleep(0.1)
    else:
        print("FAIL: API ayağa kalkmadı")
        return 1

    failures: list[str] = []
    source = (SAMPLE_DIR / SAMPLE).read_bytes()

    with httpx.Client(timeout=60) as c:
        # --- health -------------------------------------------------------
        h = c.get(f"{base}/api/health").json()
        print("health:", h)
        if not h.get("ok"):
            failures.append("health ok değil")
        if h.get("engine") != "yt-dlp":
            failures.append(f"engine={h.get('engine')}")
        if h.get("chunk") != CHUNK:
            failures.append(f"chunk={h.get('chunk')} != {CHUNK}")

        # --- info ---------------------------------------------------------
        info = c.post(f"{base}/api/info", json={"url": media_url})
        print("info:", info.status_code, str(info.json())[:200])
        if info.status_code != 200:
            failures.append(f"info {info.status_code}: {info.text[:200]}")
            return _finish(failures, origin, server)
        data = info.json()
        for key in ("title", "duration_text", "videos", "audios"):
            if key not in data:
                failures.append(f"info alanında '{key}' yok")

        # GET takma adı (tarayıcıdan doğrulama için)
        info_get = c.get(f"{base}/api/info", params={"url": media_url})
        if info_get.status_code != 200:
            failures.append(f"GET /api/info {info_get.status_code}")

        # --- resolve ------------------------------------------------------
        res = c.post(f"{base}/api/resolve", json={"url": media_url, "format_id": ""})
        print("resolve:", res.status_code, str(res.json())[:160])
        if res.status_code != 200:
            failures.append(f"resolve {res.status_code}: {res.text[:200]}")
            return _finish(failures, origin, server)
        token = res.json()["token"]

        # sahte imzalı belirteç reddedilmeli
        bad = c.get(f"{base}/api/stream", params={"token": token[:-4] + "0000", "start": 0, "length": 100})
        if bad.status_code != 403:
            failures.append(f"sahte belirteç {bad.status_code} (403 bekleniyordu)")

        # --- stream: parça parça indir ve birleştir -----------------------
        parts: list[bytes] = []
        offset = 0
        total = 0
        guard = 0
        while True:
            r = c.get(f"{base}/api/stream", params={"token": token, "start": offset, "length": CHUNK})
            if r.status_code not in (200, 206):
                failures.append(f"stream {r.status_code}: {r.text[:160]}")
                break
            total = int(r.headers.get("X-Tug-Total") or 0)
            parts.append(r.content)
            offset += len(r.content)
            guard += 1
            if not r.content or (total and offset >= total) or guard > 200:
                break
        blob = b"".join(parts)
        print(f"stream: {len(parts)} parça, {len(blob)} bayt, X-Tug-Total={total}, kaynak={len(source)}")
        if len(blob) != len(source):
            failures.append(f"boyut {len(blob)} != {len(source)}")
        if blob != source:
            failures.append("baytlar kaynakla aynı değil")
        if total != len(source):
            failures.append(f"X-Tug-Total {total} != {len(source)}")

        # --- Vercel öneki (/api/index/...) aynı uca düşmeli ---------------
        prefixed = c.get(f"{base}/api/index/api/health")
        print("prefix /api/index/api/health:", prefixed.status_code, str(prefixed.json())[:80])
        if prefixed.status_code != 200 or not prefixed.json().get("ok"):
            failures.append("prefix /api/index/api/health çalışmadı")
        pr_stream = c.get(
            f"{base}/api/index/api/stream",
            params={"token": token, "start": 0, "length": 1024},
        )
        if pr_stream.status_code != 206 or len(pr_stream.content) != 1024:
            failures.append(
                f"prefix /api/index/api/stream {pr_stream.status_code} {len(pr_stream.content)}"
            )

        # --- probe (tek istekle uçtan uca) --------------------------------
        pr = c.get(f"{base}/api/probe", params={"url": media_url})
        print("probe:", pr.status_code, str(pr.json())[:220])
        if pr.status_code != 200 or not pr.json().get("ok"):
            failures.append(f"probe başarısız: {pr.text[:200]}")

        # --- izin verilmeyen adres ---------------------------------------
        blocked = c.post(f"{base}/api/resolve", json={"url": "https://evil.example/x.mp4"})
        if blocked.status_code == 200 and "token" in blocked.json():
            tok = blocked.json()["token"]
            st = c.get(f"{base}/api/stream", params={"token": tok, "start": 0, "length": 100})
            if st.status_code in (200, 206):
                failures.append("izinli olmayan adres proxy'lendi")
        print("izinli olmayan adres:", blocked.status_code, blocked.text[:120])

    return _finish(failures, origin, server)


def _finish(failures: list[str], origin, server) -> int:
    server.should_exit = True
    origin.shutdown()
    if failures:
        print("\nFAIL:")
        for f in failures:
            print("  -", f)
        return 1
    print("\nPASS — uçtan uca akış (info → resolve → stream → birleştirme) doğrulandı")
    return 0


if __name__ == "__main__":
    sys.exit(main())
