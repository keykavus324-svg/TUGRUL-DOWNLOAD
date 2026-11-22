/**
 * Gerçek indirme motoru — sunucusuz (Vercel) proxy API istemcisi.
 *
 * GitHub Pages ve APK statik çalışır; dosyaları indirebilmek için yt-dlp'yi
 * çalıştıran bir uca ihtiyaç duyar. Bu modül o uca bağlanır:
 *
 *   /api/health   → motor ayakta mı, parça boyutu ne kadar
 *   /api/info     → başlık, süre, format listesi
 *   /api/resolve  → seçilen akış için imzalı doğrudan adres
 *   /api/stream   → imzalı adresten bayt aralığı (parça parça)
 *
 * Dosya tarayıcıda parça parça çekilip tek Blob'a birleştirilir, ardından
 * `/api/downloads/<id>/file` üzerinden kullanıcıya kaydedilir.
 */
import type { FormatInfo, MediaInfo } from "./types";

export const PROXY_KEY = "tugrul.proxy";

/** Varsayılan uç: herkesin kullanabildiği, yt-dlp çalıştıran sunucusuz API. */
export const DEFAULT_PROXY = "https://tugrul-run-tugrul1.vercel.app/api/index";

const FALLBACK_CHUNK = 1_572_864; // 1.5 MB
const MAX_TOTAL = 2 * 1024 ** 3; // tarayıcı belleği için 2 GB tavanı

let cached: string | null = null;

export function proxyBase(): string {
  if (cached !== null) return cached;
  let value = "";
  try {
    value = localStorage.getItem(PROXY_KEY) || "";
  } catch {
    /* gizli mod */
  }
  cached = (value.trim() || DEFAULT_PROXY).replace(/\/+$/, "");
  return cached;
}

export function setProxyBase(url: string): void {
  try {
    const clean = (url || "").trim().replace(/\/+$/, "");
    if (clean) localStorage.setItem(PROXY_KEY, clean);
    else localStorage.removeItem(PROXY_KEY);
  } catch {
    /* yut */
  }
  cached = null;
}

export type ProxyHealth = {
  ok: boolean;
  ytdlp?: string;
  chunk?: number;
  detail?: string;
};

/** Motor ayakta mı? (kısa zaman aşımı — arayüzü bekletmez) */
export async function proxyHealth(timeoutMs = 6000): Promise<ProxyHealth> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`${proxyBase()}/api/health`, { signal: ctl.signal });
    if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
    const d = (await r.json()) as { ok?: boolean; ytdlp?: string; chunk?: number };
    return { ok: !!d.ok, ytdlp: d.ytdlp, chunk: d.chunk || FALLBACK_CHUNK };
  } catch (e) {
    return { ok: false, detail: (e as Error).message || "bağlanılamadı" };
  } finally {
    clearTimeout(timer);
  }
}

type RawFormat = {
  format_id: string;
  ext: string;
  height: number;
  fps: number;
  abr: number;
  tbr: number;
  filesize: number;
  filesize_text: string;
  vcodec: string | null;
  acodec: string | null;
  muxed?: boolean;
};

type RawInfo = {
  id: string;
  title: string;
  thumbnail: string | null;
  uploader: string;
  duration: number;
  duration_text: string;
  webpage_url: string;
  extractor: string;
  view_count: number;
  videos: RawFormat[];
  audios: RawFormat[];
  best_video: RawFormat | null;
  best_audio: RawFormat | null;
  has_video: boolean;
  has_audio: boolean;
};

function toFormat(f: RawFormat | null, kind: "video" | "audio"): FormatInfo | null {
  if (!f) return null;
  const quality = kind === "audio" ? (f.abr ? `${Math.round(f.abr)} kbps` : "ses") : `${f.height || 0}p`;
  return {
    format_id: f.format_id,
    kind: f.muxed ? "video+audio" : kind,
    ext: f.ext || (kind === "audio" ? "m4a" : "mp4"),
    quality: f.fps && f.fps >= 45 && f.height ? `${quality}${Math.round(f.fps)}` : quality,
    height: f.height || 0,
    fps: f.fps || 0,
    vcodec: f.vcodec ?? null,
    acodec: f.acodec ?? null,
    abr: f.abr || 0,
    tbr: f.tbr || 0,
    filesize: f.filesize || 0,
    filesize_text: f.filesize_text || "",
    note: f.muxed ? "ses + görüntü tek dosyada" : "",
    language: "",
    protocol: "https",
    dynamic_range: "SDR",
    container: f.ext || "",
  };
}

