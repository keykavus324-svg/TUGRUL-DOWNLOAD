import { engineMode } from "./engine";

/** Statik (sunucusuz) yayın modu — GitHub Pages, APK, file:// */
export const OFFLINE = engineMode === "offline";
