import { useEffect, useState } from "react";
import { AlarmClock, CalendarClock, Plus, Trash2 } from "lucide-react";
import { api, del, post } from "../lib";
import { useApp } from "../store";
import type { Scheduled } from "../types";

export default function Schedule() {
  const { toast } = useApp();
  const [items, setItems] = useState<Scheduled[]>([]);
  const [url, setUrl] = useState("");
  const [when, setWhen] = useState(() => {
    const d = new Date(Date.now() + 3600_000);
    d.setMinutes(0, 0, 0);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });
  const [kind, setKind] = useState("video");
  const [busy, setBusy] = useState(false);

  const load = () => api<{ items: Scheduled[] }>("/api/scheduled").then((d) => setItems(d.items)).catch(() => {});
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  async function add() {
    if (!url.trim()) return;
    setBusy(true);
    try {
      await post("/api/scheduled", {
        url: url.trim(),
        run_at: new Date(when).getTime() / 1000,
        dl_type: kind,
        format_id: kind === "audio" ? "mp3" : "h1080",
      });
      setUrl("");
      toast("ok", "Görev zamanlandı");
      load();
    } catch (e) {
      toast("err", "Zamanlanamadı", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    await del(`/api/scheduled/${id}`);
    load();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="panel p-4">
        <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold text-white">
          <CalendarClock className="h-4 w-4 text-gold-400" /> Yeni zamanlanmış indirme
        </h2>
        <p className="mt-1 text-[11.5px] text-zinc-500">Belirttiğiniz tarih ve saatte indirme otomatik başlar.</p>
        <div className="mt-3 grid gap-2.5 sm:grid-cols-[1fr_auto_auto]">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className="input" />
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="input sm:w-auto" />
          <div className="flex gap-2">
            <div className="flex rounded-xl bg-white/[0.04] p-0.5 ring-1 ring-white/10">
              {(["video", "audio"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  className={`rounded-lg px-3 py-1.5 text-[11.5px] font-medium ${kind === k ? "bg-gold-400 text-ink-950" : "text-zinc-400"}`}
                >
                  {k === "video" ? "Video" : "Ses"}
                </button>
              ))}
            </div>
            <button onClick={add} disabled={busy || !url.trim()} className="btn-gold flex-1">
              <Plus className="h-4 w-4" /> Ekle
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {items.map((s) => {
          const past = s.run_at * 1000 < Date.now();
          return (
            <div key={s.id} className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3">
              <span className={`grid h-9 w-9 place-items-center rounded-xl ${s.status === "done" ? "bg-emerald-400/10 text-emerald-300" : past ? "bg-zinc-500/10 text-zinc-400" : "bg-gold-400/10 text-gold-300"}`}>
                <AlarmClock className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] text-zinc-200">{s.url}</p>
                <p className="text-[10.5px] text-zinc-500">
                  {new Date(s.run_at * 1000).toLocaleString("tr-TR")} · {s.dl_type === "audio" ? "Ses" : "Video"} ·{" "}
                  <span className={s.status === "done" ? "text-emerald-400" : past ? "text-amber-400" : "text-sky-400"}>
                    {s.status === "done" ? "çalıştı" : past ? "işleniyor" : "bekliyor"}
                  </span>
                </p>
              </div>
              <button onClick={() => remove(s.id)} className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-rose-500/10 hover:text-rose-300">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })}
        {items.length === 0 && (
          <div className="panel px-6 py-12 text-center">
            <p className="text-[13px] text-zinc-500">Zamanlanmış görev yok.</p>
          </div>
        )}
      </div>
    </div>
  );
}
