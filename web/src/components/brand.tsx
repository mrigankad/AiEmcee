/** The AiEmcee app mark: a play glyph and a spark on the orb gradient. */
export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id="aie-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFB547" />
          <stop offset="45%" stopColor="#F98620" />
          <stop offset="100%" stopColor="#D9400B" />
        </linearGradient>
      </defs>
      <rect width="256" height="256" rx="60" fill="url(#aie-logo)" />
      <path d="M98 76 Q98 62 110 69 L180 112 Q192 120 180 128 L110 171 Q98 178 98 164 Z" fill="#fff" />
      <circle cx="196" cy="70" r="15" fill="#fff" />
    </svg>
  );
}

/** Rasa, the director: an orange orb with white eyes. `busy` makes it breathe. */
export function Rasa({ size = 28, busy = false }: { size?: number; busy?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className={`shrink-0 ${busy ? "animate-pulse" : ""}`}>
      <defs>
        <radialGradient id="aie-rasa" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0%" stopColor="#FFC266" />
          <stop offset="45%" stopColor="#FFA12B" />
          <stop offset="75%" stopColor="#F0731A" />
          <stop offset="100%" stopColor="#DC440C" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#aie-rasa)" />
      <rect x="21" y="22" width="7" height="14" rx="3.5" fill="#fff" />
      <rect x="36" y="22" width="7" height="14" rx="3.5" fill="#fff" />
    </svg>
  );
}
