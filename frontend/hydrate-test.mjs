import { build } from "esbuild";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
  url: "https://keykavus324-svg.github.io/TUGRUL-DOWNLOAD/", pretendToBeVisual: true,
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
dom.window.fetch = async () => { throw new Error("no net"); };
globalThis.fetch = dom.window.fetch;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// jsdom'da EventSource yok — çevrimdışı SSE köprüsünü gerçekten tüketen polyfill
class SsePolyfill {
  constructor(url) {
    this.url = url; this.onmessage = null; this.onopen = null; this.onerror = null;
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
      } catch { this.onerror && this.onerror({}); }
    })();
  }
  close() { this._closed = true; }
  addEventListener() {}
}
globalThis.EventSource = SsePolyfill;
dom.window.EventSource = SsePolyfill;

// jsdom'da olmayan API'ler
dom.window.matchMedia = dom.window.matchMedia || (() => ({ matches:false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} }));
dom.window.scrollTo = () => {};
dom.window.Element.prototype.scrollIntoView = () => {};

await build({ entryPoints: ["src/offline.ts"], bundle: true, format: "esm", outfile: "./.off.mjs", logLevel: "error" });
const off = await import("./.off.mjs?" + Date.now());
off.installOfflineApi();
globalThis.fetch = dom.window.fetch;   // tarayıcıda globalThis === window; Node'da eşitle
off.startOfflineScheduler();

const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");
const { default: App } = await import("./src/App.tsx?x=" + Date.now()).catch(() => ({}));

await build({
  entryPoints: ["scripts/appEntry.tsx"], bundle: true, format: "esm", outfile: "./.app2.mjs",
  logLevel: "error", jsx: "automatic",
  define: { "import.meta.env.MODE": '"ghpages"', "process.env.NODE_ENV": '"development"' },
  external: ["react", "react-dom", "react-dom/client", "react-router-dom", "lucide-react"],
});
const { App: AppComp } = await import("./.app2.mjs?" + Date.now());

const container = document.getElementById("root");
const root = createRoot(container);
const errors = [];
const origErr = console.error;
console.error = (...a) => { const s = a.join(" "); if (!/useLayoutEffect|not wrapped in act/.test(s)) errors.push(s); origErr(...a); };

await act(async () => { root.render(React.createElement(AppComp)); });
await act(async () => { await new Promise((r) => setTimeout(r, 400)); });

const text = () => container.textContent || "";
const dbg = await (await window.fetch("/api/health")).json();
console.log("motor:", dbg.mode);
console.log("metin:", JSON.stringify(container.textContent?.slice(0, 500)));
console.log("ana sayfa:", text().length, "karakter;", /TUĞRUL/.test(text()) ? "marka ✓" : "marka ✗");
const input = container.querySelector('input[placeholder*="demo://"]');
console.log("URL alanı:", !!input, "| örnek kartlar:", container.querySelectorAll('button').length);

// demo indirme akışını arayüz üzerinden başlat: hızlı çubuk (her sayfada) + Enter
const inputEl =
  container.querySelector('input[placeholder^="Hızlı indir"]') ||
  container.querySelector('input[placeholder*="demo://"]');
const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set;
await act(async () => {
  setter.call(inputEl, "demo://demo002");
  inputEl.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
});
await act(async () => {
  inputEl.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await new Promise((r) => setTimeout(r, 600));
});
await act(async () => { await new Promise((r) => setTimeout(r, 900)); });
const created = await (await window.fetch("/api/downloads")).json();
console.log("arayüzden indirme:", created.items.length, "kayıt |", created.items[0]?.status ?? "-");

// kuyruk sayfasına git
await act(async () => {
  window.location.hash = "#/queue";
  window.dispatchEvent(new dom.window.HashChangeEvent("hashchange"));
  await new Promise((r) => setTimeout(r, 500));
});
console.log("kuyruk sayfası:", /Kuyruk|kuyruk|İndiriliyor|Sırada/.test(text()) ? "✓" : "✗", text().length);

for (let i = 0; i < 45; i++) {
  await act(async () => { await new Promise((r) => setTimeout(r, 1000)); });
  const d = (await (await window.fetch("/api/downloads")).json()).items[0];
  if (d && ["completed", "failed", "canceled"].includes(d.status)) break;
}
const done = await (await window.fetch("/api/downloads")).json();
console.log("tamamlanan:", done.items.filter((i) => i.status === "completed").length, "/", done.items.length);

// tekil olarak devam eden hataları özetle
const realErrors = errors.filter((e) => !/Warning: ReactDOM.render|findDOMNode/.test(e));
console.log(realErrors.length === 0 ? "React hata kaydı: temiz ✓" : "React hataları:\n" + realErrors.slice(0, 6).join("\n"));
process.exit(realErrors.length === 0 ? 0 : 1);
