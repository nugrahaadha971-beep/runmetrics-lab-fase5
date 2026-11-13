export default function ThinProgressBar({ value = null, name }) {
  const has = Number.isFinite(value)
  const pct = has ? Math.round(Math.min(1, Math.max(0, value)) * 100) : null
  return (
    <div className="flex items-center gap-3">
      {name && <span className="w-24 shrink-0 text-sm text-text-main">{name}</span>}
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-track"
        role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined}
        aria-label={name}>
        {has && (
          <div className="h-full rounded-full bg-accent transition-[width] duration-[600ms] motion-reduce:transition-none"
            style={{ width: `${pct}%` }} />
        )}
      </div>
      <span className="w-10 text-right text-sm tabular-nums text-text-muted">{has ? `${pct}%` : '—'}</span>
    </div>
  )
}
