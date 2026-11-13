// Render sekali di App. Menyediakan url(#gradAccent) untuk semua SVG.
// Ukuran 0x0 (bukan display:none) agar gradasi tetap dikenali browser.
export default function GradientDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" className="absolute">
      <defs>
        <linearGradient id="gradAccent" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" style={{ stopColor: 'var(--accent-from)' }} />
          <stop offset="100%" style={{ stopColor: 'var(--accent-to)' }} />
        </linearGradient>
        <linearGradient id="gradBar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: 'var(--accent-from)' }} />
          <stop offset="100%" style={{ stopColor: 'var(--accent-to)' }} />
        </linearGradient>
      </defs>
    </svg>
  )
}
