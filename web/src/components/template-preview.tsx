import type { Style } from "@/lib/api";

/**
 * A small, flat drawing of a scene template in a style's swatch
 * ([background, ink, accent]). Not a render: it tells the shapes apart.
 */
export function TemplatePreview({ template, style, className = "" }: { template: string; style: Pick<Style, "swatch" | "tone">; className?: string }) {
  const [bg, ink, accent] = style.swatch;
  const dark = style.tone === "dark";
  const soft = dark ? `${ink}22` : `${ink}14`;
  const mid = dark ? `${ink}55` : `${ink}2a`;
  const tile = dark ? `${ink}33` : "#ffffff";
  return (
    <svg viewBox="0 0 240 136" className={`block size-full ${className}`} aria-hidden style={{ background: bg }}>
      {template === "hero" && (
        <g>
          <path d="M120 54 L184 86 L120 118 L56 86 Z" fill={soft} />
          <path d="M120 58 L148 72 L120 86 L92 72 Z" fill={accent} />
          <path d="M92 72 L120 86 L120 96 L92 82 Z" fill={accent} opacity={0.75} />
          <path d="M148 72 L120 86 L120 96 L148 82 Z" fill={accent} opacity={0.55} />
          <rect x="20" y="22" width="64" height="6" rx="3" fill={ink} opacity={0.8} />
          <rect x="20" y="33" width="44" height="4" rx="2" fill={mid} />
        </g>
      )}
      {template === "pipeline" && (
        <g>
          <path d="M70 68 H170" stroke={mid} strokeWidth="1.5" strokeDasharray="2 4" />
          {[50, 120, 190].map((x, i) => (
            <path key={x} d={`M${x} 60 L${x + 18} 68 L${x} 76 L${x - 18} 68 Z`} fill={i === 1 ? accent : tile} stroke={dark ? "none" : soft} />
          ))}
          <circle cx="88" cy="68" r="3" fill={accent} />
        </g>
      )}
      {template === "stack" && (
        <g>
          <path d="M120 82 L172 102 L120 122 L68 102 Z" fill={mid} />
          <path d="M120 64 L172 84 L120 104 L68 84 Z" fill={soft} stroke={dark ? "none" : tile} />
          <path d="M120 40 L172 60 L120 80 L68 60 Z" fill={accent} />
        </g>
      )}
      {template === "metrics" && (
        <g>
          <path d="M78 98 L92 91 L92 101 L78 108 Z" fill={tile} stroke={soft} />
          <path d="M110 92 L124 85 L124 101 L110 108 Z" fill={tile} stroke={soft} />
          <path d="M146 54 L162 46 L162 92 L146 100 Z" fill={accent} />
          <path d="M146 54 L162 46 L170 50 L154 58 Z" fill={accent} opacity={0.7} />
          <rect x="70" y="24" width="30" height="8" rx="2" fill={ink} opacity={0.8} />
          <rect x="108" y="24" width="22" height="8" rx="2" fill={mid} />
        </g>
      )}
      {template === "endcard" && (
        <g>
          <rect width="240" height="136" fill={dark ? bg : ink} />
          <rect x="96" y="44" width="20" height="20" rx="5" fill={accent} />
          <rect x="122" y="50" width="34" height="8" rx="2" fill={dark ? ink : bg} />
          <rect x="84" y="76" width="72" height="4" rx="2" fill={dark ? ink : bg} opacity={0.45} />
        </g>
      )}
      {!["hero", "pipeline", "stack", "metrics", "endcard"].includes(template) && <rect x="70" y="40" width="100" height="56" rx="6" fill={soft} />}
    </svg>
  );
}
