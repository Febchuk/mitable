/* Small inlined icon set for reports-v2. Kept inline (no lucide) so the
 * component bundle stays tiny and we control every stroke for the
 * Montessori-soft aesthetic. */

type Props = { size?: number; className?: string };

function base({ size = 14 }: Props) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
}

export const Icon = {
  Check: (p: Props) => (
    <svg {...base(p)} className={p.className}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  Plus: (p: Props) => (
    <svg {...base(p)} className={p.className}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  Send: (p: Props) => (
    <svg {...base(p)} className={p.className}>
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  ),
  ChevronDown: (p: Props) => (
    <svg {...base(p)} className={p.className}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  ChevronRight: (p: Props) => (
    <svg {...base(p)} className={p.className}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
  Close: (p: Props) => (
    <svg {...base(p)} className={p.className}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  MessageCircle: (p: Props) => (
    <svg {...base(p)} className={p.className}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  ),
  RotateCcw: (p: Props) => (
    <svg {...base(p)} className={p.className}>
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
    </svg>
  ),
  Clock: (p: Props) => (
    <svg {...base(p)} className={p.className}>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 14" />
    </svg>
  ),
  Edit: (p: Props) => (
    <svg {...base(p)} className={p.className}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <polygon points="18.5 2.5 21.5 5.5 12 15 8 16 9 12 18.5 2.5" />
    </svg>
  ),
};
