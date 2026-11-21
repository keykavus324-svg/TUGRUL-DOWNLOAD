export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    let msg = `İstek başarısız (${res.status})`;
    try {
      const data = await res.json();
      if (data?.detail) msg = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
    } catch {
      /* yut */
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export const post = <T,>(path: string, body?: unknown) =>
  api<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
export const del = <T,>(path: string) => api<T>(path, { method: "DELETE" });
export const put = <T,>(path: string, body?: unknown) =>
  api<T>(path, { method: "PUT", body: JSON.stringify(body) });

export function bytes(n?: number | null): string {
  if (!n || n <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

export function clock(seconds?: number | null): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

export function ago(ts?: number | null): string {
  if (!ts) return "—";
  const diff = Math.max(0, Date.now() / 1000 - ts);
  if (diff < 60) return "az önce";
  if (diff < 3600) return `${Math.floor(diff / 60)} dk önce`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} sa önce`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} gün önce`;
  return new Date(ts * 1000).toLocaleDateString("tr-TR");
}

export function count(n?: number | null): string {
  if (!n) return "—";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} Mr`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} Mn`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)} B`;
  return String(n);
}

export function isUrl(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (t.startsWith("demo://")) return true;
  return /^(https?:\/\/|www\.)\S+\.\S+/i.test(t) || /^[a-zA-Z0-9_-]{11}$/.test(t);
}

export function statusLabel(s: string): string {
  return (
    {
      queued: "Sırada",
      downloading: "İndiriliyor",
      processing: "İşleniyor",
      paused: "Duraklatıldı",
      completed: "Tamamlandı",
      failed: "Hata",
      canceled: "İptal",
    } as Record<string, string>
  )[s] || s;
}

export function statusTone(s: string): string {
  return (
    {
      queued: "text-sky-300 bg-sky-400/10 ring-sky-400/20",
      downloading: "text-teal-300 bg-teal-400/10 ring-teal-400/20",
      processing: "text-violet-300 bg-violet-400/10 ring-violet-400/20",
      paused: "text-amber-300 bg-amber-400/10 ring-amber-400/20",
      completed: "text-emerald-300 bg-emerald-400/10 ring-emerald-400/20",
      failed: "text-rose-300 bg-rose-400/10 ring-rose-400/20",
      canceled: "text-zinc-400 bg-zinc-400/10 ring-zinc-400/20",
    } as Record<string, string>
  )[s] || "text-zinc-400 bg-zinc-400/10 ring-zinc-400/20";
}

export function downloadUrl(id: number) {
  return `/api/downloads/${id}/file`;
}
