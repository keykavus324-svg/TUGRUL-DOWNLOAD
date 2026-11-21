import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/** Klavye kısayolları:
 *  /   → arama alanına odaklan (hızlı çubuk)
 *  g+1..9 → sekmeler · Esc → kapat
 */
export default function Shortcuts() {
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    let chord = false;
    let timer = 0;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
      if (e.key === "g") {
        chord = true;
        window.clearTimeout(timer);
        timer = window.setTimeout(() => (chord = false), 1200);
        return;
      }
      if (chord && /^[1-9]$/.test(e.key)) {
        const map = ["/", "/search", "/library", "/studio", "/queue", "/schedule", "/watch", "/templates", "/stats"];
        const dest = map[Number(e.key) - 1];
        if (dest && dest !== loc.pathname) nav(dest);
        chord = false;
      }
      if (e.key === "/" && loc.pathname !== "/") {
        e.preventDefault();
        nav("/");
        setTimeout(() => {
          const input = document.querySelector<HTMLInputElement>('input[placeholder^="Hızlı indir"]');
          input?.focus();
        }, 120);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(timer);
    };
  }, [nav, loc.pathname]);

  return null;
}
