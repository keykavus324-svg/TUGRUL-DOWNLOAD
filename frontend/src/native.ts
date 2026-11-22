/**
 * Cihaz içi yt-dlp motoru (APK).
 *
 * YTDLnis ile aynı yaklaşım: yt-dlp + Python + FFmpeg telefonun içinde çalışır,
 * sunucu/proxy gerekmez. `YtdlpPlugin` (Java) bu modül üzerinden sürülür.
 *
 * Tarayıcıda (GitHub Pages) bu motor yoktur → `probeNative()` false döner ve
 * uygulama proxy ucuna düşer.
 */
import { registerPlugin } from "@capacitor/core";
import { inAndroidShell } from "./engine";
import type { FormatInfo, MediaInfo } from "./types";

export type NativeProgress = { id: string; progress: number; eta: number; line?: string };

type YtdlpPlugin = {
  init(): Promise<{ ok: boolean; version?: string; detail?: string; dir?: string; engine?: string }>;
  status(): Promise<{ ready: boolean; error: string; dir: string; version: string; engine: string }>;
  info(o: { url: string }): Promise<{ ok: boolean; exitCode: number; stdout?: string; stderr?: string }>;
  download(o: {
    id: string;
    url: string;
    type: string;
    format?: string;
    template?: string;
  }): Promise<{ ok: boolean; exitCode: number; stderr?: string; path: string; size: number }>;
  cancel(o: { id: string }): Promise<{ ok: boolean }>;
  addListener(event: "progress", cb: (p: NativeProgress) => void): Promise<{ remove(): Promise<void> }>;
};

export const Ytdlp = registerPlugin<YtdlpPlugin>("TugrulYtdlp");

/** Motor gerçekten bu kabukta var mı? (tarayıcıda false) */
let probe: Promise<boolean> | null = null;
export function probeNative(): Promise<boolean> {
  if (!probe) {
    probe = (async () => {
      if (!inAndroidShell()) return false;
      try {
        const s = await Ytdlp.status();
        dir = s.dir || dir;
        return !!s && s.engine === "on-device";
      } catch {
        return false;
      }
    })();
  }
  return probe;
}

/** Kuyruk satırı → cihazdaki gerçek dosya yolu (dosya zaten diskte). */
const devicePaths = new Map<number, string>();
export const markDeviceFile = (id: number, path: string) => {
  if (path) devicePaths.set(id, path);
};
export const deviceFilePath = (id: number): string => devicePaths.get(id) || "";
export const deviceDir = () => dir;
let dir = "";

let initPromise: Promise<{ ok: boolean; version?: string; detail?: string; dir?: string }> | null = null;

/** Motoru hazırlar (ilk açılışta Python/yt-dlp diske açılır, birkaç saniye sürebilir). */
export function nativeInit(): Promise<{ ok: boolean; version?: string; detail?: string; dir?: string }> {
  if (!initPromise) {
    initPromise = Ytdlp.init()
      .then((r) => {
        dir = r.dir || dir;
        return r;
      })
      .catch((e: Error) => ({ ok: false, detail: e.message }));
  }
  return initPromise;
}

// --- yt-dlp çıktısını arayüzün MediaInfo biçimine çevirme ------------------
const fmtSize = (n: number | null | undefined): string => {
  if (!n) return "";
  let v = Number(n);
  for (const u of ["B", "KB", "MB", "GB"]) {
    if (v < 1024) return u === "B" ? `${Math.round(v)} B` : `${v.toFixed(1)} ${u}`;
    v /= 1024;
  }
  return `${v.toFixed(1)} TB`;
};

