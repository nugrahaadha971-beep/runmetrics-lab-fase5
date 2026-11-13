import { useEffect, useState } from 'react'

const toFraction = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null)

export default function ProgressRing({ value = null, size = 96, stroke = 8, label, children }) {
  const target = toFraction(value)
  const [shown, setShown] = useState(0)

  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(target ?? 0))
    return () => cancelAnimationFrame(id)
  }, [target])

  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const percent = target === null ? null : Math.round(target * 100)
  const aria = label
    ? `${label}: ${percent === null ? 'belum ada data' : `${percent} persen`}`
    : percent === null ? 'Belum ada data' : `${percent} persen`

  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={aria}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-track" />
        {target !== null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            stroke="url(#gradAccent)"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - shown)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            className="transition-[stroke-dashoffset] duration-[600ms] ease-out motion-reduce:transition-none"
          />
        )}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center tabular-nums">{children}</div>
    </div>
  )
}
