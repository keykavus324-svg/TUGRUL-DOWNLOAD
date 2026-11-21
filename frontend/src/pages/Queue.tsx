import { useState } from "react";
import { Activity, Ban, Layers, Pause, Play, Trash2, Wifi } from "lucide-react";
import DownloadRow from "../components/DownloadRow";
import { useApp } from "../store";

export default function Queue() {
  const { downloads, stats, health, refresh, toast } = useApp();
  const [filter, setFilter] = useState<"active" | "all">("active");

  const groups = {
    downloading: downloads.filter((d) => d.status === "downloading" || d.status === "processing"),
    queued: downloads.filter((d) => d.status === "queued"),
    paused: downloads.filter((d) => d.status === "paused"),
    finished: downloads.filter((d) => ["completed", "failed", "canceled"].includes(d.status)),
  };

  async function bulk(action: "pause-all" | "resume-all" | "clear-finished") {
    try {
      if (action === "clear-finished") {
        await Promise.all(
          groups.finished.map((d) => fetch(`/api/downloads/${d.id}`, { method: "DELETE" }))
        );
        toast("info", "Tamamlanan kayıtlar temizlendi");
      } else {
        const target = action === "pause-all" ? groups.downloading.concat(groups.queued) : groups.paused;
        await Promise.all(
          target.map((d) =>
            fetch(`/api/downloads/${d.id}/${action === "pause-all" ? "pause" : "resume"}`, { method: "POST" })
          )
        );
      }
      refresh();
    } catch (e) {
      toast("err", "İşlem başarısız", (e as Error).message);
    }
  }

  const totalSpeed = groups.downloading.length;
  const pct = stats.total ? Math.round((stats.completed / stats.total) * 100) : 0;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="panel relative overflow-hidden p-4">
        <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-teal-400/10 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-display text-[16px] font-semibold text-white">
              <Activity className={`h-4 w-4 ${totalSpeed ? "text-teal-300" : "text-zinc-500"}`} />
              İndirme kuyruğu
              {totalSpeed > 0 && (
                <span className="flex items-center gap-1 rounded-full bg-teal-400/15 px-2 py-0.5 text-[10px] font-semibold text-teal-300">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-pulseRing rounded-full bg-teal-400" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-teal-400" />
                  </span>
                  {totalSpeed} aktif
                </span>
              )}
            </h2>
            <p className="mt-0.5 text-[11.5px] text-zinc-500">
              {stats.active} işlem · {stats.completed} tamamlandı · %{pct} başarı
              {health?.queue ? ` · kuyrukta ${health.queue}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => bulk("pause-all")} className="btn-outline !py-1.5 !text-[12px]" disabled={!groups.downloading.length && !groups.queued.length}>
              <Pause className="h-3.5 w-3.5" /> Tümünü duraklat
            </button>
            <button onClick={() => bulk("resume-all")} className="btn-outline !py-1.5 !text-[12px]" disabled={!groups.paused.length}>
              <Play className="h-3.5 w-3.5" /> Devam
            </button>
            <button onClick={() => bulk("clear-finished")} className="btn-ghost !py-1.5 !text-[12px]" disabled={!groups.finished.length}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
          <div className="h-full rounded-full bg-gradient-to-r from-gold-500 to-teal-400 transition-all duration-700" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="flex gap-1 rounded-xl bg-black/25 p-1 ring-1 ring-white/[0.06]">
        {(["active", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-[12px] font-medium transition ${filter === f ? "bg-white/[0.09] text-white" : "text-zinc-400"}`}
          >
            {f === "active" ? "Aktif işler" : `Tüm kayıtlar (${downloads.length})`}
          </button>
        ))}
      </div>

      <Section title="İndiriliyor" icon={Wifi} tone="text-teal-300" items={groups.downloading} onDeleted={refresh} empty="Şu an indirme yok." />
      {filter === "all" && (
        <>
          <Section title="Sırada" icon={Layers} tone="text-sky-300" items={groups.queued} onDeleted={refresh} empty="Kuyruk boş." />
          <Section title="Duraklatıldı" icon={Pause} tone="text-amber-300" items={groups.paused} onDeleted={refresh} empty="Duraklatılan yok." />
          <Section title="Bitti" icon={Ban} tone="text-zinc-400" items={groups.finished} onDeleted={refresh} empty="Kayıt yok." />
        </>
      )}
      {filter === "active" && groups.downloading.length === 0 && groups.queued.length === 0 && groups.paused.length === 0 && (
        <div className="panel grid place-items-center px-6 py-14 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/[0.04] ring-1 ring-white/10">
            <Activity className="h-6 w-6 text-zinc-500" />
          </div>
          <p className="mt-3 font-display text-[15px] font-semibold text-white">Kuyruk boş</p>
          <p className="mt-1 text-[12px] text-zinc-500">Yeni bir bağlantı ekleyerek başlayın.</p>
          <a href="/" className="btn-gold mt-4">İndir sekmesi</a>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  tone,
  items,
  empty,
  onDeleted,
}: {
  title: string;
  icon: React.ElementType;
  tone: string;
  items: import("../types").Download[];
  empty: string;
  onDeleted: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 px-1 font-display text-[12px] font-semibold uppercase tracking-wider text-zinc-400">
        <Icon className={`h-3.5 w-3.5 ${tone}`} /> {title}
        <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-zinc-400">{items.length}</span>
      </h3>
      <div className="grid gap-2">
        {items.map((d) => (
          <DownloadRow key={d.id} item={d} onDeleted={onDeleted} />
        ))}
      </div>
    </section>
  );
}
