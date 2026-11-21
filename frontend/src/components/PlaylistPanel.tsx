import { useMemo, useState } from "react";
import { CheckSquare, Download, Layers, ListChecks, Square, X } from "lucide-react";
import { clock, post } from "../lib";
import { useApp } from "../store";
import type { PlaylistInfo } from "../types";

export default function PlaylistPanel({
  data,
  onClose,
  onDone,
}: {
  data: PlaylistInfo;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useApp();
  const [picked, setPicked] = useState<Set<string>>(new Set(data.entries.map((e) => e.id)));
  const [kind, setKind] = useState<"video" | "audio">("video");
  const [quality, setQuality] = useState("h1080");
  const [busy, setBusy] = useState(false);
  const [range, setRange] = useState("");

  const allPicked = picked.size === data.entries.length;
  const total = useMemo(
    () => data.entries.filter((e) => picked.has(e.id)).reduce((a, e) => a + e.duration, 0),
    [data, picked]
  );

  function toggle(id: string) {
    const next = new Set(picked);
    next.has(id) ? next.delete(id) : next.add(id);
    setPicked(next);
  }

  function applyRange() {
    const m = range.match(/^(\d+)\s*-\s*(\d+)$/);
    if (!m) {
      toast("err", "Aralık biçimi hatalı", "Örnek: 1-10");
      return;
    }
    const a = Math.max(1, parseInt(m[1], 10));
    const b = Math.min(data.entries.length, parseInt(m[2], 10));
    const next = new Set<string>();
    data.entries.slice(a - 1, b).forEach((e) => next.add(e.id));
    setPicked(next);
  }

  async function enqueue() {
    if (picked.size === 0) return;
    setBusy(true);
    try {
      const items = data.entries
        .filter((e) => picked.has(e.id))
        .map((e) => ({
          url: e.webpage_url || e.url,
          dl_type: kind,
          format_id: kind === "audio" ? "mp3" : quality,
          title: e.title,
          thumbnail: e.thumbnail || "",
          uploader: e.uploader,
          duration: e.duration,
          skip_duplicate: false,
        }));
      const res = await post<{ count: number }>("/api/downloads/bulk", { items });
      toast("ok", `${res.count} öğe kuyruğa eklendi`, kind === "audio" ? "Ses olarak" : `Video · ${quality}`);
      onDone();
      onClose();
    } catch (e) {
      toast("err", "Liste eklenemedi", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel glow-ring overflow-hidden fade-in">
      <div className="flex items-start justify-between gap-3 border-b border-white/[0.07] p-4">
        <div className="flex min-w-0 items-center gap-3">
          {data.thumbnail ? (
            <img src={data.thumbnail} alt="" className="h-12 w-20 shrink-0 rounded-lg object-cover" />
          ) : (
            <div className="grid h-12 w-20 shrink-0 place-items-center rounded-lg bg-violet-400/10">
              <Layers className="h-5 w-5 text-violet-300" />
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate font-display text-[15px] font-semibold text-white">{data.title}</p>
            <p className="mt-0.5 text-[11.5px] text-zinc-500">
              {data.count} öğe · {data.uploader || "Bilinmeyen kaynak"} · seçili {picked.size} · {clock(total)}
            </p>
          </div>
        </div>
        <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/5 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="max-h-[280px] overflow-y-auto border-b border-white/[0.07]">
        {data.entries.map((e, i) => {
          const on = picked.has(e.id);
          return (
            <button
              key={`${e.id}-${i}`}
              onClick={() => toggle(e.id)}
              className={`flex w-full items-center gap-3 border-b border-white/[0.035] px-4 py-2 text-left transition ${on ? "bg-gold-400/[0.04]" : "hover:bg-white/[0.02]"}`}
            >
              <span className={`shrink-0 ${on ? "text-gold-400" : "text-zinc-600"}`}>
                {on ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
              </span>
              <span className="w-6 shrink-0 font-mono text-[10px] text-zinc-600">{String(i + 1).padStart(2, "0")}</span>
              {e.thumbnail ? (
                <img src={e.thumbnail} alt="" className="h-8 w-14 shrink-0 rounded object-cover" loading="lazy" />
              ) : (
                <span className="h-8 w-14 shrink-0 rounded bg-white/[0.05]" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] text-zinc-200">{e.title}</span>
                <span className="block truncate text-[10.5px] text-zinc-600">{e.uploader}</span>
              </span>
              <span className="shrink-0 font-mono text-[10.5px] text-zinc-500">{e.duration_text}</span>
            </button>
          );
        })}
        {data.entries.length === 0 && (
          <p className="px-4 py-6 text-center text-[12px] text-zinc-500">Listede öğe bulunamadı.</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 p-3.5">
        <button
          onClick={() => setPicked(allPicked ? new Set() : new Set(data.entries.map((e) => e.id)))}
          className="btn-outline !py-1.5 !text-[12px]"
        >
          <ListChecks className="h-3.5 w-3.5" /> {allPicked ? "Hiçbirini seçme" : "Tümünü seç"}
        </button>
        <div className="flex items-center gap-1 rounded-lg bg-white/[0.04] px-1.5 py-1 ring-1 ring-white/[0.08]">
          <input
            value={range}
            onChange={(e) => setRange(e.target.value)}
            placeholder="1-10"
            className="w-16 bg-transparent px-1 text-[11px] text-white placeholder:text-zinc-600 outline-none"
          />
          <button onClick={applyRange} className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-zinc-300 hover:bg-white/10">
            uygula
          </button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-lg bg-white/[0.04] p-0.5 ring-1 ring-white/10">
            {(["video", "audio"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium ${kind === k ? "bg-gold-400 text-ink-950" : "text-zinc-400"}`}
              >
                {k === "video" ? "Video" : "Ses"}
              </button>
            ))}
          </div>
          {kind === "video" && (
            <select value={quality} onChange={(e) => setQuality(e.target.value)} className="input !w-auto !py-1.5 !text-[11px]">
              {["h2160", "h1440", "h1080", "h720", "h480", "h360"].map((q) => (
                <option key={q} value={q}>{q.slice(1)}p</option>
              ))}
            </select>
          )}
          <button onClick={enqueue} disabled={busy || picked.size === 0} className="btn-gold !py-1.5 !text-[12px]">
            <Download className="h-3.5 w-3.5" />
            {busy ? "Ekleniyor…" : `${picked.size} öğeyi indir`}
          </button>
        </div>
      </div>
    </div>
  );
}
