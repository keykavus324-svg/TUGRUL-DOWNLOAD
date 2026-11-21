# Yayın rehberi

## 1. GitHub Pages (statik demo)

Canlı adres (açıldıktan sonra):

> **https://keykavus324-svg.github.io/TUGRUL-DOWNLOAD/**

### Tek adımlık ayar (gerekli — yalnızca bir kez)

Pages **bir kez** etkinleştirilmelidir; bunu depo sahibi yapabilir:

**Settings → Pages → Build and deployment**

| Alan | Değer |
|---|---|
| Source | **GitHub Actions** |

Kaydettikten sonra: **Actions → “GitHub Pages (statik demo)” → Re-run all jobs**
(veya `main` dalına yeni bir commit). İlk yayın ~1 dakika sürer.

CLI ile yapmak isterseniz (kişisel token gerekir):

```bash
gh api -X POST repos/keykavus324-svg/TUGRUL-DOWNLOAD/pages -f build_type=workflow
```

### Alternatif: `gh-pages` dalı

Actions'taki Pages izinleri açılmadan da yayınlayabilirsiniz:

```bash
npm --prefix frontend run build:ghpages
npx gh-pages -d frontend/dist          # gh-pages dalına gönderir
```

Sonra **Settings → Pages → Source: Deploy from a branch → `gh-pages` / (root)**.

### Yerelde doğrulama

```bash
npm --prefix frontend run build:ghpages
npm --prefix frontend exec vite preview -- --mode ghpages
# http://localhost:5173  → çevrimdışı motor devrede, ?offline=1 ile zorlanır
```

## 2. Android APK

```bash
export ANDROID_HOME=$HOME/Android/Sdk
bash scripts/build-apk.sh            # debug
bash scripts/build-apk.sh release    # imzalı (keystore.properties)
# → dist-apk/tugrul-download-1.0.0-debug.apk
```

Depoda **Actions** üzerinden de üretilir: `.github/workflows/release.yml`
(“Sürüm paketleri”). Etiket atınca (`git tag v1.0.0 && git push --tags`) APK ve
web arşivi otomatik olarak **Releases**'e eklenir.

> Actions şu an depo ayarlarında kısıtlı olabilir: **Settings → Actions → General →
> “Allow all actions”** ve **Workflow permissions → Read and write** seçili olmalı.
> Kısıt varsa APK'yı yukarıdaki komutla yerelde derleyin.

## 3. Docker / kendi sunucunuz

```bash
docker build -t tugrul-download .
docker run -d -p 8000:8000 -v "$PWD/downloads:/app/downloads" tugrul-download
```

APK'nın **Ayarlar → Bağlı sunucu** alanına bu sunucunun adresini yazarsanız telefon
gerçek yt-dlp motoruna bağlanır.