/** Proxy yanıtını arayüzün beklediği MediaInfo biçimine çevirir. */
export function toMediaInfo(d: RawInfo, url: string): MediaInfo {
  const videos = (d.videos || []).map((f) => toFormat(f, "video")).filter(Boolean) as FormatInfo[];
  const audios = (d.audios || []).map((f) => toFormat(f, "audio")).filter(Boolean) as FormatInfo[];
  return {
    id: d.id || "",
    title: d.title || "Başlıksız",
    description: "",
    thumbnail: d.thumbnail || null,
    uploader: d.uploader || "",
    uploader_url: "",
    duration: d.duration || 0,
    duration_text: d.duration_text || "",
    view_count: d.view_count || 0,
    like_count: 0,
    upload_date: "",
    webpage_url: d.webpage_url || url,
    extractor: d.extractor || "yt-dlp",
    is_playlist: false,
    playlist_count: 0,
    chapters: [],
    subtitles: {},
    auto_subtitles: [],
    videos,
    audios,
    muxed: [],
    best_video: toFormat(d.best_video, "video"),
    best_audio: toFormat(d.best_audio, "audio"),
    has_video: !!d.has_video || videos.length > 0,
    has_audio: !!d.has_audio || audios.length > 0,
  };
}

async function readError(r: Response): Promise<string> {
  let detail = "";
  try {
    const d = (await r.json()) as { detail?: string };
    detail = d.detail || "";
  } catch {
    /* gövde yok */
  }
  return detail || `Motor yanıt vermedi (HTTP ${r.status})`;
}

/** Bağlantıyı çöz: başlık, süre, formatlar. */
export async function proxyInfo(url: string): Promise<MediaInfo> {
  const r = await fetch(`${proxyBase()}/api/info`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!r.ok) throw new Error(await readError(r));
  return toMediaInfo((await r.json()) as RawInfo, url);
}

export type Resolved = {
  token: string;
  ext: string;
  title: string;
  filesize: number;
  format_id: string;
};

/** Seçilen format için imzalı akış belirteci alır. */
export async function proxyResolve(url: string, formatId = ""): Promise<Resolved> {
  const r = await fetch(`${proxyBase()}/api/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, format_id: formatId }),
  });
  if (!r.ok) throw new Error(await readError(r));
  const d = (await r.json()) as Resolved;
  if (!d.token) throw new Error("Akış belirteci alınamadı.");
  return d;
}

export type ChunkProgress = { downloaded: number; total: number; speed: number };

export type PartialFile = { parts: ArrayBuffer[]; offset: number; total: number };

export type Downloaded = PartialFile & { blob: Blob; ext: string; title: string; size: number };

function mimeFor(ext: string): string {
  const e = (ext || "").toLowerCase();
  if (e === "mp3") return "audio/mpeg";
  if (e === "m4a") return "audio/mp4";
  if (e === "opus" || e === "ogg") return "audio/ogg";
  if (e === "wav") return "audio/wav";
  if (e === "webm") return "video/webm";
  if (e === "mkv") return "video/x-matroska";
  if (e === "mp4" || e === "m4v") return "video/mp4";
  return "application/octet-stream";
}

/**
 * Dosyayı parça parça indirir. `initial` verilirse kaldığı yerden sürdürür
 * (duraklat → devam). İptal, `signal` ile yapılır.
 */
export async function proxyDownload(opts: {
  url: string;
  formatId?: string;
  chunk?: number;
  signal?: AbortSignal;
  initial?: PartialFile;
  onProgress?: (p: ChunkProgress) => void;
}): Promise<Downloaded> {
  const res = await proxyResolve(opts.url, opts.formatId || "");
  const chunk = Math.max(65_536, opts.chunk || FALLBACK_CHUNK);
  const parts: ArrayBuffer[] = opts.initial ? [...opts.initial.parts] : [];
  let offset = opts.initial?.offset || 0;
  let total = opts.initial?.total || res.filesize || 0;
  const started = Date.now();

  for (;;) {
    if (opts.signal?.aborted) throw new DOMException("İptal edildi", "AbortError");
    const qs = new URLSearchParams({ token: res.token, start: String(offset), length: String(chunk) });
    const r = await fetch(`${proxyBase()}/api/stream?${qs.toString()}`, { signal: opts.signal });
    if (!r.ok) throw new Error(await readError(r));
    const buf = await r.arrayBuffer();
    const head = Number(r.headers.get("X-Tug-Total") || 0);
    if (head > 0) total = head;
    if (buf.byteLength > 0) {
      parts.push(buf);
      offset += buf.byteLength;
    }
    const secs = Math.max(0.25, (Date.now() - started) / 1000);
    opts.onProgress?.({ downloaded: offset, total, speed: offset / secs });
    if (buf.byteLength === 0) break;
    if (total && offset >= total) break;
    if (!total && buf.byteLength < chunk) break;
    if (offset > MAX_TOTAL) throw new Error("Dosya çok büyük — 2 GB sınırına takıldı.");
  }

  if (total && offset < total) throw new Error(`İndirme yarım kaldı (${offset}/${total} bayt).`);
  const blob = new Blob(parts, { type: mimeFor(res.ext) });
  return { blob, ext: res.ext || "mp4", title: res.title || "", size: blob.size, parts, offset, total };
}
