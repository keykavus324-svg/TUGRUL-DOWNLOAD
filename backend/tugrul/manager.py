"""İndirme motoru — kuyruk, eşzamanlılık, duraklat/devam, iptal ve olay yayını."""
from __future__ import annotations

import asyncio
import threading
import time
from pathlib import Path
from typing import Any

import yt_dlp
from yt_dlp.utils import DownloadCancelled

from . import db, demo, media


class _PauseSignal(DownloadCancelled):
    """Duraklatma isteği: .part dosyası korunur, sonra devam edilir."""


class DownloadManager:
    def __init__(self) -> None:
        self.queue: asyncio.Queue[int] = asyncio.Queue()
        self.active: dict[int, dict] = {}
        self.workers: list[asyncio.Task] = []
        self.loop: asyncio.AbstractEventLoop | None = None
        self.subscribers: set[asyncio.Queue] = set()
        self._ctrl: dict[int, str] = {}  # id -> pause|cancel
        self._lock = threading.Lock()
        self._started = False
        self._sched_task: asyncio.Task | None = None

    # --- yaşam döngüsü -----------------------------------------------------
    async def start(self) -> None:
        if self._started:
            return
        self.loop = asyncio.get_running_loop()
        self._started = True
        self._respawn_workers()
        self._sched_task = asyncio.create_task(self._scheduler_loop())
        # yarım kalan işleri kuyruğa geri al
        for row in db.list_downloads(limit=500):
            if row["status"] in ("queued", "downloading", "processing"):
                db.update_download(row["id"], status="queued", progress=0)
                await self.queue.put(row["id"])

    def _respawn_workers(self) -> None:
        want = max(1, min(8, int(db.get_settings().get("concurrent") or 3)))
        alive = [w for w in self.workers if not w.done()]
        for _ in range(want - len(alive)):
            alive.append(asyncio.create_task(self._worker()))
        self.workers = alive

    async def stop(self) -> None:
        for t in self.workers + ([self._sched_task] if self._sched_task else []):
            t.cancel()
        for t in self.workers:
            try:
                await t
            except (asyncio.CancelledError, Exception):
                pass

    # --- olaylar -----------------------------------------------------------
    @staticmethod
    def _safe_put(q: asyncio.Queue, event: dict) -> None:
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            pass

    def publish(self, event: dict) -> None:
        if not self.loop:
            return
        for q in list(self.subscribers):
            try:
                self.loop.call_soon_threadsafe(self._safe_put, q, event)
            except RuntimeError:
                pass

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=500)
        self.subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self.subscribers.discard(q)

    def snapshot(self) -> list[dict]:
        return db.list_downloads(limit=300)

    # --- kuyruk ------------------------------------------------------------
    async def enqueue(self, payload: dict) -> dict:
        row = db.create_download(payload)
        await self.queue.put(row["id"])
        self.publish({"type": "queued", "item": row})
        db.add_log("info", f"Kuyruğa eklendi: {row['url']}")
        return row

    async def retry(self, dl_id: int) -> dict | None:
        row = db.get_download(dl_id)
        if not row:
            return None
        db.update_download(
            dl_id, status="queued", progress=0, speed="", eta="", error="", finished_at=None
        )
        await self.queue.put(dl_id)
        self.publish({"type": "queued", "item": db.get_download(dl_id)})
        return db.get_download(dl_id)

    def pause(self, dl_id: int) -> dict | None:
        row = db.get_download(dl_id)
        if not row:
            return None
        if row["status"] == "queued":
            db.update_download(dl_id, status="paused")
            return db.get_download(dl_id)
        self._ctrl[dl_id] = "pause"
        return db.get_download(dl_id)

    def cancel(self, dl_id: int) -> dict | None:
        row = db.get_download(dl_id)
        if not row:
            return None
        self._ctrl[dl_id] = "cancel"
        if row["status"] == "queued":
            db.update_download(dl_id, status="canceled", finished_at=time.time())
            self.publish({"type": "canceled", "id": dl_id})
        return db.get_download(dl_id)

    async def resume(self, dl_id: int) -> dict | None:
        row = db.get_download(dl_id)
        if not row:
            return None
        if row["status"] in ("paused", "failed", "canceled"):
            db.update_download(dl_id, status="queued", error="", speed="", eta="")
            await self.queue.put(dl_id)
            self.publish({"type": "queued", "item": db.get_download(dl_id)})
        return db.get_download(dl_id)

    # --- worker ------------------------------------------------------------
    async def _worker(self) -> None:
        while True:
            dl_id = await self.queue.get()
            try:
                row = db.get_download(dl_id)
                if not row or row["status"] not in ("queued",):
                    continue
                await self._run(dl_id)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001
                db.update_download(
                    dl_id, status="failed", error=str(exc)[:500], finished_at=time.time()
                )
                db.add_log("error", f"#{dl_id} {exc}")
                self.publish({"type": "failed", "id": dl_id})
            finally:
                self.queue.task_done()
                self.active.pop(dl_id, None)

    async def _run(self, dl_id: int) -> None:
        row = db.get_download(dl_id)
        if not row:
            return
        db.update_download(dl_id, status="downloading", progress=0, error="")
        self.active[dl_id] = {"started": time.time(), "last_emit": 0.0}
        self.publish({"type": "started", "item": db.get_download(dl_id)})
        db.add_log("info", f"Başladı #{dl_id}: {row['title'] or row['url']}")

        if demo.is_demo(row["url"]):
            await self._run_demo(dl_id, row)
            return

        opts = media.build_opts(
            row["dl_type"],
            row.get("format_id") or "",
            row.get("filename_template") or "",
            row.get("custom_args") or "",
        )
        opts["progress_hooks"] = [lambda d: self._hook(dl_id, d)]
        opts["postprocessor_hooks"] = [lambda d: self._pp_hook(dl_id, d)]
        opts["logger"] = _NullLogger()

        def work() -> str | None:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(row["url"], download=True)
                info = ydl.sanitize_info(info) if info else None
                if not info:
                    return None
                if info.get("_type") == "playlist":
                    return None
                return ydl.prepare_filename(info)

        try:
            path = await asyncio.to_thread(work)
        except (_PauseSignal, DownloadCancelled):
            action = self._ctrl.pop(dl_id, "pause")
            if action == "cancel":
                db.update_download(
                    dl_id, status="canceled", speed="", eta="", finished_at=time.time()
                )
                self.publish({"type": "canceled", "id": dl_id})
                db.add_log("warn", f"İptal edildi #{dl_id}")
            else:
                db.update_download(dl_id, status="paused", speed="", eta="")
                self.publish({"type": "paused", "id": dl_id})
                db.add_log("warn", f"Duraklatıldı #{dl_id}")
            return
        except Exception as exc:  # noqa: BLE001
            action = self._ctrl.pop(dl_id, "")
            if action == "cancel":
                db.update_download(
                    dl_id, status="canceled", speed="", eta="", finished_at=time.time()
                )
                self.publish({"type": "canceled", "id": dl_id})
                return
            msg = media._human_error(str(exc))
            db.update_download(
                dl_id, status="failed", error=msg[:500], speed="", eta="",
                finished_at=time.time(),
            )
            self.publish({"type": "failed", "id": dl_id, "error": msg})
            db.add_log("error", f"Hata #{dl_id}: {msg}")
            return

        final = self._find_output(path, row)
        size = 0
        if final and Path(final).exists():
            size = Path(final).stat().st_size
        db.update_download(
            dl_id,
            status="completed",
            progress=100,
            speed="",
            eta="",
            filepath=final or "",
            filesize=size,
            finished_at=time.time(),
        )
        self.publish({"type": "completed", "id": dl_id, "item": db.get_download(dl_id)})
        db.add_log("info", f"Tamamlandı #{dl_id}: {final or row['url']}")

    async def _run_demo(self, dl_id: int, row: dict) -> None:
        """Demo bağlantısı: ffmpeg ile gerçek dosya üret, ilerlemeyi yayınla."""

        def progress(ratio: float) -> None:
            if self._ctrl.get(dl_id) == "cancel":
                raise _PauseSignal("demo iptal")
            pct = round(min(ratio, 1.0) * 100, 1)
            speed = "6.4 MB/s" if ratio < 0.95 else ""
            db.update_download(dl_id, progress=min(pct, 99.9), speed=speed,
                               eta="3 sn" if ratio < 0.95 else "")
            self.publish(
                {
                    "type": "progress",
                    "id": dl_id,
                    "progress": min(pct, 99.9),
                    "speed": speed,
                    "eta": "3 sn" if ratio < 0.95 else "",
                    "downloaded": 0,
                    "total": 0,
                }
            )

        try:
            path = await asyncio.to_thread(
                demo.produce, row["url"], row["dl_type"], row.get("format_id") or "",
                progress,
            )
        except (_PauseSignal, DownloadCancelled):
            action = self._ctrl.pop(dl_id, "pause")
            if action == "cancel":
                db.update_download(dl_id, status="canceled", speed="", eta="",
                                   finished_at=time.time())
                self.publish({"type": "canceled", "id": dl_id})
            else:
                db.update_download(dl_id, status="paused", speed="", eta="")
                self.publish({"type": "paused", "id": dl_id})
            return
        except Exception as exc:  # noqa: BLE001
            db.update_download(dl_id, status="failed", error=str(exc)[:500],
                               finished_at=time.time())
            self.publish({"type": "failed", "id": dl_id})
            return
        size = Path(path).stat().st_size if Path(path).exists() else 0
        db.update_download(
            dl_id, status="completed", progress=100, speed="", eta="",
            filepath=path, filesize=size, finished_at=time.time(),
        )
        self.publish({"type": "completed", "id": dl_id, "item": db.get_download(dl_id)})
        db.add_log("info", f"Demo tamamlandı #{dl_id}: {path}")

    def _find_output(self, path: str | None, row: dict) -> str:
        s = db.get_settings()
        outdir = Path(s.get("download_dir") or db.BASE_DIR / "downloads")
        if path:
            p = Path(path)
            if p.exists():
                return str(p)
            stem = p.with_suffix("")
            for ext in (".mp4", ".mkv", ".webm", ".mp3", ".m4a", ".opus", ".ogg", ".flac", ".wav"):
                cand = Path(str(stem) + ext)
                if cand.exists():
                    return str(cand)
        # son çare: dizindeki en yeni dosya
        try:
            files = [f for f in outdir.rglob("*") if f.is_file() and not f.suffix in (".part", ".ytdl")]
            if files:
                newest = max(files, key=lambda f: f.stat().st_mtime)
                if time.time() - newest.stat().st_mtime < 600:
                    return str(newest)
        except OSError:
            pass
        return ""

    def _hook(self, dl_id: int, d: dict) -> None:
        if self._ctrl.get(dl_id) in ("pause", "cancel"):
            raise _PauseSignal("kullanıcı isteği")
        st = d.get("status")
        if st == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            got = d.get("downloaded_bytes") or 0
            pct = round(got * 100 / total, 1) if total else 0.0
            now = time.time()
            info = self.active.get(dl_id) or {}
            if now - float(info.get("last_emit", 0)) >= 0.5:
                speed = d.get("speed") or 0
                eta = d.get("eta") or 0
                fields = dict(
                    progress=min(pct, 99.9),
                    speed=_speed(speed),
                    eta=_eta(eta),
                )
                db.update_download(dl_id, **fields)
                self.publish(
                    {
                        "type": "progress",
                        "id": dl_id,
                        "progress": fields["progress"],
                        "speed": fields["speed"],
                        "eta": fields["eta"],
                        "downloaded": got,
                        "total": total,
                    }
                )
                info["last_emit"] = now
                self.active[dl_id] = info
        elif st == "finished":
            db.update_download(dl_id, status="processing", progress=99.9, speed="", eta="")
            self.publish({"type": "processing", "id": dl_id})

    def _pp_hook(self, dl_id: int, d: dict) -> None:
        if d.get("status") == "started":
            name = d.get("postprocessor", "")
            self.publish({"type": "processing", "id": dl_id, "stage": name})

    # --- zamanlayıcı & izleme ---------------------------------------------
    async def _scheduler_loop(self) -> None:
        while True:
            try:
                now = time.time()
                for item in db.list_scheduled():
                    if item["status"] == "pending" and item["run_at"] <= now:
                        row = await self.enqueue(
                            {
                                "url": item["url"],
                                "dl_type": item["dl_type"],
                                "format_id": item["format_id"],
                                "title": "Zamanlanmış indirme",
                            }
                        )
                        db.update_scheduled(item["id"], status="done")
                        db.add_log("info", f"Zamanlanmış görev çalıştı: #{row['id']}")
                await asyncio.sleep(15)
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001
                await asyncio.sleep(15)


class _NullLogger:
    def debug(self, msg: str) -> None:
        pass

    def info(self, msg: str) -> None:
        pass

    def warning(self, msg: str) -> None:
        pass

    def error(self, msg: str) -> None:
        pass


def _speed(v: float) -> str:
    if not v:
        return ""
    for unit in ("B/s", "KB/s", "MB/s", "GB/s"):
        if v < 1024:
            return f"{v:.1f} {unit}"
        v /= 1024
    return f"{v:.1f} TB/s"


def _eta(v: float) -> str:
    if not v:
        return ""
    v = int(v)
    h, rem = divmod(v, 3600)
    m, s = divmod(rem, 60)
    return f"{h}s {m}d" if h else f"{m}d {s}s"


manager = DownloadManager()