export const clock = (s: number | null | undefined): string => {
  const t = Math.max(0, Math.floor(Number(s) || 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
};

type Raw = Record<string, unknown>;

function label(f: Raw): FormatInfo {
  const vcodec = String(f.vcodec || "none");
  const acodec = String(f.acodec || "none");
  const hasV = vcodec !== "none";
  const hasA = acodec !== "none";
  const kind: FormatInfo["kind"] = hasV && hasA ? "video+audio" : hasV ? "video" : "audio";
  const height = Number(f.height || 0);
  const fps = Number(f.fps || 0);
  const abr = Number(f.abr || 0);
  let quality = height ? `${height}p` : kind === "audio" ? "ses" : "—";
  if (fps >= 45 && height) quality += String(Math.round(fps));
  const size = Number(f.filesize || f.filesize_approx || 0);
  return {
    format_id: String(f.format_id || ""),
    kind,
    ext: String(f.ext || ""),
    quality,
    height,
    fps,
    vcodec: hasV ? vcodec : null,
    acodec: hasA ? acodec : null,
    abr: Math.round(abr * 10) / 10,
    tbr: Math.round(Number(f.tbr || 0) * 10) / 10,
    filesize: size,
    filesize_text: fmtSize(size),
    note: String(f.format_note || f.format || ""),
    language: String(f.language || ""),
    protocol: String(f.protocol || ""),
    dynamic_range: String(f.dynamic_range || ""),
    container: String(f.container || ""),
  };
}

/** `--dump-single-json` çıktısını arayüzün beklediği MediaInfo'ya çevirir. */
export function mapInfo(info: Raw, url: string): MediaInfo {
  const formats = (info.formats as Raw[]) || [];
  const videos: FormatInfo[] = [];
  const audios: FormatInfo[] = [];
  const muxed: FormatInfo[] = [];
  const seen = new Set<string>();
  for (const f of formats) {
    const id = String(f.format_id || "");
    if (!id || ["sb0", "sb1", "sb2"].includes(id) || seen.has(id)) continue;
    const proto = String(f.protocol || "");
    if (proto === "mhtml" || proto === "none") continue;
    seen.add(id);
    const item = label(f);
    if (item.kind === "video+audio") muxed.push(item);
    else if (item.kind === "video") videos.push(item);
    else audios.push(item);
  }
  const byRes = (a: FormatInfo, b: FormatInfo) => b.height - a.height || b.tbr - a.tbr;
  videos.sort(byRes);
  muxed.sort(byRes);
  audios.sort((a, b) => b.abr - a.abr || b.tbr - a.tbr);

  const dedupe = (items: FormatInfo[], key: (f: FormatInfo) => string) => {
    const out: FormatInfo[] = [];
    const keys = new Set<string>();
    for (const it of items) {
      const k = key(it);
      if (keys.has(k)) continue;
      keys.add(k);
      out.push(it);
    }
    return out;
  };

  let thumb = (info.thumbnail as string) || null;
  const thumbs = info.thumbnails as Raw[] | undefined;
  if (!thumb && thumbs && thumbs.length) {
    thumb = String([...thumbs].sort((a, b) => Number(b.width || 0) - Number(a.width || 0))[0].url || "") || null;
  }

  const subtitles: Record<string, string[]> = {};
  for (const [lang, entries] of Object.entries((info.subtitles as Record<string, Raw[]>) || {})) {
    subtitles[lang] = entries.map((e) => String(e.ext || "vtt")).filter(Boolean);
  }

  const duration = Number(info.duration || 0);
  return {
    id: String(info.id || ""),
    title: String(info.title || info.fulltitle || "Başlıksız"),
    description: String(info.description || "").slice(0, 2000),
    thumbnail: thumb,
    uploader: String(info.uploader || info.channel || info.creator || ""),
    uploader_url: String(info.uploader_url || info.channel_url || ""),
    duration,
    duration_text: clock(duration),
    view_count: Number(info.view_count || 0),
    like_count: Number(info.like_count || 0),
    upload_date: String(info.upload_date || ""),
    webpage_url: String(info.webpage_url || url),
    extractor: String(info.extractor_key || info.extractor || "yt-dlp"),
    is_playlist: false,
    playlist_count: 0,
    chapters: ((info.chapters as Raw[]) || []).map((c) => ({
      start: Number(c.start_time || 0),
      end: Number(c.end_time || 0),
      title: String(c.title || ""),
    })),
    subtitles,
    auto_subtitles: Object.keys((info.automatic_captions as Record<string, unknown>) || {}),
    videos: dedupe(videos, (f) => `${f.height}-${f.ext}-${f.dynamic_range}`),
    audios: dedupe(audios, (f) => `${f.ext}-${f.abr}`),
    muxed,
    best_video: videos[0] || null,
    best_audio: audios[0] || null,
    has_video: videos.length > 0,
    has_audio: audios.length > 0,
  };
}

/** Bağlantıyı cihazda çözer. */
export async function nativeInfo(url: string): Promise<MediaInfo> {
  const init = await nativeInit();
  if (!init.ok) throw new Error(init.detail || "Motor hazırlanamadı.");
  const res = await Ytdlp.info({ url });
  if (!res.ok) throw new Error(res.stderr || `Bağlantı çözülemedi (kod ${res.exitCode})`);
  const raw = res.stdout || "";
  const start = raw.indexOf("{");
  if (start < 0) throw new Error("Motor boş yanıt döndürdü.");
  let data: Raw;
  try {
    data = JSON.parse(raw.slice(start));
  } catch {
    throw new Error("Motor çıktısı okunamadı.");
  }
  return mapInfo(data, url);
}
