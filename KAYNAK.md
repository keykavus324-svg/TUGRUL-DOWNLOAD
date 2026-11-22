# Kaynak ve derleme

Bu depo, [deniscerri/ytdlnis](https://github.com/deniscerri/ytdlnis) Android projesinin `dc35efe6549b421ec556f47019d74d052fa570bc` revizyonundaki kaynak kodunu temel alır. Önceki web uygulaması kaldırılmıştır. Kaynak projenin lisansı ve telif bildirimleri korunmuştur; ayrıntılar için `LICENSE` ve özgün `docs/UPSTREAM-README.md` dosyasına bakın. YTDLnis adının kullanımıyla ilgili kısıtlamalar da özgün proje README'sinde açıklanır.

Uygulama TUGRUL DOWNLOAD adı ve `com.tugrul.download` uygulama kimliğiyle yapılandırılmıştır; Kotlin kaynak paketleri kaynak projeyle uyumluluk için korunmuştur. Kaynak projenin APK güncellemeleri farklı paket ve imza kullandığından uygulama güncelleme kanalı devre dışıdır; yt-dlp ve yardımcı paket güncellemeleri korunmuştur. Yeni kimlik nedeniyle eski YTDLnis kurulumunun verileri otomatik olarak taşınmaz. Kaynak depodaki otomasyon iş akışları, bu depoya ait olmayan yayınlama ve bildirim işlemlerini çalıştırmamaları için dahil edilmemiştir. Gradle ayarlarında kaynak depoda bulunmayan ve uygulamanın bağımlılığı olmayan boş modül girdileri çıkarılmıştır.

## Android debug APK

Android Studio, JDK 17 ve Android SDK 36 kurun. SDK yolunu Android Studio üzerinden yapılandırın veya `ANDROID_HOME` ortam değişkenini ayarlayın. Proje klasöründe:

```sh
./gradlew assembleGithubDebug
```

APK dosyaları `app/build/outputs/apk/github/debug/` altında oluşur. Bağımlılıkların indirilmesi için Google Maven, Maven Central, Gradle ve projede yapılandırılmış diğer depolara erişim gerekir. Yayın APK'sı için ayrıca uygun imzalama yapılandırması gerekir.
