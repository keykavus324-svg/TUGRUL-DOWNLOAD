"""FastAPI uygulaması — TUĞRUL DOWNLOAD REST + SSE API."""
from __future__ import annotations

import asyncio
import json
import shutil
import time
from pathlib import Path

from contextlib import asynccontextmanager

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import __version__, db, demo, media, spotify, tools
from .manager import manager



@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    await manager.start()
    db.add_log("info", f"TUĞRUL DOWNLOAD v{__version__} başlatıldı")
    try:
        yield
    finally:
        await manager.stop()


app = FastAPI(title="TUĞRUL DOWNLOAD API", version=__version__, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- modeller --------------------------------------------------------------
class InfoIn(BaseModel):
    url: str
    playlist: bool = False


class SearchIn(BaseModel):
    query: str
    limit: int = Field(default=20, ge=1, le=50)


class DownloadIn(BaseModel):
    url: str
    dl_type: str = "video"
    format_id: str = ""
    title: str = ""
    thumbnail: str = ""
    uploader: str = ""
    duration: float = 0
    filename_template: str = ""
    custom_args: str = ""
    skip_duplicate: bool = True


class BulkIn(BaseModel):
    items: list[DownloadIn]


class SettingsIn(BaseModel):
    patch: dict[str, str]


class TemplateIn(BaseModel):
    name: str
    command: str


class ScheduledIn(BaseModel):
    url: str
    run_at: float
    dl_type: str = "video"
    format_id: str = ""


class WatchIn(BaseModel):
    url: str
    title: str = ""
    interval_hours: int = 24
    auto_download: bool = False


class BackupIn(BaseModel):
    data: dict


class CutIn(BaseModel):
    path: str
    start: float
    end: float
    reencode: bool = True


class CropIn(BaseModel):
    path: str
    x: int
    y: int
    width: int
    height: int


class ConvertIn(BaseModel):
    path: str
    target: str
    quality: str = "high"


class GifIn(BaseModel):
    path: str
    start: float
    duration: float
    width: int = 480


class LyricsIn(BaseModel):
    path: str
    lyrics: str


# --- sağlık & bilgi --------------------------------------------------------
@app.get("/api/health")
def health() -> dict:
    disk = shutil.disk_usage(db.DATA_DIR)
    ff = media.ffmpeg_path()
    return {
        "ok": True,
        "version": __version__,
        "ytdlp": media.version(),
        "ffmpeg": bool(ff),
        "ffmpeg_path": ff or "",
        "disk_free": disk.free,
        "disk_total": disk.total,
        "demo": True,
        "active": len(manager.active),
        "queue": manager.queue.qsize(),
        "time": time.time(),
    }


@app.post("/api/info")
async def info(body: InfoIn) -> dict:
    try:
        if demo.is_demo(body.url):
            data = await asyncio.to_thread(demo.info, body.url)
        else:
            data = await asyncio.to_thread(media.extract, body.url, body.playlist)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if data.get("playlist"):
        return data
    db.add_search(data.get("title", "")[:120])
    return data


@app.post("/api/search")
async def search(body: SearchIn) -> dict:
    try:
        results = await asyncio.to_thread(media.search, body.query, body.limit)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    db.add_search(body.query)
    return {"results": results, "query": body.query}


@app.get("/api/search/history")
def search_history() -> dict:
    return {"items": db.list_search()}


# --- indirmeler ------------------------------------------------------------
@app.get("/api/downloads")
def downloads(status: str | None = None, q: str = "", limit: int = 300) -> dict:
    return {"items": db.list_downloads(status, q, limit)}


@app.post("/api/downloads")
async def create_download(body: DownloadIn) -> dict:
    if body.skip_duplicate and db.get_settings().get("incognito") != "true":
        dup = db.find_duplicate(body.url, body.format_id)
        # yalnızca dosya hâlâ diskteyse yinelenen say
        if dup and dup.get("filepath") and Path(dup["filepath"]).exists():
            return {"duplicate": True, "item": dup}
    row = await manager.enqueue(body.model_dump())
    return {"duplicate": False, "item": row}


@app.post("/api/downloads/bulk")
async def create_bulk(body: BulkIn) -> dict:
    created = []
    for item in body.items[:500]:
        created.append(await manager.enqueue(item.model_dump()))
    return {"count": len(created), "items": created}


@app.get("/api/downloads/{dl_id}")
def get_one(dl_id: int) -> dict:
    row = db.get_download(dl_id)
    if not row:
        raise HTTPException(404, "İndirme bulunamadı")
    return row


@app.delete("/api/downloads/{dl_id}")
def delete_one(dl_id: int, remove_file: bool = False) -> dict:
    row = db.get_download(dl_id)
    if not row:
        raise HTTPException(404, "İndirme bulunamadı")
    if row["status"] in ("downloading", "processing", "queued"):
        manager.cancel(dl_id)
    if remove_file and row.get("filepath"):
        try:
            Path(row["filepath"]).unlink(missing_ok=True)
        except OSError:
            pass
    db.delete_download(dl_id)
    return {"ok": True}


@app.post("/api/downloads/{dl_id}/pause")
def pause(dl_id: int) -> dict:
    row = manager.pause(dl_id)
    if not row:
        raise HTTPException(404, "İndirme bulunamadı")
    return row


@app.post("/api/downloads/{dl_id}/resume")
async def resume(dl_id: int) -> dict:
    row = await manager.resume(dl_id)
    if not row:
        raise HTTPException(404, "İndirme bulunamadı")
    return row


@app.post("/api/downloads/{dl_id}/cancel")
def cancel(dl_id: int) -> dict:
    row = manager.cancel(dl_id)
    if not row:
        raise HTTPException(404, "İndirme bulunamadı")
    return row


@app.post("/api/downloads/{dl_id}/retry")
async def retry(dl_id: int) -> dict:
    row = await manager.retry(dl_id)
    if not row:
        raise HTTPException(404, "İndirme bulunamadı")
    return row


@app.get("/api/downloads/{dl_id}/file")
def get_file(dl_id: int):
    row = db.get_download(dl_id)
    if not row or not row.get("filepath"):
        raise HTTPException(404, "Dosya bulunamadı")
    p = Path(row["filepath"])
    if not p.exists():
        raise HTTPException(404, "Dosya diskte yok")
    return FileResponse(
        p, filename=p.name, media_type="application/octet-stream"
    )


@app.get("/api/demo/samples")
def demo_samples() -> dict:
    return {"items": demo.sample_urls()}


# --- olay akışı ------------------------------------------------------------
@app.get("/api/events")
async def events():
    async def stream():
        q = manager.subscribe()
        try:
            yield f"data: {json.dumps({'type': 'hello', 'items': manager.snapshot()}, ensure_ascii=False)}\n\n"
            while True:
                try:
                    evt = await asyncio.wait_for(q.get(), timeout=20)
                    yield f"data: {json.dumps(evt, ensure_ascii=False)}\n\n"
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        except asyncio.CancelledError:
            raise
        finally:
            manager.unsubscribe(q)

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# --- ayarlar ---------------------------------------------------------------
@app.get("/api/settings")
def get_settings() -> dict:
    return db.get_settings()


@app.put("/api/settings")
async def put_settings(body: SettingsIn) -> dict:
    out = db.set_settings(body.patch)
    manager._respawn_workers()
    return out


# --- dosyalar --------------------------------------------------------------
@app.get("/api/files")
def list_files() -> dict:
    root = Path(db.get_settings().get("download_dir") or db.BASE_DIR / "downloads")
    items = []
    if root.exists():
        for f in sorted(root.rglob("*"), key=lambda x: x.stat().st_mtime, reverse=True)[:300]:
            if f.is_file() and f.suffix not in (".part", ".ytdl"):
                items.append(
                    {
                        "name": f.name,
                        "path": str(f),
                        "size": f.stat().st_size,
                        "mtime": f.stat().st_mtime,
                        "ext": f.suffix.lstrip(".").lower(),
                    }
                )
    return {"dir": str(root), "items": items}


@app.get("/api/files/raw")
def raw_file(path: str):
    root = Path(db.get_settings().get("download_dir") or db.BASE_DIR / "downloads").resolve()
    p = Path(path).resolve()
    if not (p == root or root in p.parents) or not p.exists():
        raise HTTPException(404, "Dosya bulunamadı")
    suffix = p.suffix.lower()
    mime = {
        ".mp4": "video/mp4", ".webm": "video/webm", ".mkv": "video/x-matroska",
        ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".opus": "audio/ogg",
        ".flac": "audio/flac", ".wav": "audio/wav", ".ogg": "audio/ogg",
        ".gif": "image/gif", ".jpg": "image/jpeg", ".png": "image/png",
    }.get(suffix, "application/octet-stream")
    return FileResponse(p, media_type=mime)


@app.delete("/api/files")
def delete_file(path: str) -> dict:
    root = Path(db.get_settings().get("download_dir") or db.BASE_DIR / "downloads").resolve()
    p = Path(path).resolve()
    if root not in p.parents:
        raise HTTPException(400, "İzin verilmeyen yol")
    try:
        p.unlink(missing_ok=True)
    except OSError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"ok": True}


