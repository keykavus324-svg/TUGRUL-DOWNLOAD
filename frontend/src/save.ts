/**
 * Dosyayı cihaza kaydetme.
 *
 * Tarayıcıda (GitHub Pages): Blob → `<a download>` ile İndirilenler'e iner.
 * Android kabuğunda (APK): Capacitor Filesystem ile diske yazılır; WebView
 * `<a download>` desteklemediği için bu adım zorunludur.
 */
import { inAndroidShell } from "./engine";
import { deviceFilePath } from "./native";

export const FOLDER = "TUGRUL DOWNLOAD";

export type SaveResult = { ok: boolean; path: string; native: boolean; message: string };

const cleanName = (name: string) =>
  name
    .split("/")
    .pop()
    ?.replace(/[\\:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160) || "indirme";

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const out = String(fr.result || "");
      const comma = out.indexOf(",");
      resolve(comma >= 0 ? out.slice(comma + 1) : out);
    };
    fr.onerror = () => reject(new Error("Dosya okunamadı"));
    fr.readAsDataURL(blob);
  });
}

async function saveNative(blob: Blob, name: string): Promise<SaveResult> {
  const { Directory, Filesystem } = await import("@capacitor/filesystem");

  // API 28 ve altında yazma izni gerekiyor; üstünde gerek yok.
  try {
    const check = await Filesystem.checkPermissions();
    if (check.publicStorage !== "granted") await Filesystem.requestPermissions();
  } catch {
    /* izin API'si yoksa yazmayı dene */
  }

  const data = await blobToBase64(blob);
  const path = `${FOLDER}/${name}`;

  // 1) paylaşılan depolama → kullanıcı Dosyalar uygulamasında doğrudan görür
  try {
    const r = await Filesystem.writeFile({ path, data, directory: Directory.ExternalStorage, recursive: true });
    return { ok: true, path: r.uri, native: true, message: "" };
  } catch {
    /* kapsamlı depolama reddetti → uygulama klasörüne düş */
  }

  // 2) uygulama klasörü (her Android sürümünde izinsiz çalışır)
  try {
    const r = await Filesystem.writeFile({ path, data, directory: Directory.Documents, recursive: true });
    return { ok: true, path: r.uri, native: true, message: "Uygulama klasörüne kaydedildi" };
  } catch (e) {
    return { ok: false, path: "", native: true, message: (e as Error).message || "Depolamaya yazılamadı" };
  }
}

function saveBrowser(blob: Blob, name: string): SaveResult {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 8000);
    return { ok: true, path: name, native: false, message: "" };
  } catch (e) {
    return { ok: false, path: "", native: false, message: (e as Error).message || "Kaydedilemedi" };
  }
}

/** Blob'u cihaza kaydeder (APK'da diske, tarayıcıda İndirilenler'e). */
export async function saveBlob(blob: Blob, rawName: string): Promise<SaveResult> {
  const name = cleanName(rawName);
  if (inAndroidShell()) return saveNative(blob, name);
  return saveBrowser(blob, name);
}

async function fetchBlob(url: string): Promise<Blob> {
  const r = await fetch(url);
  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    throw new Error(detail.slice(0, 200) || `Dosya alınamadı (HTTP ${r.status})`);
  }
  const blob = await r.blob();
  if (!blob.size) throw new Error("Dosya boş — bu oturumda tutulmuyor, tekrar indirin.");
  return blob;
}

/** İndirilmiş kaydı API'den çekip cihaza kaydeder. */
export async function saveDownload(id: number, fallbackName: string): Promise<SaveResult> {
  // APK: dosya zaten Download/TUGRUL DOWNLOAD klasöründe — ikinci kopya gereksiz
  const local = deviceFilePath(id);
  if (local) return { ok: true, path: local, native: true, message: `Dosya cihazda: ${local.split("/").pop()}` };
  return saveBlob(await fetchBlob(`/api/downloads/${id}/file`), fallbackName);
}

/** Kütüphane/stüdyo dosyalarını yol üzerinden cihaza kaydeder. */
export async function saveFileByPath(path: string, fallbackName: string): Promise<SaveResult> {
  return saveBlob(await fetchBlob(`/api/files/raw?path=${encodeURIComponent(path)}`), fallbackName || path);
}

/** Medya önizlemesi için geçici blob URL üretir (WebView'de /api/... src çalışmaz). */
export async function blobUrlFor(path: string): Promise<string> {
  const blob = await fetchBlob(`/api/files/raw?path=${encodeURIComponent(path)}`);
  return URL.createObjectURL(blob);
}
