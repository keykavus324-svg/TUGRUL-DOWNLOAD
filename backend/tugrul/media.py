"""yt-dlp köprüsü — bilgi çözümleme, format listesi, arama ve indirme seçenekleri."""
from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any

import yt_dlp
from yt_dlp.utils import DownloadError, ExtractorError

from . import db

_FFMPEG = None


def ffmpeg_path() -> str | None:
    """Gömülü (imageio-ffmpeg) ya da sistemdeki ffmpeg'i bul."""
    global _FFMPEG
    if _FFMPEG is None:
        env = os.environ.get("FFMPEG_PATH")
        if env and Path(env).exists():
            _FFMPEG = env
        else:
            try:
                import imageio_ffmpeg

                _FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
            except Exception:
                _FFMPEG = None
    return _FFMPEG


def _base_opts() -> dict[str, Any]:
    s = db.get_settings()
    opts: dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "ignoreerrors": False,
        "nocheckcertificate": True,
        "extractor_retries": int(s.get("retries") or 3),
        "socket_timeout": 20,
        "geo_bypass": True,
        "source_address": None,
        "http_headers": {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
            ),
            "Accept-Language": "tr,en;q=0.8",
        },
        "cachedir": str(Path(db.DATA_DIR) / "cache"),
    }
    ff = ffmpeg_path()
    if ff:
        opts["ffmpeg_location"] = ff
    proxy = (s.get("proxy") or "").strip()
    if proxy:
        opts["proxy"] = proxy
    cookies = (s.get("cookies_path") or "").strip()
    if cookies and Path(cookies).exists() and Path(cookies).stat().st_size > 0:
        opts["cookiefile"] = cookies
    rl = (s.get("rate_limit") or "").strip()
    if rl:
        opts["ratelimit"] = _parse_rate(rl)
    return opts


def _parse_rate(value: str) -> int:
    """'5M' -> 5 MiB/sn (bayt)."""
    m = re.match(r"^\s*([\d.]+)\s*([kKmMgG]?)\s*$", value)
    if not m:
        return 0
    num = float(m.group(1))
    mult = {"": 1, "k": 1024, "m": 1024 ** 2, "g": 1024 ** 3}[m.group(2).lower()]
    return int(num * mult)


def _clean_url(url: str) -> str:
    url = (url or "").strip()
    if not url:
        raise ValueError("Bağlantı boş olamaz.")
    if re.match(r"^[a-zA-Z0-9_-]{11}$", url):  # çıplak YouTube kimliği
        return f"https://www.youtube.com/watch?v={url}"
    if not re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*://", url):
        url = "https://" + url
    return url


def _fmt_size(n: float | None) -> str:
    if not n:
        return ""
    n = float(n)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if n < 1024:
            return f"{n:.1f} {unit}" if unit != "B" else f"{int(n)} B"
        n /= 1024
    return f"{n:.1f} PB"


def _format_labels(f: dict) -> dict:
    vcodec = f.get("vcodec") or "none"
    acodec = f.get("acodec") or "none"
    has_v = vcodec != "none"
    has_a = acodec != "none"
    if has_v and has_a:
        kind = "video+audio"
    elif has_v:
        kind = "video"
    else:
        kind = "audio"
    height = f.get("height") or 0
    fps = f.get("fps") or 0
    quality = f"{height}p" if height else ("ses" if kind == "audio" else "—")
    if fps and fps >= 45 and height:
        quality += f"{int(fps)}"
    if f.get("format_note"):
        note = f["format_note"]
    else:
        note = f.get("format") or ""
    return {
        "format_id": str(f.get("format_id", "")),
        "kind": kind,
        "ext": f.get("ext") or "",
        "quality": quality,
        "height": height,
        "fps": fps,
        "vcodec": None if vcodec == "none" else vcodec,
        "acodec": None if acodec == "none" else acodec,
        "abr": round(float(f.get("abr") or 0), 1),
        "tbr": round(float(f.get("tbr") or 0), 1),
        "filesize": int(f.get("filesize") or f.get("filesize_approx") or 0),
        "filesize_text": _fmt_size(f.get("filesize") or f.get("filesize_approx")),
        "note": note,
        "language": f.get("language") or "",
        "protocol": f.get("protocol") or "",
        "dynamic_range": f.get("dynamic_range") or "",
        "container": f.get("container") or "",
    }


