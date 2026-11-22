import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Download as DownloadIcon,
  FileAudio,
  FileVideo,
  FolderOpen,
  HardDrive,
  LayoutGrid,
  List,
  Search,
  Scissors,
  Trash2,
  XCircle,
} from "lucide-react";
import DownloadRow from "../components/DownloadRow";
import { Link } from "react-router-dom";
import { api, ago, bytes } from "../lib";
import { saveFileByPath } from "../save";
import { useApp } from "../store";
import type { Download, FileItem, Stats } from "../types";

const TABS = [
  { id: "all", label: "Tümü", icon: LayoutGrid },
  { id: "completed", label: "Tamamlanan", icon: CheckCircle2 },
  { id: "failed", label: "Hatalı", icon: XCircle },
  { id: "active", label: "Devam eden", icon: Clock3 },
] as const;

export default function Library() {
  const { downloads, refresh, toast } = useApp();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("all");
  const [view, setView] = useState<"list" | "files">("list");
  const [q, setQ] = useState("");
  const [files, setFiles] = useState<FileItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [dir, setDir] = useState("");

  useEffect(() => {
    refresh();
    api<{ dir: string; items: FileItem[] }>("/api/files").then((d) => {
      setFiles(d.items);
      setDir(d.dir);
    }).catch(() => {});
    api<Stats>("/api/stats").then(setStats).catch(() => {});
  }, []);

  const filtered = downloads.filter((d) => {
    if (tab === "completed" && d.status !== "completed") return false;
    if (tab === "failed" && !["failed", "canceled"].includes(d.status)) return false;
    if (tab === "active" && !["downloading", "processing", "paused", "queued"].includes(d.status)) return false;
    if (q && !`${d.title} ${d.uploader} ${d.url}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  /** Dosyayı cihaza kaydeder (APK'da diske, tarayıcıda İndirilenler'e). */
  async function saveFile(path: string, name: string) {
    try {
      const res = await saveFileByPath(path, name || path);
      if (res.ok) toast("ok", res.native ? "Cihaza kaydedildi" : "İndirildi", res.path);
      else toast("err", "Kaydedilemedi", res.message);
    } catch (e) {
      toast("err", "Kaydedilemedi", (e as Error).message);
    }
  }

  async function removeFile(path: string) {
    try {
      await fetch(`/api/files?path=${encodeURIComponent(path)}`, { method: "DELETE" });
      setFiles((f) => f.filter((x) => x.path !== path));
      toast("info", "Dosya silindi");
    } catch (e) {
      toast("err", "Silinemedi", (e as Error).message);
    }
  }

  const groupByDate = (items: Download[]) => {
    const groups: Record<string, Download[]> = {};
    for (const d of items) {
      const dt = new Date(d.created_at * 1000);
      const key = dt.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
      (groups[key] ||= []).push(d);
    }
    return groups;
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {/* özet */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Toplam", value: stats?.total ?? 0, icon: DownloadIcon, tone: "text-sky-300" },
          { label: "Tamamlanan", value: stats?.completed ?? 0, icon: CheckCircle2, tone: "text-emerald-300" },
          { label: "Disk", value: bytes(stats?.bytes), icon: HardDrive, tone: "text-gold-300" },
          { label: "Hatalı", value: stats?.failed ?? 0, icon: XCircle, tone: "text-rose-300" },
        ].map((s) => (
          <div key={s.label} className="panel-soft flex items-center gap-2.5 p-3">
            <s.icon className={`h-4 w-4 ${s.tone}`} />
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">{s.label}</p>
              <p className="truncate font-display text-[15px] font-semibold text-white">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="panel p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 overflow-x-auto rounded-xl bg-black/25 p-1 ring-1 ring-white/[0.06]">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[12px] font-medium transition ${
                  tab === t.id ? "bg-white/[0.09] text-white" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-black/25 px-2 py-1.5">
              <Search className="h-3.5 w-3.5 text-zinc-500" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Ara…"
                className="w-24 bg-transparent text-[12px] text-white placeholder:text-zinc-600 outline-none sm:w-36"
              />
            </div>
            <div className="flex rounded-lg bg-black/25 p-0.5 ring-1 ring-white/[0.06]">
              <button onClick={() => setView("list")} className={`rounded-md p-1.5 ${view === "list" ? "bg-white/[0.09] text-white" : "text-zinc-500"}`} title="Liste">
                <List className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => setView("files")} className={`rounded-md p-1.5 ${view === "files" ? "bg-white/[0.09] text-white" : "text-zinc-500"}`} title="Dosyalar">
                <FolderOpen className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {view === "list" ? (
        <div className="space-y-4">
          {Object.entries(groupByDate(filtered)).map(([date, items]) => (
            <div key={date} className="space-y-2">
              <p className="label px-1">{date}</p>
              <div className="grid gap-2">
                {items.map((d) => (
                  <DownloadRow key={d.id} item={d} onDeleted={refresh} />
                ))}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="panel grid place-items-center px-6 py-16 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/[0.04] ring-1 ring-white/10">
                <FolderOpen className="h-6 w-6 text-zinc-500" />
              </div>
              <p className="mt-3 font-display text-[15px] font-semibold text-white">Henüz bir şey yok</p>
              <p className="mt-1 text-[12px] text-zinc-500">İndirdiğiniz içerikler burada arşivlenir.</p>
              <a href="/" className="btn-gold mt-4">İndirmeye başla</a>
            </div>
          )}
        </div>
      ) : (
        <div className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-2.5">
            <p className="truncate font-mono text-[10.5px] text-zinc-500">{dir}</p>
            <span className="text-[10.5px] text-zinc-500">{files.length} dosya · {bytes(files.reduce((a, f) => a + f.size, 0))}</span>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {files.map((f) => (
              <div key={f.path} className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-white/[0.02]">
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${["mp3", "m4a", "opus", "flac", "wav"].includes(f.ext) ? "bg-teal-400/10 text-teal-300" : "bg-gold-400/10 text-gold-300"}`}>
                  {["mp3", "m4a", "opus", "flac", "wav"].includes(f.ext) ? <FileAudio className="h-4 w-4" /> : <FileVideo className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] text-zinc-200">{f.name}</p>
                  <p className="text-[10.5px] text-zinc-600">{bytes(f.size)} · {ago(f.mtime)}</p>
                </div>
                <Link to="/studio" className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-white/5 hover:text-gold-300" title="Stüdyoda aç">
                  <Scissors className="h-4 w-4" />
                </Link>
                <button onClick={() => saveFile(f.path, f.name)} className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-white/5 hover:text-emerald-300" title="Cihaza kaydet">
                  <DownloadIcon className="h-4 w-4" />
                </button>
                <button onClick={() => removeFile(f.path)} className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-rose-500/10 hover:text-rose-300" title="Sil">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            {files.length === 0 && <p className="px-4 py-10 text-center text-[12px] text-zinc-500">Dosya bulunamadı.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