@app.post("/api/cookies")
async def upload_cookies(file: UploadFile = File(...)) -> dict:
    target = Path(db.get_settings()["cookies_path"])
    target.parent.mkdir(parents=True, exist_ok=True)
    content = await file.read()
    if len(content) > 5_000_000:
        raise HTTPException(413, "Çerez dosyası çok büyük")
    target.write_bytes(content)
    return {"ok": True, "path": str(target), "bytes": len(content)}


# --- şablonlar -------------------------------------------------------------
@app.get("/api/templates")
def templates() -> dict:
    return {"items": db.list_templates()}


@app.post("/api/templates")
def add_template(body: TemplateIn) -> dict:
    return db.create_template(body.name, body.command)


@app.delete("/api/templates/{tid}")
def del_template(tid: int) -> dict:
    if not db.delete_template(tid):
        raise HTTPException(404, "Şablon yok")
    return {"ok": True}


# --- zamanlanmış -----------------------------------------------------------
@app.get("/api/scheduled")
def scheduled() -> dict:
    return {"items": db.list_scheduled()}


@app.post("/api/scheduled")
def add_scheduled(body: ScheduledIn) -> dict:
    return db.create_scheduled(body.model_dump())


@app.delete("/api/scheduled/{sid}")
def del_scheduled(sid: int) -> dict:
    if not db.delete_scheduled(sid):
        raise HTTPException(404, "Görev yok")
    return {"ok": True}


