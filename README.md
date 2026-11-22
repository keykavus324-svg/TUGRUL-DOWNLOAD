# TUĞRUL DOWNLOAD

Android için yt-dlp tabanlı video ve ses indirme uygulaması. Bağlantıları paylaşarak veya uygulamaya yapıştırarak indirin; biçim seçin, sıraya alın ve indirmeleri yönetin.

## Kurulum ve kullanım

[GitHub sürümleri](https://github.com/keykavus324-svg/TUGRUL-DOWNLOAD/releases) sayfasından cihazınıza uygun APK'yı indirin. Debug olarak belirtilen APK'lar test içindir. Ayrıntılı adımlar ve sorun giderme için [kullanım kılavuzuna](KULLANIM.md) bakın.

## Geliştirme

Android Studio, JDK 17 ve Android SDK 36 gerekir. SDK yapılandırıldıktan sonra:

```sh
./gradlew assembleGithubDebug
```

APK'lar `app/build/outputs/apk/github/debug/` altında oluşturulur. İmzalı yayın APK'sı için ayrıca bir imzalama anahtarı gerekir. [Kaynak ve derleme notları](KAYNAK.md).

## Kaynak ve lisans

TUĞRUL DOWNLOAD, Denis Çerri tarafından geliştirilen [YTDLnis](https://github.com/deniscerri/ytdlnis) projesinin GPL-3.0 lisanslı kaynak kodundan türetilmiştir. [Lisans](LICENSE), [kaynak bilgileri](KAYNAK.md) ve [özgün proje README'si](docs/UPSTREAM-README.md). yt-dlp ve diğer bağımlılıklar kendi lisanslarına tabidir. İndirme yaparken içerik sahibinin haklarına ve ilgili platformun kurallarına uyun.