def _summarize_formats(info: dict) -> dict:
    formats = info.get("formats") or []
    videos, audios, muxed = [], [], []
    seen: set[tuple] = set()
    for f in formats:
        if f.get("format_id") in (None, "sb0", "sb1", "sb2"):
            continue
        if (f.get("protocol") or "") in ("mhtml", "none"):
            continue
        data = _format_labels(f)
        key = (data["format_id"],)
        if key in seen:
            continue
        seen.add(key)
        if data["kind"] == "video+audio":
            muxed.append(data)
        elif data["kind"] == "video":
            if data["height"] or data["vcodec"] not in (None, "none"):
                videos.append(data)
        elif data["kind"] == "audio":
            audios.append(data)

    videos.sort(key=lambda x: (x["height"], x["tbr"]), reverse=True)
    muxed.sort(key=lambda x: (x["height"], x["tbr"]), reverse=True)
    audios.sort(key=lambda x: (x["abr"], x["tbr"]), reverse=True)

    # aynı çözünürlükte tekrar edenleri sadeleştir (en iyi bitrate kalır)
    def dedupe(items: list[dict], keyfn) -> list[dict]:
        out, seen_k = [], set()
        for it in items:
            k = keyfn(it)
            if k in seen_k:
                continue
            seen_k.add(k)
            out.append(it)
        return out

    videos = dedupe(videos, lambda x: (x["height"], x["ext"], x["dynamic_range"]))
    audios = dedupe(audios, lambda x: (x["ext"], x["abr"]))
    thumb = info.get("thumbnail")
    if not thumb and info.get("thumbnails"):
        thumb = sorted(
            info["thumbnails"], key=lambda t: t.get("width") or 0, reverse=True
        )[0].get("url")

    subs = {}
    for lang, entries in (info.get("subtitles") or {}).items():
        subs[lang] = [e.get("ext") for e in entries if e.get("ext")]
    auto_subs = list((info.get("automatic_captions") or {}).keys())

    return {
        "id": info.get("id", ""),
        "title": info.get("title") or info.get("fulltitle") or "Başlıksız",
        "description": (info.get("description") or "")[:2000],
        "thumbnail": thumb,
        "uploader": info.get("uploader") or info.get("channel") or info.get("creator") or "",
        "uploader_url": info.get("uploader_url") or info.get("channel_url") or "",
        "duration": float(info.get("duration") or 0),
        "duration_text": _clock(info.get("duration") or 0),
        "view_count": info.get("view_count") or 0,
        "like_count": info.get("like_count") or 0,
        "upload_date": _pretty_date(info.get("upload_date")),
        "timestamp": info.get("timestamp") or 0,
        "webpage_url": info.get("webpage_url") or info.get("original_url") or "",
        "extractor": info.get("extractor_key") or info.get("extractor") or "",
        "is_playlist": info.get("_type") == "playlist",
        "playlist_count": info.get("playlist_count") or len(info.get("entries") or []),
        "playlist_title": info.get("title") if info.get("_type") == "playlist" else "",
        "chapters": [
            {"start": c.get("start_time") or 0, "end": c.get("end_time") or 0,
             "title": c.get("title") or ""}
            for c in (info.get("chapters") or [])
        ],
        "subtitles": subs,
        "auto_subtitles": auto_subs[:40],
        "videos": videos[:40],
        "audios": audios[:15],
        "muxed": muxed[:15],
        "best_video": videos[0] if videos else (muxed[0] if muxed else None),
        "best_audio": audios[0] if audios else None,
        "has_video": bool(videos or muxed),
        "has_audio": bool(audios or muxed),
    }


