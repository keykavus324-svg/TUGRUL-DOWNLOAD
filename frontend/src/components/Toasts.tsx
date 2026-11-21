import { useEffect } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { useApp } from "../store";

const TONE = {
  ok: { ring: "ring-emerald-400/30", icon: CheckCircle2, color: "text-emerald-300" },
  err: { ring: "ring-rose-400/30", icon: AlertTriangle, color: "text-rose-300" },
  info: { ring: "ring-sky-400/30", icon: Info, color: "text-sky-300" },
};

export default function Toasts() {
  const { toasts, dismiss } = useApp();
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-[min(92vw,360px)] flex-col gap-2.5">
      {toasts.map((t) => {
        const T = TONE[t.kind];
        const Icon = T.icon;
        return (
          <div
            key={t.id}
            className={`pointer-events-auto panel flex items-start gap-3 p-3.5 ring-1 ${T.ring} fade-in`}
            style={{ animationDuration: "220ms" }}
          >
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${T.color}`} />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-white">{t.title}</p>
              {t.body && <p className="mt-0.5 line-clamp-2 text-[12px] text-zinc-400">{t.body}</p>}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="rounded-md p-1 text-zinc-500 transition hover:bg-white/5 hover:text-white"
              aria-label="Kapat"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function useEscape(onClose: () => void, active = true) {
  useEffect(() => {
    if (!active) return;
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose, active]);
}
