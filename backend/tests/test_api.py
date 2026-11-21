"""TUĞRUL DOWNLOAD — uçtan uca API testleri.

Çalıştırma:  python3 -m pytest backend/tests -q
"""
import os
import sys
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

# testler ayrı bir veri/indirme alanı kullansın
os.environ.setdefault("TUGTRUL_TEST", "1")

from tugrul import db, demo, media  # noqa: E402
from tugrul.api import app  # noqa: E402


@pytest.fixture(scope="module")
def client():
    db.init_db()
    with TestClient(app) as c:
        yield c


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is True
    assert data["ffmpeg"] is True
    assert data["ytdlp"]


def test_demo_samples(client):
    r = client.get("/api/demo/samples")
    items = r.json()["items"]
    assert len(items) >= 3
    assert items[0]["url"].startswith("demo://")


def test_info_demo(client):
    r = client.post("/api/info", json={"url": "demo://demo001"})
    assert r.status_code == 200
    data = r.json()
    assert data["title"]
    assert data["videos"] and data["audios"]
    assert data["best_video"]["kind"] == "video"
    assert data["has_audio"] is True


def test_info_invalid(client):
    r = client.post("/api/info", json={"url": "kesinlikle-gecersiz-bir-adres"})
    assert r.status_code == 422
    assert "desteklenmiyor" in r.json()["detail"].lower() or "ulaşılamadı" in r.json()["detail"].lower()


def test_download_lifecycle(client):
    r = client.post(
        "/api/downloads",
        json={"url": "demo://demo003", "dl_type": "audio", "format_id": "a320", "title": "Test ses"},
    )
    assert r.status_code == 200
    dl_id = r.json()["item"]["id"]

    deadline = time.time() + 60
    status = "queued"
    while time.time() < deadline:
        item = client.get(f"/api/downloads/{dl_id}").json()
        status = item["status"]
        if status in ("completed", "failed"):
            break
        time.sleep(1)

    item = client.get(f"/api/downloads/{dl_id}").json()
    assert item["status"] == "completed", item.get("error")
    assert item["progress"] == 100
    assert Path(item["filepath"]).exists()

    # dosya servisi
    f = client.get(f"/api/downloads/{dl_id}/file")
    assert f.status_code == 200 and len(f.content) > 1000

    # temizlik
    assert client.delete(f"/api/downloads/{dl_id}").status_code == 200


def test_settings_roundtrip(client):
    before = client.get("/api/settings").json()
    r = client.put("/api/settings", json={"patch": {"rate_limit": "2M"}})
    assert r.json()["rate_limit"] == "2M"
    client.put("/api/settings", json={"patch": {"rate_limit": before.get("rate_limit", "")}})


def test_templates(client):
    created = client.post("/api/templates", json={"name": "Test şablon", "command": "-f best"}).json()
    assert created["id"]
    ids = [t["id"] for t in client.get("/api/templates").json()["items"]]
    assert created["id"] in ids
    assert client.delete(f"/api/templates/{created['id']}").status_code == 200


def test_scheduled(client):
    run_at = time.time() + 3600
    created = client.post(
        "/api/scheduled", json={"url": "demo://demo001", "run_at": run_at, "dl_type": "video"}
    ).json()
    assert created["status"] == "pending"
    assert client.delete(f"/api/scheduled/{created['id']}").status_code == 200


def test_watchlist(client):
    created = client.post(
        "/api/watchlist", json={"url": "demo://watch-test", "title": "Kanal", "interval_hours": 6}
    ).json()
    assert created["id"]
    assert client.delete(f"/api/watchlist/{created['id']}").status_code == 200


def test_backup_restore(client):
    backup = client.get("/api/backup")
    assert backup.status_code == 200
    data = backup.json()
    assert data["app"] == "TUGRUL DOWNLOAD"
    r = client.post("/api/restore", json={"data": data})
    assert r.status_code == 200


def test_files_listing(client):
    r = client.get("/api/files")
    assert r.status_code == 200
    assert "items" in r.json()


def test_path_traversal_blocked(client):
    r = client.get("/api/files/raw", params={"path": "/etc/passwd"})
    assert r.status_code == 404
    r2 = client.delete("/api/files", params={"path": "/etc/passwd"})
    assert r2.status_code == 400


def test_format_parsing():
    v = media._parse_rate("5M")
    assert v == 5 * 1024 * 1024
    assert media._parse_rate("800K") == 800 * 1024
    assert media._parse_rate("saçma") == 0
    opts = media._parse_custom_args("--limit-rate 2M --no-mtime -f best")
    assert opts["ratelimit"] == 2 * 1024 * 1024
    assert opts["updatetime"] is False
    assert opts["format"] == "best"


def test_human_error_mapping():
    assert "Çerez" in media._human_error("ERROR: Private video. Sign in")
    assert "bölge" in media._human_error("This video is not available in your country")
    assert "ağ" in media._human_error("TLS/SSL connection has been closed").lower() or \
        "bağlantı" in media._human_error("TLS/SSL connection has been closed").lower()


def test_demo_media_generation(tmp_path):
    out = demo.produce("demo://demo004", "video", "h1080", lambda _x: None)
    p = Path(out)
    assert p.exists() and p.stat().st_size > 10_000
