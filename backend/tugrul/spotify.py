"""Yardımcı servisler — lrclib söz arama, OpenGraph önizleme ve Spotify bağlantı çözümü."""
from __future__ import annotations

import html
import re

import httpx

UA = {"User-Agent": "Mozilla/5.0 (compatible; TugrulDownload/1.0)"}


async def find_lyrics(title: str, artist: str = "") -> dict:
    """lrclib.net üzerinden senkron/sade söz arar."""
    title = re.sub(r"\(.*?\)|\[.*?\]", "", title or "").strip()
    title = re.sub(r"\s*(official|video|lyric|audio|hd|4k).*$", "", title, flags=re.I).strip()
    params = {"track_name": title or " ", "artist_name": artist or ""}
    async with httpx.AsyncClient(timeout=15, headers=UA) as client:
        r = await client.get("https://lrclib.net/api/search", params=params)
        if r.status_code >= 400:
            return {"found": False, "error": "Söz servisine ulaşılamadı"}
        results = r.json() or []
    if not results:
        return {"found": False}
    best = results[0]
    return {
        "found": True,
        "track": best.get("trackName"),
        "artist": best.get("artistName"),
        "album": best.get("albumName"),
        "duration": best.get("duration"),
        "synced": best.get("syncedLyrics") or "",
        "plain": best.get("plainLyrics") or "",
        "id": best.get("id"),
    }


async def og_preview(url: str) -> dict:
    async with httpx.AsyncClient(
        timeout=15, headers=UA, follow_redirects=True
    ) as client:
        r = await client.get(url)
    text = r.text[:400_000]

    def meta(prop: str) -> str:
        for pat in (
            rf'<meta[^>]+property=["\']{prop}["\'][^>]*content=["\']([^"\']+)',
            rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]*property=["\']{prop}["\']',
            rf'<meta[^>]+name=["\']{prop}["\'][^>]*content=["\']([^"\']+)',
        ):
            m = re.search(pat, text, re.I)
            if m:
                return html.unescape(m.group(1))
        return ""

    title = meta("og:title") or meta("twitter:title")
    if not title:
        m = re.search(r"<title[^>]*>(.*?)</title>", text, re.I | re.S)
        title = html.unescape(m.group(1)).strip() if m else ""
    return {
        "title": title,
        "description": meta("og:description") or meta("description"),
        "image": meta("og:image") or meta("twitter:image"),
        "site": meta("og:site_name"),
        "url": str(r.url),
    }


SPOTIFY_RE = re.compile(r"open\.spotify\.com/(?:intl-[a-z-]+/)?(track|album|playlist)/([A-Za-z0-9]+)")


def spotify_hint(url: str) -> dict | None:
    """Spotify bağlantısını yt-dlp'nin anlayacağı biçime çevirir."""
    m = SPOTIFY_RE.search(url or "")
    if not m:
        return None
    kind, sid = m.group(1), m.group(2)
    return {
        "kind": kind,
        "id": sid,
        "supported": kind == "track",
        "note": (
            "Spotify parçaları meta veri olarak çözülür; ses akışı YouTube'dan alınır."
            if kind == "track"
            else "Spotify albüm/listeleri için parça bağlantılarını tek tek ekleyin."
        ),
    }
