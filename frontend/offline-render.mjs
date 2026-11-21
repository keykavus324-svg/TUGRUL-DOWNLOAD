import { build } from "esbuild";
import { JSDOM } from "jsdom";
import fs from "node:fs";

const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
  url: "https://keykavus324-svg.github.io/TUGRUL-DOWNLOAD/",
  pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
globalThis.localStorage = dom.window.localStorage;
dom.window.fetch = async () => { throw new Error("no net"); };
globalThis.fetch = dom.window.fetch;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.EventSource = class { constructor(){ this.onmessage=null; } close(){} addEventListener(){} set onopen(v){} set onerror(v){} };
downloadsFix();
function downloadsFix() {}

// offline fetch
await build({
  entryPoints: ["src/offline.ts"], bundle: true, format: "esm",
  outfile: "/tmp/off2.mjs", logLevel: "error",
});
const off = await import("/tmp/off2.mjs?" + Date.now());
off.installOfflineApi();
off.startOfflineScheduler();

const { createElement } = await import("react");
await build({
  entryPoints: ["./scripts/renderEntry.tsx"], bundle: true, format: "esm",
  outfile: "./.app-render.mjs", logLevel: "error", jsx: "automatic",
  define: { "import.meta.env.MODE": '"ghpages"' },
  external: ["react", "react-dom", "react-dom/server", "react-router-dom", "@fontsource-variable/inter", "@fontsource-variable/space-grotesk", "lucide-react", "@capacitor/core"],
});
const { renderAll } = await import("./.app-render.mjs?" + Date.now());
const out = await renderAll();
let bad = 0;
for (const [route, html] of Object.entries(out)) {
  const ok = html.length > 5000 && html.includes("TUĞRUL");
  if (!ok) bad++;
  console.log((ok ? "✓" : "✗"), route.padEnd(11), html.length, "karakter");
}
console.log(bad === 0 ? "\n10/10 sayfa temiz render edildi (çevrimdışı mod)" : `\n${bad} sayfa başarısız`);
process.exit(bad === 0 ? 0 : 1);
