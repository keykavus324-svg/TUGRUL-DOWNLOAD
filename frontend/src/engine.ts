/**
 * TUĞRUL DOWNLOAD — çalışma modu algılama.
 *
 * `server`  : Python/FastAPI sunucusu (tam güç — gerçek yt-dlp + FFmpeg)
 * `offline` : Statik barındırma (GitHub Pages), Android APK (Capacitor) veya file://
 *             → tarayıcı içi motor (kuyruk, kalıcılık, demo medya üretimi)
 */

function detect(): "server" | "offline" {
  // Vite "ghpages" modunda derlendi → her zaman statik
  // (import.meta.env bazı derleme ortamlarında yoktur → savunmalı oku)
  const env = (import.meta as unknown as { env?: { MODE?: string; VITE_OFFLINE?: string } }).env || {};
  if (env.MODE === "ghpages" || env.VITE_OFFLINE === "1") return "offline";
  if (typeof window === "undefined") return "server";

  const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
  if (w.Capacitor?.isNativePlatform?.() || /Capacitor/i.test(navigator.userAgent)) return "offline";
  if (window.location.protocol === "file:") return "offline";
  if (/(^|\.)github\.io$/.test(window.location.hostname)) return "offline";
  if (new URLSearchParams(window.location.search).get("offline") === "1") return "offline";
  return "server";
}

export const engineMode: "server" | "offline" = detect();

/**
 * Native (APK) kabukta sunucu seçimi: kullanıcı Ayarlar → "Bağlı sunucu" alanına
 * `http://192.168.1.20:8000` gibi bir adres girerse uygulama gerçek yt-dlp
 * motoruna bağlanır; boşsa çevrimdışı motor kullanılır.
 */
export const SERVER_KEY = "tugrul.server";

export function serverBase(): string {
  try {
    return (localStorage.getItem(SERVER_KEY) || "").replace(/\/+$/, "");
  } catch {
    return "";
  }
}

export function setServerBase(url: string): void {
  try {
    const clean = (url || "").trim().replace(/\/+$/, "");
    if (clean) localStorage.setItem(SERVER_KEY, clean);
    else localStorage.removeItem(SERVER_KEY);
  } catch {
    /* yut */
  }
}

/** Native kabukta uzak sunucu modu etkin mi? */
export const useRemoteServer = () =>
  inAndroidShell() && !!serverBase() && new URLSearchParams(window.location.search).get("offline") !== "1";

export const isOffline = () => engineMode === "offline";

/** APK (Capacitor kabuğu) içinde miyiz? */
export const inAndroidShell = () =>
  typeof window !== "undefined" &&
  !!(
    (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.() ||
    /Capacitor/i.test(navigator.userAgent)
  );
