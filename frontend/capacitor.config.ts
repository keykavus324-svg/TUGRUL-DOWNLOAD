import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.tugrul.studio",
  appName: "TUĞRUL DOWNLOAD",
  webDir: "dist",
  bundledWebRuntime: false,
  android: {
    allowMixedContent: false,
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
