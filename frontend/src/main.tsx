import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { installOfflineApi, startOfflineScheduler } from "./offline";
import { engineMode, serverBase, useRemoteServer } from "./engine";
import "./index.css";

// Native kabuk + kullanıcı bir sunucu adresi girdiyse: istekleri oraya yönlendir
if (useRemoteServer()) {
  const base = serverBase();
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("/api/")) return original(base + url, init);
    return original(input, init);
  };
} else if (engineMode === "offline") {
  // Statik barındırma (GitHub Pages / APK) → tarayıcı içi motor
  (window as unknown as { __TUGRUL_OFFLINE__: boolean }).__TUGRUL_OFFLINE__ = true;
  installOfflineApi();
  startOfflineScheduler();
}

// Android paylaşım hedefi: kabuk `window.__TUGRUL_SHARE__(metin)` çağırır
(window as unknown as { __TUGRUL_SHARE__?: (text: string) => void }).__TUGRUL_SHARE__ = (text: string) => {
  try {
    localStorage.setItem("tugrul.pendingShare", text);
  } catch {
    /* yut */
  }
  window.dispatchEvent(new CustomEvent("tugrul:share", { detail: text }));
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
