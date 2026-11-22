/**
 * Çevrimdışı motor — API yokken arayüzü uçtan uca çalıştırır.
 *
 * `installOfflineApi()` global `fetch`'i sarar; `/api/...` çağrılarını bellekteki
 * (IndexedDB destekli) sanal sunucuya yönlendirir. Böylece tüm sayfalar ve
 * bileşenler hiçbir değişiklik yapılmadan çalışır: kuyruk, ilerleme, kalıcılık,
 * ayarlar, şablonlar, zamanlama, izleme listesi, yedekleme ve demo medya üretimi.
 */

import { proxyBase, proxyDownload, proxyHealth, proxyInfo, type PartialFile } from "./proxy";

type Status = "queued" | "downloading" | "processing" | "paused" | "completed" | "failed" | "canceled";

type Row = {
  id: number;
  url: string;
  title: string;
  thumbnail: string;
  uploader: string;
  duration: number;
  dl_type: "video" | "audio";
  format_id: string;
  status: Status;
  progress: number;
  speed: string;
  eta: string;
  filepath: string;
  filesize: number;
  error: string;
  filename_template: string;
  custom_args: string;
  created_at: number;
  finished_at: number | null;
};

const DB_NAME = "tugrul-offline";
const STORE = "state";

const DEFAULT_SETTINGS: Record<string, string> = {
  download_dir: "Cihaz / TUĞRUL DOWNLOAD",
  concurrent: "3",
  retries: "3",
  fragments: "4",
  rate_limit: "",
  proxy: "",
  extractor: "yt-dlp",
  incognito: "false",
  theme: "dark",
  language: "tr",
  filename_template: "%(uploader)s - %(title)s [%(id)s].%(ext)s",
  audio_format: "mp3",
  audio_quality: "0",
  video_format: "mp4",
  embed_metadata: "true",
  embed_thumbnail: "true",
  embed_chapters: "true",
  sponsorblock: "mark",
  write_subs: "false",
  sub_langs: "tr,en",
  auto_update_ytdlp: "true",
  custom_args: "",
  cookies_path: "cookies.txt",
};

const DEMO = [
  {
    id: "demo001",
    title: "TUĞRUL DOWNLOAD — Tanıtım Filmi",
    uploader: "Tuğrul Studio",
    duration: 16,
    height: 1080,
    file: "sample/tugrul-demo.mp4",
    thumb: "demo/thumbs/demo001.jpg",
  },
  {
    id: "demo002",
    title: "Anadolu Manzaraları — 4K Doğa",
    uploader: "Gezgin Kanal",
    duration: 16,
    height: 720,
    file: "sample/tugrul-demo.mp4",
    thumb: "demo/thumbs/demo002.jpg",
  },
  {
    id: "demo003",
    title: "Lo-Fi Çalışma Müziği — Gece Seti",
    uploader: "Sakin Sesler",
    duration: 32,
    height: 0,
    file: "sample/lofi-demo.mp3",
    thumb: "",
  },
  {
    id: "demo004",
    title: "Elazığ — Harput Kalesi Drone Çekimi",
    uploader: "Tuğrul Studio",
    duration: 16,
    height: 1080,
    file: "sample/tugrul-demo.mp4",
    thumb: "demo/thumbs/demo004.jpg",
  },
];

const BASE = () => {
  const u = new URL(window.location.href);
  u.hash = "";
  u.search = "";
  return u.toString().replace(/[^/]*$/, "");
};

type State = {
  seq: number;
  downloads: Row[];
  settings: Record<string, string>;
  templates: { id: number; name: string; command: string; created_at: number }[];
  scheduled: { id: number; url: string; dl_type: string; format_id: string; run_at: number; status: string; created_at: number }[];
  watchlist: { id: number; url: string; title: string; interval_hours: number; auto_download: number; created_at: number }[];
  searches: { id: number; query: string; created_at: number }[];
  logs: { id: number; level: string; message: string; created_at: number }[];
};

let state: State = {
  seq: 1,
  downloads: [],
  settings: { ...DEFAULT_SETTINGS },
  templates: [],
  scheduled: [],
  watchlist: [],
  searches: [],
  logs: [],
};

// --- kalıcılık -------------------------------------------------------------
let dbp: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbp;
}

