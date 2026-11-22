/**
 * Gerçek indirme akışının uçtan uca testi (tarayıcı yerine jsdom).
 *
 * Zincir birebir production'daki gibi kurulur:
 *
 *   React arayüzü (Home)  →  sanal kuyruk API'si (offline.ts)
 *        →  proxy istemcisi (proxy.ts)  →  GERÇEK motor (vercel-api/api/index.py, uvicorn)
 *        →  Range destekli kaynak sunucu  →  parça parça baytlar → Blob
 *
 * Doğrulanan: yapıştır → indirme kendiliğinden başlar → ilerleme gerçek baytlardan
 * gelir → tamamlanınca dosya bayt bayt kaynakla aynı olur.
 *
 * Çalıştırma:  node frontend/proxy-download-test.mjs
 * (Python bağımlılıkları: fastapi, httpx, uvicorn, yt-dlp)
 */
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const SAMPLE_DIR = path.join(HERE, "public", "sample");
const SAMPLE = "tugrul-demo.mp4";
const CHUNK = 65536; // küçük parça → çok adımlı birleştirme gerçekten çalışsın

const source = fs.readFileSync(path.join(SAMPLE_DIR, SAMPLE));
const failures = [];
const ok = (cond, label, extra = "") => {
  console.log(`${cond ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures.push(label);
};

// --- 1) Range destekli kaynak sunucu --------------------------------------
function originServer() {
  const server = http.createServer((req, res) => {
    const file = path.join(SAMPLE_DIR, path.basename(new URL(req.url, "http://x").pathname));
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404).end();
      return;
    }
    const size = fs.statSync(file).size;
    const range = req.headers.range;
    if (range && range.startsWith("bytes=")) {
      const [a, b] = range.slice(6).split("-");
      const start = Number(a || 0);
      const end = Math.min(Number(b || size - 1), size - 1);
      res.writeHead(206, {
        "Content-Type": "video/mp4",
        "Accept-Ranges": "bytes",
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": String(end - start + 1),
      });
      fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": String(size) });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

// --- 2) gerçek motor: vercel-api/api/index.py + uvicorn --------------------
function engineServer(originHost) {
  const py = fs.existsSync(path.join(ROOT, ".venv-api", "bin", "python"))
    ? path.join(ROOT, ".venv-api", "bin", "python")
    : "python3";
  const child = spawn(
    py,
    [
      "-c",
      `
import importlib.util, threading, uvicorn, httpx, time
spec = importlib.util.spec_from_file_location("tug_api", "${ROOT}/vercel-api/api/index.py")
mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
port = int(__import__("os").environ["TUG_PORT"])
cfg = uvicorn.Config(mod.app, host="127.0.0.1", port=port, log_level="warning")
uvicorn.Server(cfg).run()
`,
    ],
    {
      env: {
        ...process.env,
        TUG_EXTRA_HOSTS: originHost,
        TUG_CHUNK: String(CHUNK),
        TUG_SECRET: "local-test-secret",
        TUG_PORT: "8931",
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  child.stderr.on("data", () => {});
  child.stdout.on("data", () => {});
  return child;
}

const origin = await originServer();
const originPort = origin.address().port;
const mediaUrl = `http://127.0.0.1:${originPort}/${SAMPLE}`;

const engine = engineServer("127.0.0.1");
const base = "http://127.0.0.1:8931/api/index";

// motor ayağa kalkana kadar bekle
let alive = false;
for (let i = 0; i < 120; i++) {
  try {
    const r = await fetch(`${base}/api/health`);
    if (r.ok) {
      alive = true;
      const h = await r.json();
      ok(h.ok === true && h.engine === "yt-dlp", "motor ayakta", `yt-dlp ${h.ytdlp}, chunk ${h.chunk}`);
      break;
    }
  } catch {
    /* henüz değil */
  }
  await new Promise((r) => setTimeout(r, 250));
}
if (!alive) {
  console.log("✗ motor ayağa kalkmadı — .venv-api içinde fastapi/uvicorn/yt-dlp kurulu olmalı");
  engine.kill();
  origin.close();
  process.exit(1);
}

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
// proxy mutlak URL kullanır → gerçek (Node) fetch geçmeli
const realFetch = globalThis.fetch.bind(globalThis);
dom.window.fetch = (...args) => realFetch(...args);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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
dom.window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
// modül Node globalindeki URL'i kullanır → oraya ve jsdom'un anchor'ına kanca tak
const saved = [];
const clicked = [];
const origCreate = globalThis.URL.createObjectURL?.bind(globalThis.URL);
globalThis.URL.createObjectURL = (b) => {
  saved.push({ size: b.size, type: b.type });
  return "blob:tugrul-test";
};
globalThis.URL.revokeObjectURL = () => {};
dom.window.URL.createObjectURL = globalThis.URL.createObjectURL;
dom.window.URL.revokeObjectURL = globalThis.URL.revokeObjectURL;
// jsdom "navigation" desteklemez → tıklamayı kaydet
dom.window.HTMLAnchorElement.prototype.click = function () {
  clicked.push({ download: this.download, href: this.href });
};
dom.window.scrollTo = () => {};
dom.window.Element.prototype.scrollIntoView = () => {};

// uygulama hangi motora bağlanacağını localStorage'dan okur
dom.window.localStorage.setItem("tugrul.proxy", base);

await build({ entryPoints: [path.join(HERE, "src/offline.ts")], bundle: true, format: "esm", outfile: path.join(HERE, ".proxy-off.mjs"), logLevel: "error" });
const off = await import("./.proxy-off.mjs?" + Date.now());
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
  outfile: path.join(HERE, ".proxy-app.mjs"),
  logLevel: "error",
  jsx: "automatic",
  define: { "import.meta.env.MODE": '"ghpages"', "process.env.NODE_ENV": '"development"' },
  external: ["react", "react-dom", "react-dom/client", "react-router-dom", "lucide-react"],
});
const { App } = await import("./.proxy-app.mjs?" + Date.now());

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
  await new Promise((r) => setTimeout(r, 500));
});

