"""Demo motoru — gerçek medya üreten, ağ gerektirmeyen örnek indirmeler.

`demo://` şemalı bağlantılar bu modülle işlenir: ffmpeg ile gerçek bir
video/ses dosyası üretilir ve normal indirme akışının tamamı (kuyruk,
ilerleme, tamamlanma, dosya önizleme) uçtan uca çalışır. Böylece uygulama
internet erişimi kısıtlı ortamlarda da eksiksiz denenebilir.
"""
from __future__ import annotations

import random
import shutil
import subprocess
import time
from pathlib import Path

from . import db, media

DEMO_PREFIX = "demo://"

SAMPLES = [
    {
        "id": "demo001",
        "title": "TUĞRUL DOWNLOAD — Tanıtım Filmi",
        "uploader": "Tuğrul Studio",
        "duration": 24,
        "height": 1080,
        "accent": "0x2dd4bf",
        "gradient": "0x0ea5e9",
    },
    {
        "id": "demo002",
        "title": "Anadolu Manzaraları — 4K Doğa",
        "uploader": "Gezgin Kanal",
        "duration": 18,
        "height": 720,
        "accent": "0x22c55e",
        "gradient": "0x065f46",
    },
    {
        "id": "demo003",
        "title": "Lo-Fi Çalışma Müziği — Gece Seti",
        "uploader": "Sakin Sesler",
        "duration": 32,
        "height": 0,
        "accent": "0x6366f1",
        "gradient": "0x1e1b4b",
    },
    {
        "id": "demo004",
        "title": "Elazığ — Harput Kalesi Drone Çekimi",
        "uploader": "Tuğrul Studio",
        "duration": 15,
        "height": 1080,
        "accent": "0xf59e0b",
        "gradient": "0x7c2d12",
    },
]


def is_demo(url: str) -> bool:
    return (url or "").startswith(DEMO_PREFIX)


def _sample(url: str) -> dict:
    key = url.split("demo://")[-1].strip("/")
    for s in SAMPLES:
        if s["id"] == key:
            return s
    return SAMPLES[0]


def sample_urls() -> list[dict]:
    return [
        {
            "url": f"{DEMO_PREFIX}{s['id']}",
            "title": s["title"],
            "uploader": s["uploader"],
            "duration": s["duration"],
            "duration_text": f"0:{s['duration']:02d}",
        }
        for s in SAMPLES
    ]


def _thumb(sample: dict, outdir: Path) -> str | None:
    if sample["height"] == 0:
        return None
    path = outdir / f"{sample['id']}.jpg"
    if path.exists():
        return f"/demo/thumbs/{sample['id']}.jpg"
    ff = media.ffmpeg_path()
    if not ff:
        return None
    cmd = [
        ff, "-y", "-loglevel", "error",
        "-f", "lavfi",
        "-i", f"gradients=s=1280x720:c0={sample['accent']}:c1={sample['gradient']}"
              ":x0=0:y0=0:x1=1280:y1=720:nb_colors=2:speed=0.06",
        "-frames:v", "1", "-q:v", "3", str(path),
    ]
    try:
        subprocess.run(cmd, check=True, timeout=60)
        return f"/demo/thumbs/{sample['id']}.jpg"
    except Exception:
        return None


def info(url: str) -> dict:
    s = _sample(url)
    outdir = Path(db.DATA_DIR) / "demo"
    outdir.mkdir(parents=True, exist_ok=True)
    thumb = _thumb(s, outdir)
    videos, audios = [], []
    if s["height"]:
        for h, note in ((s["height"], "1080p60"), (720, "720p"), (480, "480p"), (360, "360p")):
            if h > s["height"]:
                continue
            videos.append(
                {
                    "format_id": f"h{h}",
                    "kind": "video",
                    "ext": "mp4",
                    "quality": f"{h}p",
                    "height": h,
                    "fps": 60 if h == s["height"] else 30,
                    "vcodec": "avc1.640028",
                    "acodec": None,
                    "abr": 0,
                    "tbr": h * 4,
                    "filesize": h * 900,
                    "filesize_text": f"{h * 900 / 1024 / 1024:.1f} MB",
                    "note": note,
                    "language": "",
                    "protocol": "https",
                    "dynamic_range": "SDR",
                    "container": "mp4",
                }
            )
    for ext, abr in (("mp3", 320), ("m4a", 256), ("opus", 160)):
        audios.append(
            {
                "format_id": f"a{abr}",
                "kind": "audio",
                "ext": ext,
                "quality": "ses",
                "height": 0,
                "fps": 0,
                "vcodec": None,
                "acodec": "mp4a.40.2",
                "abr": abr,
                "tbr": abr,
                "filesize": abr * 1000 * s["duration"] // 8,
                "filesize_text": f"{abr * 1000 * s['duration'] / 8 / 1024 / 1024:.1f} MB",
                "note": f"{abr} kbps",
                "language": "tr",
                "protocol": "https",
                "dynamic_range": "SDR",
                "container": ext,
            }
        )
    return {
        "id": s["id"],
        "title": s["title"],
        "description": "Bu bir demo içeriktir. Gerçek sitelerden indirme için bağlantı yapıştırın.",
        "thumbnail": thumb,
        "uploader": s["uploader"],
        "uploader_url": "",
        "duration": s["duration"],
        "duration_text": f"0:{s['duration']:02d}",
        "view_count": random.randint(12_000, 940_000),
        "like_count": random.randint(300, 24_000),
        "upload_date": "2026-11-20",
        "timestamp": 0,
        "webpage_url": url,
        "extractor": "Demo",
        "is_playlist": False,
        "playlist_count": 0,
        "playlist_title": "",
        "chapters": [
            {"start": 0, "end": s["duration"] / 3, "title": "Giriş"},
            {"start": s["duration"] / 3, "end": 2 * s["duration"] / 3, "title": "Gelişme"},
            {"start": 2 * s["duration"] / 3, "end": s["duration"], "title": "Kapanış"},
        ],
        "subtitles": {"tr": ["vtt"], "en": ["vtt"]},
        "auto_subtitles": ["tr", "en"],
        "videos": videos,
        "audios": audios,
        "muxed": [],
        "best_video": videos[0] if videos else None,
        "best_audio": audios[0] if audios else None,
        "has_video": bool(videos),
        "has_audio": True,
        "playlist": False,
        "entries": [],
        "demo": True,
    }


