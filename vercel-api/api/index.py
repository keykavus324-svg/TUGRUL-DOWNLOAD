"""
TUĞRUL DOWNLOAD — Vercel proxy API (gerçek yt-dlp motoru, sunucusuz).

Arayüz (GitHub Pages / APK) bu API'ye bağlanarak gerçek sitelerden indirme yapar:

  POST /api/info     → bağlantıyı çözer (başlık, süre, formatlar)
  POST /api/resolve  → seçilen akış için imzalı doğrudan URL üretir
  GET  /api/stream   → imzalı URL'den bayt aralığı (Range) proxy'si
  GET  /api/health   → motor durumu

Serverless yanıt sınırı (~4.5 MB) nedeniyle istemci dosyayı parça parça çeker
ve tarayıcıda birleştirir. URL'ler HMAC ile imzalanır → açık proxy değildir.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import time
from typing import Any
from urllib.parse import quote, unquote

import httpx
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, StreamingResponse
from pydantic import BaseModel

try:  # yt-dlp build sırasında kurulur
    import yt_dlp
except Exception:  # pragma: no cover
    yt_dlp = None  # type: ignore

APP_VERSION = "1.0.0"
CHUNK = int(os.environ.get("TUG_CHUNK", str(3 * 1024 * 1024)))  # 3 MB
SECRET = (os.environ.get("TUG_SECRET") or "tugrul-download-dev-secret").encode()
TTL = 60 * 60 * 6  # imzalı URL geçerliliği (6 saat)

_BASE_HOSTS = (
    "googlevideo.com", "youtube.com", "ytimg.com", "ggpht.com",
    "akamaized.net", "akamaihd.net", "fbcdn.net", "cdninstagram.com",
    "tiktokcdn.com", "tiktokcdn-us.com", "byteoversea.com", "ibytedtos.com",
    "twitch.tv", "ttvnw.net", "vimeo.com", "vimeocdn.com", "dmcdn.net",
    "dailymotion.com", "redd.it", "redditmedia.com", "redditstatic.com",
    "sndcdn.com", "soundcloud.com", "bilibili.com", "bilivideo.com",
    "pinimg.com", "cdn.discordapp.com", "video.twimg.com", "twimg.com",
    "x.com", "twitter.com", "storage.googleapis.com", "cloudfront.net",
)
# TUG_EXTRA_HOSTS ile genişletilebilir (yerel test / kendi sunucunuz).
ALLOWED_HOSTS = tuple(
    _BASE_HOSTS
    + tuple(
        h.strip().lower()
        for h in (os.environ.get("TUG_EXTRA_HOSTS") or "").split(",")
        if h.strip()
    )
)

app = FastAPI(title="TUĞRUL DOWNLOAD Proxy API", version=APP_VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Range", "Content-Length", "Accept-Ranges", "X-Tug-Total"],
)

# Vercel'de fonksiyon `/api/index` yolunda yayınlanır; vercel.json'a gerek kalmadan
# hem `/api/info` hem `/api/index/api/info` aynı uca düşsün diye öneki soyuyoruz.
PREFIX = "/api/index"


@app.middleware("http")
async def strip_function_prefix(request: Request, call_next):
    path = request.scope.get("path", "")
    if path.startswith(PREFIX):
        stripped = path[len(PREFIX):] or "/"
        if not stripped.startswith("/"):
            stripped = "/" + stripped
        request.scope["path"] = stripped
        request.scope["raw_path"] = stripped.encode("utf-8")
    return await call_next(request)


# --- yardımcılar -----------------------------------------------------------
def _cookies_file() -> str | None:
    """YTDLP_COOKIES_B64 / YTDLP_COOKIES ortam değişkeninden çerez dosyası üret."""
    raw = os.environ.get("YTDLP_COOKIES_B64")
    if raw:
        try:
            data = base64.b64decode(raw).decode("utf-8", "ignore")
        except Exception:  # noqa: BLE001
            data = ""
    else:
        data = os.environ.get("YTDLP_COOKIES", "")
    if not data.strip():
        return None
    path = "/tmp/cookies.txt"
    try:
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(data if "\t" in data else data)
        return path
    except OSError:
        return None


DEFAULT_EXTRACTOR_ARGS: dict[str, Any] = {
    # Veri merkezi IP'lerinden YouTube çoğu zaman çerez ister; mobil/TV istemcileri
    # genelde çerezsiz doğrudan akış URL'si döndürür.
    "youtube": {"player_client": ["android", "ios", "web"]},
}


def _extractor_args() -> dict[str, Any]:
    raw = os.environ.get("YTDLP_EXTRACTOR_ARGS")
    if not raw or not raw.strip():
        return DEFAULT_EXTRACTOR_ARGS
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else DEFAULT_EXTRACTOR_ARGS
    except ValueError:
        return DEFAULT_EXTRACTOR_ARGS


def _opts(extra: dict | None = None) -> dict[str, Any]:
    o: dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "nocheckcertificate": True,
        "noplaylist": True,
        "skip_download": True,
        "socket_timeout": 20,
        "retries": 2,
        "extractor_retries": 2,
        "cachedir": False,
        "http_headers": {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
            ),
            "Accept-Language": "tr,en;q=0.9",
        },
        "extractor_args": _extractor_args(),
    }
    ck = _cookies_file()
    if ck:
        o["cookiefile"] = ck
    proxy = os.environ.get("YTDLP_PROXY")
    if proxy:
        o["proxy"] = proxy
    if extra:
        o.update(extra)
    return o


def _human(msg: str) -> str:
    low = msg.lower()
    table = [
        # ağ / DNS (önce: "unable to download webpage" içindeki "age" tuzağına düşmesin)
        ("name or service not known", "Sunucu bu alan adını çözemedi (DNS)."),
        ("temporary failure in name resolution", "Sunucunun DNS çözümlemesi başarısız."),
        ("nodename nor servname", "Sunucu bu alan adını çözemedi (DNS)."),
        ("getaddrinfo", "Sunucu bu alan adını çözemedi (DNS)."),
        ("connection refused", "Kaynak bağlantıyı reddetti."),
        ("timed out", "Kaynağa ulaşmak çok uzun sürdü (zaman aşımı)."),
        # site tarafı engeller
        ("sign in to confirm", "YouTube bu sunucudan bot doğrulaması istiyor. Yönetici: YTDLP_COOKIES_B64 ortam değişkenine çerez ekleyin."),
        ("confirm you're not a bot", "YouTube bu sunucudan bot doğrulaması istiyor. Yönetici: çerez ekleyin."),
        ("po token", "YouTube bu sunucudan ek doğrulama (PO token) istiyor — çerez gerekiyor."),
        ("age-restricted", "Yaş kısıtlı içerik — çerez gerekiyor."),
        ("age restricted", "Yaş kısıtlı içerik — çerez gerekiyor."),
        ("confirm your age", "Yaş kısıtlı içerik — çerez gerekiyor."),
        ("over 18", "Yaş kısıtlı içerik — çerez gerekiyor."),
        ("video unavailable", "Video kullanılamıyor (kaldırılmış ya da gizli)."),
        ("private video", "Video gizli."),
        ("members-only", "Yalnızca üyelere açık içerik — çerez gerekiyor."),
        ("unsupported url", "Bu adres desteklenmiyor."),
        ("http error 403", "Kaynak erişimi reddetti (403)."),
        ("http error 404", "İçerik bulunamadı (404)."),
        ("http error 429", "Kaynak çok istek nedeniyle bizi geçici olarak engelledi (429)."),
        ("unable to download webpage", "Sayfa indirilemedi — kaynak erişimi engelledi ya da ağ hatası."),
        ("no such option", "Sunucu ayarı geçersiz."),
    ]
    for k, v in table:
        if k in low:
            return v
    return re.sub(r"\x1b\[[0-9;]*m", "", msg).replace("ERROR: ", "").strip()[:400]


def _sign(payload: dict) -> str:
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    body = base64.urlsafe_b64encode(raw).decode().rstrip("=")
    mac = hmac.new(SECRET, body.encode(), hashlib.sha256).hexdigest()[:32]
    return f"{body}.{mac}"


def _verify(token: str) -> dict:
    try:
        body, mac = token.rsplit(".", 1)
    except ValueError as exc:
        raise HTTPException(400, "Geçersiz belirteç") from exc
    expect = hmac.new(SECRET, body.encode(), hashlib.sha256).hexdigest()[:32]
    if not hmac.compare_digest(mac, expect):
        raise HTTPException(403, "Belirteç doğrulanamadı")
    pad = "=" * (-len(body) % 4)
    data = json.loads(base64.urlsafe_b64decode(body + pad))
    if data.get("exp", 0) < time.time():
        raise HTTPException(410, "Belirtecin süresi doldu, tekrar deneyin")
    return data


def _host_ok(url: str) -> bool:
    m = re.match(r"^https?://([^/]+)", url or "")
    if not m:
        return False
    host = m.group(1).split(":")[0].lower()
    return any(host == h or host.endswith("." + h) for h in ALLOWED_HOSTS)


def _fmt_size(n: float | None) -> str:
    if not n:
        return ""
    n = float(n)
    for u in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.1f} {u}" if u != "B" else f"{int(n)} B"
        n /= 1024
    return f"{n:.1f} TB"


def _clock(s: float | None) -> str:
    t = int(s or 0)
    h, r = divmod(t, 3600)
    m, sec = divmod(r, 60)
    return f"{h}:{m:02d}:{sec:02d}" if h else f"{m}:{sec:02d}"


# --- modeller --------------------------------------------------------------
class InfoIn(BaseModel):
    url: str


class ResolveIn(BaseModel):
    url: str
    format_id: str = ""


@app.get("/api/health")
def health() -> dict:
    return {
        "ok": True,
        "version": APP_VERSION,
        "engine": "yt-dlp" if yt_dlp else "yok",
        "ytdlp": getattr(getattr(yt_dlp, "version", None), "__version__", "—"),
        "cookies": bool(_cookies_file()),
        "proxy": bool(os.environ.get("YTDLP_PROXY")),
        "chunk": CHUNK,
        "time": time.time(),
    }


def _clean_url(url: str) -> str:
    """Çıplak YouTube kimliği / şemasız adres → tam URL."""
    url = (url or "").strip()
    if not url:
        raise HTTPException(400, "Bağlantı boş")
    if re.match(r"^[A-Za-z0-9_-]{11}$", url):
        url = f"https://www.youtube.com/watch?v={url}"
    if not re.match(r"^[a-z]+://", url, re.I):
        url = "https://" + url
    return url


def _extract(url: str, fmt: str = "") -> dict:
    """yt-dlp ile bilgi çıkar (liste ise ilk girdi)."""
    if not yt_dlp:
        raise HTTPException(503, "yt-dlp yüklenemedi (sunucu yapılandırması).")
    try:
        with yt_dlp.YoutubeDL(_opts({"format": fmt} if fmt else None)) as ydl:
            data = ydl.extract_info(url, download=False)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(422, _human(str(exc))) from exc
    if not data:
        raise HTTPException(422, "Bu bağlantıdan bilgi alınamadı.")
    if data.get("_type") == "playlist":
        entries = [e for e in (data.get("entries") or []) if e]
        if not entries:
            raise HTTPException(422, "Liste boş.")
        data = entries[0]
    return data


def _info_payload(data: dict, url: str) -> JSONResponse:
    formats = data.get("formats") or []
    videos, audios = [], []
    for f in formats:
        v = f.get("vcodec") not in (None, "none")
        a = f.get("acodec") not in (None, "none")
        if (f.get("protocol") or "") in ("mhtml", "none"):
            continue
        item = {
            "format_id": str(f.get("format_id")),
            "ext": f.get("ext") or "",
            "height": f.get("height") or 0,
            "fps": f.get("fps") or 0,
            "abr": round(float(f.get("abr") or 0), 1),
            "tbr": round(float(f.get("tbr") or 0), 1),
            "filesize": int(f.get("filesize") or f.get("filesize_approx") or 0),
            "filesize_text": _fmt_size(f.get("filesize") or f.get("filesize_approx")),
            "vcodec": None if not v else f.get("vcodec"),
            "acodec": None if not a else f.get("acodec"),
            "muxed": bool(v and a),
            "url_ok": bool(f.get("url")),
        }
        if v and not a:
            videos.append(item)
        elif a and not v:
            audios.append(item)
        elif v and a:
            videos.append(item)

    videos.sort(key=lambda x: (x["height"], x["tbr"]), reverse=True)
    audios.sort(key=lambda x: (x["abr"], x["tbr"]), reverse=True)
    seen: set[tuple] = set()
    videos = [
        v for v in videos if (v["height"], v["ext"]) not in seen and not seen.add((v["height"], v["ext"]))  # type: ignore[func-returns-value]
    ]
    thumb = data.get("thumbnail")
    if not thumb and data.get("thumbnails"):
        thumb = sorted(data["thumbnails"], key=lambda t: t.get("width") or 0, reverse=True)[0].get("url")

    return JSONResponse(
        {
            "id": data.get("id", ""),
            "title": data.get("title") or "Başlıksız",
            "thumbnail": thumb,
            "uploader": data.get("uploader") or data.get("channel") or "",
            "duration": float(data.get("duration") or 0),
            "duration_text": _clock(data.get("duration")),
            "webpage_url": data.get("webpage_url") or url,
            "extractor": data.get("extractor_key") or "",
            "view_count": data.get("view_count") or 0,
            "videos": videos[:12],
            "audios": audios[:6],
            "best_video": videos[0] if videos else None,
            "best_audio": audios[0] if audios else None,
            "has_video": bool(videos),
            "has_audio": bool(audios),
            "proxy": True,
        }
    )


@app.post("/api/info")
def info(body: InfoIn) -> JSONResponse:
    url = _clean_url(body.url)
    return _info_payload(_extract(url), url)


@app.get("/api/info")
def info_get(url: str = Query(..., min_length=1)) -> JSONResponse:
    clean = _clean_url(url)
    return _info_payload(_extract(clean), clean)


def _resolve_payload(url: str, fmt: str = "") -> JSONResponse:
    """Seçilen format için doğrudan (imzalı) akış URL'si üret."""
    data = _extract(url, fmt)
    if not data.get("url") and fmt:
        data = _extract(url)  # seçim çoklu akış döndürdüyse tek akışa düş
    if not data.get("url"):
        reqs = [r for r in (data.get("requested_formats") or []) if r.get("url")]
        if reqs:
            data = next((r for r in reqs if r.get("vcodec") not in (None, "none")), reqs[0])
    url_direct = data.get("url")
    if not url_direct:
        raise HTTPException(422, "Doğrudan akış bulunamadı.")
    if not _host_ok(url_direct):
        raise HTTPException(422, "Bu kaynağın doğrudan bağlantısı desteklenmiyor.")

    headers = {
        k: v
        for k, v in (data.get("http_headers") or {}).items()
        if k.lower() in ("user-agent", "referer", "cookie", "accept", "accept-language", "origin")
    }
    token = _sign(
        {
            "u": url_direct,
            "h": headers,
            "e": data.get("ext") or "mp4",
            "t": (data.get("title") or "video")[:120],
            "size": int(data.get("filesize") or data.get("filesize_approx") or 0),
            "exp": int(time.time()) + TTL,
        }
    )
    return JSONResponse(
        {
            "token": token,
            "ext": data.get("ext") or "mp4",
            "title": data.get("title") or "video",
            "filesize": int(data.get("filesize") or data.get("filesize_approx") or 0),
            "mime": data.get("mime_type") or "",
            "height": data.get("height") or 0,
            "format_id": str(data.get("format_id") or ""),
        }
    )


