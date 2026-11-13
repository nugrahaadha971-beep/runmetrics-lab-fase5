import { useMemo, useState } from 'react'
import { Activity, Flame, Gauge, Mountain, Timer } from 'lucide-react'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import GlassCard from '../ui/GlassCard'
import PillTabs from '../ui/PillTabs'
import ProgressRing from '../ui/ProgressRing'
import StatChip from '../ui/StatChip'
import ChartCard from '../ui/ChartCard'
import { axisProps, tooltipProps } from '../ui/chartStyles'
import { periodRange, periodTarget, summarizePeriod, volumeByDay, volumeByWeek } from '../../utils/summaries'
import { addDays, formatDuration, formatKm, formatPace } from '../../utils/dateUtils'

const PERIODS = [
  { id: 'day', label: 'Hari ini' },
  { id: 'week', label: 'Minggu ini' },
  { id: 'month', label: 'Bulan ini' },
]
const num = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—')

/** Layar 2: ringkasan periode (cincin jarak vs target, durasi, pace, grafik batang, beban/elevasi/cadence). */
export default function SummaryScreen({ activities, settings, today, factor }) {
  const [period, setPeriod] = useState('week')
  const { from, to } = periodRange(period, today)
  const sum = useMemo(() => summarizePeriod(activities, from, to, factor), [activities, from, to, factor])
  const target = periodTarget(period, settings.weeklyTargetKm, today)
  const bars = useMemo(
    () => (period === 'month' ? volumeByWeek(activities, from, to) : volumeByDay(activities, period === 'day' ? addDays(today, -6) : from, 7)),
    [activities, period, from, to, today],
  )
  const hasAny = activities.length > 0

  return (
    <div className="flex flex-col gap-4">
      <PillTabs tabs={PERIODS} value={period} onChange={setPeriod} label="Pilih periode ringkasan" />

      <GlassCard>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="justify-self-start">
            <StatChip vertical icon={Timer} value={sum.count ? formatDuration(sum.durationSec) : '—'} label="Durasi" />
          </div>
          <ProgressRing value={hasAny && target ? sum.km / target : null} size={132} stroke={10} label="Jarak terhadap target">
            {hasAny ? (
              <div className="px-2">
                <div className="text-xl font-semibold">{formatKm(sum.km, 1)} km</div>
                <div className="text-xs text-text-muted">dari target {formatKm(target, 1)} km</div>
              </div>
            ) : (
              <span className="px-3 text-xs text-text-muted">Belum ada data</span>
            )}
          </ProgressRing>
          <div className="justify-self-end">
            <StatChip vertical icon={Gauge} value={sum.avgPaceSec ? `${formatPace(sum.avgPaceSec)} /km` : '—'} label="Pace rata-rata" />
          </div>
        </div>
      </GlassCard>

      <ChartCard
        title="Volume"
        subtitle={period === 'month' ? 'Km per minggu' : period === 'day' ? 'Km per hari, 7 hari terakhir' : 'Km per hari'}
        empty={bars.every((b) => b.km === 0)}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={bars} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
            <XAxis dataKey="name" {...axisProps} />
            <YAxis {...axisProps} width={40} allowDecimals={false} />
            <Tooltip {...tooltipProps} cursor={false} formatter={(v) => [`${formatKm(v)} km`, 'Volume']} />
            <Bar dataKey="km" fill="url(#gradBar)" radius={[6, 6, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid grid-cols-3 gap-2">
        <StatChip vertical icon={Flame} value={num(sum.load)} label="Beban (TRIMP)" />
        <StatChip vertical icon={Mountain} value={sum.elevationGain === null ? '—' : `${num(sum.elevationGain)} m`} label="Elevasi" />
        <StatChip vertical icon={Activity} value={sum.avgCadence === null ? '—' : `${num(sum.avgCadence)} spm`} label="Cadence" />
      </div>
      {sum.noLoadCount > 0 && <p className="text-xs text-text-muted">{sum.noLoadCount} sesi tanpa data beban</p>}
    </div>
  )
}
