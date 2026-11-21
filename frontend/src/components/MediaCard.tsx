import { useMemo, useState } from "react";
import {
  AudioLines,
  Captions,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  FileAudio,
  FileVideo,
  Film,
  Layers,
  ListTree,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  ThumbsUp,
  Zap,
} from "lucide-react";
import { bytes, count, post } from "../lib";
import { useApp } from "../store";
import type { FormatInfo, MediaInfo } from "../types";

function badgeFor(f: FormatInfo) {
  if (f.kind === "audio") return `${f.ext.toUpperCase()} · ${f.abr || f.tbr} kbps`;
  const bits = [f.ext.toUpperCase(), f.fps ? `${f.fps}fps` : "", f.dynamic_range && f.dynamic_range !== "SDR" ? f.dynamic_range : ""];
  return bits.filter(Boolean).join(" · ");
}

export default function MediaCard({
  info,
  onDownloaded,
  onOpenPlaylist,
}: {
  info: MediaInfo;
  onDownloaded?: () => void;
  onOpenPlaylist?: (url: string) => void;
}) {
  const { toast } = useApp();
  const [tab, setTab] = useState<"video" | "audio" | "subs" | "chapters">("video");
  const [selected, setSelected] = useState<string>(info.best_video?.format_id || info.best_audio?.format_id || "");
  const [audioFormat, setAudioFormat] = useState("mp3");
  const [busy, setBusy] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [template, setTemplate] = useState("");
  const [customArgs, setCustomArgs] = useState("");

  const videos = useMemo(() => (info.videos.length ? info.videos : info.muxed), [info]);
  const audioList = info.audios;
  const audioCodecs = useMemo(() => {
    const set = new Set(audioList.map((a) => a.ext));
    return ["mp3", "m4a", "opus", "flac", "wav"].filter((x) => set.has(x) || ["mp3", "m4a"].includes(x));
  }, [audioList]);

  const chosen = useMemo(() => {
    if (tab === "audio") return audioList.find((a) => a.ext === audioFormat) || info.best_audio;
    return videos.find((v) => v.format_id === selected) || videos[0] || info.best_video;
  }, [tab, audioFormat, selected, videos, audioList, info]);

  async function start(kind: "video" | "audio") {
    if (!info.webpage_url) return;
    setBusy(true);
    try {
      const fmt = kind === "audio" ? audioCodecs.includes(audioFormat) ? audioFormat : "mp3" : chosen?.format_id || "";
      const res = await post<{ duplicate: boolean; item: { id: number } }>("/api/downloads", {
        url: info.webpage_url,
        dl_type: kind,
        format_id: kind === "audio" ? audioFormat : fmt,
        title: info.title,
        thumbnail: typeof info.thumbnail === "string" ? info.thumbnail : "",
        uploader: info.uploader,
        duration: info.duration,
        filename_template: template,
        custom_args: customArgs,
      });
      if (res.duplicate) toast("info", "Bu içerik zaten indirilmiş", "Kütüphaneden bulabilirsiniz.");
      else toast("ok", kind === "audio" ? "Ses indirmesi kuyruğa alındı" : "Video indirmesi kuyruğa alındı", info.title);
      onDownloaded?.();
    } catch (e) {
      toast("err", "Kuyruğa eklenemedi", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const tabs = [
    { id: "video" as const, label: "Video", icon: Film, n: videos.length },
    { id: "audio" as const, label: "Ses", icon: AudioLines, n: audioList.length },
    { id: "subs" as const, label: "Altyazı", icon: Captions, n: Object.keys(info.subtitles || {}).length },
    { id: "chapters" as const, label: "Bölümler", icon: ListTree, n: info.chapters?.length || 0 },
  ];

  return (
    <div className="panel glow-ring overflow-hidden fade-in">
      <div className="grid gap-0 md:grid-cols-[minmax(0,320px)_1fr]">
        {/* kapak */}
        <div className="relative aspect-video overflow-hidden bg-black/40 md:aspect-auto md:min-h-[260px]">
          {info.thumbnail ? (
            <img src={info.thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="grid h-full w-full place-items-center bg-gradient-to-br from-teal-500/20 to-indigo-600/10">
              <AudioLines className="h-12 w-12 text-teal-300/60" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/20 to-transparent md:bg-gradient-to-r md:from-transparent md:via-transparent md:to-ink-950/80" />
          <div className="absolute bottom-3 left-3 flex flex-wrap items-center gap-1.5">
            <span className="chip bg-black/60 text-zinc-200 ring-white/10 backdrop-blur-md">
              <Clock3 className="h-3 w-3" /> {info.duration_text}
            </span>
            {info.extractor && (
              <span className="chip bg-gold-400/15 text-gold-300 ring-gold-400/25 backdrop-blur-md">
                <Sparkles className="h-3 w-3" /> {info.extractor}
              </span>
            )}
            {info.demo && (
              <span className="chip bg-teal-400/15 text-teal-300 ring-teal-400/25 backdrop-blur-md">DEMO</span>
            )}
          </div>
          {info.thumbnail && (
            <a
              href={info.webpage_url}
              target="_blank"
              rel="noreferrer"
              className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-black/60 text-white/90 ring-1 ring-white/15 backdrop-blur transition hover:bg-black/80"
              aria-label="Kaynağı aç"
            >
              <PlayCircle className="h-4 w-4" />
            </a>
          )}
        </div>

        {/* bilgi */}
        <div className="flex min-w-0 flex-col p-4 sm:p-5">
          <h3 className="line-clamp-2 font-display text-[17px] font-semibold leading-snug tracking-tight text-white">
            {info.title}
          </h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-zinc-400">
            {info.uploader && <span className="font-medium text-zinc-300">{info.uploader}</span>}
            {!!info.view_count && (
              <span className="inline-flex items-center gap-1">
                <Eye className="h-3 w-3" /> {count(info.view_count)}
              </span>
            )}
            {!!info.like_count && (
              <span className="inline-flex items-center gap-1">
                <ThumbsUp className="h-3 w-3" /> {count(info.like_count)}
              </span>
            )}
            {info.upload_date && <span>{info.upload_date}</span>}
            {info.is_playlist && (
              <button
                onClick={() => onOpenPlaylist?.(info.webpage_url)}
                className="chip bg-violet-400/10 text-violet-300 ring-violet-400/25"
              >
                <Layers className="h-3 w-3" /> Liste · {info.playlist_count}
              </button>
            )}
          </div>

          {/* sekmeler */}
          <div className="mt-4 flex gap-1 overflow-x-auto rounded-xl bg-black/25 p-1 ring-1 ring-white/[0.06]">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setTab(t.id);
                  if (t.id === "video" && videos[0]) setSelected(videos[0].format_id);
                }}
                className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition ${
                  tab === t.id ? "bg-white/[0.09] text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
                {t.n > 0 && <span className="text-[10px] text-zinc-500">{t.n}</span>}
              </button>
            ))}
          </div>

          {/* içerik */}
          <div className="mt-3 min-h-[132px] flex-1">
            {tab === "video" && (
              <div className="grid gap-1.5 sm:grid-cols-2">
                {videos.length === 0 && (
                  <p className="col-span-2 rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-[12px] text-zinc-500">
                    Bu içerikte video akışı yok — ses olarak indirin.
                  </p>
                )}
                {videos.slice(0, 8).map((v) => {
                  const active = selected === v.format_id;
                  return (
                    <button
                      key={v.format_id}
                      onClick={() => setSelected(v.format_id)}
                      className={`group flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition ${
                        active
                          ? "border-gold-400/50 bg-gold-400/[0.08]"
                          : "border-white/[0.07] bg-white/[0.02] hover:border-white/[0.16] hover:bg-white/[0.04]"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${active ? "bg-gold-400/20 text-gold-300" : "bg-white/[0.05] text-zinc-400"}`}>
                          {active ? <CheckCircle2 className="h-4 w-4" /> : <FileVideo className="h-4 w-4" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[13px] font-semibold text-white">{v.quality}</span>
                          <span className="block truncate text-[10.5px] text-zinc-500">{badgeFor(v)}</span>
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-[11px] font-medium text-zinc-300">{v.filesize_text || "—"}</span>
                        {v.note && <span className="block text-[10px] text-zinc-600">{v.note}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {tab === "audio" && (
              <div className="space-y-2.5">
                <div className="flex flex-wrap gap-1.5">
                  {audioCodecs.map((c) => (
                    <button
                      key={c}
                      onClick={() => setAudioFormat(c)}
                      className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold uppercase tracking-wide transition ${
                        audioFormat === c
                          ? "bg-gold-400 text-ink-950"
                          : "bg-white/[0.05] text-zinc-400 hover:bg-white/[0.09] hover:text-white"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {audioList.slice(0, 4).map((a) => (
                    <div key={a.format_id} className="flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2">
                      <span className="grid h-8 w-8 place-items-center rounded-lg bg-teal-400/10 text-teal-300">
                        <FileAudio className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12.5px] font-semibold text-white">{a.abr || a.tbr} kbps</p>
                        <p className="truncate text-[10.5px] text-zinc-500">
                          {a.ext.toUpperCase()} {a.acodec ? `· ${a.acodec}` : ""}
                        </p>
                      </div>
                      <span className="text-[11px] text-zinc-400">{a.filesize_text || "—"}</span>
                    </div>
                  ))}
                  {audioList.length === 0 && (
                    <p className="col-span-2 rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-[12px] text-zinc-500">
                      Ses akışı listelenemedi — yine de en iyi ses indirilebilir.
                    </p>
                  )}
                </div>
                <p className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                  <ShieldCheck className="h-3 w-3 text-emerald-400" />
                  Kapak resmi, etiketler ve bölümler otomatik gömülür.
                </p>
              </div>
            )}

            {tab === "subs" && (
              <div className="space-y-2">
                {Object.keys(info.subtitles || {}).length === 0 && info.auto_subtitles.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-[12px] text-zinc-500">
                    Altyazı bulunamadı.
                  </p>
                ) : (
                  <>
                    <p className="text-[11px] text-zinc-500">Ayarlardan altyazı indirme/gömme açık olduğunda bu diller alınır:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.keys(info.subtitles || {}).map((l) => (
                        <span key={l} className="chip bg-emerald-400/10 text-emerald-300 ring-emerald-400/20">
                          {l.toUpperCase()} · gömülü
                        </span>
                      ))}
                      {info.auto_subtitles.slice(0, 10).map((l) => (
                        <span key={`a-${l}`} className="chip bg-white/[0.04] text-zinc-400 ring-white/10">
                          {l} · otomatik
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {tab === "chapters" && (
              <div className="max-h-[152px] space-y-1 overflow-y-auto pr-1">
                {(info.chapters || []).length === 0 && (
                  <p className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-[12px] text-zinc-500">
                    Bölüm bilgisi yok.
                  </p>
                )}
                {(info.chapters || []).map((c, i) => (
                  <div key={i} className="flex items-center gap-2.5 rounded-lg bg-white/[0.02] px-2.5 py-1.5">
                    <span className="font-mono text-[10px] text-gold-400/80">{String(i + 1).padStart(2, "0")}</span>
                    <span className="min-w-0 flex-1 truncate text-[12px] text-zinc-300">{c.title}</span>
                    <span className="font-mono text-[10px] text-zinc-500">
                      {Math.floor(c.start / 60)}:{String(Math.floor(c.start % 60)).padStart(2, "0")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {advanced && (
            <div className="mt-3 grid gap-2 rounded-xl border border-white/[0.07] bg-black/20 p-3 sm:grid-cols-2">
              <div>
                <label className="label">Dosya adı şablonu</label>
                <input
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  placeholder="%(uploader)s - %(title)s.%(ext)s"
                  className="input mt-1 font-mono text-[11.5px]"
                />
              </div>
              <div>
                <label className="label">Ek yt-dlp argümanları</label>
                <input
                  value={customArgs}
                  onChange={(e) => setCustomArgs(e.target.value)}
                  placeholder="--limit-rate 5M --write-thumbnail"
                  className="input mt-1 font-mono text-[11.5px]"
                />
              </div>
            </div>
          )}

          {/* eylemler */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button onClick={() => start("video")} disabled={busy || !info.has_video} className="btn-gold flex-1 sm:flex-none">
              <Download className="h-4 w-4" />
              {busy ? "Ekleniyor…" : `Video indir${chosen?.quality ? ` · ${chosen.quality}` : ""}`}
            </button>
            <button onClick={() => start("audio")} disabled={busy || !info.has_audio} className="btn-dark flex-1 sm:flex-none">
              <AudioLines className="h-4 w-4" />
              Ses · {audioFormat.toUpperCase()}
            </button>
            <button onClick={() => setAdvanced((v) => !v)} className="btn-ghost" title="Gelişmiş seçenekler">
              <Zap className={`h-4 w-4 ${advanced ? "text-gold-400" : ""}`} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
