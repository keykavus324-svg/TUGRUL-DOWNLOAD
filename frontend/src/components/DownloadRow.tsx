import { useState } from "react";
import {
  AlertTriangle,
  Ban,
  Download,
  FileAudio,
  FileVideo,
  FolderOpen,
  Loader2,
  Pause,
  Play,
  RotateCw,
  Trash2,
} from "lucide-react";
import { bytes, statusLabel, statusTone } from "../lib";
import { saveDownload } from "../save";
import { useApp } from "../store";
import type { Download as DL } from "../types";

export default function DownloadRow({
  item,
  compact = false,
  onDeleted,
}: {
  item: DL;
  compact?: boolean;
  onDeleted?: () => void;
}) {
  const { toast } = useApp();
  const [hover, setHover] = useState(false);
  const [saving, setSaving] = useState(false);

  /** Dosyayı cihaza kaydeder (APK'da diske, tarayıcıda İndirilenler'e). */
  const save = async () => {
    setSaving(true);
    try {
      const res = await saveDownload(item.id, item.filepath || item.title || "indirme");
      if (res.ok) toast("ok", res.native ? "Cihaza kaydedildi" : "İndirildi", res.path);
      else toast("err", "Kaydedilemedi", res.message);
    } catch (e) {
      toast("err", "Kaydedilemedi", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const active = item.status === "downloading" || item.status === "processing";

  const act = async (action: "pause" | "resume" | "cancel" | "retry" | "delete") => {
    try {
      if (action === "delete") {
        await fetch(`/api/downloads/${item.id}`, { method: "DELETE" });
        onDeleted?.();
        toast("info", "Kayıt silindi", item.title || undefined);
        return;
      }
      await fetch(`/api/downloads/${item.id}/${action}`, { method: "POST" });
      if (action === "retry") toast("info", "Yeniden denenecek", item.title || undefined);
    } catch (e) {
      toast("err", "İşlem başarısız", (e as Error).message);
    }
  };

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3 transition hover:border-white/[0.14] hover:bg-white/[0.035]"
    >
      <div className="flex items-center gap-3">
        <div className="relative h-12 w-[68px] shrink-0 overflow-hidden rounded-lg bg-black/40">
          {item.thumbnail ? (
            <img src={item.thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="grid h-full w-full place-items-center bg-gradient-to-br from-teal-500/20 to-indigo-500/10">
              {item.dl_type === "audio" ? (
                <FileAudio className="h-5 w-5 text-teal-300/70" />
              ) : (
                <FileVideo className="h-5 w-5 text-gold-300/70" />
              )}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-white">{item.title || item.url}</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10.5px] text-zinc-500">
                {item.uploader && <span className="truncate">{item.uploader}</span>}
                <span className={`chip !py-0 !px-2 !text-[9.5px] ring-1 ${statusTone(item.status)}`}>
                  {statusLabel(item.status)}
                </span>
                {item.filesize > 0 && <span>{bytes(item.filesize)}</span>}
                {item.status === "downloading" && item.speed && <span className="text-teal-400">{item.speed}</span>}
                {item.status === "downloading" && item.eta && <span>kalan {item.eta}</span>}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-0.5">
              {item.status === "completed" && (
                <button
                  onClick={save}
                  disabled={saving}
                  className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/[0.07] hover:text-emerald-300 disabled:opacity-50"
                  title="Cihaza kaydet"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                </button>
              )}
              {(active || item.status === "paused") && (
                <button
                  onClick={() => act(item.status === "paused" ? "resume" : "pause")}
                  className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/[0.07] hover:text-white"
                  title={item.status === "paused" ? "Devam et" : "Duraklat"}
                >
                  {item.status === "paused" ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                </button>
              )}
              {(item.status === "failed" || item.status === "canceled") && (
                <button
                  onClick={() => act("retry")}
                  className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/[0.07] hover:text-gold-300"
                  title="Yeniden dene"
                >
                  <RotateCw className="h-4 w-4" />
                </button>
              )}
              {(active || item.status === "queued") && (
                <button
                  onClick={() => act("cancel")}
                  className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/[0.07] hover:text-amber-300"
                  title="İptal"
                >
                  <Ban className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => act("delete")}
                className={`rounded-lg p-1.5 text-zinc-400 transition hover:bg-rose-500/10 hover:text-rose-300 ${compact && !hover ? "opacity-0" : ""}`}
                title="Sil"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {(active || item.status === "paused" || item.status === "queued") && (
            <div className="mt-2 flex items-center gap-2">
              <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                <div
                  className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ${
                    item.status === "paused"
                      ? "bg-amber-400/70"
                      : "bg-gradient-to-r from-gold-500 via-gold-400 to-teal-300"
                  }`}
                  style={{ width: `${Math.max(1.5, item.progress)}%` }}
                />
                {active && (
                  <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/25 to-transparent" />
                )}
              </div>
              <span className="w-10 shrink-0 text-right font-mono text-[10.5px] text-zinc-400">
                {item.progress.toFixed(0)}%
              </span>
            </div>
          )}

          {item.status === "failed" && item.error && (
            <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-rose-300/90">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span className="line-clamp-2">{item.error}</span>
            </p>
          )}
          {item.status === "completed" && item.filepath && (
            <p className="mt-1 flex items-center gap-1 truncate text-[10.5px] text-zinc-600">
              <FolderOpen className="h-3 w-3 shrink-0" />
              <span className="truncate font-mono">{item.filepath.split("/").slice(-2).join("/")}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