def produce(sample_url: str, dl_type: str, fmt: str, progress) -> str:
    """ffmpeg ile gerçek bir demo dosyası üretir; `progress(0..1)` geri çağırır."""
    s = _sample(sample_url)
    out_dir = Path(db.get_settings().get("download_dir") or db.BASE_DIR / "downloads")
    out_dir.mkdir(parents=True, exist_ok=True)
    ff = media.ffmpeg_path()
    if not ff:
        raise RuntimeError("FFmpeg bulunamadı; demo dosyası üretilemiyor.")
    safe = "".join(c for c in s["title"] if c.isalnum() or c in " -_").strip()
    if dl_type == "audio":
        ext = (fmt or "mp3").replace("a", "", 1) if fmt.startswith("a") else "mp3"
        ext = ext if ext in ("mp3", "m4a", "opus") else "mp3"
        target = out_dir / f"{safe}.{ext}"
        codec = {"mp3": "libmp3lame", "m4a": "aac", "opus": "libopus"}[ext]
        cmd = [
            ff, "-y", "-loglevel", "error",
            "-f", "lavfi",
            "-i", (
                f"aevalsrc=0.18*sin(2*PI*220*t)+0.1*sin(2*PI*330*t)"
                f"+0.05*sin(2*PI*440*t):d={s['duration']}:s=44100:c=stereo"
            ),
            "-ac", "2", "-ar", "44100", "-c:a", codec, "-b:a", "192k", str(target),
        ]
    else:
        target = out_dir / f"{safe}.mp4"
        h = s["height"] or 720
        w = int(h * 16 / 9)
        cmd = [
            ff, "-y", "-loglevel", "error",
            "-f", "lavfi",
            "-i", f"gradients=s={w}x{h}:c0={s['accent']}:c1={s['gradient']}"
                  f":x0=0:y0=0:x1={w}:y1={h}:nb_colors=2:speed=0.05:d={s['duration']}",
            "-f", "lavfi",
            "-i", f"sine=frequency=330:duration={s['duration']}",
            "-shortest", "-r", "30",
            "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "128k",
            "-metadata", f"title={s['title']}",
            "-metadata", f"artist={s['uploader']}",
            str(target),
        ]
    try:
        proc = subprocess.Popen(
            cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE
        )
        # gerçekçi ilerleme yayını (ağ indirmesi hissi)
        step = 0.0
        deadline = time.time() + 9
        while proc.poll() is None:
            step = min(step + random.uniform(0.06, 0.14), 0.94)
            progress(step)
            try:
                proc.wait(timeout=0.45)
            except subprocess.TimeoutExpired:
                pass
        while time.time() < deadline:
            step = min(step + random.uniform(0.02, 0.05), 0.97)
            progress(step)
            time.sleep(0.45)
        if proc.returncode != 0:
            err = (proc.stderr.read() or b"").decode("utf-8", "ignore")[:300]
            raise RuntimeError(f"Demo üretimi başarısız: {err}")
        progress(1.0)
        return str(target)
    finally:
        pass


def cleanup_demo_files() -> int:
    out = Path(db.DATA_DIR) / "demo"
    if not out.exists():
        return 0
    n = 0
    for f in out.iterdir():
        if f.is_dir():
            shutil.rmtree(f, ignore_errors=True)
        else:
            f.unlink(missing_ok=True)
        n += 1
    return n
