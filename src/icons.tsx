// Lucide-style SVG icons — 24×24 viewBox, 2px stroke, round caps/joins.
// All icons accept optional `size` (px) and `className` props.

type P = { size?: number; className?: string };
const base = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export const IconMic = ({ size = 14, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <rect x="9" y="2" width="6" height="11" rx="3"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" y1="19" x2="12" y2="22"/>
    <line x1="8"  y1="22" x2="16" y2="22"/>
  </svg>
);

export const IconSquare = ({ size = 12, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="currentColor">
    <rect x="4" y="4" width="16" height="16" rx="2"/>
  </svg>
);

export const IconZap = ({ size = 13, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  </svg>
);

export const IconMonitor = ({ size = 13, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <rect x="2" y="3" width="20" height="14" rx="2"/>
    <line x1="8"  y1="21" x2="16" y2="21"/>
    <line x1="12" y1="17" x2="12" y2="21"/>
  </svg>
);

export const IconFileText = ({ size = 13, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <line x1="10" y1="9"  x2="8" y2="9"/>
  </svg>
);

export const IconSettings = ({ size = 14, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);

export const IconLayers = ({ size = 14, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <polygon points="12 2 2 7 12 12 22 7 12 2"/>
    <polyline points="2 17 12 22 22 17"/>
    <polyline points="2 12 12 17 22 12"/>
  </svg>
);

export const IconChevronUp = ({ size = 13, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <polyline points="18 15 12 9 6 15"/>
  </svg>
);

export const IconChevronDown = ({ size = 13, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);

export const IconMinus = ({ size = 13, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);

export const IconX = ({ size = 12, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <line x1="18" y1="6"  x2="6"  y2="18"/>
    <line x1="6"  y1="6"  x2="18" y2="18"/>
  </svg>
);

export const IconCopy = ({ size = 13, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <rect x="9" y="9" width="13" height="13" rx="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>
);

export const IconCheck = ({ size = 13, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

export const IconArrowLeft = ({ size = 13, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <line x1="19" y1="12" x2="5" y2="12"/>
    <polyline points="12 19 5 12 12 5"/>
  </svg>
);

export const IconRefresh = ({ size = 13, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <polyline points="23 4 23 10 17 10"/>
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
  </svg>
);

export const IconTrash = ({ size = 13, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6M14 11v6"/>
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
);

export const IconGhost = ({ size = 15, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
    <path d="M9 10h.01M15 10h.01"/>
    <path d="M12 2a8 8 0 0 1 8 8v10l-3-2-2 2-2-2-2 2-2-2-3 2V10a8 8 0 0 1 8-8z"/>
  </svg>
);
