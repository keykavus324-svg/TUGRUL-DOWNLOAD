import { useEffect } from "react";
import { X } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  width?: string;
  footer?: React.ReactNode;
};

export default function Modal({ open, onClose, title, subtitle, children, width = "max-w-2xl", footer }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        onClick={onClose}
        style={{ animation: "fadeIn 180ms ease both" }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`panel relative z-10 w-full ${width} max-h-[92vh] overflow-hidden rounded-b-none rounded-t-3xl sm:rounded-3xl`}
        style={{ animation: "fadeIn 240ms cubic-bezier(0.16,1,0.3,1) both" }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] px-5 py-4">
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight text-white">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[12px] text-zinc-500">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/[0.07] hover:text-white"
            aria-label="Kapat"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[calc(92vh-9rem)] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-white/[0.07] px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="label">{label}</label>
      {children}
      {hint && <p className="text-[11px] leading-relaxed text-zinc-500">{hint}</p>}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3 text-left transition hover:border-white/[0.14]"
    >
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-white">{label}</span>
        {hint && <span className="mt-0.5 block text-[11px] text-zinc-500">{hint}</span>}
      </span>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
          checked ? "bg-gold-400" : "bg-white/[0.12]"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200 ${
            checked ? "left-[22px]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}
