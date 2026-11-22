import { useEffect, useRef, useState } from "react";
import {
  Cookie,
  Download,
  FileJson,
  Folder,
  Gauge,
  Globe2,
  Loader2,
  Moon,
  Palette,
  RotateCcw,
  Save,
  ShieldOff,
  Sparkles,
  Sun,
  Upload,
  Wrench,
} from "lucide-react";
import Modal, { Field, Toggle } from "../components/Modal";
import { api, bytes } from "../lib";
import { inAndroidShell, serverBase, setServerBase } from "../engine";
import { DEFAULT_PROXY, proxyBase, proxyHealth, setProxyBase } from "../proxy";
import { useApp } from "../store";

const SECTIONS = [
  { id: "general", label: "Genel", icon: Wrench },
  { id: "download", label: "İndirme", icon: Download },
  { id: "format", label: "Format & kalite", icon: Gauge },
  { id: "network", label: "Ağ & güvenlik", icon: Globe2 },
  { id: "appearance", label: "Görünüm", icon: Palette },
  { id: "data", label: "Yedek & veri", icon: FileJson },
] as const;

export default function SettingsPage() {
  const { settings, refreshSettings, toast, health, setSettings } = useApp();
  const [sec, setSec] = useState<(typeof SECTIONS)[number]["id"]>("general");
  const [draft, setDraft] = useState<Record<string, string>>(settings);
  const [saving, setSaving] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreText, setRestoreText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const cookieRef = useRef<HTMLInputElement>(null);

  useEffect(() => setDraft(settings), [settings]);

  const dirty = Object.keys(draft).some((k) => draft[k] !== settings[k]);

  async function save() {
    setSaving(true);
    try {
      await setSettings(draft);
      toast("ok", "Ayarlar kaydedildi");
    } catch (e) {
      toast("err", "Kaydedilemedi", (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function uploadCookies(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/cookies", { method: "POST", body: fd });
    if (res.ok) toast("ok", "Çerez dosyası yüklendi", file.name);
    else toast("err", "Yüklenemedi");
  }

  async function restoreFrom(text: string) {
    try {
      const data = JSON.parse(text);
      const counts = await api<Record<string, number>>("/api/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data }),
      });
      toast("ok", "Yedek geri yüklendi", `${counts.settings} ayar, ${counts.templates} şablon, ${counts.history} geçmiş`);
      setRestoreOpen(false);
      setRestoreText("");
      refreshSettings();
    } catch (e) {
      toast("err", "Geri yüklenemedi", (e as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="grid gap-4 lg:grid-cols-[190px_1fr]">
        <div className="panel h-fit p-2 lg:sticky lg:top-20">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSec(s.id)}
              className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[12.5px] font-medium transition ${
                sec === s.id ? "bg-gold-400/[0.12] text-white ring-1 ring-inset ring-gold-400/20" : "text-zinc-400 hover:bg-white/[0.04] hover:text-white"
              }`}
            >
              <s.icon className={`h-4 w-4 ${sec === s.id ? "text-gold-400" : "text-zinc-500"}`} />
              {s.label}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {sec === "general" && (
            <div className="panel space-y-3 p-4">
              <h2 className="font-display text-[15px] font-semibold text-white">Genel</h2>
              <Field label="İndirme klasörü" hint="Tüm dosyalar bu klasöre kaydedilir.">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Folder className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                    <input
                      value={draft.download_dir || ""}
                      onChange={(e) => setDraft({ ...draft, download_dir: e.target.value })}
                      className="input !pl-9 font-mono !text-[12px]"
                    />
                  </div>
                </div>
              </Field>
              <div className="rounded-xl border border-gold-400/25 bg-gold-400/[0.05] p-3">
                <p className="text-[12px] font-semibold text-gold-200">İndirme motoru (yt-dlp proxy)</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-gold-200/70">
                  Bağlantılar bu uçta çözülür, dosya parça parça cihaza iner. Kendi sunucunuzu
                  kullanmak isterseniz adresi değiştirin; boş bırakırsanız ortak uç kullanılır.
                </p>
                <input
                  defaultValue={proxyBase()}
                  placeholder={DEFAULT_PROXY}
                  onChange={(e) => setProxyBase(e.target.value)}
                  className="input mt-2 font-mono !text-[12px]"
                />
                <button
                  onClick={async () => {
                    const h = await proxyHealth();
                    if (h.ok) toast("ok", "Motor hazır", `yt-dlp ${h.ytdlp || ""}`);
                    else toast("err", "Motora ulaşılamadı", h.detail || "adres yanlış olabilir");
                  }}
                  className="btn-outline mt-2 !py-1.5 !text-[11.5px]"
                >
                  Motoru test et
                </button>
              </div>
              {inAndroidShell() && (
                <div className="rounded-xl border border-teal-400/25 bg-teal-400/[0.05] p-3">
                  <p className="text-[12px] font-semibold text-teal-200">Yerel sunucu (tam güç: FFmpeg + kuyruk)</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-teal-200/70">
                    Bilgisayarınızda
                    <code className="mx-1 rounded bg-black/30 px-1">bash scripts/start.sh</code>
                    çalıştırıp adresi buraya yazın (ör. http://192.168.1.20:8000). Doluysa tüm işler
                    o sunucuda yürür; boşsa yukarıdaki proxy ucu kullanılır.
                  </p>
                  <input
                    defaultValue={serverBase()}
                    placeholder="http://192.168.1.20:8000"
                    onChange={(e) => setServerBase(e.target.value)}
                    className="input mt-2 font-mono !text-[12px]"
                  />
                  <button
                    onClick={() => window.location.reload()}
                    className="btn-outline mt-2 !py-1.5 !text-[11.5px]"
                  >
                    Bağlan ve yeniden yükle
                  </button>
                </div>
              )}
              <Toggle
                checked={draft.incognito === "true"}
                onChange={(v) => setDraft({ ...draft, incognito: String(v) })}
                label="Gizli mod"
                hint="Geçmiş, günlük ve arama kaydı tutulmaz."
              />
              <Toggle
                checked={draft.auto_update_ytdlp === "true"}
                onChange={(v) => setDraft({ ...draft, auto_update_ytdlp: String(v) })}
                label="yt-dlp otomatik güncelleme"
                hint="Yeni site desteği için motoru güncel tutar."
              />
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                <div className="flex items-center justify-between text-[11.5px]">
                  <span className="text-zinc-400">Motur durumu</span>
                  <span className="font-mono text-emerald-300">yt-dlp {health?.ytdlp}</span>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[11.5px]">
                  <span className="text-zinc-400">FFmpeg</span>
                  <span className={`font-mono ${health?.ffmpeg ? "text-emerald-300" : "text-amber-300"}`}>
                    {health?.ffmpeg ? "hazır" : "bulunamadı"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {sec === "download" && (
            <div className="panel space-y-3 p-4">
              <h2 className="font-display text-[15px] font-semibold text-white">İndirme davranışı</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Eşzamanlı indirme" hint="Aynı anda çalışacak indirme sayısı (1-8).">
                  <input
                    type="number"
                    min={1}
                    max={8}
                    value={draft.concurrent || "3"}
                    onChange={(e) => setDraft({ ...draft, concurrent: e.target.value })}
                    className="input"
                  />
                </Field>
                <Field label="Parçalı indirme" hint="Paralel parça sayısı (hız artırır).">
                  <input
                    type="number"
                    min={1}
                    max={16}
                    value={draft.fragments || "4"}
                    onChange={(e) => setDraft({ ...draft, fragments: e.target.value })}
                    className="input"
                  />
                </Field>
                <Field label="Yeniden deneme">
                  <input
                    type="number"
                    min={0}
                    max={10}
                    value={draft.retries || "3"}
                    onChange={(e) => setDraft({ ...draft, retries: e.target.value })}
                    className="input"
                  />
                </Field>
                <Field label="Dosya adı şablonu" hint="yt-dlp çıktı şablonu.">
                  <input
                    value={draft.filename_template || ""}
                    onChange={(e) => setDraft({ ...draft, filename_template: e.target.value })}
                    className="input font-mono !text-[11px]"
                  />
                </Field>
              </div>
              <Toggle
                checked={draft.embed_metadata === "true"}
                onChange={(v) => setDraft({ ...draft, embed_metadata: String(v) })}
                label="Meta veri göm"
                hint="Başlık, sanatçı ve tarih bilgisi dosyaya yazılır."
              />
              <Toggle
                checked={draft.embed_thumbnail === "true"}
                onChange={(v) => setDraft({ ...draft, embed_thumbnail: String(v) })}
                label="Kapak resmi göm"
              />
              <Toggle
                checked={draft.embed_chapters === "true"}
                onChange={(v) => setDraft({ ...draft, embed_chapters: String(v) })}
                label="Bölümleri göm"
              />
              <Toggle
                checked={draft.write_subs === "true"}
                onChange={(v) => setDraft({ ...draft, write_subs: String(v) })}
                label="Altyazıları indir ve göm"
              />
              {draft.write_subs === "true" && (
                <Field label="Altyazı dilleri" hint="Virgülle ayırın; örn: tr,en">
                  <input
                    value={draft.sub_langs || ""}
                    onChange={(e) => setDraft({ ...draft, sub_langs: e.target.value })}
                    className="input"
                  />
                </Field>
              )}
            </div>
          )}

          {sec === "format" && (
            <div className="panel space-y-3 p-4">
              <h2 className="font-display text-[15px] font-semibold text-white">Format & kalite</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Varsayılan video kabı">
                  <select value={draft.video_format || "mp4"} onChange={(e) => setDraft({ ...draft, video_format: e.target.value })} className="input">
                    {["mp4", "mkv", "webm"].map((f) => <option key={f} value={f}>{f.toUpperCase()}</option>)}
                  </select>
                </Field>
                <Field label="Varsayılan ses formatı">
                  <select value={draft.audio_format || "mp3"} onChange={(e) => setDraft({ ...draft, audio_format: e.target.value })} className="input">
                    {["mp3", "m4a", "opus", "flac", "wav"].map((f) => <option key={f} value={f}>{f.toUpperCase()}</option>)}
                  </select>
                </Field>
                <Field label="Ses kalitesi" hint="0 = en iyi (VBR).">
                  <select value={draft.audio_quality || "0"} onChange={(e) => setDraft({ ...draft, audio_quality: e.target.value })} className="input">
                    <option value="0">En iyi (VBR 0)</option>
                    <option value="2">Yüksek (VBR 2)</option>
                    <option value="5">Orta (VBR 5)</option>
                    <option value="7">Küçük boyut (VBR 7)</option>
                  </select>
                </Field>
                <Field label="SponsorBlock">
                  <select value={draft.sponsorblock || "mark"} onChange={(e) => setDraft({ ...draft, sponsorblock: e.target.value })} className="input">
                    <option value="off">Kapalı</option>
                    <option value="mark">İşaretle</option>
                    <option value="remove">Kesip çıkar</option>
                  </select>
                </Field>
              </div>
              <div className="rounded-xl border border-teal-400/20 bg-teal-400/[0.05] p-3 text-[11.5px] leading-relaxed text-teal-200/80">
                <Sparkles className="mb-1 h-3.5 w-3.5" />
                Format seçimi indirme kartında yapılır; buradaki değerler varsayılanları belirler.
              </div>
            </div>
          )}

          {sec === "network" && (
            <div className="panel space-y-3 p-4">
              <h2 className="font-display text-[15px] font-semibold text-white">Ağ & güvenlik</h2>
              <Field label="Hız sınırı" hint="Örn: 5M, 800K. Boş = sınırsız.">
                <input
                  value={draft.rate_limit || ""}
                  onChange={(e) => setDraft({ ...draft, rate_limit: e.target.value })}
                  placeholder="sınırsız"
                  className="input font-mono"
                />
              </Field>
              <Field label="Proxy" hint="http://kullanıcı:şifre@host:port">
                <input
                  value={draft.proxy || ""}
                  onChange={(e) => setDraft({ ...draft, proxy: e.target.value })}
                  placeholder="http://127.0.0.1:8080"
                  className="input font-mono !text-[12px]"
                />
              </Field>
              <Field label="Çerez dosyası (cookies.txt)" hint="Özel/yaş kısıtlı içerikler için tarayıcı çerezleri.">
                <div className="flex gap-2">
                  <input
                    value={draft.cookies_path || ""}
                    onChange={(e) => setDraft({ ...draft, cookies_path: e.target.value })}
                    className="input flex-1 font-mono !text-[11px]"
                  />
                  <input
                    ref={cookieRef}
                    type="file"
                    accept=".txt"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && uploadCookies(e.target.files[0])}
                  />
                  <button onClick={() => cookieRef.current?.click()} className="btn-outline shrink-0">
                    <Cookie className="h-4 w-4" /> Yükle
                  </button>
                </div>
              </Field>
              <div className="flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-3 text-[11.5px] leading-relaxed text-amber-200/80">
                <ShieldOff className="mt-0.5 h-4 w-4 shrink-0" />
                <p>Çerezler yalnızca cihazınızda saklanır. Hesap güvenliği için ikinci bir tarayıcı profili kullanmanız önerilir.</p>
              </div>
            </div>
          )}

          {sec === "appearance" && (
            <div className="panel space-y-3 p-4">
              <h2 className="font-display text-[15px] font-semibold text-white">Görünüm</h2>
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { id: "dark", label: "Gece", icon: Moon, hint: "Abanoz + altın" },
                  { id: "light", label: "Gündüz", icon: Sun, hint: "Açık tema" },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setDraft({ ...draft, theme: t.id })}
                    className={`rounded-2xl border p-3 text-left transition ${
                      (draft.theme || "dark") === t.id
                        ? "border-gold-400/50 bg-gold-400/[0.08]"
                        : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.16]"
                    }`}
                  >
                    <t.icon className={`h-4 w-4 ${(draft.theme || "dark") === t.id ? "text-gold-400" : "text-zinc-500"}`} />
                    <p className="mt-2 text-[12.5px] font-semibold text-white">{t.label}</p>
                    <p className="text-[10.5px] text-zinc-500">{t.hint}</p>
                  </button>
                ))}
              </div>
              <Field label="Arayüz dili" hint="Arayüz Türkçe; indirme motoru tüm dilleri destekler.">
                <select value={draft.language || "tr"} onChange={(e) => setDraft({ ...draft, language: e.target.value })} className="input">
                  <option value="tr">Türkçe</option>
                  <option value="en">English</option>
                </select>
              </Field>
            </div>
          )}

          {sec === "data" && (
            <div className="panel space-y-3 p-4">
              <h2 className="font-display text-[15px] font-semibold text-white">Yedek & veri</h2>
              <p className="text-[11.5px] leading-relaxed text-zinc-500">
                Ayarlar, şablonlar, izleme listesi ve geçmiş tek dosyada yedeklenir.
              </p>
              <div className="flex flex-wrap gap-2">
                <a href="/api/backup" className="btn-gold" download>
                  <FileJson className="h-4 w-4" /> Yedeği indir
                </a>
                <button onClick={() => setRestoreOpen(true)} className="btn-outline">
                  <Upload className="h-4 w-4" /> Yedekten geri yükle
                </button>
                <button
                  onClick={() => {
                    setDraft({ ...settings, theme: "dark" });
                    toast("info", "Varsayılanlar yüklendi", "Kaydet'e basarak uygulayın.");
                  }}
                  className="btn-ghost"
                >
                  <RotateCcw className="h-4 w-4" /> Sıfırla
                </button>
              </div>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-[11.5px] text-zinc-400">
                <div className="flex justify-between"><span>Disk boş alan</span><span className="font-mono text-zinc-300">{bytes(health?.disk_free)}</span></div>
                <div className="mt-1 flex justify-between"><span>Toplam</span><span className="font-mono text-zinc-300">{bytes(health?.disk_total)}</span></div>
              </div>
            </div>
          )}

          {/* kaydet çubuğu */}
          <div className="sticky bottom-20 z-30 flex items-center justify-between gap-3 rounded-2xl border border-white/[0.09] bg-ink-900/90 p-2.5 pl-4 backdrop-blur-xl lg:bottom-4">
            <p className="text-[11.5px] text-zinc-500">
              {dirty ? "Kaydedilmemiş değişiklikler var" : "Tüm değişiklikler kaydedildi"}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setDraft(settings)} disabled={!dirty} className="btn-ghost !py-2 !text-[12px]">Geri al</button>
              <button onClick={save} disabled={!dirty || saving} className="btn-gold !py-2 !text-[12px]">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Kaydet
              </button>
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={restoreOpen}
        onClose={() => setRestoreOpen(false)}
        title="Yedekten geri yükle"
        subtitle="JSON yedeğini seçin veya içeriğini yapıştırın"
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setRestoreOpen(false)} className="btn-ghost">Vazgeç</button>
            <button onClick={() => restoreFrom(restoreText)} disabled={!restoreText.trim()} className="btn-gold">Geri yükle</button>
          </div>
        }
      >
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setRestoreText(await f.text());
          }}
        />
        <button onClick={() => fileRef.current?.click()} className="btn-outline mb-3 w-full">
          <Upload className="h-4 w-4" /> JSON dosyası seç
        </button>
        <textarea
          value={restoreText}
          onChange={(e) => setRestoreText(e.target.value)}
          placeholder='{"app":"TUGRUL DOWNLOAD", ...}'
          className="input h-40 resize-none font-mono !text-[11px]"
        />
      </Modal>
    </div>
  );
}
