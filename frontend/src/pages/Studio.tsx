import { useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines,
  Crop,
  FileAudio,
  FileVideo,
  Film,
  Loader2,
  Music4,
  Scissors,
  Sparkles,
  Wand2,
} from "lucide-react";
import { api, bytes, clock, post } from "../lib";
import { useApp } from "../store";
import type { FileItem } from "../types";

type Probe = {
  name: string;
  path: string;
  size: number;
  duration: number;
  container: string;
  video: { codec: string; width: number; height: number; fps: number } | null;
  audio: { codec: string; channels: number; sample_rate: string } | null;
};

const AUDIO_EXT = ["mp3", "m4a", "opus", "flac", "wav", "aac", "ogg"];

export default function Studio() {
  const { toast, refresh } = useApp();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [picked, setPicked] = useState<FileItem | null>(null);
  const [probe, setProbe] = useState<Probe | null>(null);
  const [busy, setBusy] = useState("");
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(30);
  const [cropRect, setCropRect] = useState({ x: 0, y: 0, w: 1280, h: 720 });
  const [target, setTarget] = useState("mp4");
  const [result, setResult] = useState<{ name: string; path: string; size: number } | null>(null);
  const [lyrics, setLyrics] = useState("");
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const mediaRef = useRef<HTMLVideoElement | null>(null);

  const load = () =>
    api<{ items: FileItem[] }>("/api/files").then((d) => {
      setFiles(d.items);
      if (!picked && d.items[0]) select(d.items[0]);
    });

  useEffect(() => {
    load();
  }, []);

  async function select(f: FileItem) {
    setPicked(f);
    setResult(null);
    setProbe(null);
    setLyrics("");
    try {
      const p = await api<Probe>(`/api/tools/probe?path=${encodeURIComponent(f.path)}`);
      setProbe(p);
      setStart(0);
      setEnd(Math.min(p.duration || 30, 30));
      if (p.video) setCropRect({ x: 0, y: 0, w: Math.floor((p.video.width || 1280) / 2) * 2, h: Math.floor((p.video.height || 720) / 2) * 2 });
      const isAudio = AUDIO_EXT.includes(f.ext);
      setTarget(isAudio ? "mp3" : "mp4");
    } catch (e) {
      toast("err", "Dosya okunamadı", (e as Error).message);
    }
  }

  const isAudio = picked ? AUDIO_EXT.includes(picked.ext) : false;

  async function act(kind: "cut" | "crop" | "convert" | "gif") {
    if (!picked) return;
    setBusy(kind);
    try {
      let body: Record<string, unknown> = { path: picked.path };
      if (kind === "cut") body = { ...body, start, end, reencode: true };
      if (kind === "crop") body = { ...body, x: cropRect.x, y: cropRect.y, width: cropRect.w, height: cropRect.h };
      if (kind === "convert") body = { ...body, target };
      if (kind === "gif") body = { ...body, start, duration: Math.max(1, end - start), width: 480 };
      const res = await post<{ name: string; path: string; size: number }>(`/api/tools/${kind}`, body);
      setResult(res);
      toast("ok", "İşlem tamamlandı", res.name);
      load();
      refresh();
    } catch (e) {
      toast("err", "İşlem başarısız", (e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function findLyrics() {
    if (!picked) return;
    const base = picked.name.replace(/\.[^.]+$/, "");
    const m = base.match(/^(.*?)\s*[-–]\s*(.*)$/);
    setLyricsLoading(true);
    try {
      const q = new URLSearchParams(m ? { title: m[2], artist: m[1] } : { title: base });
      const data = await api<{ found: boolean; plain?: string; synced?: string; track?: string; artist?: string }>(
        `/api/lyrics?${q.toString()}`,
        { method: "POST" }
      );
      if (!data.found) {
        toast("info", "Söz bulunamadı", base);
        return;
      }
      setLyrics(data.synced || data.plain || "");
      toast("ok", "Sözler bulundu", `${data.artist} — ${data.track}`);
    } catch (e) {
      toast("err", "Söz araması başarısız", (e as Error).message);
    } finally {
      setLyricsLoading(false);
    }
  }

  async function embed() {
    if (!picked || !lyrics.trim()) return;
    setBusy("lyrics");
    try {
      const res = await post<{ name: string; path: string; kind: string }>("/api/tools/lyrics", {
        path: picked.path,
        lyrics,
      });
      toast("ok", res.kind === "lrc" ? "LRC dosyası oluşturuldu" : "Sözler dosyaya gömüldü", res.name);
      load();
    } catch (e) {
      toast("err", "Gömülemedi", (e as Error).message);
    } finally {
      setBusy("");
    }
  }

  const src = useMemo(() => (picked ? `/api/files/raw?path=${encodeURIComponent(picked.path)}` : ""), [picked]);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        {/* dosya listesi */}
        <div className="panel h-fit overflow-hidden">
          <div className="border-b border-white/[0.07] px-3.5 py-2.5">
            <p className="text-[12px] font-semibold text-white">Kütüphaneden seç</p>
            <p className="text-[10.5px] text-zinc-500">{files.length} dosya</p>
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {files.map((f) => {
              const audio = AUDIO_EXT.includes(f.ext);
              const on = picked?.path === f.path;
              return (
                <button
                  key={f.path}
                  onClick={() => select(f)}
                  className={`flex w-full items-center gap-2.5 border-b border-white/[0.03] px-3 py-2 text-left transition ${on ? "bg-gold-400/[0.08]" : "hover:bg-white/[0.03]"}`}
                >
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${audio ? "bg-teal-400/10 text-teal-300" : "bg-gold-400/10 text-gold-300"}`}>
                    {audio ? <FileAudio className="h-3.5 w-3.5" /> : <FileVideo className="h-3.5 w-3.5" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[11.5px] text-zinc-200">{f.name}</span>
                    <span className="block text-[10px] text-zinc-600">{bytes(f.size)}</span>
                  </span>
                </button>
              );
            })}
            {files.length === 0 && (
              <p className="px-3 py-8 text-center text-[11.5px] text-zinc-500">Önce bir dosya indirin.</p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {picked ? (
            <>
              <div className="panel overflow-hidden">
                <div className="relative aspect-video bg-black/60">
                  {isAudio ? (
                    <div className="grid h-full place-items-center bg-gradient-to-br from-teal-500/15 via-transparent to-indigo-600/10">
                      <div className="text-center">
                        <Music4 className="mx-auto h-10 w-10 text-teal-300/70" />
                        <p className="mt-2 max-w-xs truncate px-4 text-[12px] text-zinc-400">{picked.name}</p>
                      </div>
                    </div>
                  ) : (
                    <video
                      ref={mediaRef}
                      src={`/api/files/raw?path=${encodeURIComponent(picked.path)}`}
                      controls
                      className="h-full w-full object-contain"
                      onTimeUpdate={(e) => {
                        const t = (e.target as HTMLVideoElement).currentTime;
                        if (Math.abs(t - start) < 0.4) (e.target as HTMLVideoElement).pause();
                      }}
                    />
                  )}
                  <div className="absolute left-3 top-3 flex gap-1.5">
                    <span className="chip bg-black/60 text-zinc-200 ring-white/10 backdrop-blur">
                      <Film className="h-3 w-3" /> {probe?.container?.split(",")[0] || picked.ext}
                    </span>
                    {probe && (
                      <span className="chip bg-black/60 text-zinc-300 ring-white/10 backdrop-blur">
                        {clock(probe.duration)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-[11px] text-zinc-500">
                  <span className="font-mono text-zinc-400">{picked.name}</span>
                  {probe?.video && <span>{probe.video.width}×{probe.video.height} · {probe.video.fps}fps · {probe.video.codec}</span>}
                  {probe?.audio && <span>ses: {probe.audio.codec} · {probe.audio.channels} kanal</span>}
                  <span className="ml-auto">{bytes(picked.size)}</span>
                </div>
              </div>

              {/* zaman aralığı */}
              <div className="panel p-4">
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-2 font-display text-[13px] font-semibold text-white">
                    <Scissors className="h-3.5 w-3.5 text-gold-400" /> Kesit aralığı
                  </h3>
                  <span className="font-mono text-[11px] text-zinc-400">
                    {clock(start)} → {clock(end)} · {clock(Math.max(0, end - start))}
                  </span>
                </div>
                <div className="mt-3 space-y-2.5">
                  <Slider label="Başlangıç" value={start} max={probe?.duration || 100} onChange={(v) => setStart(Math.min(v, end - 0.5))} />
                  <Slider label="Bitiş" value={end} max={probe?.duration || 100} onChange={(v) => setEnd(Math.max(v, start + 0.5))} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={() => act("cut")} disabled={!!busy} className="btn-gold !py-2">
                    {busy === "cut" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />}
                    Kesiti oluştur
                  </button>
                  {!isAudio && (
                    <button onClick={() => act("gif")} disabled={!!busy} className="btn-outline !py-2">
                      {busy === "gif" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      GIF yap
                    </button>
                  )}
                </div>
              </div>

              {/* dönüştürme */}
              <div className="panel p-4">
                <h3 className="flex items-center gap-2 font-display text-[13px] font-semibold text-white">
                  <Wand2 className="h-3.5 w-3.5 text-teal-300" /> Format dönüştür
                </h3>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {(isAudio ? ["mp3", "m4a", "opus", "flac", "wav", "aac"] : ["mp4", "mkv", "webm", "gif", "mp3", "m4a"]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTarget(t)}
                      className={`rounded-lg px-3 py-1.5 text-[11.5px] font-semibold uppercase transition ${target === t ? "bg-gold-400 text-ink-950" : "bg-white/[0.05] text-zinc-400 hover:text-white"}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <button onClick={() => act("convert")} disabled={!!busy} className="btn-dark mt-3 !py-2">
                  {busy === "convert" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                  {target.toUpperCase()} olarak dönüştür
                </button>
              </div>

              {/* kırpma */}
              {!isAudio && probe?.video && (
                <div className="panel p-4">
                  <h3 className="flex items-center gap-2 font-display text-[13px] font-semibold text-white">
                    <Crop className="h-3.5 w-3.5 text-violet-300" /> Video kırp
                  </h3>
                  <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      { k: "x", label: "X" },
                      { k: "y", label: "Y" },
                      { k: "w", label: "Genişlik" },
                      { k: "h", label: "Yükseklik" },
                    ].map((f) => (
                      <div key={f.k}>
                        <label className="label">{f.label}</label>
                        <input
                          type="number"
                          value={cropRect[f.k as keyof typeof cropRect]}
                          onChange={(e) => setCropRect({ ...cropRect, [f.k]: Number(e.target.value) })}
                          className="input mt-1 !py-1.5 !text-[12px]"
                        />
                      </div>
                    ))}
                  </div>
                  <button onClick={() => act("crop")} disabled={!!busy} className="btn-dark mt-3 !py-2">
                    {busy === "crop" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crop className="h-4 w-4" />}
                    Kırpılmış kopya oluştur
                  </button>
                </div>
              )}

              {/* sözler */}
              <div className="panel p-4">
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-2 font-display text-[13px] font-semibold text-white">
                    <AudioLines className="h-3.5 w-3.5 text-amber-300" /> Sözler (lrclib)
                  </h3>
                  <button onClick={findLyrics} disabled={lyricsLoading} className="btn-outline !py-1.5 !text-[11.5px]">
                    {lyricsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    Sözleri ara
                  </button>
                </div>
                <textarea
                  value={lyrics}
                  onChange={(e) => setLyrics(e.target.value)}
                  placeholder="Zaman damgalı [00:12.40] veya düz metin…"
                  className="input mt-2.5 h-32 resize-none font-mono !text-[11px]"
                />
                <button onClick={embed} disabled={!!busy || !lyrics.trim()} className="btn-dark mt-2 !py-2">
                  {busy === "lyrics" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Music4 className="h-4 w-4" />}
                  Sözleri göm / .lrc kaydet
                </button>
              </div>

              {result && (
                <div className="panel flex items-center gap-3 border-emerald-400/25 bg-emerald-400/[0.05] p-3.5">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-400/15 text-emerald-300">
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-medium text-white">{result.name}</p>
                    <p className="text-[10.5px] text-zinc-500">{bytes(result.size)} · kütüphaneye eklendi</p>
                  </div>
                  <a href={`/api/files/raw?path=${encodeURIComponent(result.path)}`} download className="btn-outline !py-1.5 !text-[11.5px]">
                    İndir
                  </a>
                </div>
              )}
            </>
          ) : (
            <div className="panel grid place-items-center px-6 py-20 text-center">
              <Wand2 className="h-8 w-8 text-zinc-600" />
              <p className="mt-3 font-display text-[15px] font-semibold text-white">Stüdyo</p>
              <p className="mt-1 text-[12px] text-zinc-500">Kes, kırp, dönüştür, GIF yap ve söz göm — hepsi cihazında.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Slider({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[10.5px] text-zinc-500">
        <span>{label}</span>
        <span className="font-mono text-zinc-400">{clock(value)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={Math.max(1, max)}
        step={0.5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/[0.1] accent-gold-400 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-gold-400 [&::-webkit-slider-thumb]:shadow"
      />
    </div>
  );
}
