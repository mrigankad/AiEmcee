import Link from "next/link";
import type { ReactNode } from "react";

/** The 48px bar above every screen: breadcrumb on the left, actions on the right. */
export function Topbar({ crumbs, children }: { crumbs: { label: string; href?: string }[]; children?: ReactNode }) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-5">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-[14px]">
        {crumbs.map((c, i) => (
          <span key={i} className="flex min-w-0 items-center gap-2">
            {i > 0 && <span className="text-line-strong">/</span>}
            {c.href ? (
              <Link href={c.href} className="truncate text-mute hover:text-ink">
                {c.label}
              </Link>
            ) : (
              <span className="truncate text-ink">{c.label}</span>
            )}
          </span>
        ))}
      </nav>
      <div className="flex-1" />
      <div className="flex items-center gap-2">{children}</div>
    </header>
  );
}
