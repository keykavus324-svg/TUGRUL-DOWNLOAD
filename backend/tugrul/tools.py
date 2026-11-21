"""Medya araçları — kesme, kırpma, dönüştürme, GIF, söz gömme ve bilgi.

Tüm işlemler FFmpeg üzerinden yapılır; girdi dosyaları yalnızca indirme
klasöründeki dosyalar olabilir (yol güvenliği).
"""
from __future__ import annotations

import json
import re
import subprocess
import time
from pathlib import Path

from . import db, media


def _root() -> Path:
    return Path(db.get_settings().get("download_dir") or db.BASE_DIR / "downloads").resolve()


def safe_path(path: str) -> Path:
    root = _root()
    p = Path(path).resolve()
    if not (p == root or root in p.parents):
        raise ValueError("Bu dosyaya erişim izniniz yok.")
    if not p.exists():
        raise FileNotFoundError("Dosya bulunamadı.")
    return p


def _run(cmd: list[str], timeout: int = 900) -> str:
    proc = subprocess.run(
        cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout
    )
    if proc.returncode != 0:
        err = (proc.stderr or b"").decode("utf-8", "ignore").strip().splitlines()
        raise RuntimeError(err[-1] if err else "FFmpeg işlemi başarısız oldu.")
    return (proc.stdout or b"").decode("utf-8", "ignore")


def ff() -> str:
    exe = media.ffmpeg_path()
    if not exe:
        raise RuntimeError("FFmpeg bulunamadı.")
    return exe


def probe(path: str) -> dict:
    """ffmpeg -i çıktısını (stderr) ayrıştırarak medya bilgisi topla.

    imageio-ffmpeg yalnızca `ffmpeg` ikilisini içerdiği için ffprobe yerine
    ffmpeg'in bilgi çıktısı kullanılır.
    """
    p = safe_path(path)
    proc = subprocess.run(
        [ff(), "-hide_banner", "-i", str(p)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    text = (proc.stderr or b"").decode("utf-8", "ignore")

    duration = 0.0
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", text)
    if m:
        duration = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))

    bitrate = 0
    mb = re.search(r"bitrate:\s*(\d+)\s*kb/s", text)
    if mb:
        bitrate = int(mb.group(1)) * 1000

    video = None
    mv = re.search(
        r"Stream #\d+:\d+.*?: Video: (\w+).*?(\d{2,5})x(\d{2,5})[^\n]*?, ([\d.]+) fps",
        text,
    )
    if not mv:
        mv = re.search(r"Stream #\d+:\d+.*?: Video: (\w+).*?(\d{2,5})x(\d{2,5})", text)
    if mv:
        video = {
            "codec": mv.group(1),
            "width": int(mv.group(2)),
            "height": int(mv.group(3)),
            "fps": float(mv.group(4)) if mv.lastindex and mv.lastindex >= 4 else 0,
        }

    audio = None
    ma = re.search(r"Stream #\d+:\d+.*?: Audio: (\w+).*?(\d+) Hz, (mono|stereo|\d+ channels)", text)
    if ma:
        ch = ma.group(3)
        audio = {
            "codec": ma.group(1),
            "channels": 1 if ch == "mono" else 2 if ch == "stereo" else int(ch.split()[0]),
            "sample_rate": ma.group(2),
        }

    container = ""
    mc = re.search(r"Input #0, ([^,]+), from", text)
    if mc:
        container = mc.group(1)

    return {
        "name": p.name,
        "path": str(p),
        "size": p.stat().st_size,
        "duration": duration,
        "bitrate": bitrate,
        "container": container,
        "video": video,
        "audio": audio,
    }


def _fps(raw: str) -> float:
    try:
        num, den = raw.split("/")
        return round(float(num) / float(den), 2) if float(den) else 0
    except Exception:  # noqa: BLE001
        return 0


def _stamp() -> str:
    return time.strftime("%H%M%S")


def cut(path: str, start: float, end: float, reencode: bool = True) -> dict:
    p = safe_path(path)
    if end <= start:
        raise ValueError("Bitiş zamanı başlangıçtan büyük olmalı.")
    out = p.with_name(f"{p.stem} [kesit {_stamp()}]{p.suffix}")
    cmd = [ff(), "-y", "-hide_banner", "-loglevel", "error", "-ss", str(start), "-to", str(end), "-i", str(p)]
    if reencode:
        cmd += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-b:a", "192k"]
    else:
        cmd += ["-c", "copy"]
    cmd.append(str(out))
    _run(cmd)
    return {"ok": True, "path": str(out), "name": out.name, "size": out.stat().st_size}


