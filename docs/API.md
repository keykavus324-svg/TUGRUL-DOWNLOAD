# API Başvurusu

Temel adres: `http://localhost:8000` — tüm yanıtlar JSON (dosya/SSE hariç).

## Sağlık & motor

| Yöntem | Yol | Açıklama |
|---|---|---|
| GET | `/api/health` | sürüm, yt-dlp sürümü, FFmpeg varlığı, disk, aktif iş sayısı |
| POST | `/api/info` | bağlantı çözümleme (`{"url": "...", "playlist": false}`) |
| POST | `/api/search` | YouTube araması (`{"query": "...", "limit": 20}`) |
| GET | `/api/search/history` | son aramalar |
| GET | `/api/demo/samples` | demo bağlantıları |

```bash
curl -s -X POST localhost:8000/api/info \
  -H 'content-type: application/json' \
  -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}' | jq '.title, .videos[0]'
```

`/api/info` yanıtı (özet): `title, thumbnail, uploader, duration, duration_text,
videos[], audios[], muxed[], subtitles{}, auto_subtitles[], chapters[],
best_video, best_audio, has_video, has_audio, extractor, webpage_url`.

Oynatma listesi istenirse `playlist: true` → `{playlist: true, entries: [...]}`.

## İndirmeler

| Yöntem | Yol | Açıklama |
|---|---|---|
| GET | `/api/downloads?status=&q=&limit=` | liste |
| POST | `/api/downloads` | kuyruğa ekle |
| POST | `/api/downloads/bulk` | `{items: [...]}` (en fazla 500) |
| GET | `/api/downloads/{id}` | tek kayıt |
| DELETE | `/api/downloads/{id}?remove_file=` | sil |
| POST | `/api/downloads/{id}/pause` | duraklat |
| POST | `/api/downloads/{id}/resume` | devam |
| POST | `/api/downloads/{id}/cancel` | iptal |
| POST | `/api/downloads/{id}/retry` | yeniden dene |
| GET | `/api/downloads/{id}/file` | dosyayı indir |
| GET | `/api/events` | SSE canlı akış |

Eklerken gövde:

```json
{
  "url": "https://...",
  "dl_type": "video",            // video | audio
  "format_id": "h1080",          // h{height} | yt-dlp format_id | mp3/m4a
  "title": "", "thumbnail": "", "uploader": "", "duration": 0,
  "filename_template": "%(uploader)s - %(title)s.%(ext)s",
  "custom_args": "--limit-rate 5M",
  "skip_duplicate": true
}
```

Yanıt: `{"duplicate": false, "item": {...}}`. Aynı url+format tamamlanmışsa
`duplicate: true` ve mevcut kayıt döner.

## Ayarlar & araçlar

| Yöntem | Yol | Açıklama |
|---|---|---|
| GET | `/api/settings` | tüm ayarlar |
| PUT | `/api/settings` | `{patch: {...}}` |
| POST | `/api/cookies` | multipart `file` → cookies.txt |
| GET | `/api/files` | indirme klasörü listesi |
| GET | `/api/files/raw?path=` | dosyayı oynat/servis et (Range destekli) |
| DELETE | `/api/files?path=` | dosya sil (klasör dışına çıkılamaz) |
| POST | `/api/tools/cleanup` | `.part/.ytdl` artıklarını temizle |
| GET | `/api/tools/probe?path=` | medya bilgisi |
| POST | `/api/tools/cut` | `{path,start,end,reencode}` |
| POST | `/api/tools/crop` | `{path,x,y,width,height}` |
| POST | `/api/tools/convert` | `{path,target,quality}` |
| POST | `/api/tools/gif` | `{path,start,duration,width}` |
| POST | `/api/tools/lyrics` | `{path,lyrics}` → LRC veya gömülü |
| POST | `/api/lyrics?title=&artist=` | lrclib araması |
| GET | `/api/metadata/{url}` | OpenGraph önizleme |

## Planlama, izleme, şablonlar, veri

| Yöntem | Yol |
|---|---|
| GET/POST/DELETE | `/api/scheduled`, `/api/scheduled/{id}` |
| GET/POST/DELETE | `/api/watchlist`, `/api/watchlist/{id}` |
| GET/POST/DELETE | `/api/templates`, `/api/templates/{id}` |
| GET | `/api/stats` |
| GET/DELETE | `/api/logs` |
| GET | `/api/backup` (JSON indirir) |
| POST | `/api/restore` (`{data: {...}}`) |

## Hata biçimi

```json
{ "detail": "Bu video gizli. Çerez (cookies) ekleyerek tekrar deneyin." }
```

yt-dlp/FFmpeg hataları kullanıcıya anlaşılır Türkçe mesajlara çevrilir
(`media._human_error`).
