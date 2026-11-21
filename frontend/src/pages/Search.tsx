import { useEffect, useState } from "react";
import { Clock3, History, Link2, Loader2, Search as SearchIcon, Sparkles, TrendingUp } from "lucide-react";
import MediaCard from "../components/MediaCard";
import { api, clock, count, post } from "../lib";
import { useApp } from "../store";
import type { MediaInfo, SearchItem } from "../types";

const TRENDING = ["lofi çalışma müziği", "Anadolu manzaraları 4k", "caz gece seti", "doğa belgeseli", "gitar akustik"];

export default function Search() {
  const { toast, refresh } = useApp();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<SearchItem[]>([]);
  const [history, setHistory] = useState<{ id: number; query: string }[]>([]);
  const [picked, setPicked] = useState<MediaInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState<string>("");

  useEffect(() => {
    api<{ items: { id: number; query: string }[] }>("/api/search/history")
      .then((d) => setHistory(d.items))
      .catch(() => {});
  }, []);

  async function run(query?: string) {
    const term = (query ?? q).trim();
    if (!term) return;
    setBusy(true);
    setPicked(null);
    try {
      const data = await post<{ results: SearchItem[] }>("/api/search", { query: term, limit: 18 });
      setResults(data.results);
      if (data.results.length === 0) toast("info", "Sonuç bulunamadı", term);
      const h = await api<{ items: { id: number; query: string }[] }>("/api/search/history");
      setHistory(h.items);
    } catch (e) {
      toast("err", "Arama başarısız", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function open(item: SearchItem) {
    setLoadingInfo(item.id);
    try {
      const data = await post<MediaInfo>("/api/info", { url: item.webpage_url });
      setPicked(data);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      toast("err", "Çözümlenemedi", (e as Error).message);
    } finally {
      setLoadingInfo("");
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="panel p-4">
        <div className="flex items-center gap-2 rounded-xl border border-white/[0.09] bg-black/30 p-1.5 focus-within:border-gold-400/50">
          <SearchIcon className="ml-1.5 h-4 w-4 shrink-0 text-zinc-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
            placeholder="YouTube'da ara — şarkı, kanal, video…"
            className="min-w-0 flex-1 bg-transparent px-1 text-[13px] text-white placeholder:text-zinc-600 outline-none"
          />
          <button onClick={() => run()} disabled={busy || !q.trim()} className="btn-gold !py-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <SearchIcon className="h-4 w-4" />}
            <span className="hidden sm:inline">Ara</span>
          </button>
        </div>

        {history.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <History className="h-3 w-3 text-zinc-600" />
            {history.slice(0, 8).map((h) => (
              <button
                key={h.id}
                onClick={() => { setQ(h.query); run(h.query); }}
                className="rounded-full bg-white/[0.04] px-2.5 py-1 text-[11px] text-zinc-400 ring-1 ring-white/[0.06] transition hover:text-white"
              >
                {h.query.length > 28 ? h.query.slice(0, 28) + "…" : h.query}
              </button>
            ))}
          </div>
        )}
        {history.length === 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <TrendingUp className="h-3 w-3 text-zinc-600" />
            {TRENDING.map((t) => (
              <button
                key={t}
                onClick={() => { setQ(t); run(t); }}
                className="rounded-full bg-white/[0.04] px-2.5 py-1 text-[11px] text-zinc-400 ring-1 ring-white/[0.06] transition hover:text-white"
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {picked && (
        <div className="space-y-2">
          <button onClick={() => setPicked(null)} className="text-[11.5px] text-zinc-500 transition hover:text-white">
            ← Sonuçlara dön
          </button>
          <MediaCard info={picked} onDownloaded={refresh} />
        </div>
      )}

      {!picked && (
        <div className="grid gap-2 sm:grid-cols-2">
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => open(r)}
              disabled={loadingInfo === r.id}
              className="group flex gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-2.5 text-left transition hover:border-gold-400/30 hover:bg-white/[0.045] disabled:opacity-60"
            >
              <div className="relative h-[62px] w-[108px] shrink-0 overflow-hidden rounded-lg bg-black/40">
                {r.thumbnail ? (
                  <img src={r.thumbnail} alt="" className="h-full w-full object-cover transition group-hover:scale-105" loading="lazy" />
                ) : (
                  <div className="grid h-full w-full place-items-center">
                    <Sparkles className="h-4 w-4 text-zinc-600" />
                  </div>
                )}
                <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 py-0.5 font-mono text-[9.5px] text-white">
                  {r.duration_text}
                </span>
                {loadingInfo === r.id && (
                  <span className="absolute inset-0 grid place-items-center bg-black/60">
                    <Loader2 className="h-4 w-4 animate-spin text-gold-400" />
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1 py-0.5">
                <p className="line-clamp-2 text-[12.5px] font-medium leading-snug text-zinc-200 group-hover:text-white">{r.title}</p>
                <p className="mt-1 truncate text-[10.5px] text-zinc-500">{r.uploader}</p>
                <div className="mt-1 flex items-center gap-2 text-[10px] text-zinc-600">
                  <span className="inline-flex items-center gap-0.5"><Clock3 className="h-2.5 w-2.5" /> {r.duration_text}</span>
                  <span>{count(r.view_count)} görüntüleme</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {!busy && results.length === 0 && !picked && (
        <div className="panel grid place-items-center px-6 py-14 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-gold-400/15 to-teal-400/10 ring-1 ring-white/10">
            <Link2 className="h-6 w-6 text-gold-300" />
          </div>
          <p className="mt-3 font-display text-[15px] font-semibold text-white">Keşfetmeye başla</p>
          <p className="mt-1 max-w-sm text-[12px] leading-relaxed text-zinc-500">
            yt-dlp üzerinden YouTube araması yapın; kartlara dokunarak format seçip indirin. Tarayıcıda video oynatılmaz, doğrudan stüdyo akışı kullanılır.
          </p>
        </div>
      )}
    </div>
  );
}
