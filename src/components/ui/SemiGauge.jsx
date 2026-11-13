const CX = 100
const CY = 100
const R = 80
const SPAN = 220
const START = -SPAN / 2

const point = (deg, r = R) => {
  const rad = (deg * Math.PI) / 180
  return [CX + r * Math.sin(rad), CY - r * Math.cos(rad)]
}

const arc = (a0, a1) => {
  const [x0, y0] = point(a0)
  const [x1, y1] = point(a1)
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${R} ${R} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
}

/**
 * zones: [{ to, label, className }] berurutan naik; `className` = kelas stroke-* token.
 * zoneLabel (opsional) menimpa label hasil pencarian zona, agar batas zona
 * ditentukan oleh fungsi analitik, bukan komponen.
 * value null => gauge abu-abu dengan emptyLabel.
 */
export default function SemiGauge({ value = null, min = 0, max = 2, zones = [], valueText, zoneLabel, emptyLabel = 'Belum ada data' }) {
  const hasValue = Number.isFinite(value)
  const frac = (v) => Math.min(1, Math.max(0, (v - min) / (max - min)))
  const angle = (v) => START + frac(v) * SPAN
  const zone = hasValue ? zones.find((z) => value <= z.to) ?? zones[zones.length - 1] : null

  let from = min
  const segments = zones.map((z) => {
    const seg = { ...z, from }
    from = z.to
    return seg
  })

  const ticks = Array.from({ length: 23 }, (_, i) => START + (i * SPAN) / 22)

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 140" className="w-full max-w-[260px]" role="img"
        aria-label={hasValue ? `Nilai ${valueText ?? value}, zona ${zoneLabel ?? zone?.label ?? ''}` : emptyLabel}>
        {ticks.map((a, i) => {
          const [x0, y0] = point(a, R + 12)
          const [x1, y1] = point(a, R + (i % 2 === 0 ? 18 : 15))
          return <line key={a} x1={x0} y1={y0} x2={x1} y2={y1} strokeWidth="1.5" strokeLinecap="round" className="stroke-track" />
        })}
        {hasValue && zones.length > 0
          ? segments.map((s) => (
              <path key={s.label} d={arc(angle(s.from), angle(Math.min(s.to, max)))} fill="none"
                strokeWidth="10" strokeLinecap="butt" className={s.className} />
            ))
          : <path d={arc(START, START + SPAN)} fill="none" strokeWidth="10" strokeLinecap="round" className="stroke-track" />}
        {hasValue && (() => {
          const [mx, my] = point(angle(Math.min(max, Math.max(min, value))))
          return <circle cx={mx} cy={my} r="8" strokeWidth="3" className="fill-text-main stroke-bg-from" />
        })()}
        <text x={CX} y={CY + 6} textAnchor="middle" className="fill-text-main text-[40px] font-semibold tabular-nums">
          {hasValue ? valueText ?? value : '—'}
        </text>
      </svg>
      <p className="-mt-2 text-center text-sm font-medium text-text-main">
        {hasValue ? zoneLabel ?? zone?.label : emptyLabel}
      </p>
    </div>
  )
}
