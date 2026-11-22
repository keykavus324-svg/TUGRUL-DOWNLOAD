import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Clipboard,
  ClipboardPaste,
  Flame,
  Layers,
  Link2,
  ListVideo,
  Loader2,
  Radio,
  Sparkles,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import MediaCard from "../components/MediaCard";
import PlaylistPanel from "../components/PlaylistPanel";
import DownloadRow from "../components/DownloadRow";
import { api, isUrl, post } from "../lib";
import { useApp } from "../store";
import type { MediaInfo, PlaylistInfo } from "../types";

type Sample = { url: string; title: string; uploader: string; duration: number; duration_text: string };

export default function Home() {
  const { downloads, stats, toast, refresh } = useApp();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<MediaInfo | null>(null);
  const [playlist, setPlaylist] = useState<PlaylistInfo | null>(null);
  const [error, setError] = useState("");
  const [samples, setSamples] = useState<Sample[]>([]);
  const [mode, setMode] = useState<"video" | "audio">("video");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<{ items: Sample[] }>("/api/demo/samples").then((d) => setSamples(d.items)).catch(() => {});
  }, []);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData("text") || "";
      const active = document.activeElement?.tagName;
      const typing = active === "INPUT" || active === "TEXTAREA";
      if (text && isUrl(text) && !typing) {
        // yapıştır → indirme hemen başlar
        e.preventDefault();
        setInput(text.trim());
        submit(text.trim());
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, toast]);

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setInput(text.trim());
        submit(text.trim());
      }
    } catch {
      toast("info", "Pano okunamadı", "Bağlantıyı elle yapıştırın.");
    }
  }

  /** Bağlantıyı beklemeden kuyruğa alır — indirme hemen başlar. */
  async function submit(raw?: string) {
    const url = (raw ?? input).trim();
    if (!url) return;
    if (!isUrl(url)) {
      setError("Geçerli bir bağlantı girin (https://… veya 11 haneli YouTube kimliği).");
      return;
    }
    setError("");
    setInput("");
    try {
      const res = await post<{ item: { id: number } }>("/api/downloads", {
        url,
        dl_type: mode,
        format_id: "",
      });
      toast("ok", "İndirme başladı", url.slice(0, 80));
      refresh();
      return res;
    } catch (e) {
      setError((e as Error).message);
      toast("err", "İndirme başlatılamadı", (e as Error).message);
    }
  }

  async function analyze(raw?: string, asPlaylist = false) {
    const url = (raw ?? input).trim();
    if (!url) return;
    if (!isUrl(url)) {
      setError("Geçerli bir bağlantı girin (https://… veya demo://demo001).");
      return;
    }
    setError("");
    setLoading(true);
    setInfo(null);
    setPlaylist(null);
    try {
      const data = await api<MediaInfo | PlaylistInfo>("/api/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, playlist: asPlaylist }),
      });
      if ((data as PlaylistInfo).playlist) {
        setPlaylist(data as PlaylistInfo);
      } else {
        setInfo(data as MediaInfo);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const recent = downloads.slice(0, 4);
  const activeItems = downloads.filter((d) => ["downloading", "processing", "paused", "queued"].includes(d.status));

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* kahraman */}
      <section className="relative overflow-hidden rounded-3xl border border-white/[0.07] bg-gradient-to-br from-white/[0.045] via-white/[0.02] to-transparent p-5 sm:p-7">
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-gold-400/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-10 h-56 w-56 rounded-full bg-teal-400/10 blur-3xl" />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip bg-gold-400/10 text-gold-300 ring-gold-400/25">
              <Sparkles className="h-3 w-3" /> yt-dlp motoru
            </span>
            <span className="chip bg-teal-400/10 text-teal-300 ring-teal-400/25">
              <Radio className="h-3 w-3" /> 1000+ site
            </span>
            <span className="chip bg-white/[0.04] text-zinc-400 ring-white/10">
              <Flame className="h-3 w-3" /> {stats.completed} indirme tamamlandı
            </span>
          </div>

          <h2 className="mt-3.5 font-display text-[26px] font-bold leading-[1.15] tracking-tight text-white sm:text-[32px]">
            Bağlantıyı bırak,<span className="bg-gradient-to-r from-gold-300 via-gold-400 to-amber-500 bg-clip-text text-transparent"> gerisini Tuğrul halleder.</span>
          </h2>
          <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-zinc-400">
            Video, ses, oynatma listesi veya doğrudan medya bağlantısı — tek panoda çözümle, formatı seç, indir.
          </p>

          {/* giriş */}
          <div className="mt-5">
            <div className={`flex items-center gap-2 rounded-2xl border bg-black/35 p-2 transition-all ${error ? "border-rose-400/40" : "border-white/[0.09] focus-within:border-gold-400/50 focus-within:ring-2 focus-within:ring-gold-400/10"}`}>
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.05] text-zinc-400">
                <Link2 className="h-4 w-4" />
              </div>
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setError("");
                }}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="Bağlantıyı yapıştırın — https://youtube.com/watch?v=…"
                spellCheck={false}
                className="min-w-0 flex-1 bg-transparent px-1 text-[13.5px] text-white placeholder:text-zinc-600 outline-none"
              />
              {input && (
                <button onClick={() => { setInput(""); setInfo(null); setError(""); }} className="rounded-lg p-1.5 text-zinc-500 hover:text-white" aria-label="Temizle">
                  <X className="h-4 w-4" />
                </button>
              )}
              <button onClick={pasteFromClipboard} className="hidden rounded-lg p-2 text-zinc-500 transition hover:bg-white/5 hover:text-white sm:block" title="Panodan yapıştır">
                <ClipboardPaste className="h-4 w-4" />
              </button>
              <button
                onClick={() => analyze()}
                disabled={loading || !input.trim()}
                title="Format listesini aç"
                className="shrink-0 rounded-xl border border-white/[0.09] bg-white/[0.03] px-3 py-2 text-[12px] text-zinc-300 transition hover:border-white/20 hover:text-white disabled:opacity-40"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListVideo className="h-4 w-4" />}
              </button>
              <button onClick={() => submit()} disabled={!input.trim()} className="btn-gold shrink-0 !px-3.5 !py-2">
                <Zap className="h-4 w-4" />
                <span className="hidden sm:inline">İndir</span>
              </button>
            </div>
            {error && <p className="mt-2 text-[12px] text-rose-300">{error}</p>}

            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <span className="chip bg-emerald-400/15 text-emerald-300 ring-emerald-400/30">
                <Zap className="h-3 w-3" /> Yapıştır → indirme başlar
              </span>
              <div className="flex rounded-lg bg-white/[0.04] p-0.5 ring-1 ring-white/10">
                {(["video", "audio"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${mode === m ? "bg-gold-400 text-ink-950" : "text-zinc-400"}`}
                  >
                    {m === "video" ? "Video" : "Ses"}
                  </button>
                ))}
              </div>
              <span className="ml-auto hidden items-center gap-1 text-[10.5px] text-zinc-600 sm:flex">
                <Clipboard className="h-3 w-3" /> Ctrl+V ile panodan yapıştırın
              </span>
            </div>
          </div>

          {/* örnekler */}
          {samples.length > 0 && !info && !playlist && (
            <div className="mt-4">
              <p className="label mb-2">Örnek bağlantılar</p>
              <div className="flex flex-wrap gap-1.5">
                {samples.map((s) => (
                  <button
                    key={s.url}
                    onClick={() => {
                      setInput(s.url);
                      submit(s.url);
                    }}
                    className="group flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] py-1.5 pl-1.5 pr-3 text-left transition hover:border-gold-400/30 hover:bg-gold-400/[0.06]"
                  >
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/[0.05] text-zinc-500 group-hover:text-gold-300">
                      <Wand2 className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block max-w-[190px] truncate text-[11.5px] font-medium text-zinc-300 group-hover:text-white">{s.title}</span>
                      <span className="block text-[10px] text-zinc-600">{s.duration_text} · {s.uploader}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {loading && (
        <div className="panel flex items-center gap-4 p-5">
          <div className="skeleton h-16 w-24 rounded-xl" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-4 w-2/3 rounded" />
            <div className="skeleton h-3 w-1/3 rounded" />
            <div className="skeleton h-3 w-1/2 rounded" />
          </div>
        </div>
      )}

      {playlist && (
        <PlaylistPanel
          data={playlist}
          onClose={() => setPlaylist(null)}
          onDone={() => {
            refresh();
            toast("ok", "Liste kuyruğa alındı");
          }}
        />
      )}

      {info && <MediaCard info={info} onDownloaded={refresh} onOpenPlaylist={(url) => analyze(url, true)} />}

      {/* aktif işler */}
      {activeItems.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-display text-[13px] font-semibold text-white">
              <Layers className="h-4 w-4 text-teal-300" /> Şu an indiriliyor
              <span className="rounded-full bg-teal-400/15 px-1.5 py-0.5 text-[10px] text-teal-300">{activeItems.length}</span>
            </h3>
          </div>
          <div className="grid gap-2">
            {activeItems.map((d) => (
              <DownloadRow key={d.id} item={d} compact onDeleted={refresh} />
            ))}
          </div>
        </section>
      )}

      {/* son indirmeler */}
      {recent.length > 0 && activeItems.length === 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-display text-[13px] font-semibold text-white">
              <ListVideo className="h-4 w-4 text-gold-400" /> Son indirmeler
            </h3>
            <a href="/library" className="text-[11px] font-medium text-zinc-500 transition hover:text-gold-300">
              Tümünü gör →
            </a>
          </div>
          <div className="grid gap-2">
            {recent.map((d) => (
              <DownloadRow key={d.id} item={d} compact onDeleted={refresh} />
            ))}
          </div>
        </section>
      )}

      {/* desteklenen siteler */}
      {!info && !playlist && (
        <section className="panel p-4">
          <p className="label">Popüler desteklenen siteler</p>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-600">
            Kısayollar: <kbd className="rounded bg-white/[0.06] px-1">/</kbd> hızlı çubuk ·
            <kbd className="ml-1 rounded bg-white/[0.06] px-1">g</kbd> ardından
            <kbd className="mx-1 rounded bg-white/[0.06] px-1">1-9</kbd> sekme
          </p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {["YouTube", "Instagram", "TikTok", "X / Twitter", "Facebook", "Twitch", "Vimeo", "Reddit", "SoundCloud", "Dailymotion", "Bilibili", "Pinterest", "Spotify (meta)", "1000+ daha"].map((s) => (
              <span key={s} className="rounded-lg bg-white/[0.04] px-2.5 py-1 text-[11px] text-zinc-400 ring-1 ring-white/[0.06]">
                {s}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
