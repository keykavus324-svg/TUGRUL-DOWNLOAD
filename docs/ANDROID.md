# Android APK

TUĞRUL DOWNLOAD'ın Android sürümü, aynı arayüzün **Capacitor** kabuğu içinde
paketlenmiş hâlidir: tek kod tabanı, iki dağıtım (web + APK).

## Hazır APK'yı indir

* **Sürümler sayfası:** <https://github.com/keykavus324-svg/TUGRUL-DOWNLOAD/releases/latest>
  → `tugrul-download-1.0.1-debug.apk`
* Ya da Actions → **Sürüm paketleri** → Artifacts → `tugrul-download-apk`

Kurulum: APK'yı telefona indir → aç → “bilinmeyen kaynaklara izin ver” → kur.
Uygulama `com.tugrul.studio` paket adıyla, kendi ikonu ve başlangıç ekranıyla gelir.

## Nasıl çalışıyor

| Katman | Ne yapar |
|---|---|
| **Cihaz (APK içi)** | Arayüz + kuyruk, ilerleme, duraklat/devam, kalıcılık (IndexedDB), izleme/şablon/istatistik. Dosya parça parça inince **diske yazılır** (`TUGRUL DOWNLOAD` klasörü). |
| **Motor (varsayılan)** | Sunucusuz yt-dlp ucu: `https://tugrul-run-tugrul1.vercel.app/api/index` — Ayarlar → **İndirme motoru** alanından değiştirilebilir. |
| **Motor (yerel, tam güç)** | Ayarlar → **Yerel sunucu** = `http://<bilgisayar-ip>:8000` → aynı ağdaki TUĞRUL DOWNLOAD sunucusu: FFmpeg stüdyosu, toplu işler, oynatma listeleri. |

Bağlantıyı yapıştırmanız yeterli — indirme hemen başlar.

> Neden sunucu? yt-dlp + FFmpeg'i Android'de çalıştırmak ~80 MB Python/FFmpeg
> paketi ve JNI köprüsü gerektirir. APK'yı hafif (≈5 MB) tutmak ve mağaza
> politikalarına uygun kalmak için motor dışarıda çalışır; telefon arayüz olur.
>
> Kendi ucunuzu yayınlamak: `vercel-api/` klasörünü Vercel'e taşıyın, sonra
> _Project Settings → Deployment Protection → "Only Preview Deployments"_
> (aksi hâlde `*.vercel.app` adresleri Vercel girişi ister ve uygulama motora ulaşamaz).
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
# → dist-apk/tugrul-download-1.0.1-debug.apk
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
| Sürüm | `1.0.1` (versionCode 2) |
| minSdk / targetSdk | 22 / 34 |
| İzinler | INTERNET, ACCESS_NETWORK_STATE, WRITE_EXTERNAL_STORAGE (yalnız API ≤ 28) |
| Kayıt yolu | `TUGRUL DOWNLOAD/<başlık>.<uzantı>` (paylaşılan depolama; izin verilmezse uygulama klasörü) |
| Ekstra | Paylaş menüsünden bağlantı alma (`ACTION_SEND`), `tugrul://open` derin bağlantısı |

## Mağaza notu

Google Play, “başka sitelerden içerik indirme” uygulamalarına karşı hassastır.
Bu yüzden APK varsayılan olarak **demo/istemci** modunda gelir; gerçek indirme
motoru kullanıcının kendi cihazında/ağında çalışan sunucudadır. Yayınlarken
mağaza politikasını ve telif kurallarını gözetin.
