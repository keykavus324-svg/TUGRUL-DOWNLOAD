/**
 * Cihaz içi indirme motorunun uçtan uca testi (APK yolu).
 *
 * YTDLnis yaklaşımını doğrular: yt-dlp telefonda çalışır, hiçbir sunucuya
 * gidilmez. Zincir production'dakiyle aynı kurulur:
 *
 *   React arayüzü (Home) → sanal API (offline.ts) → native.ts (Capacitor köprüsü)
 *        → YtdlpPlugin (bu testte sahte köprü ile taklit edilir)
 *        → dosya Download/TUGRUL DOWNLOAD içine yazılır
 *
 * Sahte olan tek katman Java eklentisinin kendisi; köprü sözleşmesi
 * (PluginHeaders / nativePromise / nativeCallback / addListener) Capacitor'ın
 * gerçeğiyle aynı. Dış ağ tamamen kapalı: http(s) isteği atılırsa test başarısız.
 *
 * Çalıştırma: node frontend/native-download-test.mjs
 */
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const failures = [];
const ok = (cond, label, extra = "") => {
  console.log(`${cond ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures.push(label);
};

const DEVICE_DIR = "/storage/emulated/0/Download/TUGRUL DOWNLOAD";
const TEST_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

// --- 1) sahte yt-dlp çıktısı (gerçek --dump-single-json biçimi) ------------
const dumpJson = {
  id: "dQw4w9WgXcQ",
  title: "Rick Astley - Never Gonna Give You Up",
  description: "Resmi video",
  duration: 213,
  uploader: "Rick Astley",
  channel: "Rick Astley",
  upload_date: "20091025",
  view_count: 1500000000,
  like_count: 17000000,
  webpage_url: TEST_URL,
  extractor_key: "Youtube",
  thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  chapters: [{ start_time: 0, end_time: 213, title: "Başlangıç" }],
  subtitles: { tr: [{ ext: "vtt" }], en: [{ ext: "vtt" }] },
  automatic_captions: { tr: [], en: [] },
  formats: [
    {
      format_id: "18",
      ext: "mp4",
      height: 360,
      fps: 25,
      vcodec: "avc1.42001E",
      acodec: "mp4a.40.2",
      abr: 96,
      tbr: 500,
      filesize: 13000000,
      protocol: "https",
      format_note: "360p",
    },
    {
      format_id: "22",
      ext: "mp4",
      height: 720,
      fps: 25,
      vcodec: "avc1.64001F",
      acodec: "mp4a.40.2",
      abr: 128,
      tbr: 1800,
      filesize: 46000000,
      protocol: "https",
      format_note: "720p",
    },
    {
      format_id: "137",
      ext: "mp4",
      height: 1080,
      fps: 25,
      vcodec: "avc1.640028",
      acodec: "none",
      tbr: 4300,
      filesize: 110000000,
      protocol: "https",
    },
    {
      format_id: "140",
      ext: "m4a",
      height: null,
      vcodec: "none",
      acodec: "mp4a.40.2",
      abr: 128,
      tbr: 130,
      filesize: 3400000,
      protocol: "https",
    },
  ],
};

// --- 2) sahte Capacitor köprüsü (gerçek sözleşmeyle aynı) ------------------
const listeners = new Map();
const emitted = [];
let cbSeq = 0;
const deviceFiles = [];

const emitProgress = (payload) => {
  emitted.push(payload);
  for (const cb of listeners.get("progress") || []) cb(payload, null);
};

async function fakeCall(pluginId, method, opts = {}) {
  if (pluginId !== "TugrulYtdlp") throw new Error(`beklenmeyen eklenti: ${pluginId}`);
  switch (method) {
    case "status":
      return { ready: true, error: "", dir: DEVICE_DIR, version: "2025.01.26", engine: "on-device" };
    case "init":
      return { ok: true, version: "2025.01.26", dir: DEVICE_DIR, engine: "on-device" };
    case "info": {
      if (!String(opts.url || "").startsWith("http")) throw new Error("Bağlantı boş");
      return { ok: true, exitCode: 0, stdout: JSON.stringify({ ...dumpJson, webpage_url: opts.url }), stderr: "" };
    }
    case "cancel":
      return { ok: true };
    case "download": {
      const type = opts.type === "audio" ? "mp3" : "mp4";
      const name = `${dumpJson.title.replace(/[^\w -]/g, "")}.${type}`;
      const filePath = `${DEVICE_DIR}/${name}`;
      // yt-dlp --newline çıktısını taklit et: ilerleme olayları
      for (const p of [12.4, 48.9, 81.2, 99.0]) {
        await new Promise((r) => setTimeout(r, 20));
        emitProgress({ id: String(opts.id), progress: p, eta: 3, line: `[download] ${p}% of ~13.00MiB at 4.2MiB/s` });
      }
      deviceFiles.push({ path: filePath, size: type === "mp3" ? 3400000 : 13000000 });
      return { ok: true, exitCode: 0, stderr: "", path: filePath, size: type === "mp3" ? 3400000 : 13000000 };
    }
    default:
      throw new Error(`bilinmeyen metot: ${method}`);
  }
}

const bridge = {
  PluginHeaders: [
    {
      name: "TugrulYtdlp",
      methods: [
        { name: "init", rtype: "promise" },
        { name: "status", rtype: "promise" },
        { name: "info", rtype: "promise" },
        { name: "download", rtype: "promise" },
        { name: "cancel", rtype: "promise" },
        { name: "addListener", rtype: "callback" },
        { name: "removeListener", rtype: "callback" },
      ],
    },
  ],
  nativePromise: (pluginId, method, opts) => fakeCall(pluginId, method, opts),
  nativeCallback: async (pluginId, method, opts, cb) => {
    const id = `cb-${++cbSeq}`;
    if (method === "addListener") {
      const list = listeners.get(opts.eventName) || [];
      list.push(cb);
      listeners.set(opts.eventName, list);
    }
    return id;
  },
  getPlatform: () => "android",
  isNativePlatform: () => true,
};

// --- 3) jsdom + gerçek uygulama --------------------------------------------
const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
  url: "https://keykavus324-svg.github.io/TUGRUL-DOWNLOAD/",
  pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
globalThis.localStorage = dom.window.localStorage;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Node = dom.window.Node;
globalThis.MouseEvent = dom.window.MouseEvent;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.getComputedStyle = dom.window.getComputedStyle;
dom.window.TextDecoder = TextDecoder;
dom.window.TextEncoder = TextEncoder;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Android kabuğu: Capacitor küreseli hem Node globalinde hem window'da
globalThis.androidBridge = {};
dom.window.androidBridge = {};
globalThis.Capacitor = bridge;
dom.window.Capacitor = bridge;

// --- dış ağ tamamen kapalı --------------------------------------------------
const externalCalls = [];
const blockedFetch = (...args) => {
  const url = typeof args[0] === "string" ? args[0] : args[0]?.url || String(args[0]);
  if (/^https?:/i.test(url)) {
    externalCalls.push(url);
    return Promise.reject(new Error(`dış ağ isteği engellendi: ${url}`));
  }
  return Promise.reject(new Error(`beklenmeyen istek: ${url}`));
};
dom.window.fetch = blockedFetch;
globalThis.fetch = blockedFetch;

// EventSource jsdom'da yok → offline.ts'in SSE köprüsünü fetch üzerinden kur
class SsePolyfill {
  constructor(url) {
    this.onmessage = null;
    this.onopen = null;
    this.onerror = null;
    this._closed = false;
    (async () => {
      try {
        const res = await window.fetch(url);
        this.onopen && this.onopen({});
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        while (!this._closed) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const parts = buf.split("\n\n");
          buf = parts.pop() || "";
          for (const part of parts) {
            const line = part.split("\n").find((l) => l.startsWith("data: "));
            if (line && this.onmessage) this.onmessage({ data: line.slice(6) });
          }
        }
      } catch {
        this.onerror && this.onerror({});
      }
    })();
  }
  close() {
    this._closed = true;
  }
  addEventListener() {}
}
globalThis.EventSource = SsePolyfill;
dom.window.EventSource = SsePolyfill;

dom.window.matchMedia = () => ({
  matches: false,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
});
dom.window.scrollTo = () => {};
dom.window.Element.prototype.scrollIntoView = () => {};
dom.window.URL.createObjectURL = () => "blob:tugrul-native-test";
dom.window.URL.revokeObjectURL = () => {};
globalThis.URL.createObjectURL = dom.window.URL.createObjectURL;
globalThis.URL.revokeObjectURL = dom.window.URL.revokeObjectURL;

await build({
  entryPoints: [path.join(HERE, "src/offline.ts")],
  bundle: true,
  format: "esm",
  outfile: path.join(HERE, ".native-off.mjs"),
  logLevel: "error",
  define: { "import.meta.env.MODE": '"ghpages"', "process.env.NODE_ENV": '"development"' },
});
const off = await import("./.native-off.mjs?" + Date.now());
off.installOfflineApi();
globalThis.fetch = dom.window.fetch; // sarmalayıcı kurulduktan sonra
off.startOfflineScheduler();

const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");

await build({
  entryPoints: [path.join(HERE, "scripts/appEntry.tsx")],
  bundle: true,
  format: "esm",
  outfile: path.join(HERE, ".native-app.mjs"),
  logLevel: "error",
  jsx: "automatic",
  define: { "import.meta.env.MODE": '"ghpages"', "process.env.NODE_ENV": '"development"' },
  external: ["react", "react-dom", "react-dom/client", "react-router-dom", "lucide-react"],
});
const { App } = await import("./.native-app.mjs?" + Date.now());

const container = document.getElementById("root");
const root = createRoot(container);
const errors = [];
const origErr = console.error;
console.error = (...a) => {
  const s = a.join(" ");
  if (!/useLayoutEffect|not wrapped in act|ReactDOMTestUtils|React Router Future Flag/.test(s)) errors.push(s);
  origErr(...a);
};

await act(async () => {
  root.render(React.createElement(App));
});
await act(async () => {
  await new Promise((r) => setTimeout(r, 600));
});
ok(/TUĞRUL/.test(container.textContent || ""), "arayüz render edildi");

// --- 4) motor cihazda görünüyor mu? ----------------------------------------
const health = await (await dom.window.fetch("/api/health")).json();
ok(health.engine === "device", "health: motor cihaz içi", health.engine);
ok(health.ytdlp.includes("cihaz"), "health: yt-dlp cihazda", health.ytdlp);
ok(/cihazda/.test(container.textContent || ""), "rozet: 'yt-dlp · cihazda'", "");

// --- 5) yapıştır → çözümleme cihazda, indirme kendiliğinden başlar ---------
const input = container.querySelector('input[placeholder*="Bağlantıyı yapıştırın"]');
ok(!!input, "bağlantı alanı bulundu");

const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set;
await act(async () => {
  setter.call(input, TEST_URL);
  input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 400));
});
ok(externalCalls.length === 0, "yapıştırma sırasında dış ağa çıkılmadı", externalCalls.join(", "));

await act(async () => {
  input.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await new Promise((r) => setTimeout(r, 500));
});

const queued = await (await dom.window.fetch("/api/downloads")).json();
ok(queued.items.length === 1, "kuyrukta 1 kayıt", queued.items[0]?.status);
ok(
  ["downloading", "processing", "queued", "completed"].includes(queued.items[0]?.status),
  "indirme kendiliğinden başladı",
  queued.items[0]?.status
);

let done = null;
for (let i = 0; i < 40; i++) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 250));
  });
  const row = (await (await dom.window.fetch("/api/downloads")).json()).items[0];
  if (row && ["completed", "failed", "canceled"].includes(row.status)) {
    done = row;
    break;
  }
}

ok(!!done, "indirme bitti", done?.status);
ok(done?.status === "completed", "durum: completed", done?.error || "");
ok(emitted.length >= 4, "ilerleme olayları eklentiden geldi", `${emitted.length} olay`);
ok((done?.progress ?? 0) === 100, "ilerleme %100", String(done?.progress));
ok(
  (done?.filepath || "").startsWith(DEVICE_DIR),
  "dosya cihazın İndirilenler klasöründe",
  done?.filepath
);
ok(done?.filesize === 13000000, "dosya boyutu eklentiden geldi", String(done?.filesize));
ok(externalCalls.length === 0, "indirme boyunca dış ağa çıkılmadı", externalCalls.join(", "));
ok(
  /Never Gonna Give You Up/.test(container.textContent || ""),
  "başlık cihazdaki yt-dlp'den geldi (sunucusuz)",
  done?.title
);

// --- 6) ses indirmesi (mp3) -------------------------------------------------
await act(async () => {
  await dom.window.fetch("/api/downloads", {
    method: "POST",
    body: JSON.stringify({ url: TEST_URL, dl_type: "audio", title: dumpJson.title }),
  });
  await new Promise((r) => setTimeout(r, 300));
});
let audio = null;
for (let i = 0; i < 40; i++) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 250));
  });
  const items = (await (await dom.window.fetch("/api/downloads")).json()).items;
  const row = items.find((d) => d.dl_type === "audio");
  if (row && ["completed", "failed"].includes(row.status)) {
    audio = row;
    break;
  }
}
ok(audio?.status === "completed", "ses indirmesi tamamlandı", audio?.error || audio?.status);
ok((audio?.filepath || "").endsWith(".mp3"), "ses dosyası mp3", audio?.filepath);
ok(externalCalls.length === 0, "ses indirmesinde de dış ağ yok", externalCalls.join(", "));

// --- 7) kayıt listesi cihaz yolunu gösteriyor ------------------------------
const list = await (await dom.window.fetch("/api/downloads")).json();
ok(list.items.length === 2, "kuyrukta 2 kayıt", String(list.items.length));

ok(errors.length === 0, "React hatası yok", errors.slice(0, 3).join(" | "));
ok(externalCalls.length === 0, "TOPLAM: hiçbir dış sunucuya gidilmedi", externalCalls.join(", "));

console.log(
  failures.length === 0
    ? "\nPASS — yapıştır → cihaz içi yt-dlp → dosya telefonda (sunucusuz)"
    : `\nFAIL: ${failures.join(", ")}`
);
process.exit(failures.length === 0 ? 0 : 1);