async function persist() {
  const db = await openDb();
  if (!db) {
    try {
      localStorage.setItem("tugrul.state", JSON.stringify(state));
    } catch {
      /* kota */
    }
    return;
  }
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(JSON.parse(JSON.stringify(state)), "state");
  } catch {
    /* yut */
  }
}

async function restoreState() {
  const load = (raw: string | null) => {
    if (!raw) return;
    try {
      const data = JSON.parse(raw) as State;
      state = { ...state, ...data, settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) } };
      state.downloads = (state.downloads || []).map((d) =>
        ["downloading", "processing", "queued"].includes(d.status)
          ? { ...d, status: "paused" as Status, speed: "", eta: "" }
          : d
      );
    } catch {
      /* yut */
    }
  };
  const db = await openDb();
  if (!db) {
    load(localStorage.getItem("tugrul.state"));
    return;
  }
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get("state");
    req.onsuccess = () => {
      load(req.result ? JSON.stringify(req.result) : null);
      resolve();
    };
    req.onerror = () => resolve();
  });
}

// --- yardımcılar -----------------------------------------------------------
const now = () => Date.now() / 1000;
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const clock = (s: number) => {
  const t = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
};
const log = (level: string, message: string) => {
  if (state.settings.incognito === "true") return;
  state.logs.unshift({ id: state.seq++, level, message, created_at: now() });
  state.logs = state.logs.slice(0, 400);
};

function speedText(bps: number) {
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  let v = bps;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

// --- demo bilgi nesnesi ----------------------------------------------------
function sampleOf(url: string) {
  const key = (url || "").split("demo://")[1]?.replace(/\/+$/, "");
  return DEMO.find((d) => d.id === key) || DEMO[0];
}

function fileUrl(path: string) {
  return BASE() + path;
}

function demoInfo(url: string) {
  const s = sampleOf(url);
  const videos = s.height
    ? [s.height, 720, 480, 360]
        .filter((h) => h <= s.height)
        .map((h) => ({
          format_id: `h${h}`,
          kind: "video" as const,
          ext: "mp4",
          quality: `${h}p`,
          height: h,
          fps: h === s.height ? 60 : 30,
          vcodec: "avc1.640028",
          acodec: null,
          abr: 0,
          tbr: h * 4,
          filesize: h * 900,
          filesize_text: `${((h * 900) / 1024 / 1024).toFixed(1)} MB`,
          note: h === s.height ? "en iyi" : "",
          language: "",
          protocol: "https",
          dynamic_range: "SDR",
          container: "mp4",
        }))
    : [];
  const audios = [
    { ext: "mp3", abr: 320 },
    { ext: "m4a", abr: 256 },
    { ext: "opus", abr: 160 },
  ].map((a) => ({
    format_id: `a${a.abr}`,
    kind: "audio" as const,
    ext: a.ext,
    quality: "ses",
    height: 0,
    fps: 0,
    vcodec: null,
    acodec: "mp4a.40.2",
    abr: a.abr,
    tbr: a.abr,
    filesize: (a.abr * 1000 * s.duration) / 8,
    filesize_text: `${((a.abr * 1000 * s.duration) / 8 / 1024 / 1024).toFixed(1)} MB`,
    note: `${a.abr} kbps`,
    language: "tr",
    protocol: "https",
    dynamic_range: "SDR",
    container: a.ext,
  }));
  return {
    id: s.id,
    title: s.title,
    description: "Örnek içerik — arayüzü denemek için. Gerçek bir bağlantı yapıştırdığınızda doğrudan indirilir.",
    thumbnail: s.thumb ? fileUrl(s.thumb) : null,
    uploader: s.uploader,
    uploader_url: "",
    duration: s.duration,
    duration_text: clock(s.duration),
    view_count: 42800,
    like_count: 3120,
    upload_date: "2026-11-20",
    timestamp: 0,
    webpage_url: url,
    extractor: "Demo · çevrimdışı",
    is_playlist: false,
    playlist_count: 0,
    playlist_title: "",
    chapters: [
      { start: 0, end: s.duration / 3, title: "Giriş" },
      { start: s.duration / 3, end: (2 * s.duration) / 3, title: "Gelişme" },
      { start: (2 * s.duration) / 3, end: s.duration, title: "Kapanış" },
    ],
    subtitles: { tr: ["vtt"], en: ["vtt"] },
    auto_subtitles: ["tr", "en"],
    videos,
    audios,
    muxed: [],
    best_video: videos[0] || null,
    best_audio: audios[0] || null,
    has_video: !!videos.length,
    has_audio: true,
    playlist: false,
    entries: [],
    demo: true,
  };
}

// --- indirme yürütücüsü ----------------------------------------------------
type Task = {
  timer: number | null;
  paused: boolean;
  canceled: boolean;
  abort?: AbortController;
};
const tasks = new Map<number, Task>();

/** Gerçek indirmelerin bitmiş dosyaları (kaydedilene kadar bellekte). */
const blobs = new Map<number, Blob>();
/** Duraklatılmış gerçek indirmelerin yarım parçaları — devam ettirmek için. */
const partials = new Map<number, PartialFile>();

const isDemoUrl = (url: string) => (url || "").startsWith("demo://");
const safeName = (name: string) =>
  name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160) || "indirme";

