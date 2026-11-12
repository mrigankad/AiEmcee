"use client";

import { Check, ChevronDown } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";

export type Option<T extends string> = { value: T; label: string; hint?: ReactNode; description?: string; disabled?: boolean };

/**
 * A listbox dropdown in the studio's style. Keyboard: arrows, Home/End, type
 * to jump, Enter or Space to pick, Escape or Tab to close. Clicking outside
 * closes it. It opens upward when there is no room below.
 */
export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
  showLabel = false,
  size = "md",
  tone = "neutral",
  align = "left",
  menuWidth,
  className = "",
}: {
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  label: string;
  showLabel?: boolean;
  size?: "sm" | "md";
  tone?: "neutral" | "motion";
  align?: "left" | "right";
  /** The menu's width when the options need more room than the button (px). */
  menuWidth?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [up, setUp] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const id = useId();
  const current = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  useEffect(() => {
    if (open) list.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function show() {
    const r = root.current?.getBoundingClientRect();
    setUp(!!r && window.innerHeight - r.bottom < Math.min(280, options.length * 36 + 16) && r.top > window.innerHeight - r.bottom);
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
    requestAnimationFrame(() => list.current?.focus());
  }
  function pick(i: number) {
    const o = options[i];
    if (!o || o.disabled) return;
    onChange(o.value);
    setOpen(false);
    root.current?.querySelector("button")?.focus();
  }
  function move(step: number) {
    let i = active;
    for (let n = 0; n < options.length; n++) {
      i = (i + step + options.length) % options.length;
      if (!options[i].disabled) break;
    }
    setActive(i);
  }

  const h = size === "sm" ? "h-7 text-[12px] px-2.5 gap-1.5" : "h-9 text-[14px] px-3 gap-2";
  const skin =
    tone === "motion"
      ? "rounded-full border-0 bg-motion-bg font-bold text-motion hover:brightness-95"
      : "rounded-lg border border-line bg-page text-ink hover:border-line-strong";

  return (
    <div ref={root} className={`relative ${className}`}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        aria-label={showLabel ? undefined : `${label}: ${current?.label ?? ""}`}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(e) => {
          if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
            e.preventDefault();
            show();
          }
        }}
        className={`inline-flex w-full min-w-0 items-center justify-between whitespace-nowrap transition ${h} ${skin} ${open ? "ring-3 ring-peach" : ""}`}
      >
        <span className="min-w-0 truncate">
          {showLabel && <span className="mr-1.5 text-mute">{label}</span>}
          {current?.label}
        </span>
        <ChevronDown size={size === "sm" ? 12 : 14} className={`shrink-0 opacity-60 transition ${open ? "rotate-180" : ""}`} />
      </button>
      <ul
        ref={list}
        id={id}
        role="listbox"
        tabIndex={-1}
        aria-label={label}
        style={menuWidth ? { width: menuWidth } : undefined}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        onKeyDown={(e) => {
          e.stopPropagation();
          const keys: Record<string, () => void> = {
            ArrowDown: () => move(1),
            ArrowUp: () => move(-1),
            Home: () => setActive(0),
            End: () => setActive(options.length - 1),
            Enter: () => pick(active),
            " ": () => pick(active),
          };
          if (keys[e.key]) {
            e.preventDefault();
            keys[e.key]();
          } else if (e.key === "Escape" || e.key === "Tab") {
            setOpen(false);
            root.current?.querySelector("button")?.focus();
          } else if (e.key.length === 1) {
            // Type-ahead: jump to the first option starting with what was typed.
            const now = e.timeStamp;
            typed.current = { text: (now - typed.current.at < 600 ? typed.current.text : "") + e.key.toLowerCase(), at: now };
            const i = options.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.text));
            if (i >= 0) setActive(i);
          }
        }}
        className={`absolute z-40 max-h-[280px] min-w-full overflow-auto rounded-[10px] border border-line bg-page p-1 shadow-[0_12px_32px_#16181d24,0_2px_6px_#16181d14] outline-none transition duration-100 ${
          align === "right" ? "right-0" : "left-0"
        } ${up ? "bottom-[calc(100%+6px)] origin-bottom" : "top-[calc(100%+6px)] origin-top"} ${open ? "visible scale-100 opacity-100" : "invisible scale-[0.98] opacity-0"}`}
      >
        {options.map((o, i) => {
          const selected = o.value === value;
          return (
            <li
              key={o.value}
              id={`${id}-${i}`}
              role="option"
              aria-selected={selected}
              aria-disabled={o.disabled || undefined}
              onPointerEnter={() => !o.disabled && setActive(i)}
              onClick={() => pick(i)}
              className={`flex min-h-8 cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] whitespace-nowrap ${i === active && open ? "bg-sunk" : ""} ${o.disabled ? "cursor-default opacity-45" : ""}`}
            >
              <Check size={14} strokeWidth={3} className={`shrink-0 text-action ${selected ? "" : "invisible"}`} />
              <span className="min-w-0 flex-1">
                <span className={`block ${selected ? "font-bold" : ""} text-ink`}>{o.label}</span>
                {o.description && <span className="block text-[12px] whitespace-normal text-mute">{o.description}</span>}
              </span>
              {o.hint != null && <span className="shrink-0 pl-3 text-[12px] text-mute">{o.hint}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