@app.post("/api/resolve")
def resolve(body: ResolveIn) -> JSONResponse:
    return _resolve_payload(_clean_url(body.url), (body.format_id or "").strip())


@app.get("/api/resolve")
def resolve_get(url: str = Query(..., min_length=1), format_id: str = Query("")) -> JSONResponse:
    return _resolve_payload(_clean_url(url), (format_id or "").strip())


@app.get("/api/probe")
async def probe(url: str = Query(..., min_length=1), format_id: str = Query("")) -> JSONResponse:
    """Uçtan uca sağlık kontrolü: bilgi çıkar → imzala → ilk baytları çek.

    Tarayıcıdan (GET) çağrılabilir; dağıtımın gerçekten çalıştığını tek istekte doğrular.
    """
    clean = _clean_url(url)
    t0 = time.time()
    payload = json.loads(_resolve_payload(clean, (format_id or "").strip()).body)
    token = payload["token"]

    # imzalı belirteçle ilk parçayı doğrudan kaynaktan çek (stream yoluyla aynı doğrulama)
    data = _verify(token)
    start = 0
    want = 4096
    client2 = httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=10.0), follow_redirects=True)
    got = 0
    status = 0
    total = 0
    try:
        headers = dict(data.get("h") or {})
        headers["Range"] = f"bytes={start}-{start + want - 1}"
        r = await client2.get(data["u"], headers=headers)
        status = r.status_code
        got = len(r.content)
        cr = r.headers.get("content-range", "")
        if "/" in cr:
            try:
                total = int(cr.split("/")[-1])
            except ValueError:
                total = 0
        if not total and r.headers.get("content-length"):
            total = int(r.headers["content-length"])
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"Kaynağa ulaşılamadı: {exc}") from exc
    finally:
        await client2.aclose()

    return {
        "ok": status in (200, 206),
        "url": clean,
        "title": payload.get("title"),
        "ext": payload.get("ext"),
        "format_id": payload.get("format_id"),
        "filesize": payload.get("filesize"),
        "probe_status": status,
        "probe_bytes": got,
        "probe_total": total or payload.get("filesize") or 0,
        "seconds": round(time.time() - t0, 2),
        "ytdlp": getattr(getattr(yt_dlp, "version", None), "__version__", "—"),
    }