def _clock(seconds: float) -> str:
    seconds = int(seconds or 0)
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def _pretty_date(raw: str | None) -> str:
    if not raw or len(raw) != 8:
        return ""
    return f"{raw[0:4]}-{raw[4:6]}-{raw[6:8]}"


def extract(url: str, playlist: bool = False, limit: int = 100) -> dict:
    """Tek video ya da liste bilgisini çöz."""
    u = _clean_url(url)
    opts = _base_opts()
    opts.update({"skip_download": True, "extract_flat": "in_playlist" if playlist else False})
    if playlist:
        opts["playlistend"] = limit
    else:
        opts["noplaylist"] = True
    with yt_dlp.YoutubeDL(opts) as ydl:
        try:
            info = ydl.extract_info(u, download=False)
        except (DownloadError, ExtractorError) as exc:
            if "unsupported url" not in str(exc).lower():
                raise RuntimeError(_human_error(str(exc))) from exc
            # doğrudan medya bağlantıları: genel çözücüyle dene
            try:
                fallback = dict(opts)
                fallback["force_generic_extractor"] = True
                with yt_dlp.YoutubeDL(fallback) as ydl2:
                    info = ydl2.extract_info(u, download=False)
            except Exception as exc2:  # noqa: BLE001
                raise RuntimeError(_human_error(str(exc2))) from exc2
    if not info:
        raise RuntimeError("Bu bağlantıdan bilgi alınamadı. Bağlantıyı kontrol edin.")
    if info.get("_type") == "playlist":
        entries = [e for e in (info.get("entries") or []) if e]
        return {
            "playlist": True,
            "id": info.get("id", ""),
            "title": info.get("title") or "Oynatma Listesi",
            "webpage_url": info.get("webpage_url") or u,
            "thumbnail": info.get("thumbnail"),
            "uploader": info.get("uploader") or info.get("channel") or "",
            "count": len(entries),
            "entries": [
                {
                    "id": e.get("id", ""),
                    "title": e.get("title") or "Başlıksız",
                    "url": e.get("url") or e.get("webpage_url") or "",
                    "webpage_url": e.get("webpage_url") or e.get("url") or "",
                    "thumbnail": e.get("thumbnail"),
                    "duration": float(e.get("duration") or 0),
                    "duration_text": _clock(e.get("duration") or 0),
                    "uploader": e.get("uploader") or e.get("channel") or "",
                }
                for e in entries
            ],
        }
    data = _summarize_formats(info)
    data["playlist"] = False
    data["entries"] = []
    return data


def search(query: str, limit: int = 20) -> list[dict]:
    """YouTube üzerinde arama (ytsearch)."""
    q = (query or "").strip()
    if not q:
        raise ValueError("Arama sorgusu boş olamaz.")
    opts = _base_opts()
    opts.update({"skip_download": True, "extract_flat": True, "playlistend": limit})
    with yt_dlp.YoutubeDL(opts) as ydl:
        try:
            info = ydl.extract_info(f"ytsearch{limit}:{q}", download=False)
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(_human_error(str(exc))) from exc
    out = []
    for e in (info or {}).get("entries") or []:
        if not e:
            continue
        out.append(
            {
                "id": e.get("id", ""),
                "title": e.get("title") or "Başlıksız",
                "url": e.get("url") or f"https://www.youtube.com/watch?v={e.get('id')}",
                "webpage_url": e.get("webpage_url")
                or f"https://www.youtube.com/watch?v={e.get('id')}",
                "thumbnail": e.get("thumbnail"),
                "duration": float(e.get("duration") or 0),
                "duration_text": _clock(e.get("duration") or 0),
                "uploader": e.get("uploader") or e.get("channel") or "",
                "view_count": e.get("view_count") or 0,
            }
        )
    return out