# --- izleme listesi --------------------------------------------------------
@app.get("/api/watchlist")
def watchlist() -> dict:
    return {"items": db.list_watchlist()}


@app.post("/api/watchlist")
def add_watch(body: WatchIn) -> dict:
    return db.create_watchlist(body.model_dump())


@app.delete("/api/watchlist/{wid}")
def del_watch(wid: int) -> dict:
    if not db.delete_watchlist(wid):
        raise HTTPException(404, "Kayıt yok")
    return {"ok": True}


# --- istatistik, log, yedek -------------------------------------------------
@app.get("/api/stats")
def stats() -> dict:
    return db.stats()


@app.get("/api/logs")
def logs(limit: int = 300) -> dict:
    return {"items": db.get_logs(limit)}


@app.delete("/api/logs")
def clear_logs() -> dict:
    db.clear_logs()
    return {"ok": True}


@app.get("/api/backup")
def backup() -> JSONResponse:
    data = db.export_backup()
    return JSONResponse(
        data,
        headers={
            "Content-Disposition": 'attachment; filename="tugrul-yedek.json"'
        },
    )


@app.post("/api/restore")
def restore(body: BackupIn) -> dict:
    return db.import_backup(body.data)


# --- spotify / lrclib ------------------------------------------------------
@app.post("/api/lyrics")
async def lyrics(title: str, artist: str = "") -> dict:
    try:
        return await spotify.find_lyrics(title, artist)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(422, str(exc)) from exc


@app.get("/api/metadata/{url:path}")
async def site_metadata(url: str) -> dict:
    """OpenGraph önizlemesi (kart görseli olmayan siteler için)."""
    try:
        return await spotify.og_preview(url)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(422, str(exc)) from exc


# --- medya araçları ---------------------------------------------------------
@app.get("/api/tools/probe")
def probe(path: str) -> dict:
    try:
        return tools.probe(path)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(422, str(exc)) from exc


@app.post("/api/tools/cut")
def tool_cut(body: CutIn) -> dict:
    try:
        return tools.cut(body.path, body.start, body.end, body.reencode)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(422, str(exc)) from exc


@app.post("/api/tools/crop")
def tool_crop(body: CropIn) -> dict:
    try:
        return tools.crop(body.path, body.x, body.y, body.width, body.height)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(422, str(exc)) from exc


@app.post("/api/tools/convert")
def tool_convert(body: ConvertIn) -> dict:
    try:
        return tools.convert(body.path, body.target, body.quality)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(422, str(exc)) from exc


@app.post("/api/tools/gif")
def tool_gif(body: GifIn) -> dict:
    try:
        return tools.gif(body.path, body.start, body.duration, body.width)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(422, str(exc)) from exc


@app.post("/api/tools/lyrics")
def tool_lyrics(body: LyricsIn) -> dict:
    try:
        return tools.embed_lyrics(body.path, body.lyrics)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(422, str(exc)) from exc


@app.post("/api/tools/cleanup")
def tool_cleanup() -> dict:
    return tools.remove_partials()


# --- statik arayüz ---------------------------------------------------------
THUMBS = Path(db.DATA_DIR) / "demo"
THUMBS.mkdir(parents=True, exist_ok=True)
app.mount("/demo/thumbs", StaticFiles(directory=str(THUMBS)), name="demo-thumbs")

DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if DIST.exists():
    app.mount("/", StaticFiles(directory=str(DIST), html=True), name="ui")