def crop(path: str, x: int, y: int, w: int, h: int) -> dict:
    p = safe_path(path)
    out = p.with_name(f"{p.stem} [kırpık {_stamp()}]{p.suffix}")
    _run(
        [ff(), "-y", "-hide_banner", "-loglevel", "error", "-i", str(p),
         "-vf", f"crop={w}:{h}:{x}:{y}", "-c:v", "libx264", "-preset", "veryfast",
         "-crf", "20", "-c:a", "copy", str(out)]
    )
    return {"ok": True, "path": str(out), "name": out.name, "size": out.stat().st_size}


def convert(path: str, target: str, quality: str = "high") -> dict:
    p = safe_path(path)
    target = target.lower().lstrip(".")
    allowed = {"mp4", "mkv", "webm", "mp3", "m4a", "opus", "flac", "wav", "aac", "ogg", "gif"}
    if target not in allowed:
        raise ValueError("Desteklenmeyen hedef format.")
    out = p.with_suffix(f".{target}")
    if out.exists():
        out = p.with_name(f"{p.stem} [dönüştürüldü {_stamp()}].{target}")
    audio_only = target in {"mp3", "m4a", "opus", "flac", "wav", "aac", "ogg"}
    if target == "gif":
        cmd = [ff(), "-y", "-hide_banner", "-loglevel", "error", "-i", str(p),
               "-vf", "fps=12,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse",
               str(out)]
    elif audio_only:
        codec = {"mp3": "libmp3lame", "m4a": "aac", "opus": "libopus", "flac": "flac",
                 "wav": "pcm_s16le", "aac": "aac", "ogg": "libvorbis"}[target]
        cmd = [ff(), "-y", "-hide_banner", "-loglevel", "error", "-i", str(p),
               "-vn", "-c:a", codec, "-b:a", "320k" if quality == "high" else "192k", str(out)]
    elif target == "webm":
        cmd = [ff(), "-y", "-hide_banner", "-loglevel", "error", "-i", str(p),
               "-c:v", "libvpx-vp9", "-crf", "30", "-b:v", "0", "-c:a", "libopus", str(out)]
    elif target == "mkv":
        cmd = [ff(), "-y", "-hide_banner", "-loglevel", "error", "-i", str(p), "-c", "copy", str(out)]
    else:
        cmd = [ff(), "-y", "-hide_banner", "-loglevel", "error", "-i", str(p),
               "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
               "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(out)]
    _run(cmd)
    return {"ok": True, "path": str(out), "name": out.name, "size": out.stat().st_size}


def gif(path: str, start: float, duration: float, width: int = 480) -> dict:
    p = safe_path(path)
    out = p.with_name(f"{p.stem} [{_stamp()}].gif")
    vf = (
        f"fps=14,scale={width}:-1:flags=lanczos,split[s0][s1];"
        "[s0]palettegen[p];[s1][p]paletteuse"
    )
    _run(
        [ff(), "-y", "-hide_banner", "-loglevel", "error", "-ss", str(start),
         "-t", str(duration), "-i", str(p), "-vf", vf, "-loop", "0", str(out)]
    )
    return {"ok": True, "path": str(out), "name": out.name, "size": out.stat().st_size}


LRC_RE = re.compile(r"\[(\d+):(\d+(?:\.\d+)?)\](.*)")


def embed_lyrics(path: str, lyrics: str) -> dict:
    """Zaman damgalı (LRC) veya düz sözleri dosyaya göm."""
    p = safe_path(path)
    if p.suffix.lower() not in (".mp3", ".m4a", ".opus", ".flac", ".ogg"):
        raise ValueError("Sözler yalnızca ses dosyalarına gömülebilir.")
    tags = {}
    if LRC_RE.search(lyrics):
        out = p.with_suffix(".lrc")
        out.write_text(lyrics, encoding="utf-8")
        return {"ok": True, "path": str(out), "name": out.name, "kind": "lrc"}
    tags["lyrics"] = lyrics[:4000].replace("\n", "\\n")
    out = p.with_name(f"{p.stem} [sözlü]{p.suffix}")
    cmd = [ff(), "-y", "-hide_banner", "-loglevel", "error", "-i", str(p), "-c", "copy"]
    for k, v in tags.items():
        cmd += ["-metadata", f"{k}={v}"]
    cmd.append(str(out))
    _run(cmd)
    return {"ok": True, "path": str(out), "name": out.name, "kind": "embedded"}


def remove_partials() -> dict:
    root = _root()
    n, freed = 0, 0
    for f in root.rglob("*"):
        if f.is_file() and f.suffix in (".part", ".ytdl"):
            freed += f.stat().st_size
            f.unlink(missing_ok=True)
            n += 1
    return {"removed": n, "freed": freed}
