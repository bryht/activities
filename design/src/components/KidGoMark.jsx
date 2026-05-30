// KidGo brand mark — a location pin with a happy kid's face.
export default function KidGoMark({ className }) {
  return (
    <svg viewBox="0 0 512 512" className={className} role="img" aria-label="KidGo">
      <defs>
        <linearGradient id="kg-mark-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FF8A5C" />
          <stop offset="0.55" stopColor="#FB6A78" />
          <stop offset="1" stopColor="#E11D48" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="116" fill="url(#kg-mark-tile)" />
      <g fill="#FFD45E">
        <path d="M392 96 c5 22 9 26 31 31 -22 5 -26 9 -31 31 -5 -22 -9 -26 -31 -31 22 -5 26 -9 31 -31 z" />
        <path d="M428 168 c3 13 5 15 18 18 -13 3 -15 5 -18 18 -3 -13 -5 -15 -18 -18 13 -3 15 -5 18 -18 z" />
      </g>
      <g transform="translate(256 188)">
        <path d="M0 248 L103.8 56.1 A118 118 0 1 0 -103.8 56.1 Z" fill="#FFFFFF" />
        <circle cx="-66" cy="26" r="16" fill="#FFB3A7" opacity="0.9" />
        <circle cx="66" cy="26" r="16" fill="#FFB3A7" opacity="0.9" />
        <g fill="#2B2440">
          <circle cx="-38" cy="-20" r="17" />
          <circle cx="38" cy="-20" r="17" />
        </g>
        <g fill="#FFFFFF">
          <circle cx="-44" cy="-28" r="6" />
          <circle cx="32" cy="-28" r="6" />
        </g>
        <path d="M-34 18 Q0 62 34 18" fill="none" stroke="#2B2440" strokeWidth="14" strokeLinecap="round" />
      </g>
    </svg>
  )
}
