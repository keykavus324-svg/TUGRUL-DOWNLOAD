import { useEffect, useState } from "react";
import { Braces, Copy, Plus, Terminal, Trash2 } from "lucide-react";
import { api, del, post } from "../lib";
import { useApp } from "../store";
import type { Template } from "../types";

const PRESETS: { name: string; command: string; desc: string }[] = [
  { name: "En iyi video (MP4)", command: "-f bestvideo[ext=mp4]+bestaudio[ext=m4a] --merge-output-format mp4", desc: "En yüksek çözünürlük, MP4 konteyner." },
  { name: "MP3 320 kbps", command: "--extract-audio --audio-format mp3 --audio-quality 0", desc: "Ses çıkar, en yüksek kalite." },
  { name: "Altyazı + küçük resim", command: "--write-subs --write-auto-subs --sub-langs tr,en --write-thumbnail", desc: "Altyazı ve kapak indir." },
  { name: "Sadece ses (m4a)", command: "-f bestaudio[ext=m4a] --extract-audio --audio-format m4a", desc: "Apple uyumlu." },
  { name: "SponsorBlock temizle", command: "--sponsorblock-remove sponsor,intro,outro", desc: "Sponsor bölümlerini çıkar." },
  { name: "Hız sınırlı indirme", command: "--limit-rate 5M --concurrent-fragments 2", desc: "Bant genişliği dostu." },
];

export default function Templates() {
  const { toast } = useApp();
  const [items, setItems] = useState<Template[]>([]);
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");

  const load = () => api<{ items: Template[] }>("/api/templates").then((d) => setItems(d.items)).catch(() => {});
  useEffect(() => {
    load();
  }, []);

  async function add(customName?: string, customCmd?: string) {
    const n = customName ?? name;
    const c = customCmd ?? command;
    if (!n.trim() || !c.trim()) return;
    await post("/api/templates", { name: n.trim(), command: c.trim() });
    setName("");
    setCommand("");
    toast("ok", "Şablon kaydedildi");
    load();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="panel p-4">
        <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold text-white">
          <Terminal className="h-4 w-4 text-gold-400" /> Komut şablonları
        </h2>
        <p className="mt-1 text-[11.5px] text-zinc-500">
          Tekrar eden yt-dlp argüman demetlerini kaydedin; indirme kartındaki gelişmiş alandan uygulayın.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[200px_1fr_auto]">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Şablon adı" className="input" />
          <input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="--extract-audio --audio-format mp3" className="input font-mono !text-[12px]" />
          <button onClick={() => add()} className="btn-gold"><Plus className="h-4 w-4" /> Kaydet</button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((t) => (
          <div key={t.id} className="group rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3 transition hover:border-white/[0.14]">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Braces className="h-3.5 w-3.5 text-gold-400" />
                <p className="text-[12.5px] font-semibold text-white">{t.name}</p>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(t.command);
                    toast("info", "Kopyalandı", t.command);
                  }}
                  className="rounded-md p-1 text-zinc-500 hover:text-white"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={async () => {
                    await del(`/api/templates/${t.id}`);
                    load();
                  }}
                  className="rounded-md p-1 text-zinc-500 hover:text-rose-300"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-black/40 px-2.5 py-2 font-mono text-[10.5px] leading-relaxed text-zinc-400">
              {t.command}
            </pre>
          </div>
        ))}
      </div>

      <div>
        <p className="label mb-2 px-1">Hazır şablonlar</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              onClick={() => add(p.name, p.command)}
              className="rounded-2xl border border-dashed border-white/[0.09] bg-white/[0.01] p-3 text-left transition hover:border-gold-400/30 hover:bg-gold-400/[0.04]"
            >
              <p className="text-[12px] font-semibold text-zinc-200">{p.name}</p>
              <p className="mt-0.5 text-[10.5px] text-zinc-500">{p.desc}</p>
              <p className="mt-1.5 truncate font-mono text-[10px] text-zinc-600">{p.command}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