def _human_error(msg: str) -> str:
    low = msg.lower()
    table = [
        ("unsupported url", "Bu adres desteklenmiyor. Bağlantıyı kontrol edin."),
        ("video unavailable", "Video kullanılamıyor (kaldırılmış veya gizli olabilir)."),
        ("private video", "Bu video gizli. Çerez (cookies) ekleyerek tekrar deneyin."),
        ("members-only", "Bu içerik üyelere özel. Çerez ekleyin."),
        ("age-restricted", "Yaş kısıtlı içerik. Çerez ekleyerek tekrar deneyin."),
        ("confirm your age", "Yaş kısıtlı içerik. Çerez ekleyerek tekrar deneyin."),
        ("sign in", "Giriş gerekli. Çerez dosyası ekleyin."),
        ("not available in your country", "İçerik bulunduğunuz bölgede kullanılamıyor."),
        ("timed out", "Bağlantı zaman aşımına uğradı. İnternetinizi kontrol edin."),
        ("failed to resolve", "Sunucuya ulaşılamadı (DNS). İnternetinizi kontrol edin."),
        ("no space left", "Diskte yeterli alan yok."),
        ("ffmpeg", "FFmpeg bulunamadı ya da çalıştırılamadı."),
        ("http error 403", "Erişim reddedildi (403). Proxy/çerez deneyin."),
        ("http error 404", "İçerik bulunamadı (404)."),
        ("tls", "Bu ağdan siteye güvenli bağlantı kurulamıyor (ağ kısıtı)."),
        ("ssl", "Bu ağdan siteye güvenli bağlantı kurulamıyor (ağ kısıtı)."),
        ("unable to download webpage", "Siteye ulaşılamadı. Ağ bağlantısını kontrol edin."),
        ("connection", "Bağlantı kurulamadı. Ağınızı kontrol edin."),
    ]
    for key, text in table:
        if key in low:
            return text
    clean = re.sub(r"\x1b\[[0-9;]*m", "", msg)
    clean = clean.replace("ERROR: ", "").strip()
    return clean[:500] or "Bilinmeyen bir hata oluştu."


AUDIO_CODECS = {"mp3", "m4a", "opus", "flac", "wav", "aac", "ogg"}