function emit(type: string, payload: Record<string, unknown>) {
  (window as unknown as { __tugrulEmit__?: (e: unknown) => void }).__tugrulEmit__?.({ type, ...payload });
}

async function runTask(id: number) {
  const row = state.downloads.find((d) => d.id === id);
  if (!row) return;
  const s = sampleOf(row.url);
  const task: Task = { timer: null, paused: false, canceled: false };
  tasks.set(id, task);

  row.status = "downloading";
  row.progress = 0;
  row.error = "";
  emit("started", { item: row });
  log("info", `Başladı #${id}: ${row.title || row.url}`);

  // gerçek dosya boyutunu öğren (kapak/medya) — sunucu yoksa tahmini kullan
  let total = row.dl_type === "audio" ? 620_000 : 900_000;
  try {
    const head = await fetch(fileUrl(s.file), { method: "HEAD" });
    if (head.ok) {
      const len = Number(head.headers.get("content-length") || 0);
      if (len > 0) total = row.dl_type === "audio" ? len : len;
    }
  } catch {
    /* yut */
  }

  // tohumlanmış ilerleme: duraklat/devam senaryosu için kaldığı yerden sürer
  let pct = row.progress > 0 && row.progress < 100 ? row.progress : 0;
  const speed = Math.max(1, total / 9 / 1024); // KB/s ~9 sn sürer

  task.timer = window.setInterval(() => {
    if (task.paused || task.canceled) return;
    pct = Math.min(99.4, pct + Math.random() * 3.2 + 0.7);
    row.progress = Math.round(pct * 10) / 10;
    row.speed = speedText(speed * 1024);
    row.eta = `${Math.max(1, Math.round(((100 - pct) / 100) * 3))} sn`;
    if (pct > 96) row.status = "processing";
    persist();
    emit("progress", {
      id,
      progress: row.progress,
      speed: row.speed,
      eta: row.eta,
      downloaded: Math.round((total * pct) / 100),
      total,
    });
    if (pct >= 99.4) {
      finishTask(id, s);
    }
  }, 420);
}

function finishTask(id: number, s: (typeof DEMO)[number]) {
  const row = state.downloads.find((d) => d.id === id);
  const task = tasks.get(id);
  if (!row) return;
  if (task?.timer) window.clearInterval(task.timer);
  tasks.delete(id);

  row.status = "completed";
  row.progress = 100;
  row.speed = "";
  row.eta = "";
  row.finished_at = now();
  row.filepath = `TUĞRUL DOWNLOAD/${row.title || s.title}.${row.dl_type === "audio" ? "mp3" : "mp4"}`;
  row.filesize = row.dl_type === "audio" ? 627_000 : 913_000;
  log("info", `Tamamlandı #${id}`);
  persist();
  emit("completed", { id, item: row });
}

/**
 * Gerçek indirme — proxy API üzerinden parça parça çekilir.
 * İlerleme gerçek bayt sayısından gelir; duraklat/devam kaldığı yerden sürer.
 */
