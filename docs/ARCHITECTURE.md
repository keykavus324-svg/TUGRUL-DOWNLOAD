# Mimari

## Genel bakış

TUĞRUL DOWNLOAD iki süreçten oluşur; üretimde tek porttan servis edilir.

```
tarayıcı ──► FastAPI :8000 ──┬─► /api/*        REST + SSE
                              ├─► /demo/thumbs demo kapakları
                              └─► /            derlenmiş React (frontend/dist)
```

Geliştirmede Vite :5173 arayüzü sunar ve `/api`, `/demo` isteklerini :8000'e proxy'ler.

## Katmanlar

| Modül | Sorumluluk |
|---|---|
| `backend/tugrul/api.py` | HTTP yüzeyi, doğrulama (pydantic), statik arayüz montajı |
| `backend/tugrul/manager.py` | Kuyruk, worker'lar, ilerleme kancaları, SSE yayını, zamanlayıcı |
| `backend/tugrul/media.py` | yt-dlp köprüsü: bilgi çözümleme, format özetleme, seçenek üretimi, arama, hata çevirisi |
| `backend/tugrul/tools.py` | FFmpeg: kes, kırp, dönüştür, GIF, söz gömme, medya bilgisi |
| `backend/tugrul/demo.py` | Ağsız ortamlar için gerçek medya üreten demo motoru |
| `backend/tugrul/spotify.py` | lrclib söz arama, OpenGraph önizleme, Spotify bağlantı çözümü |
| `backend/tugrul/db.py` | SQLite şeması, CRUD, ayarlar, yedek/geri yükleme |

## İndirme yaşam döngüsü

```
POST /api/downloads
      │  db.create_download → status=queued
      ▼
  queue.put(id) ──► worker ──► status=downloading
                                 │  yt-dlp (thread) ── progress_hooks
                                 │        └─► db.update + publish(SSE)
                                 ▼
                        postprocessor (FFmpeg) ── status=processing
                                 ▼
                        completed | failed | paused | canceled
```

* **Eşzamanlılık**: `settings.concurrent` kadar `asyncio.Task` worker. Ayar değişince
  `_respawn_workers()` farkı kapatır.
* **Duraklatma/iptal**: `_ctrl[id] = "pause" | "cancel"`; ilerleme kancası bunu görünce
  `_PauseSignal` (yt-dlp `DownloadCancelled` türevi) fırlatır. yt-dlp `.part` dosyasını
  silmez → devam ettirmede kaldığı yerden sürer.
* **Yeniden başlatma dayanıklılığı**: açılışta `queued/downloading/processing`
  durumundaki kayıtlar yeniden kuyruğa alınır.
* **Çıktı tespiti**: `prepare_filename` + olası uzantı varyantları + son çare olarak
  dizindeki en yeni dosya (10 dk içinde değişmişse).

## Olay akışı (SSE)

`GET /api/events` → `text/event-stream`. Her bağlantı kendi `asyncio.Queue`'sunu alır
(`manager.subscribe`), 20 sn sessizlikte `: ping` yorumu gönderilir (proxy'ler için).

Olay tipleri: `hello`, `queued`, `started`, `progress`, `processing`, `paused`,
`canceled`, `failed`, `completed`.

Arayüz `store.tsx` içinde bu olaylar tek yerde uygulanır; tüm sayfalar aynı canlı
listeyi paylaşır.

## Veri modeli (SQLite)

```
downloads(id, url, title, thumbnail, uploader, duration, dl_type, format_id,
          status, progress, speed, eta, filepath, filesize, error,
          filename_template, custom_args, created_at, finished_at)
settings(key, value)          -- 23 varsayılan anahtar
templates(id, name, command, created_at)
scheduled(id, url, dl_type, format_id, run_at, status, created_at)
watchlist(id, url, title, last_checked, interval_hours, auto_download, created_at)
search_history(id, query, created_at)
logs(id, level, message, created_at)
```

WAL modu, RLock ile korunan tek bağlantı fabrikası. Gizli modda `logs`,
`search_history` yazımları atlanır.

## Format seçimi

`media._summarize_formats()` yt-dlp `formats` listesini üç gruba ayırır:

* `videos` — video-only, çözünürlüğe göre azalan, `(height, ext, dynamic_range)` ile tekilleştirilmiş
* `audios` — audio-only, bitrate'e göre azalan
* `muxed` — video+audio birleşik

Seçim mantığı:

```python
audio  → FFmpegExtractAudio(preferredcodec, preferredquality)
video  → h{height} ise: bestvideo[height<=h][ext=mp4]+bestaudio[ext=m4a]/...
         format_id verilmişse doğrudan o akış
         aksi halde en iyi mp4+m4a, sonra en iyi herhangi
```

Sonrasında ayarlara göre `EmbedThumbnail`, `FFmpegMetadata`, `SponsorBlock` +
`ModifyChapters`, `FFmpegEmbedSubtitle` eklenir.

Serbest argümanlar (`--limit-rate`, `-f`, `--write-subs`, …) beyaz liste üzerinden
`_parse_custom_args()` ile sözlüğe çevrilir; keyfi kabuk komutu çalıştırılamaz.

## FFmpeg araçları

`ffmpeg_path()` sırayla: `FFMPEG_PATH` ortam değişkeni → `imageio-ffmpeg` gömülü
ikili → yok. `probe()` ffprobe gerektirmeden `ffmpeg -i` çıktısını ayrıştırır
(süre, codec, çözünürlük, fps, kanal, bit hızı).

Tüm araçlar `safe_path()` ile indirme klasörüne hapsedilir.

## Arayüz

* `HashRouter` — statik sunumda derin bağlantı sorunsuz.
* `store.tsx` — Context + `EventSource`; `downloads`, `stats`, `settings`, `health`.
* `Layout` — masaüstü yan menü, mobil alt menü, üst **QuickBar** (her sayfadan hızlı indirme).
* Sayfalar: Home, Search, Library, Studio, Queue, Schedule, Watch, Templates, Stats, Settings.
* Tema CSS değişkenleriyle (`html.light`) — koyu "abanoz + altın" varsayılan.

## Test stratejisi

`backend/tests/test_api.py` — `TestClient` ile gerçek FFmpeg çıktısı üreten uçtan uca
testler; ağ gerektirmez (demo motoru). Ayrıca birim testleri: hız ayrıştırma,
argüman beyaz listesi, hata mesajı eşlemesi, yol güvenliği.
