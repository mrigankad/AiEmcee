import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "dark";

const VARIANTS: Record<Variant, string> = {
  primary: "btn-orb",
  secondary: "bg-page border border-line-strong text-ink hover:border-mute",
  ghost: "text-body hover:bg-sunk hover:text-ink",
  dark: "bg-ink text-white font-bold hover:bg-black",
};

export function Button({ variant = "secondary", size = "md", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  const sz = size === "sm" ? "h-7 px-2.5 text-[13px] rounded-md gap-1.5" : "h-8 px-3.5 text-sm rounded-lg gap-2";
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex shrink-0 items-center justify-center whitespace-nowrap transition disabled:pointer-events-none disabled:opacity-50 ${sz} ${VARIANTS[variant]} ${className}`}
    />
  );
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-9 min-w-0 rounded-lg border border-line bg-page px-3 text-sm text-ink placeholder:text-mute focus:border-kicker focus:outline-none ${className}`}
    />
  );
}

const PILL = {
  neutral: "bg-sunk text-body",
  ok: "bg-ok-bg text-ok",
  warn: "bg-warn-bg text-warn",
  bad: "bg-bad-bg text-bad",
  action: "bg-peach-2 text-action",
  motion: "bg-motion-bg text-motion",
};

export function Pill({ tone = "neutral", children, className = "" }: { tone?: keyof typeof PILL; children: ReactNode; className?: string }) {
  return <span className={`inline-flex h-5 items-center rounded-full px-2 text-[11px] font-bold whitespace-nowrap ${PILL[tone]} ${className}`}>{children}</span>;
}

export function Kicker({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`text-[11px] font-bold tracking-[0.08em] text-mute uppercase ${className}`}>{children}</div>;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-card border border-line bg-page ${className}`}>{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-mute">{children}</p>;
}
