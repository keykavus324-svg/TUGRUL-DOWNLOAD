import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.tugrul.studio",
  appName: "TUĞRUL DOWNLOAD",
  webDir: "dist",
  android: {
    // Ayarlar → "Yerel sunucu" alanına http://192.168.1.x:8000 yazıldığında
    // WebView'in o adrese gitmesine izin ver (kendi ağınızdaki motor).
    allowMixedContent: true,
    backgroundColor: "#07080c",
  },
  server: {
    androidScheme: "https",
  },
  plugins: {
    SplashScreen: {
      backgroundColor: "#07080c",
      showSpinner: false,
      launchAutoHide: true,
    },
  },
};

export default config;
