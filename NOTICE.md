# NOTICE — Köken, atıflar ve lisans

TUĞRUL DOWNLOAD, **özgün bir uygulamadır**. Kaynak kodu sıfırdan yazılmıştır;
hiçbir projeden dosya kopyalanmamıştır. Aşağıdaki projelerden **fikir/özellik
ilhamı** ve **çalışma zamanı bağımlılığı** olarak yararlanılmıştır.

## 1. YTDLnis (ilham)

* Proje: YTDLnis — Full-featured audio/video downloader for Android using yt-dlp
* Yazar: Denis Çerri
* Kaynak: https://github.com/deniscerri/ytdlnis
* Lisans: GNU GPL v3 (https://github.com/deniscerri/ytdlnis/blob/main/LICENSE)

TUĞRUL DOWNLOAD; YTDLnis'in ürün kurgusundan (kuyruk yönetimi, format seçimi,
komut şablonları, izleme listesi, SponsorBlock, altyazı gömme, söz arama, gizli
mod, yedekleme) esinlenmiştir. YTDLnis'in Android/Kotlin kaynak kodu, kaynak
dosyaları, çeviri dosyaları veya görselleri bu depoya **kopyalanmamıştır**;
uygulama web teknolojileriyle (Python + React) yeniden yazılmıştır.

Bu depo, aynı lisans ailesini (GPL-3.0-or-later) kullanarak uyumluluğu korur.

## 2. Çalışma zamanı bağımlılıkları

| Bileşen | Lisans | Kullanım |
|---|---|---|
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | Unlicense | İndirme/çözümleme motoru (alt süreç olarak kütüphane) |
| [FFmpeg](https://ffmpeg.org) (imageio-ffmpeg dağıtımı) | LGPL/GPL (derlemeye göre) | Medya işleme, kod dönüştürme |
| [FastAPI](https://fastapi.tiangolo.com) | MIT | HTTP API |
| [Uvicorn](https://www.uvicorn.org) | BSD-3-Clause | ASGI sunucu |
| [React](https://react.dev) | MIT | Arayüz |
| [Vite](https://vitejs.dev) | MIT | Derleme |
| [Tailwind CSS](https://tailwindcss.com) | MIT | Stil |
| [lucide-react](https://lucide.dev) | ISC | Simgeler |
| [Inter / Space Grotesk](https://fontsource.org) | SIL OFL 1.1 | Yazı tipleri |
| [lrclib.net](https://lrclib.net) | — | Söz arama servisi (API) |

## 3. Yasal uyarı

Bu yazılım yalnızca hak sahibi olduğunuz, kamu malı olan veya indirme izni
bulunan içerikler için kullanılmalıdır. Kullanıcı, içerik sağlayıcıların hizmet
koşullarına ve yürürlükteki telif mevzuatına uymakla yükümlüdür. Geliştiriciler
bu aracın hukuka aykırı kullanımından sorumlu tutulamaz.
