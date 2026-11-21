import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Loader2, Rocket, Zap } from "lucide-react";
import { isUrl, post } from "../lib";
import { useApp } from "../store";
import type { MediaInfo } from "../types";

/** Her sayfadan erişilebilen "yapıştır ve git" çubuğu. */
export default function QuickBar() {
  const { toast, refresh } = useApp();
  const nav = useNavigate();
  const [value, setValue] = useState("");
  const [mode, setMode] = useState<"video" | "audio">(
    () => (localStorage.getItem("tugrul.quickmode") as "video" | "audio") || "video"
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    localStorage.setItem("tugrul.quickmode", mode);
  }, [mode]);

  async function go() {
    const url = value.trim();
    if (!url) return;
    if (!isUrl(url)) {
      toast("err", "Geçerli bir bağlantı değil", url.slice(0, 60));
      return;
    }
    setBusy(true);
    try {
      const info = await post<MediaInfo>("/api/info", { url });
      const format = mode === "audio" ? "mp3" : info.best_video?.format_id || "";
      await post("/api/downloads", {
        url: info.webpage_url,
        dl_type: mode,
        format_id: format,
        title: info.title,
        thumbnail: typeof info.thumbnail === "string" ? info.thumbnail : "",
        uploader: info.uploader,
        duration: info.duration,
      });
      toast("ok", mode === "audio" ? "Ses indirmesi başladı" : "Video indirmesi başladı", info.title);
      setValue("");
      refresh();
      nav("/queue");
    } catch (e) {
      toast("err", "Başlatılamadı", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-white/[0.06] bg-ink-950/40 px-4 py-2 backdrop-blur sm:px-6">
      <div className="flex items-center gap-2">
        <Rocket className="hidden h-3.5 w-3.5 shrink-0 text-gold-400 sm:block" />
        <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-xl border border-white/[0.08] bg-black/30 px-2 py-1 transition focus-within:border-gold-400/40">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && go()}
            placeholder="Hızlı indir: bağlantıyı yapıştır, Enter'a bas…"
            className="min-w-0 flex-1 bg-transparent px-1 py-1 text-[12px] text-white placeholder:text-zinc-600 outline-none"
            spellCheck={false}
          />
          <div className="flex shrink-0 rounded-md bg-white/[0.05] p-0.5">
            {(["video", "audio"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase transition ${
                  mode === m ? "bg-gold-400 text-ink-950" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {m === "video" ? "Vid" : "Ses"}
              </button>
            ))}
          </div>
          <button
            onClick={go}
            disabled={busy || !value.trim()}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-gold-400 text-ink-950 transition hover:brightness-110 disabled:opacity-40"
            aria-label="Hızlı indir"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
          </button>
        </div>
        <span className="hidden items-center gap-1 text-[10px] text-zinc-600 lg:flex">
          <Zap className="h-3 w-3" /> tek tuşla
        </span>
      </div>
    </div>
  );
}
