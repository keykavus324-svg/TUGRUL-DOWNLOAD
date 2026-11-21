# Değişiklik Günlüğü

Biçim: [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/) · Sürümleme: SemVer.

## [1.0.0] — 2026-11-21

### Eklendi
- **Sunucu modu** (Python/FastAPI): yt-dlp ile gerçek indirme, kuyruk, duraklat/devam,
  iptal, yeniden dene, SSE canlı ilerleme, yeniden başlatmada otomatik kurtarma.
- **Format çözümleme**: video/ses/muxed akışları, fps/HDR/codec/boyut, altyazı dilleri, bölümler.
- **Toplu işler**: oynatma listesi seçimi + aralık filtresi, 500 öğeye kadar kuyruk.
- **Stüdyo**: kes, kırp, format dönüştür, GIF, lrclib söz arama + `.lrc` / gömme.
- **Kalite**: SponsorBlock (işaretle/kes), altyazı gömme, kapak+etiket+bölüm, çerez,
  proxy, hız sınırı, dosya adı şablonları, 6 hazır komut şablonu.
- **Arayüz**: 10 sayfa, abanoz+altın ve açık tema, mobil menü, hızlı indirme çubuğu,
  klavye kısayolları, canlı bildirimler.
- **Çevrimdışı motor**: GitHub Pages/APK için tarayıcı içi kuyruk, kalıcılık (IndexedDB),
  demo medya üretimi — sunucu olmadan tüm arayüz çalışır.
- **Android APK**: Capacitor kabuğu, `com.tugrul.studio`, özel ikon/splash, paylaşımdan
  bağlantı alma, derin bağlantı, Ayarlar'dan uzak sunucuya bağlanma.
- **Dağıtım**: GitHub Actions (Pages + sürüm paketleri), Docker, tek komut kurulum.
- **Test**: 15 pytest uçtan uca test + çevrimdışı motor duman testi.

[1.0.0]: https://github.com/keykavus324-svg/TUGRUL-DOWNLOAD/releases/tag/v1.0.0
