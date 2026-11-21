import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Activity,
  AlarmClock,
  BarChart3,
  Download,
  HardDrive,
  HelpCircle,
  Library,
  Wand2,
  Radar,
  Search,
  Menu,
  Settings as SettingsIcon,
  Sparkles,
  Terminal,
} from "lucide-react";
import { useApp } from "../store";
import { isOffline } from "../engine";
import QuickBar from "./QuickBar";

export const NAV = [
  { to: "/", label: "İndir", icon: Download, key: "indir" },
  { to: "/search", label: "Keşfet", icon: Search, key: "kesfet" },
  { to: "/library", label: "Kütüphane", icon: Library, key: "kutuphane" },
  { to: "/studio", label: "Stüdyo", icon: Wand2, key: "studyo" },
  { to: "/queue", label: "Kuyruk", icon: Activity, key: "kuyruk" },
  { to: "/schedule", label: "Zamanla", icon: AlarmClock, key: "zamanla" },
  { to: "/watch", label: "İzle", icon: Radar, key: "izle" },
  { to: "/templates", label: "Şablonlar", icon: Terminal, key: "sablon" },
  { to: "/stats", label: "İstatistik", icon: BarChart3, key: "istatistik" },
  { to: "/settings", label: "Ayarlar", icon: SettingsIcon, key: "ayarlar" },
];

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-gold-400 via-gold-500 to-amber-700 shadow-[0_8px_24px_-8px_rgba(247,201,72,0.7)]">
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-ink-950" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v11" />
          <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
          <path d="M4 18.5h16" />
        </svg>
        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-teal-400 ring-2 ring-ink-950" />
      </div>
      {!compact && (
        <div className="leading-none">
          <p className="font-display text-[15px] font-bold tracking-[0.16em] text-white">TUĞRUL</p>
          <p className="mt-1 font-display text-[9.5px] font-medium tracking-[0.42em] text-gold-400/90">DOWNLOAD</p>
        </div>
      )}
    </div>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { health, connected, stats } = useApp();
  const loc = useLocation();
  const [sheet, setSheet] = useState(false);

  useEffect(() => {
    setSheet(false);
  }, [loc.pathname]);
  const active = NAV.find((n) => (n.to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(n.to)));

  return (
    <div className="relative flex min-h-screen">
      {/* atmosfer */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-70" />
        <div className="absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-gold-500/[0.09] blur-[130px]" />
        <div className="absolute -right-32 top-24 h-[460px] w-[460px] rounded-full bg-teal-500/[0.07] blur-[130px]" />
        <div className="absolute bottom-0 left-1/3 h-[380px] w-[380px] rounded-full bg-indigo-500/[0.06] blur-[120px]" />
      </div>

      {/* masaüstü yan menü */}
      <aside className="sticky top-0 hidden h-screen w-[236px] shrink-0 flex-col border-r border-white/[0.06] bg-black/20 px-4 py-5 backdrop-blur-xl lg:flex">
        <NavLink to="/" className="px-1.5">
          <Logo />
        </NavLink>
        <nav className="mt-7 flex-1 space-y-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all ${
                  isActive
                    ? "bg-gradient-to-r from-gold-400/[0.14] to-transparent text-white ring-1 ring-inset ring-gold-400/20"
                    : "text-zinc-400 hover:bg-white/[0.04] hover:text-white"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={`h-[17px] w-[17px] ${isActive ? "text-gold-400" : "text-zinc-500 group-hover:text-zinc-300"}`} />
                  <span className="flex-1">{label}</span>
                  {to === "/queue" && stats.active > 0 && (
                    <span className="rounded-full bg-teal-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-teal-300">
                      {stats.active}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="space-y-2.5">
          <div className="panel-soft p-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Motor</span>
              <span className={`flex items-center gap-1.5 text-[10px] font-semibold ${connected ? "text-emerald-400" : "text-rose-400"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-400" : "bg-rose-400"}`} />
                {connected ? "Çevrimiçi" : "Bağlantı yok"}
              </span>
            </div>
            <div className="mt-2 space-y-1 text-[10.5px] text-zinc-500">
              <div className="flex justify-between"><span>yt-dlp</span><span className="font-mono text-zinc-400">{health?.ytdlp || "—"}</span></div>
              <div className="flex justify-between"><span>FFmpeg</span><span className={health?.ffmpeg ? "text-emerald-400" : "text-amber-400"}>{health?.ffmpeg ? "hazır" : "yok"}</span></div>
              <div className="flex justify-between"><span>Kuyruk</span><span className="font-mono text-zinc-400">{stats.active}</span></div>
            </div>
          </div>
          <div className="flex items-center gap-2 px-1.5 text-[10px] text-zinc-600">
            <HardDrive className="h-3 w-3" />
            <span className="font-mono">v{health?.version || "1.0.0"}</span>
            <span className="text-zinc-700">•</span>
            <HelpCircle className="h-3 w-3" />
            <span>ytdlnis esintili</span>
          </div>
        </div>
      </aside>

      {/* içerik */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-white/[0.06] bg-ink-950/70 px-4 py-3 backdrop-blur-xl sm:px-6">
          <div className="flex items-center gap-3">
            <div className="lg:hidden"><Logo /></div>
            <div className="hidden lg:block">
              <h1 className="font-display text-[15px] font-semibold tracking-tight text-white">{active?.label ?? "İndir"}</h1>
              <p className="text-[11px] text-zinc-500">1000+ siteden video ve ses • yt-dlp motoru</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSheet(true)}
              className="grid h-9 w-9 place-items-center rounded-full border border-white/[0.08] bg-white/[0.03] text-zinc-400 transition hover:text-white lg:hidden"
              aria-label="Menü"
            >
              <Menu className="h-4 w-4" />
            </button>
            {isOffline() ? (
              <div className="flex items-center gap-2 rounded-full border border-amber-400/25 bg-amber-400/[0.08] px-3 py-1.5">
                <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                <span className="text-[11px] font-medium text-amber-200">Demo modu</span>
              </div>
            ) : (
              <div className="hidden items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 sm:flex">
                <Sparkles className="h-3.5 w-3.5 text-gold-400" />
                <span className="text-[11px] font-medium text-zinc-300">AAA Stüdyo</span>
              </div>
            )}
            <NavLink
              to="/settings"
              className="grid h-9 w-9 place-items-center rounded-full border border-white/[0.08] bg-white/[0.03] text-zinc-400 transition hover:text-white"
              aria-label="Ayarlar"
            >
              <SettingsIcon className="h-4 w-4" />
            </NavLink>
          </div>
        </header>

        <QuickBar />
        <main className="flex-1 px-4 pb-28 pt-5 sm:px-6 lg:pb-10">{children}</main>
      </div>

      {/* mobil menü sayfası */}
      {sheet && (
        <div className="fixed inset-0 z-[70] lg:hidden">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setSheet(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-white/[0.09] bg-ink-900 p-4 pb-6" style={{ animation: "fadeIn 200ms ease both" }}>
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/15" />
            <div className="grid grid-cols-2 gap-2">
              {NAV.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === "/"}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-[12.5px] font-medium transition ${
                      isActive ? "border-gold-400/30 bg-gold-400/10 text-white" : "border-white/[0.07] bg-white/[0.02] text-zinc-300"
                    }`
                  }
                >
                  <Icon className="h-4 w-4 text-gold-400" />
                  {label}
                </NavLink>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2 text-[10.5px] text-zinc-500">
              <span className="font-mono">yt-dlp {health?.ytdlp || "—"}</span>
              <span className={connected ? "text-emerald-400" : "text-rose-400"}>{connected ? "çevrimiçi" : "bağlantı yok"}</span>
            </div>
          </div>
        </div>
      )}

      {/* mobil alt menü */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/[0.07] bg-ink-950/90 backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-xl items-stretch justify-between px-2 py-1.5">
          {NAV.slice(0, 5).map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-medium transition ${
                  isActive ? "text-gold-400" : "text-zinc-500"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`grid h-8 w-8 place-items-center rounded-lg ${isActive ? "bg-gold-400/15" : ""}`}>
                    <Icon className="h-[17px] w-[17px]" />
                  </span>
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
