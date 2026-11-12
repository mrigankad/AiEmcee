"use client";

import { useEffect, useState } from "react";

export function toast(message: string, tone: "info" | "error" = "info") {
  window.dispatchEvent(new CustomEvent("aiemcee:toast", { detail: { message, tone } }));
}

export function toastError(e: unknown) {
  toast(e instanceof Error ? e.message : String(e), "error");
}

export function Toaster() {
  const [items, setItems] = useState<{ id: number; message: string; tone: string }[]>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const { message, tone } = (e as CustomEvent).detail as { message: string; tone: string };
      const id = Date.now() + Math.random();
      setItems((xs) => [...xs.slice(-2), { id, message, tone }]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 5000);
    };
    window.addEventListener("aiemcee:toast", on);
    return () => window.removeEventListener("aiemcee:toast", on);
  }, []);
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      {items.map((t) => (
        <div key={t.id} className={`max-w-md rounded-lg px-4 py-2.5 text-sm whitespace-pre-wrap shadow-lg ${t.tone === "error" ? "bg-bad text-white" : "bg-ink text-white"}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