@app.get("/api/stream")
async def stream(
    request: Request,
    token: str = Query(..., description="resolve ile alınan imzalı belirteç"),
    start: int = Query(0, ge=0),
    length: int = Query(0, ge=0),
):
    """İmzalı URL'den tek bir bayt aralığı proxy'le (en fazla ~3 MB)."""
    data = _verify(token)
    url = data["u"]
    if not _host_ok(url):
        raise HTTPException(403, "Adres izinli değil")

    want = length or CHUNK
    want = min(max(want, 1), CHUNK)
    end = start + want - 1
    headers = dict(data.get("h") or {})
    headers["Range"] = f"bytes={start}-{end}"

    client = httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=10.0), follow_redirects=True)
    try:
        req = client.build_request("GET", url, headers=headers)
        upstream = await client.send(req, stream=True)
    except Exception as exc:  # noqa: BLE001
        await client.aclose()
        raise HTTPException(502, f"Kaynağa ulaşılamadı: {exc}") from exc

    if upstream.status_code not in (200, 206):
        await upstream.aclose()
        await client.aclose()
        raise HTTPException(502, f"Kaynak {upstream.status_code} döndü")

    total = 0
    cr = upstream.headers.get("content-range", "")
    if "/" in cr:
        try:
            total = int(cr.split("/")[-1])
        except ValueError:
            total = 0
    if not total:
        cl = upstream.headers.get("content-length")
        total = int(cl) + start if cl and upstream.status_code == 206 else int(cl or 0)

    async def body():
        sent = 0
        try:
            async for chunk in upstream.aiter_bytes(64 * 1024):
                if sent + len(chunk) > want:
                    chunk = chunk[: max(0, want - sent)]
                if chunk:
                    sent += len(chunk)
                    yield chunk
                if sent >= want:
                    break
        finally:
            await upstream.aclose()
            await client.aclose()

    out_headers = {
        "Content-Type": upstream.headers.get("content-type", "application/octet-stream"),
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
        "X-Tug-Total": str(total),
        "Content-Length": str(min(want, max(0, (total - start) if total else want))),
    }
    if total:
        out_headers["Content-Range"] = f"bytes {start}-{start + want - 1}/{total}"
    return StreamingResponse(body(), status_code=206, headers=out_headers)


@app.get("/api/manifest")
def manifest() -> dict:
    return {
        "app": "TUĞRUL DOWNLOAD proxy",
        "version": APP_VERSION,
        "endpoints": ["/api/health", "/api/info", "/api/resolve", "/api/stream"],
        "chunk": CHUNK,
    }


@app.options("/{_:path}")
def preflight(_: str) -> Response:
    return Response(
        status_code=204,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
            "Access-Control-Allow-Headers": "*",
        },
    )


@app.get("/")
def root() -> dict:
    return {
        "name": "TUĞRUL DOWNLOAD API",
        "ok": True,
        "ui": "https://keykavus324-svg.github.io/TUGRUL-DOWNLOAD/",
        "health": "/api/health",
    }


__all__ = ["app", "quote", "unquote"]
