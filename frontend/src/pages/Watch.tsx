import { useEffect, useState } from "react";
import { Bell, Plus, Radar, Trash2 } from "lucide-react";
import { api, del, post } from "../lib";
import { useApp } from "../store";
import type { WatchItem } from "../types";

export default function Watch() {
  const { toast } = useApp();
  const [items, setItems] = useState<WatchItem[]>([]);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [hours, setHours] = useState(24);
  const [auto, setAuto] = useState(false);

  const load = () => api<{ items: WatchItem[] }>("/api/watchlist").then((d) => setItems(d.items)).catch(() => {});
  useEffect(() => {
    load();
  }, []);

  async function add() {
    if (!url.trim()) return;
    try {
      await post("/api/watchlist", { url: url.trim(), title, interval_hours: hours, auto_download: auto });
      setUrl("");
      setTitle("");
      toast("ok", "İzleme listesine eklendi");
      load();
    } catch (e) {
      toast("err", "Eklenemedi", (e as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="panel p-4">
        <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold text-white">
          <Radar className="h-4 w-4 text-teal-300" /> Kaynak izleme
        </h2>
        <p className="mt-1 text-[11.5px] text-zinc-500">
          Kanal veya oynatma listesi ekleyin; belirlediğiniz aralıkla yeni yüklemeler kontrol edilir.
        </p>
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Kanal / liste bağlantısı" className="input" />
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Etiket (isteğe bağlı)" className="input" />
          <div className="flex items-center gap-2">
            <span className="text-[11.5px] text-zinc-500">Aralık</span>
            <select value={hours} onChange={(e) => setHours(Number(e.target.value))} className="input !py-2 !text-[12px]">
              {[6, 12, 24, 48, 72, 168].map((h) => (
                <option key={h} value={h}>{h} saat</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAuto((v) => !v)}
              className={`flex flex-1 items-center justify-between rounded-xl border px-3 py-2 text-[12px] transition ${auto ? "border-teal-400/40 bg-teal-400/[0.08] text-teal-200" : "border-white/[0.08] bg-white/[0.02] text-zinc-400"}`}
            >
              Otomatik indir
              <span className={`h-4 w-7 rounded-full ${auto ? "bg-teal-400" : "bg-white/15"} relative transition`}>
                <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${auto ? "left-3.5" : "left-0.5"}`} />
              </span>
            </button>
            <button onClick={add} className="btn-gold !py-2">
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-2">
        {items.map((w) => (
          <div key={w.id} className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-teal-400/10 text-teal-300">
              <Bell className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] text-zinc-200">{w.title || w.url}</p>
              <p className="text-[10.5px] text-zinc-500">
                her {w.interval_hours} saat · {w.auto_download ? "otomatik indirir" : "yalnız bildirir"}
              </p>
            </div>
            <button
              onClick={async () => {
                await del(`/api/watchlist/${w.id}`);
                load();
              }}
              className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-rose-500/10 hover:text-rose-300"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {items.length === 0 && (
          <div className="panel px-6 py-12 text-center">
            <Radar className="mx-auto h-6 w-6 text-zinc-600" />
            <p className="mt-2 text-[13px] text-zinc-500">Henüz izlenen kaynak yok.</p>
          </div>
        )}
      </div>
    </div>
  );
}