async function runRealTask(id: number) {
  const row = state.downloads.find((d) => d.id === id);
  if (!row) return;
  const task: Task = { timer: null, paused: false, canceled: false, abort: new AbortController() };
  tasks.set(id, task);

  row.status = "downloading";
  row.error = "";
  if (!partials.has(id)) row.progress = 0;
  emit("started", { item: row });
  log("info", `Başladı #${id}: ${row.title || row.url}`);
  persist();

  try {
    const health = await proxyHealth(8000);
    if (!health.ok) throw new Error(`İndirme motoruna ulaşılamadı (${health.detail || "bağlantı yok"})`);
    const formatId =
      row.format_id || (row.dl_type === "audio" ? "bestaudio" : "");
    const done = await proxyDownload({
      url: row.url,
      formatId,
      chunk: health.chunk,
      signal: task.abort!.signal,
      initial: partials.get(id),
      onProgress: (p) => {
        if (task.canceled || task.paused) return;
        row.progress = p.total
          ? Math.min(99.5, Math.round((p.downloaded / p.total) * 1000) / 10)
          : 0;
        row.speed = speedText(p.speed);
        row.eta = p.speed > 0 && p.total > p.downloaded ? clock((p.total - p.downloaded) / p.speed) : "";
        persist();
        emit("progress", {
          id,
          progress: row.progress,
          speed: row.speed,
          eta: row.eta,
          downloaded: p.downloaded,
          total: p.total,
        });
      },
    });

    if (task.canceled) return;
    partials.delete(id);
    blobs.set(id, done.blob);
    if (!row.title || row.title === row.url) row.title = done.title || row.url;
    row.filepath = `TUĞRUL DOWNLOAD/${safeName(`${done.title || row.title || "indirme"}.${done.ext}`)}`;
    row.filesize = done.size;
    row.status = "completed";
    row.progress = 100;
    row.speed = "";
    row.eta = "";
    row.finished_at = now();
    log("info", `Tamamlandı #${id} (${done.size} bayt)`);
    persist();
    emit("completed", { id, item: row });
  } catch (e) {
    if (task.canceled) return;
    const message = (e as Error).message || "İndirme başarısız";
    if (task.paused) {
      row.status = "paused";
      row.speed = "";
      row.eta = "";
      persist();
      emit("paused", { id });
      return;
    }
    row.status = "failed";
    row.error = message;
    row.speed = "";
    row.eta = "";
    log("error", `Başarısız #${id}: ${message}`);
    persist();
    emit("failed", { id, item: row, error: message });
  } finally {
    tasks.delete(id);
  }
}

// --- statik arayüz yolları -------------------------------------------------
/** Bitmiş gerçek dosyayı indirilebilir yanıt olarak döndürür. */
function blobResponse(blob: Blob, name: string) {
  const file = safeName(name.split("/").pop() || "indirme");
  return new Response(blob, {
    status: 200,
    headers: {
      "Content-Type": blob.type || "application/octet-stream",
      "Content-Length": String(blob.size),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file)}`,
    },
  });
}

const extOf = (d: Row) => {
  const fromPath = (d.filepath || "").split(".").pop()?.toLowerCase() || "";
  if (fromPath && fromPath.length <= 5) return fromPath;
  return d.dl_type === "audio" ? "mp3" : "mp4";
};

function fileList(): { name: string; path: string; size: number; mtime: number; ext: string }[] {
  return state.downloads
    .filter((d) => d.status === "completed")
    .map((d) => {
      const ext = extOf(d);
      const name = d.filepath
        ? d.filepath.split("/").pop() || `${d.title || "indirme"}.${ext}`
        : `${d.title || sampleOf(d.url).title}.${ext}`;
      return {
        name,
        // gerçek dosyalar bellekte tutulur; sanal yol ile adreslenir
        path: isDemoUrl(d.url) ? fileUrl(sampleOf(d.url).file) : `tugrul://${d.id}/${name}`,
        size: d.filesize,
        mtime: d.finished_at || d.created_at,
        ext,
      };
    });
}

