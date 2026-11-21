# Android APK

TUĞRUL DOWNLOAD'ın Android sürümü, aynı arayüzün **Capacitor** kabuğu içinde
paketlenmiş hâlidir: tek kod tabanı, iki dağıtım (web + APK).

## Hazır APK'yı indir

* **Sürümler sayfası:** <https://github.com/keykavus324-svg/TUGRUL-DOWNLOAD/releases/latest>
  → `tugrul-download-1.0.0-debug.apk`
* Ya da Actions → **Sürüm paketleri** → Artifacts → `tugrul-download-apk`

Kurulum: APK'yı telefona indir → aç → “bilinmeyen kaynaklara izin ver” → kur.
Uygulama `com.tugrul.studio` paket adıyla, kendi ikonu ve başlangıç ekranıyla gelir.

## İki çalışma modu

| Mod | Nasıl | Ne yapar |
|---|---|---|
| **Demo (varsayılan)** | Kur, aç | Cihaz içi motor: kuyruk, ilerleme, kalıcılık (IndexedDB), demo medya üretimi, izleme/şablon/istatistik, tüm arayüz. Ağ gerekmez. |
| **Gerçek motor** | Ayarlar → **Bağlı sunucu** = `http://<bilgisayar-ip>:8000` | APK, aynı ağdaki TUĞRUL DOWNLOAD sunucusuna bağlanır → **gerçek yt-dlp indirmeleri**, FFmpeg stüdyosu, tüm özellikler |

> Neden sunucu? yt-dlp + FFmpeg'i Android'de çalıştırmak ~80 MB Python/FFmpeg
> paketi ve JNI köprüsü gerektirir. APK'yı hafif (≈5 MB) tutmak ve mağaza
> politikalarına uygun kalmak için motor sunucuda çalışır; telefon arayüz olur.
> Yerel (on-device) motor isteyenler için yol haritası: chaquopy + yt-dlp.

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
# → dist-apk/tugrul-download-1.0.0-debug.apk
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
| Sürüm | `1.0.0` (versionCode 1) |
| minSdk / targetSdk | 22 / 34 |
| İzinler | INTERNET, ACCESS_NETWORK_STATE |
| Ekstra | Paylaş menüsünden bağlantı alma (`ACTION_SEND`), `tugrul://open` derin bağlantısı |

## Mağaza notu

Google Play, “başka sitelerden içerik indirme” uygulamalarına karşı hassastır.
Bu yüzden APK varsayılan olarak **demo/istemci** modunda gelir; gerçek indirme
motoru kullanıcının kendi cihazında/ağında çalışan sunucudadır. Yayınlarken
mağaza politikasını ve telif kurallarını gözetin.