def build_opts(
    dl_type: str,
    format_id: str = "",
    filename_template: str = "",
    custom_args: str = "",
    extra: dict | None = None,
) -> dict:
    """İndirme seçeneklerini ayarlara göre üret."""
    s = db.get_settings()
    outdir = s.get("download_dir") or str(db.BASE_DIR / "downloads")
    Path(outdir).mkdir(parents=True, exist_ok=True)
    tpl = (filename_template or s.get("filename_template") or "%(title)s.%(ext)s").strip()
    if not tpl:
        tpl = "%(title)s.%(ext)s"

    opts = _base_opts()
    opts.update(
        {
            "outtmpl": {"default": str(Path(outdir) / tpl)},
            "paths": {"home": outdir},
            "continuedl": True,
            "retries": int(s.get("retries") or 3),
            "fragment_retries": int(s.get("retries") or 3),
            "concurrent_fragment_downloads": int(s.get("fragments") or 4),
            "overwrites": False,
            "windowsfilenames": False,
            "trim_file_name": 200,
        }
    )

    postprocessors: list[dict] = []
    if dl_type == "audio":
        codec = (
            format_id.lower() if format_id.lower() in AUDIO_CODECS
            else (s.get("audio_format") or "mp3").lower()
        )
        if codec == "m4a":
            opts["format"] = "bestaudio[ext=m4a]/bestaudio/best"
        else:
            opts["format"] = "bestaudio/best"
        pp_codec = "m4a" if codec in ("aac", "ogg") else codec
        postprocessors.append(
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": pp_codec,
                "preferredquality": s.get("audio_quality") or "0",
            }
        )
        if s.get("embed_thumbnail") == "true":
            postprocessors.append({"key": "EmbedThumbnail", "already_have_thumbnail": False})
        if s.get("embed_metadata") == "true":
            postprocessors.append({"key": "FFmpegMetadata", "add_metadata": True})
    else:
        height = ""
        if format_id.startswith("h"):
            height = format_id[1:]
        elif re.match(r"^\d+$", format_id):
            height = format_id
        if format_id and not height:
            opts["format"] = format_id
        elif height:
            h = int(height)
            opts["format"] = (
                f"bestvideo[height<={h}][ext=mp4]+bestaudio[ext=m4a]/"
                f"bestvideo[height<={h}]+bestaudio/"
                f"best[height<={h}]/best"
            )
            opts["format_sort"] = [f"res:{h}", "codec:h264", "ext:mp4"]
        else:
            opts["format"] = (
                "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best"
            )
        opts["merge_output_format"] = (s.get("video_format") or "mp4").lower()
        if s.get("embed_metadata") == "true":
            postprocessors.append({"key": "FFmpegMetadata", "add_metadata": True})
        if s.get("embed_thumbnail") == "true":
            postprocessors.append(
                {"key": "EmbedThumbnail", "already_have_thumbnail": False}
            )

    if s.get("embed_chapters") == "true":
        opts["embed_chapters"] = True

    if s.get("write_subs") == "true":
        opts["writesubtitles"] = True
        opts["writeautomaticsub"] = True
        langs = [x.strip() for x in (s.get("sub_langs") or "tr,en").split(",") if x.strip()]
        opts["subtitleslangs"] = langs
        opts["subtitlesformat"] = "srt/best"
        postprocessors.append({"key": "FFmpegEmbedSubtitle", "already_have_subtitle": False})

    sb = (s.get("sponsorblock") or "mark").lower()
    if sb in ("mark", "remove"):
        postprocessors.append(
            {
                "key": "SponsorBlock",
                "categories": {"sponsor", "intro", "outro", "selfpromo", "interaction"},
                "when": "after_filter",
            }
        )
        postprocessors.append(
            {"key": "ModifyChapters", "remove_sponsor_segments": sb == "remove"}
        )

    if postprocessors:
        opts["postprocessors"] = postprocessors

    if custom_args:
        opts.update(_parse_custom_args(custom_args))
    if extra:
        opts.update(extra)
    return opts


KNOWN_FLAGS = {
    "--no-mtime": ("updatetime", False),
    "--write-thumbnail": ("writethumbnail", True),
    "--write-info-json": ("writeinfojson", True),
    "--write-description": ("writedescription", True),
    "--embed-subs": ("embedsubtitles", True),
    "--write-subs": ("writesubtitles", True),
    "--write-auto-subs": ("writeautomaticsub", True),
    "--no-part": ("nopart", True),
    "--keep-video": ("keepvideo", True),
}


def _parse_custom_args(raw: str) -> dict:
    """Serbest yt-dlp argümanlarını güvenli biçimde seçenek sözlüğüne çevir.

    Yalnızca bilinen ve tehlikesiz bayraklar kabul edilir (path/exec yok).
    """
    out: dict[str, Any] = {}
    tokens = raw.split()
    i = 0
    while i < len(tokens):
        tok = tokens[i]
        if tok in KNOWN_FLAGS:
            key, val = KNOWN_FLAGS[tok]
            out[key] = val
        elif tok in ("--limit-rate", "-r") and i + 1 < len(tokens):
            out["ratelimit"] = _parse_rate(tokens[i + 1])
            i += 1
        elif tok in ("--retries", "-R") and i + 1 < len(tokens):
            try:
                out["retries"] = max(0, int(tokens[i + 1]))
            except ValueError:
                pass
            i += 1
        elif tok in ("-f", "--format") and i + 1 < len(tokens):
            out["format"] = tokens[i + 1]
            i += 1
        i += 1
    return out


def version() -> str:
    return yt_dlp.version.__version__
