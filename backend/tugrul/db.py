"""SQLite katmanı — TUĞRUL DOWNLOAD.

Tek dosyalık, sıfır kurulumlu veritabanı: indirmeler/geçmiş, ayarlar,
komut şablonları, loglar, zamanlanmış görevler, izleme listesi ve
arama geçmişi. Incognito (gizli) modunda yazma işlemleri atlanır.
"""
from __future__ import annotations

import json
import sqlite3
import threading
import time
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "tugrul.db"

_lock = threading.RLock()  # yeniden girişli: dışa aktarma iç içe çağrı yapar

DEFAULT_SETTINGS: dict[str, str] = {
    "download_dir": str(BASE_DIR / "downloads"),
    "concurrent": "3",
    "retries": "3",
    "fragments": "4",
    "rate_limit": "",
    "proxy": "",
    "extractor": "yt-dlp",
    "incognito": "false",
    "theme": "dark",
    "language": "tr",
    "filename_template": "%(uploader)s - %(title)s [%(id)s].%(ext)s",
    "audio_format": "mp3",
    "audio_quality": "0",
    "video_format": "mp4",
    "embed_metadata": "true",
    "embed_thumbnail": "true",
    "embed_chapters": "true",
    "sponsorblock": "mark",
    "write_subs": "false",
    "sub_langs": "tr,en",
    "auto_update_ytdlp": "true",
    "custom_args": "",
    "cookies_path": str(DATA_DIR / "cookies.txt"),
}


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db() -> None:
    with _lock, _connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS downloads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                url TEXT NOT NULL,
                title TEXT DEFAULT '',
                thumbnail TEXT DEFAULT '',
                uploader TEXT DEFAULT '',
                duration REAL DEFAULT 0,
                dl_type TEXT DEFAULT 'video',
                format_id TEXT DEFAULT '',
                status TEXT DEFAULT 'queued',
                progress REAL DEFAULT 0,
                speed TEXT DEFAULT '',
                eta TEXT DEFAULT '',
                filepath TEXT DEFAULT '',
                filesize INTEGER DEFAULT 0,
                error TEXT DEFAULT '',
                filename_template TEXT DEFAULT '',
                custom_args TEXT DEFAULT '',
                created_at REAL NOT NULL,
                finished_at REAL
            );
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS templates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                command TEXT NOT NULL,
                created_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                level TEXT DEFAULT 'info',
                message TEXT NOT NULL,
                created_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS scheduled (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                url TEXT NOT NULL,
                dl_type TEXT DEFAULT 'video',
                format_id TEXT DEFAULT '',
                run_at REAL NOT NULL,
                status TEXT DEFAULT 'pending',
                created_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS watchlist (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                url TEXT NOT NULL UNIQUE,
                title TEXT DEFAULT '',
                last_checked REAL DEFAULT 0,
                interval_hours INTEGER DEFAULT 24,
                auto_download INTEGER DEFAULT 0,
                created_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS search_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                query TEXT NOT NULL,
                created_at REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_downloads_status ON downloads(status);
            CREATE INDEX IF NOT EXISTS idx_downloads_created ON downloads(created_at DESC);
            """
        )
        for k, v in DEFAULT_SETTINGS.items():
            conn.execute(
                "INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)", (k, v)
            )
        conn.commit()


def get_settings() -> dict[str, str]:
    with _lock, _connect() as conn:
        rows = conn.execute("SELECT key, value FROM settings").fetchall()
        out = dict(DEFAULT_SETTINGS)
        out.update({r["key"]: r["value"] for r in rows})
        return out


def set_settings(patch: dict[str, str]) -> dict[str, str]:
    with _lock, _connect() as conn:
        for k, v in patch.items():
            conn.execute(
                "INSERT INTO settings(key, value) VALUES (?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (k, str(v)),
            )
        conn.commit()
    return get_settings()


def is_incognito() -> bool:
    return get_settings().get("incognito") == "true"


def add_log(level: str, message: str) -> None:
    if is_incognito():
        return
    with _lock, _connect() as conn:
        conn.execute(
            "INSERT INTO logs(level, message, created_at) VALUES (?, ?, ?)",
            (level, message[:4000], time.time()),
        )
        conn.commit()


def get_logs(limit: int = 300) -> list[dict]:
    with _lock, _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM logs ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(r) for r in rows]


def clear_logs() -> None:
    with _lock, _connect() as conn:
        conn.execute("DELETE FROM logs")
        conn.commit()


def create_download(payload: dict) -> dict:
    now = time.time()
    with _lock, _connect() as conn:
        cur = conn.execute(
            """INSERT INTO downloads
               (url, title, thumbnail, uploader, duration, dl_type, format_id,
                status, filename_template, custom_args, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?)""",
            (
                payload.get("url", ""),
                payload.get("title", ""),
                payload.get("thumbnail", ""),
                payload.get("uploader", ""),
                float(payload.get("duration") or 0),
                payload.get("dl_type", "video"),
                payload.get("format_id", ""),
                payload.get("filename_template", ""),
                payload.get("custom_args", ""),
                now,
            ),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM downloads WHERE id = ?", (cur.lastrowid,)
        ).fetchone()
        return dict(row)


def update_download(dl_id: int, **fields) -> dict | None:
    if not fields:
        return get_download(dl_id)
    cols = ", ".join(f"{k} = ?" for k in fields)
    with _lock, _connect() as conn:
        conn.execute(
            f"UPDATE downloads SET {cols} WHERE id = ?", (*fields.values(), dl_id)
        )
        conn.commit()
    return get_download(dl_id)


def get_download(dl_id: int) -> dict | None:
    with _lock, _connect() as conn:
        row = conn.execute(
            "SELECT * FROM downloads WHERE id = ?", (dl_id,)
        ).fetchone()
        return dict(row) if row else None


def list_downloads(status: str | None = None, q: str = "", limit: int = 200) -> list[dict]:
    sql = "SELECT * FROM downloads"
    clauses, params = [], []
    if status:
        clauses.append("status = ?")
        params.append(status)
    if q:
        clauses.append("(title LIKE ? OR url LIKE ? OR uploader LIKE ?)")
        params += [f"%{q}%"] * 3
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    sql += " ORDER BY created_at DESC LIMIT ?"
    params.append(limit)
    with _lock, _connect() as conn:
        return [dict(r) for r in conn.execute(sql, params).fetchall()]


def delete_download(dl_id: int) -> bool:
    with _lock, _connect() as conn:
        cur = conn.execute("DELETE FROM downloads WHERE id = ?", (dl_id,))
        conn.commit()
        return cur.rowcount > 0


def find_duplicate(url: str, format_id: str) -> dict | None:
    with _lock, _connect() as conn:
        row = conn.execute(
            """SELECT * FROM downloads WHERE url = ? AND format_id = ?
               AND status = 'completed' ORDER BY created_at DESC LIMIT 1""",
            (url, format_id),
        ).fetchone()
        return dict(row) if row else None


def stats() -> dict:
    with _lock, _connect() as conn:
        total = conn.execute("SELECT COUNT(*) c FROM downloads").fetchone()["c"]
        done = conn.execute(
            "SELECT COUNT(*) c FROM downloads WHERE status='completed'"
        ).fetchone()["c"]
        failed = conn.execute(
            "SELECT COUNT(*) c FROM downloads WHERE status='failed'"
        ).fetchone()["c"]
        size = conn.execute(
            "SELECT COALESCE(SUM(filesize),0) s FROM downloads WHERE status='completed'"
        ).fetchone()["s"]
        active = conn.execute(
            "SELECT COUNT(*) c FROM downloads WHERE status IN ('downloading','paused','queued','processing')"
        ).fetchone()["c"]
        return {
            "total": total,
            "completed": done,
            "failed": failed,
            "active": active,
            "bytes": int(size),
        }


# --- şablonlar -------------------------------------------------------------
def list_templates() -> list[dict]:
    with _lock, _connect() as conn:
        return [
            dict(r)
            for r in conn.execute(
                "SELECT * FROM templates ORDER BY created_at DESC"
            ).fetchall()
        ]


def create_template(name: str, command: str) -> dict:
    with _lock, _connect() as conn:
        cur = conn.execute(
            "INSERT INTO templates(name, command, created_at) VALUES (?, ?, ?)",
            (name, command, time.time()),
        )
        conn.commit()
        return dict(
            conn.execute(
                "SELECT * FROM templates WHERE id = ?", (cur.lastrowid,)
            ).fetchone()
        )


def delete_template(tid: int) -> bool:
    with _lock, _connect() as conn:
        cur = conn.execute("DELETE FROM templates WHERE id = ?", (tid,))
        conn.commit()
        return cur.rowcount > 0


# --- zamanlanmış -----------------------------------------------------------
def list_scheduled() -> list[dict]:
    with _lock, _connect() as conn:
        return [
            dict(r)
            for r in conn.execute(
                "SELECT * FROM scheduled ORDER BY run_at ASC"
            ).fetchall()
        ]


def create_scheduled(payload: dict) -> dict:
    with _lock, _connect() as conn:
        cur = conn.execute(
            """INSERT INTO scheduled(url, dl_type, format_id, run_at, status, created_at)
               VALUES (?, ?, ?, ?, 'pending', ?)""",
            (
                payload["url"],
                payload.get("dl_type", "video"),
                payload.get("format_id", ""),
                float(payload["run_at"]),
                time.time(),
            ),
        )
        conn.commit()
        return dict(
            conn.execute(
                "SELECT * FROM scheduled WHERE id = ?", (cur.lastrowid,)
            ).fetchone()
        )


def update_scheduled(sid: int, **fields) -> None:
    cols = ", ".join(f"{k} = ?" for k in fields)
    with _lock, _connect() as conn:
        conn.execute(
            f"UPDATE scheduled SET {cols} WHERE id = ?", (*fields.values(), sid)
        )
        conn.commit()


def delete_scheduled(sid: int) -> bool:
    with _lock, _connect() as conn:
        cur = conn.execute("DELETE FROM scheduled WHERE id = ?", (sid,))
        conn.commit()
        return cur.rowcount > 0


# --- izleme listesi --------------------------------------------------------
def list_watchlist() -> list[dict]:
    with _lock, _connect() as conn:
        return [
            dict(r)
            for r in conn.execute(
                "SELECT * FROM watchlist ORDER BY created_at DESC"
            ).fetchall()
        ]


def create_watchlist(payload: dict) -> dict:
    with _lock, _connect() as conn:
        cur = conn.execute(
            """INSERT OR IGNORE INTO watchlist(url, title, interval_hours, auto_download, created_at)
               VALUES (?, ?, ?, ?, ?)""",
            (
                payload["url"],
                payload.get("title", ""),
                int(payload.get("interval_hours", 24)),
                1 if payload.get("auto_download") else 0,
                time.time(),
            ),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM watchlist WHERE url = ?", (payload["url"],)
        ).fetchone()
        return dict(row)


def update_watchlist(wid: int, **fields) -> None:
    cols = ", ".join(f"{k} = ?" for k in fields)
    with _lock, _connect() as conn:
        conn.execute(
            f"UPDATE watchlist SET {cols} WHERE id = ?", (*fields.values(), wid)
        )
        conn.commit()


def delete_watchlist(wid: int) -> bool:
    with _lock, _connect() as conn:
        cur = conn.execute("DELETE FROM watchlist WHERE id = ?", (wid,))
        conn.commit()
        return cur.rowcount > 0


# --- arama geçmişi ---------------------------------------------------------
def add_search(q: str) -> None:
    if is_incognito() or not q.strip():
        return
    with _lock, _connect() as conn:
        conn.execute(
            "INSERT INTO search_history(query, created_at) VALUES (?, ?)",
            (q.strip(), time.time()),
        )
        conn.commit()


def list_search(limit: int = 20) -> list[dict]:
    with _lock, _connect() as conn:
        return [
            dict(r)
            for r in conn.execute(
                "SELECT * FROM search_history ORDER BY id DESC LIMIT ?", (limit,)
            ).fetchall()
        ]


def export_backup() -> dict:
    with _lock, _connect() as conn:
        return {
            "app": "TUGRUL DOWNLOAD",
            "version": 1,
            "exported_at": time.time(),
            "settings": get_settings(),
            "templates": [
                dict(r)
                for r in conn.execute("SELECT name, command FROM templates").fetchall()
            ],
            "watchlist": [
                dict(r)
                for r in conn.execute(
                    "SELECT url, title, interval_hours, auto_download FROM watchlist"
                ).fetchall()
            ],
            "history": [
                dict(r)
                for r in conn.execute(
                    "SELECT url, title, uploader, dl_type, format_id, status, filepath, filesize, created_at FROM downloads ORDER BY created_at DESC LIMIT 1000"
                ).fetchall()
            ],
        }


def import_backup(data: dict) -> dict:
    counts = {"settings": 0, "templates": 0, "watchlist": 0, "history": 0}
    if isinstance(data.get("settings"), dict):
        set_settings({k: str(v) for k, v in data["settings"].items()})
        counts["settings"] = len(data["settings"])
    for t in data.get("templates", []) or []:
        if t.get("name") and t.get("command"):
            create_template(t["name"], t["command"])
            counts["templates"] += 1
    for w in data.get("watchlist", []) or []:
        if w.get("url"):
            create_watchlist(w)
            counts["watchlist"] += 1
    for h in data.get("history", []) or []:
        if h.get("url"):
            create_download(h)
            counts["history"] += 1
    return counts


def dumps(obj) -> str:
    return json.dumps(obj, ensure_ascii=False)
