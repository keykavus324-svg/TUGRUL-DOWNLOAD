# Android APK

TUĞRUL DOWNLOAD'ın Android sürümü, aynı arayüzün **Capacitor** kabuğu içinde
paketlenmiş hâlidir: tek kod tabanı, iki dağıtım (web + APK).

## Hazır APK'yı indir

* **Sürümler sayfası:** <https://github.com/keykavus324-svg/TUGRUL-DOWNLOAD/releases/latest>
  → `tugrul-download-1.0.3-debug.apk`
* Ya da Actions → **Sürüm paketleri** → Artifacts → `tugrul-download-apk`

Kurulum: APK'yı telefona indir → aç → “bilinmeyen kaynaklara izin ver” → kur.
Uygulama `com.tugrul.studio` paket adıyla, kendi ikonu ve başlangıç ekranıyla gelir.

## Nasıl çalışıyor

| Katman | Ne yapar |
|---|---|
| **Motor (APK içi)** | `YtdlpPlugin.java` → [`youtubedl-android`](https://github.com/junkfood02/youtubedl-android): **yt-dlp + Python + FFmpeg telefonda çalışır** (YTDLnis ile aynı kütüphane). Sunucu, proxy, bulut ucu gerekmez. |
| **Cihaz (APK içi)** | Arayüz + kuyruk, ilerleme, duraklat/devam, kalıcılık (IndexedDB), izleme/şablon/istatistik. Dosya doğrudan `İndirilenler/TUGRUL DOWNLOAD` klasörüne yazılır. |
| **Motor (isteğe bağlı, tam güç)** | Ayarlar → **Yerel sunucu** = `http://<bilgisayar-ip>:8000` → aynı ağdaki TUĞRUL DOWNLOAD sunucusu: FFmpeg stüdyosu, toplu işler, oynatma listeleri. |

Bağlantıyı yapıştırmanız yeterli — indirme kendiliğinden başlar ve dosya telefona yazılır.

### Köprü (WebView ↔ Java)

```
Ytdlp.init()                 Python/yt-dlp/FFmpeg'i hazırlar (ilk açılışta birkaç saniye)
Ytdlp.info(url)              --dump-single-json → başlık, süre, formatlar
Ytdlp.download({url,type})   -o Download/TUGRUL DOWNLOAD/… · ilerleme "progress" olayıyla akar
Ytdlp.cancel(id)             destroyProcessById → çalışan indirmeyi durdurur
```

* Bağımlılıklar: `io.github.junkfood02.youtubedl-android:library:0.18.1` + `:ffmpeg:0.18.1`
  (mavenCentral), `minSdk 24`, `extractNativeLibs=true`, ABI'ler `arm64-v8a` + `armeabi-v7a`.
* Doğrulama: `node frontend/native-download-test.mjs` — dış ağ **tamamen kapalıyken**
  yapıştır → çöz → indir → dosya cihazda (20 kontrol).
* Bu alan için APK düz HTTP'ye de izin verir (`usesCleartextTraffic=true`), böylece
  yerel sunucu modu çalışır; motorun kendisi doğrudan HTTPS ile kaynak siteye gider.

### Telefonu sunucuya bağlama (2 dakika)

```bash
# bilgisayarda
bash scripts/start.sh                 # http://0.0.0.0:8000
hostname -I                           # örn. 192.168.1.20
```

Telefonda: **Ayarlar → Bağlı sunucu → `http://192.168.1.20:8000` → Bağlan**.

## Kendin derle

```bash
# gereksinimler: JDK 17+, Android SDK (ANDROID_HOME), Node 18+
export ANDROID_HOME=$HOME/Android/Sdk
bash scripts/build-apk.sh            # debug APK
bash scripts/build-apk.sh release    # imzalı sürüm (keystore.properties gerekir)
# → dist-apk/tugrul-download-1.0.3-debug.apk
```

### İmzalı sürüm

`frontend/android/keystore.properties` oluşturun (depoya **eklemeyin**):

```properties
storeFile=../tugrul.keystore
storePassword=***
keyAlias=tugrul
keyPassword=***
```

```bash
keytool -genkey -v -keystore frontend/android/tugrul.keystore -alias tugrul \
        -keyalg RSA -keysize 2048 -validity 10000
```

## Uygulama kimliği

| Alan | Değer |
|---|---|
| Paket | `com.tugrul.studio` |
| Sürüm | `1.0.3` (versionCode 4) |
| minSdk / targetSdk | 24 / 34 |
| ABI | `arm64-v8a`, `armeabi-v7a` |
| İzinler | INTERNET, ACCESS_NETWORK_STATE, WRITE_EXTERNAL_STORAGE (yalnız API ≤ 28) |
| Kayıt yolu | `İndirilenler/TUGRUL DOWNLOAD/<başlık>.<uzantı>` (API 30+ izinsiz; API ≤ 28'de izin ister) |
| Ekstra | Paylaş menüsünden bağlantı alma (`ACTION_SEND`), `tugrul://open` derin bağlantısı |

## Mağaza notu

Google Play, “başka sitelerden içerik indirme” uygulamalarına karşı hassastır.
APK artık tam işlevsel bir indiricidir (motor cihazda); yayınlarken mağaza
politikasını ve telif kurallarını gözetin.