async function router(method: string, path: string, body: any): Promise<Response> {
  const [route, qs] = path.split("?");
  const q = new URLSearchParams(qs || "");

  if (route === "/api/health")
    return json({
      ok: true,
      version: "1.0.0",
      ytdlp: "proxy (yt-dlp)",
      ffmpeg: false,
      ffmpeg_path: "",
      disk_free: 0,
      disk_total: 0,
      demo: false,
      mode: "proxy",
      engine: "proxy",
      proxy: proxyBase(),
      active: state.downloads.filter((d) => d.status === "downloading" || d.status === "processing").length,
      queue: state.downloads.filter((d) => d.status === "queued").length,
      time: now(),
    });

  if (route === "/api/settings" && method === "GET") return json(state.settings);
  if (route === "/api/settings" && method === "PUT") {
    state.settings = { ...state.settings, ...(body?.patch || {}) };
    persist();
    return json(state.settings);
  }

  if (route === "/api/demo/samples")
    return json({
      items: DEMO.map((d) => ({
        url: `demo://${d.id}`,
        title: d.title,
        uploader: d.uploader,
        duration: d.duration,
        duration_text: clock(d.duration),
      })),
    });

  if (route === "/api/info" && method === "POST") {
    const url: string = body?.url || "";
    if (isDemoUrl(url)) return json(demoInfo(url));
    if (!url.trim()) return json({ detail: "Bağlantı boş" }, 400);
    try {
      return json(await proxyInfo(url.trim()));
    } catch (e) {
      return json({ detail: (e as Error).message || "Bağlantı çözülemedi" }, 422);
    }
  }

  if (route === "/api/search" && method === "POST") {
    const term = String(body?.query || "");
    state.searches.unshift({ id: state.seq++, query: term, created_at: now() });
    state.searches = state.searches.slice(0, 30);
    const items = DEMO.filter((d) => !term || d.title.toLowerCase().includes(term.toLowerCase()) || true).map((d) => ({
      id: d.id,
      title: d.title,
      url: `demo://${d.id}`,
      webpage_url: `demo://${d.id}`,
      thumbnail: d.thumb ? fileUrl(d.thumb) : null,
      duration: d.duration,
      duration_text: clock(d.duration),
      uploader: d.uploader,
      view_count: 12000,
    }));
    persist();
    return json({ results: items.slice(0, 8), query: term });
  }

  if (route === "/api/search/history") return json({ items: state.searches });

  if (route === "/api/downloads" && method === "GET") {
    let items = [...state.downloads].sort((a, b) => b.created_at - a.created_at);
    const status = q.get("status");
    if (status) items = items.filter((d) => d.status === status);
    return json({ items });
  }

  if (route === "/api/downloads" && method === "POST") {
    const d = body || {};
    const demo = isDemoUrl(d.url);
    const row: Row = {
      id: state.seq++,
      url: d.url,
      title: d.title || (demo ? sampleOf(d.url).title : d.url),
      thumbnail: d.thumbnail || (demo && sampleOf(d.url).thumb ? fileUrl(sampleOf(d.url).thumb) : ""),
      uploader: d.uploader || "",
      duration: d.duration || 0,
      dl_type: d.dl_type === "audio" ? "audio" : "video",
      format_id: d.format_id || "",
      status: "queued",
      progress: 0,
      speed: "",
      eta: "",
      filepath: "",
      filesize: 0,
      error: "",
      filename_template: d.filename_template || "",
      custom_args: d.custom_args || "",
      created_at: now(),
      finished_at: null,
    };
    state.downloads.unshift(row);
    persist();
    emit("queued", { item: row });
    // demo bağlantıları örnek medyayla simüle edilir, gerçek adresler proxy'ye gider
    if (isDemoUrl(row.url)) window.setTimeout(() => runTask(row.id), 350);
    else window.setTimeout(() => runRealTask(row.id), 0);
    return json({ duplicate: false, item: row });
  }

  if (route === "/api/downloads/bulk" && method === "POST") {
    const items = (body?.items || []).slice(0, 500);
    for (const it of items) {
      await router("POST", "/api/downloads", it);
    }
    return json({ count: items.length, items: [] });
  }

  const m = route.match(/^\/api\/downloads\/(\d+)(\/\w+)?$/);
  if (m) {
    const id = Number(m[1]);
    const action = m[2]?.slice(1);
    const row = state.downloads.find((d) => d.id === id);
    if (!row) return json({ detail: "İndirme bulunamadı" }, 404);
    if (method === "DELETE") {
      const t = tasks.get(id);
      if (t?.timer) window.clearInterval(t.timer);
      if (t) t.canceled = true;
      tasks.delete(id);
      state.downloads = state.downloads.filter((d) => d.id !== id);
      blobs.delete(id);
      partials.delete(id);
      persist();
      return json({ ok: true });
    }
    if (action === "pause") {
      const t = tasks.get(id);
      if (t) t.paused = true;
      if (t?.abort) t.abort.abort(); // gerçek indirme kaldığı yerden sürdürülebilir
      row.status = "paused";
      row.speed = "";
      row.eta = "";
      persist();
      emit("paused", { id });
      return json(row);
    }
    if (action === "resume") {
      const t = tasks.get(id);
      if (t) {
        t.paused = false;
        row.status = "downloading";
      } else {
        row.status = "queued";
        window.setTimeout(() => (isDemoUrl(row.url) ? runTask(id) : runRealTask(id)), 250);
      }
      persist();
      return json(row);
    }
    if (action === "cancel") {
      const t = tasks.get(id);
      if (t?.timer) window.clearInterval(t.timer);
      if (t) t.canceled = true;
      t?.abort?.abort();
      tasks.delete(id);
      partials.delete(id);
      blobs.delete(id);
      row.status = "canceled";
      row.speed = "";
      persist();
      emit("canceled", { id });
      return json(row);
    }
    if (action === "retry") {
      partials.delete(id);
      row.status = "queued";
      row.progress = 0;
      row.error = "";
      persist();
      window.setTimeout(() => (isDemoUrl(row.url) ? runTask(id) : runRealTask(id)), 250);
      return json(row);
    }
    if (action === "file") {
      const blob = blobs.get(id);
      if (blob) return blobResponse(blob, row.filepath || `${row.title || "indirme"}`);
      const s = sampleOf(row.url);
      return new Response(null, { status: 302, headers: { Location: fileUrl(s.file) } });
    }
    return json(row);
  }

  if (route === "/api/stats") {
    const done = state.downloads.filter((d) => d.status === "completed");
    return json({
      total: state.downloads.length,
      completed: done.length,
      failed: state.downloads.filter((d) => d.status === "failed").length,
      active: state.downloads.filter((d) => ["downloading", "processing", "queued", "paused"].includes(d.status)).length,
      bytes: done.reduce((a, d) => a + d.filesize, 0),
    });
  }

  if (route === "/api/files" && method === "GET") return json({ dir: state.settings.download_dir, items: fileList() });
  if (route === "/api/files" && method === "DELETE") {
    const p = q.get("path") || "";
    const virt = p.match(/^tugrul:\/\/(\d+)\//);
    state.downloads = state.downloads.filter(
      (d) => !(virt ? d.id === Number(virt[1]) : p.endsWith(sampleOf(d.url).file))
    );
    if (virt) {
      blobs.delete(Number(virt[1]));
      partials.delete(Number(virt[1]));
    }
    persist();
    return json({ ok: true });
  }
  if (route === "/api/files/raw") {
    const p = q.get("path") || "";
    const virt = p.match(/^tugrul:\/\/(\d+)\//);
    if (virt) {
      const id = Number(virt[1]);
      const blob = blobs.get(id);
      if (blob) return blobResponse(blob, p);
      return json({ detail: "Dosya bu oturumda değil — tekrar indirin." }, 410);
    }
    const s = DEMO.find((d) => p.endsWith(d.file)) || DEMO[0];
    return new Response(null, { status: 302, headers: { Location: fileUrl(s.file) } });
  }

  if (route === "/api/templates" && method === "GET") return json({ items: state.templates });
  if (route === "/api/templates" && method === "POST") {
    const t = { id: state.seq++, name: body.name, command: body.command, created_at: now() };
    state.templates.unshift(t);
    persist();
    return json(t);
  }
  if (route.startsWith("/api/templates/") && method === "DELETE") {
    state.templates = state.templates.filter((t) => t.id !== Number(route.split("/").pop()));
    persist();
    return json({ ok: true });
  }

  if (route === "/api/scheduled" && method === "GET") return json({ items: state.scheduled });
  if (route === "/api/scheduled" && method === "POST") {
    const s = { id: state.seq++, ...body, status: "pending", created_at: now() };
    state.scheduled.push(s);
    persist();
    return json(s);
  }
  if (route.startsWith("/api/scheduled/") && method === "DELETE") {
    state.scheduled = state.scheduled.filter((s) => s.id !== Number(route.split("/").pop()));
    persist();
    return json({ ok: true });
  }

  if (route === "/api/watchlist" && method === "GET") return json({ items: state.watchlist });
  if (route === "/api/watchlist" && method === "POST") {
    const w = {
      id: state.seq++,
      url: body.url,
      title: body.title || "",
      interval_hours: body.interval_hours || 24,
      auto_download: body.auto_download ? 1 : 0,
      last_checked: 0,
      created_at: now(),
    };
    state.watchlist.unshift(w);
    persist();
    return json(w);
  }
  if (route.startsWith("/api/watchlist/") && method === "DELETE") {
    state.watchlist = state.watchlist.filter((w) => w.id !== Number(route.split("/").pop()));
    persist();
    return json({ ok: true });
  }

  if (route === "/api/logs") return json({ items: state.logs });
  if (route === "/api/logs" && method === "DELETE") {
    state.logs = [];
    persist();
    return json({ ok: true });
  }

  if (route === "/api/backup")
    return json({
      app: "TUGRUL DOWNLOAD",
      version: 1,
      exported_at: now(),
      settings: state.settings,
      templates: state.templates,
      watchlist: state.watchlist,
      history: state.downloads,
    });
  if (route === "/api/restore" && method === "POST") {
    const d = body?.data || {};
    if (d.settings) state.settings = { ...state.settings, ...d.settings };
    if (Array.isArray(d.templates)) state.templates = d.templates;
    if (Array.isArray(d.watchlist)) state.watchlist = d.watchlist;
    persist();
    return json({ settings: Object.keys(d.settings || {}).length, templates: (d.templates || []).length, watchlist: (d.watchlist || []).length, history: 0 });
  }

  if (route === "/api/tools/probe") {
    const p = q.get("path") || "";
    const audio = p.toLowerCase().endsWith(".mp3");
    return json({
      name: p.split("/").pop() || "demo",
      path: p,
      size: audio ? 627_000 : 913_000,
      duration: audio ? 32 : 16,
      bitrate: 160_000,
      container: audio ? "mp3" : "mov,mp4,m4a",
      video: audio ? null : { codec: "h264", width: 1280, height: 720, fps: 30 },
      audio: { codec: audio ? "mp3" : "aac", channels: 2, sample_rate: "44100" },
    });
  }
  if (route.startsWith("/api/tools/"))
    return json(
      {
        detail:
          "Medya araçları (kes, kırp, dönüştür) FFmpeg gerektirir ve tam sürümde (bash scripts/start.sh) çalışır.",
      },
      501
    );

  if (route === "/api/cookies") return json({ ok: true, path: "cookies.txt", bytes: 0 });
  if (route === "/api/lyrics") return json({ found: false });

  return json({ detail: "Bilinmeyen uç (çevrimdışı mod)" }, 404);
}

// --- fetch sarmalayıcı -----------------------------------------------------
export function installOfflineApi() {
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method || (typeof input === "object" && "method" in input ? input.method : "GET") || "GET").toUpperCase();

    if (url.startsWith("/api/")) {
      let body: any = undefined;
      if (init?.body && typeof init.body === "string") {
        try {
          body = JSON.parse(init.body);
        } catch {
          body = init.body;
        }
      }
      if (url === "/api/events") return sseResponse();
      await ready;
      return router(method, url, body);
    }
    return original(input, init);
  };
}

