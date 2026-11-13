import { useMemo } from 'react'
import { Medal, Mountain, Plus, Trophy, Wind, Zap } from 'lucide-react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import GlassCard from '../ui/GlassCard'
import ProgressRing from '../ui/ProgressRing'
import Button from '../ui/Button'
import ChartCard from '../ui/ChartCard'
import { axisProps, tooltipProps } from '../ui/chartStyles'
import { categoryShares, dailyVolume } from '../../utils/summaries'
import { formatKm } from '../../utils/dateUtils'

const CELLS = [
  { key: '5K', icon: Zap },
  { key: '10K', icon: Wind },
  { key: '21.1K', icon: Medal },
  { key: '42.2K', icon: Trophy },
  { key: 'Ultra', icon: Mountain },
]

/** Layar 1: pilih jenis latihan (cincin porsi volume 30 hari) dan progres harian. */
export default function ActivityScreen({ activities, today, onPickCategory, onOpenManual, onGoUpload }) {
  const shares = useMemo(() => categoryShares(activities, today, 30), [activities, today])
  const daily = useMemo(() => dailyVolume(activities, today, 30), [activities, today])

  return (
    <div className="flex flex-col gap-4">
      {activities.length === 0 && (
        <GlassCard>
          <h2 className="text-lg font-semibold">Belum ada aktivitas</h2>
          <p className="mt-2 text-sm text-text-muted">
            Unggah file .fit atau .gpx dari jam larimu, atau catat lari lewat Input Manual. Semua data tersimpan di
            perangkat ini.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={onGoUpload}>Unggah file</Button>
            <Button variant="secondary" onClick={onOpenManual}>Input manual</Button>
          </div>
        </GlassCard>
      )}

      <GlassCard>
        <h2 className="text-sm font-medium text-accent-cyan">Pilih jenis latihan</h2>
        <div className="mt-3 grid grid-cols-3 gap-x-2 gap-y-4">
          {CELLS.map(({ key, icon: Icon }) => {
            const share = shares.byKey[key].share
            return (
              <button
                key={key}
                type="button"
                onClick={() => onPickCategory(key)}
                aria-label={`Lihat riwayat ${key}`}
                className="flex min-h-[44px] flex-col items-center gap-1"
              >
                <span className="text-xs tabular-nums text-text-muted">{share === null ? '—' : `${Math.round(share * 100)}%`}</span>
                <ProgressRing value={share} size={72} stroke={6} label={`Porsi volume ${key}`}>
                  <Icon size={24} strokeWidth={1.75} className="text-accent-cyan" aria-hidden="true" />
                </ProgressRing>
                <span className="text-sm">{key}</span>
              </button>
            )
          })}
          <button type="button" onClick={onOpenManual} aria-label="Input manual" className="flex min-h-[44px] flex-col items-center gap-1">
            <span className="text-xs" aria-hidden="true">&nbsp;</span>
            <ProgressRing value={null} size={72} stroke={6} label="Input manual">
              <Plus size={24} strokeWidth={1.75} className="text-accent-cyan" aria-hidden="true" />
            </ProgressRing>
            <span className="text-sm">Input Manual</span>
          </button>
        </div>
      </GlassCard>

      <ChartCard title="Progres harian" subtitle="Volume (km), 30 hari terakhir" empty={daily.every((d) => d.km === 0)}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={daily} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
            <defs>
              <linearGradient id="areaFade" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" style={{ stopColor: 'var(--accent-from)', stopOpacity: 0.6 }} />
                <stop offset="100%" style={{ stopColor: 'var(--accent-from)', stopOpacity: 0 }} />
              </linearGradient>
            </defs>
            <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={28} />
            <YAxis {...axisProps} width={40} allowDecimals={false} />
            <Tooltip {...tooltipProps} formatter={(v) => [`${formatKm(v)} km`, 'Volume']} />
            <Area type="monotone" dataKey="km" fill="url(#areaFade)" />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  )
}
