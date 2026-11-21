import { useEffect, useState } from "react";
import { Activity, BarChart3, CheckCircle2, Clock3, HardDrive, RefreshCw, ScrollText, Trash2, XCircle } from "lucide-react";
import { api, ago, bytes } from "../lib";
import { useApp } from "../store";
import type { Download, Health, LogItem, Stats as S } from "../types";

export default function StatsPage() {
  const { downloads, health, refreshHealth, toast } = useApp();
  const [stats, setStats] = useState<S | null>(null);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [tab, setTab] = useState<"overview" | "logs">("overview");

  const load = () => {
    api<S>("/api/stats").then(setStats).catch(() => {});
    api<{ items: LogItem[] }>("/api/logs").then((d) => setLogs(d.items)).catch(() => {});
  };
  useEffect(() => {
    load();
    refreshHealth();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  const byType = (type: string) => downloads.filter((d) => d.dl_type === type && d.status === "completed");
  const last7 = Array.from({ length: 7 }).map((_, i) => {
    const day = new Date();
    day.setDate(day.getDate() - (6 - i));
    const key = day.toDateString();
    return {
      label: day.toLocaleDateString("tr-TR", { weekday: "short" }),
      n: downloads.filter((d) => new Date(d.created_at * 1000).toDateString() === key).length,
    };
  });
  const max = Math.max(1, ...last7.map((d) => d.n));
  const successRate = stats?.total ? Math.round(((stats.completed || 0) / stats.total) * 100) : 0;
  const diskPct = health ? Math.round(((health.disk_total - health.disk_free) / health.disk_total) * 100) : 0;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex gap-1 rounded-xl bg-black/25 p-1 ring-1 ring-white/[0.06]">
        {(["overview", "logs"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition ${tab === t ? "bg-white/[0.09] text-white" : "text-zinc-400"}`}
          >
            {t === "overview" ? <BarChart3 className="h-3.5 w-3.5" /> : <ScrollText className="h-3.5 w-3.5" />}
            {t === "overview" ? "Genel bakış" : "Sistem günlüğü"}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {[
              { label: "Toplam", value: stats?.total ?? 0, icon: BarChart3, tone: "from-sky-400/20 to-sky-400/5 text-sky-300" },
              { label: "Tamamlanan", value: stats?.completed ?? 0, icon: CheckCircle2, tone: "from-emerald-400/20 to-emerald-400/5 text-emerald-300" },
              { label: "Hatalı", value: stats?.failed ?? 0, icon: XCircle, tone: "from-rose-400/20 to-rose-400/5 text-rose-300" },
              { label: "Aktif", value: stats?.active ?? 0, icon: Activity, tone: "from-gold-400/20 to-gold-400/5 text-gold-300" },
            ].map((c) => (
              <div key={c.label} className={`rounded-2xl border border-white/[0.07] bg-gradient-to-br p-3.5 ${c.tone}`}>
                <c.icon className="h-4 w-4" />
                <p className="mt-2 font-display text-[22px] font-bold leading-none text-white">{c.value}</p>
                <p className="mt-1 text-[10.5px] uppercase tracking-wider text-zinc-400">{c.label}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2">
            <div className="panel p-4">
              <p className="label">Son 7 gün</p>
              <div className="mt-3 flex h-28 items-end gap-1.5">
                {last7.map((d) => (
                  <div key={d.label} className="flex flex-1 flex-col items-center gap-1.5">
                    <div className="relative w-full overflow-hidden rounded-t-md bg-white/[0.04]" style={{ height: "100%" }}>
                      <div
                        className="absolute bottom-0 w-full rounded-t-md bg-gradient-to-t from-gold-600 to-gold-300 transition-all duration-700"
                        style={{ height: `${(d.n / max) * 100}%`, minHeight: d.n ? "6px" : "2px", opacity: d.n ? 1 : 0.25 }}
                      />
                    </div>
                    <span className="text-[9.5px] text-zinc-500">{d.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel p-4">
              <p className="label">Dağılım</p>
              <div className="mt-3 space-y-3">
                <Bar label="Video" n={byType("video").length} total={stats?.completed || 1} tone="from-gold-500 to-gold-300" />
                <Bar label="Ses" n={byType("audio").length} total={stats?.completed || 1} tone="from-teal-500 to-teal-300" />
                <div className="flex items-center justify-between border-t border-white/[0.06] pt-2.5 text-[11.5px]">
                  <span className="flex items-center gap-1.5 text-zinc-400"><CheckCircle2 className="h-3 w-3 text-emerald-400" /> Başarı oranı</span>
                  <span className="font-display font-semibold text-white">%{successRate}</span>
                </div>
                <div className="flex items-center justify-between text-[11.5px]">
                  <span className="flex items-center gap-1.5 text-zinc-400"><HardDrive className="h-3 w-3 text-gold-400" /> Toplam boyut</span>
                  <span className="font-mono text-zinc-300">{bytes(stats?.bytes)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="panel p-4">
            <div className="flex items-center justify-between">
              <p className="label">Sistem durumu</p>
              <button onClick={() => { refreshHealth(); load(); }} className="rounded-lg p-1 text-zinc-500 hover:text-white">
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Info label="yt-dlp" value={health?.ytdlp || "—"} ok />
              <Info label="FFmpeg" value={health?.ffmpeg ? "hazır" : "yok"} ok={!!health?.ffmpeg} />
              <Info label="Disk kullanımı" value={`%${diskPct}`} ok={diskPct < 90} />
              <Info label="Boş alan" value={bytes(health?.disk_free)} ok />
            </div>
            <div className="mt-3">
              <p className="mb-1 flex items-center justify-between text-[10.5px] text-zinc-500">
                <span>Disk</span>
                <span>{bytes((health?.disk_total || 0) - (health?.disk_free || 0))} / {bytes(health?.disk_total)}</span>
              </p>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div className={`h-full rounded-full ${diskPct > 90 ? "bg-rose-400" : "bg-gradient-to-r from-teal-400 to-gold-400"}`} style={{ width: `${diskPct}%` }} />
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-2.5">
            <p className="text-[12px] font-semibold text-white">Son {logs.length} kayıt</p>
            <button
              onClick={async () => {
                await fetch("/api/logs", { method: "DELETE" });
                setLogs([]);
                toast("info", "Günlük temizlendi");
              }}
              className="btn-ghost !py-1 !text-[11px]"
            >
              <Trash2 className="h-3 w-3" /> Temizle
            </button>
          </div>
          <div className="max-h-[520px] divide-y divide-white/[0.035] overflow-y-auto font-mono text-[11px]">
            {logs.map((l) => (
              <div key={l.id} className="flex gap-3 px-4 py-1.5">
                <span className="shrink-0 text-zinc-600">{ago(l.created_at)}</span>
                <span className={`shrink-0 uppercase ${l.level === "error" ? "text-rose-400" : l.level === "warn" ? "text-amber-400" : "text-teal-400"}`}>
                  {l.level}
                </span>
                <span className="break-all text-zinc-400">{l.message}</span>
              </div>
            ))}
            {logs.length === 0 && <p className="px-4 py-10 text-center text-[12px] text-zinc-500">Günlük boş (gizli mod açık olabilir).</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function Bar({ label, n, total, tone }: { label: string; n: number; total: number; tone: string }) {
  const pct = Math.round((n / Math.max(1, total)) * 100);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="text-zinc-400">{label}</span>
        <span className="text-zinc-500">{n} · %{pct}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div className={`h-full rounded-full bg-gradient-to-r ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Info({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
      <span className="text-[11.5px] text-zinc-400">{label}</span>
      <span className={`font-mono text-[11px] ${ok ? "text-emerald-300" : "text-amber-300"}`}>{value}</span>
    </div>
  );
}
