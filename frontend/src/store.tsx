import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./lib";
import type { Download, Health, Settings, Stats } from "./types";

type Toast = { id: number; kind: "ok" | "err" | "info"; title: string; body?: string };

type Ctx = {
  downloads: Download[];
  stats: Stats;
  settings: Settings;
  health: Health | null;
  connected: boolean;
  toasts: Toast[];
  toast: (kind: Toast["kind"], title: string, body?: string) => void;
  dismiss: (id: number) => void;
  refresh: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  refreshHealth: () => Promise<void>;
  setSettings: (patch: Record<string, string>) => Promise<void>;
};

const AppCtx = createContext<Ctx | null>(null);

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp AppProvider dışında kullanıldı");
  return ctx;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [downloads, setDownloads] = useState<Download[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, completed: 0, failed: 0, active: 0, bytes: 0 });
  const [settings, setSettingsState] = useState<Settings>({});
  const [health, setHealth] = useState<Health | null>(null);
  const [connected, setConnected] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const esRef = useRef<EventSource | null>(null);
  const toastId = useRef(1);

  const toast = useCallback((kind: Toast["kind"], title: string, body?: string) => {
    const id = toastId.current++;
    setToasts((t) => [...t.slice(-4), { id, kind, title, body }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4800);
  }, []);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const refresh = useCallback(async () => {
    try {
      const data = await api<{ items: Download[] }>("/api/downloads?limit=300");
      setDownloads(data.items);
      setStats(await api<Stats>("/api/stats"));
      setConnected(true);
    } catch {
      setConnected(false);
    }
  }, []);

  const refreshSettings = useCallback(async () => {
    try {
      setSettingsState(await api<Settings>("/api/settings"));
    } catch {
      /* yut */
    }
  }, []);

  const refreshHealth = useCallback(async () => {
    try {
      setHealth(await api<Health>("/api/health"));
      setConnected(true);
    } catch {
      setConnected(false);
    }
  }, []);

  const setSettings = useCallback(async (patch: Record<string, string>) => {
    const next = await api<Settings>("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patch }),
    });
    setSettingsState(next);
  }, []);

  useEffect(() => {
    refresh();
    refreshSettings();
    refreshHealth();
    const es = new EventSource("/api/events");
    esRef.current = es;
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type === "hello") {
          setDownloads(data.items || []);
          return;
        }
        if (data.type === "progress") {
          setDownloads((prev) =>
            prev.map((d) =>
              d.id === data.id
                ? {
                    ...d,
                    progress: data.progress,
                    speed: data.speed ?? d.speed,
                    eta: data.eta ?? d.eta,
                    status: d.status === "queued" ? "downloading" : d.status,
                  }
                : d
            )
          );
          return;
        }
        if (data.type === "completed") {
          setDownloads((prev) => {
            const exists = prev.some((d) => d.id === data.id);
            if (!exists && data.item) return [data.item, ...prev];
            return prev.map((d) => (d.id === data.id && data.item ? data.item : d));
          });
          if (data.item) toast("ok", "İndirme tamamlandı", data.item.title || undefined);
          api<Stats>("/api/stats").then(setStats).catch(() => {});
          return;
        }
        if (["started", "queued", "paused", "canceled", "failed", "processing"].includes(data.type)) {
          if (data.item) {
            setDownloads((prev) => {
              const exists = prev.some((d) => d.id === data.item.id);
              return exists
                ? prev.map((d) => (d.id === data.item.id ? data.item : d))
                : [data.item, ...prev];
            });
          } else if (data.id) {
            const patch: Partial<Download> =
              data.type === "paused"
                ? { status: "paused" }
                : data.type === "canceled"
                ? { status: "canceled" }
                : data.type === "failed"
                ? { status: "failed", error: data.error || "" }
                : data.type === "processing"
                ? { status: "processing" }
                : {};
            setDownloads((prev) => prev.map((d) => (d.id === data.id ? { ...d, ...patch } : d)));
          }
          if (data.type === "failed") toast("err", "İndirme başarısız", data.error || undefined);
        }
      } catch {
        /* yut */
      }
    };
    const timer = window.setInterval(() => {
      refreshHealth();
    }, 20000);
    return () => {
      es.close();
      window.clearInterval(timer);
    };
  }, [refresh, refreshHealth, toast]);

  // tema
  useEffect(() => {
    const t = settings.theme || "dark";
    const root = document.documentElement;
    root.classList.toggle("light", t === "light");
    root.classList.toggle("dark", t !== "light");
  }, [settings.theme]);

  const value = useMemo(
    () => ({
      downloads,
      stats,
      settings,
      health,
      connected,
      toasts,
      toast,
      dismiss,
      refresh,
      refreshSettings,
      refreshHealth,
      setSettings,
    }),
    [downloads, stats, settings, health, connected, toasts, toast, dismiss, refresh, refreshSettings, refreshHealth, setSettings]
  );

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