// --- SSE köprüsü -----------------------------------------------------------
const subscribers = new Set<(data: string) => void>();

function sseResponse(): Response {
  const enc = new TextEncoder();
  let timer: number | undefined;
  let closed = false;
  const stream = new ReadableStream({
    start(controller) {
      const send = (payload: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          /* kapanmış */
        }
      };
      send({ type: "hello", items: [...state.downloads].sort((a, b) => b.created_at - a.created_at) });
      const cb = (data: string) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(data));
        } catch {
          /* yut */
        }
      };
      subscribers.add(cb);
      timer = window.setInterval(() => {
        if (!closed) {
          try {
            controller.enqueue(enc.encode(": ping\n\n"));
          } catch {
            /* yut */
          }
        }
      }, 20000);
      (controller as unknown as { _cleanup?: () => void })._cleanup = () => subscribers.delete(cb);
    },
    cancel() {
      closed = true;
      if (timer) window.clearInterval(timer);
    },
  });

  (window as unknown as { __tugrulEmit__?: (e: unknown) => void }).__tugrulEmit__ = (e) => {
    const data = `data: ${JSON.stringify(e)}\n\n`;
    subscribers.forEach((fn) => fn(data));
  };

  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  });
}

const ready = restoreState();

/** Zamanlanmış görevleri çevrimdışı modda da çalıştır. */
export function startOfflineScheduler() {
  window.setInterval(() => {
    const t = now();
    for (const s of state.scheduled) {
      if (s.status === "pending" && s.run_at <= t) {
        s.status = "done";
        void router("POST", "/api/downloads", {
          url: s.url,
          dl_type: s.dl_type,
          format_id: s.format_id,
          title: "Zamanlanmış indirme",
        });
      }
    }
  }, 15000);
}
