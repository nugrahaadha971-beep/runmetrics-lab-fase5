import { useMemo } from 'react'
import { Flame, Gauge } from 'lucide-react'
import GlassCard from '../ui/GlassCard'
import SemiGauge from '../ui/SemiGauge'
import StatChip from '../ui/StatChip'
import ThinProgressBar from '../ui/ThinProgressBar'
import { ACWR_INSUFFICIENT, ACWR_NOTE, calcAcwr } from '../../utils/runAnalytics'
import { weekDots, workoutDistribution } from '../../utils/summaries'
import { WORKOUT_TYPES } from '../../utils/constants'

const ZONES = [
  { to: 0.8, label: 'Beban rendah', className: 'stroke-accent-cyan' },
  { to: 1.3, label: 'Optimal', className: 'stroke-ok' },
  { to: 1.5, label: 'Waspada', className: 'stroke-warn' },
  { to: Infinity, label: 'Risiko tinggi', className: 'stroke-accent-from' },
]

/** Layar 3: kontrol beban latihan (hari aktif, gauge ACWR, beban akut dan kronis, distribusi latihan). */
export default function LoadScreen({ activities, today, factor }) {
  const acwr = useMemo(() => calcAcwr(activities, today, factor), [activities, today, factor])
  const dots = useMemo(() => weekDots(activities, today), [activities, today])
  const dist = useMemo(() => workoutDistribution(activities, today, 28), [activities, today])

  return (
    <div className="flex flex-col gap-4">
      <GlassCard>
        <h2 className="text-lg font-semibold">Kontrol beban latihan</h2>
        <ul className="mt-3 flex justify-between">
          {dots.map((d) => (
            <li key={d.date} className="flex flex-col items-center gap-1 text-xs">
              <span className="text-text-muted">{d.name}</span>
              <span
                role="img"
                aria-label={`${d.name}: ${d.has ? 'ada sesi' : 'tidak ada sesi'}${d.isToday ? ', hari ini' : ''}`}
                className={`grid h-7 w-7 place-items-center rounded-full ${d.isToday ? 'ring-2 ring-accent-cyan' : ''}`}
              >
                <span className={`h-3 w-3 rounded-full ${d.has ? 'bg-accent' : 'bg-track'}`} />
              </span>
            </li>
          ))}
        </ul>
      </GlassCard>

      <GlassCard className="flex flex-col items-center gap-3">
        <h3 className="self-start text-base font-semibold">ACWR (7:28 hari)</h3>
        <SemiGauge
          value={acwr.acwr}
          min={0}
          max={2}
          zones={ZONES}
          valueText={acwr.acwr === null ? undefined : acwr.acwr.toFixed(2)}
          zoneLabel={acwr.zone?.label}
          emptyLabel={acwr.status === 'chronic_zero' ? '—' : ACWR_INSUFFICIENT}
        />
        <div className="grid w-full grid-cols-2 gap-2">
          <StatChip vertical icon={Flame} value={Math.round(acwr.acute)} label="Beban akut (7 hari)" />
          <StatChip vertical icon={Gauge} value={Math.round(acwr.chronic)} label="Beban kronis (28 hari)" />
        </div>
        {acwr.noLoadCount > 0 && <p className="text-xs text-text-muted">{acwr.noLoadCount} sesi tanpa data beban</p>}
        <p className="text-xs text-text-muted">{ACWR_NOTE}</p>
      </GlassCard>

      <GlassCard className="flex flex-col gap-3">
        <h3 className="text-base font-semibold">Distribusi latihan</h3>
        <p className="-mt-2 text-xs text-text-muted">Porsi waktu, 28 hari terakhir</p>
        {WORKOUT_TYPES.map((t) => (
          <ThinProgressBar key={t} name={t} value={dist.byType[t].share} />
        ))}
      </GlassCard>
    </div>
  )
}
