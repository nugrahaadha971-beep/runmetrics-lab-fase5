import GlassCard from './GlassCard'

/** Kartu grafik dengan tinggi eksplisit (agar ResponsiveContainer tidak 0) dan state kosong. */
export default function ChartCard({ title, subtitle, empty = false, children, footer = null, height = 'h-48' }) {
  return (
    <GlassCard className="min-w-0">
      <h3 className="text-base font-semibold">{title}</h3>
      {subtitle && <p className="text-xs text-text-muted">{subtitle}</p>}
      <div className={`mt-3 w-full ${height}`}>
        {empty ? (
          <div className="grid h-full place-items-center rounded-xl border border-dashed border-track text-sm text-text-muted">
            Belum ada data
          </div>
        ) : children}
      </div>
      {footer}
    </GlassCard>
  )
}