ok(/TUĞRUL/.test(container.textContent || ""), "arayüz render edildi");

// --- 4) yapıştır → indirme kendiliğinden başlar ---------------------------
const input = container.querySelector('input[placeholder*="Bağlantıyı yapıştırın"]');
ok(!!input, "bağlantı alanı bulundu");

const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set;
await act(async () => {
  setter.call(input, mediaUrl);
  input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 120));
});
await act(async () => {
  input.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await new Promise((r) => setTimeout(r, 800));
});

const queued = await (await window.fetch("/api/downloads")).json();
ok(queued.items.length === 1, "kuyrukta 1 kayıt", queued.items[0]?.status);
ok(
  ["downloading", "processing", "queued", "completed"].includes(queued.items[0]?.status),
  "indirme kendiliğinden başladı (ek düğmeye gerek kalmadı)",
  queued.items[0]?.status
);

// ilerleme gerçek mi?
await act(async () => {
  await new Promise((r) => setTimeout(r, 1500));
});
const mid = (await (await window.fetch("/api/downloads")).json()).items[0];
ok(mid.progress > 0, "ilerleme gerçek baytlarla akıyor", `%${mid.progress} ${mid.speed || "-"}`);

// tamamlanmasını bekle
let done = null;
for (let i = 0; i < 60; i++) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 500));
  });
  const row = (await (await window.fetch("/api/downloads")).json()).items[0];
  if (row && ["completed", "failed", "canceled"].includes(row.status)) {
    done = row;
    break;
  }
}
ok(!!done, "indirme bitti", done?.status);
ok(done?.status === "completed", "durum: completed", done?.error || "");
ok(done?.filesize === source.length, "dosya boyutu doğru", `${done?.filesize} / ${source.length}`);

// --- 5) indirilen dosya kaynakla birebir aynı mı? -------------------------
const fileRes = await window.fetch(`/api/downloads/${done?.id}/file`);
const buf = Buffer.from(await fileRes.arrayBuffer());
ok(buf.length === source.length, "kaydedilen dosya boyu", String(buf.length));
ok(buf.equals(source), "baytlar kaynakla birebir aynı");

// --- 6) tamamlanan satırdan cihaza kaydet --------------------------------
await act(async () => {
  window.location.hash = "#/queue";
  window.dispatchEvent(new dom.window.HashChangeEvent("hashchange"));
  await new Promise((r) => setTimeout(r, 400));
});
// tamamlananlar "Tüm kayıtlar" sekmesinde görünür
const allTab = [...container.querySelectorAll("button")].find((b) => /Tüm kayıtlar/.test(b.textContent || ""));
ok(!!allTab, "'Tüm kayıtlar' sekmesi bulundu");
if (allTab) {
  await act(async () => {
    allTab.click();
    await new Promise((r) => setTimeout(r, 300));
  });
}
const saveBtn = container.querySelector('button[title="Cihaza kaydet"]');
ok(!!saveBtn, "tamamlanan satırda 'Cihaza kaydet' düğmesi var");
if (saveBtn) {
  await act(async () => {
    saveBtn.click();
    await new Promise((r) => setTimeout(r, 600));
  });
  ok(saved.length === 1, "kaydet düğmesi dosyayı Blob olarak aldı", JSON.stringify(saved));
  ok(saved[0]?.size === source.length, "kaydedilen Blob boyu doğru", String(saved[0]?.size));
  ok(saved[0]?.type === "video/mp4", "MIME doğru", String(saved[0]?.type));
  ok(clicked.length === 1 && clicked[0].download, "tarayıcıda indirme tetiklendi (a[download])", JSON.stringify(clicked));
  ok(!/Kaydedilemedi/.test(container.textContent || ""), "kayıt hatası gösterilmedi");
  if (origCreate) globalThis.URL.createObjectURL = origCreate;
}

ok(errors.length === 0, "React hatası yok", errors.slice(0, 3).join(" | "));

engine.kill();
origin.close();
console.log(failures.length === 0 ? "\nPASS — yapıştır → gerçek indirme → dosya doğrulandı" : `\nFAIL: ${failures.join(", ")}`);
process.exit(failures.length === 0 ? 0 : 1);
