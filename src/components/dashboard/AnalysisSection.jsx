import { useMemo, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Bar, BarChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import GlassCard from '../ui/GlassCard'
import PillTabs from '../ui/PillTabs'
import ChartCard from '../ui/ChartCard'
import { inputClass } from '../ui/Field'
import { axisProps, tooltipProps } from '../ui/chartStyles'
import {
  BEST_DISTANCES, defaultRiegelReference, effortsFromActivities, personalBests, pbHistory, riegelCandidates, riegelPredict,
} from '../../utils/runAnalytics'
import { weeklySeries } from '../../utils/summaries'
import { formatKm, formatPace, formatRaceTime, formatShortDate } from '../../utils/dateUtils'

const KEY_TABS = BEST_DISTANCES.map((b) => ({ id: b.key, label: b.key }))
const effortId = (e) => `${e.activityId}-${e.key}`

function TrendLine({ data, dataKey, color, name, formatTick, formatValue, reversed = false }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={24} />
        <YAxis {...axisProps} width={48} reversed={reversed} domain={['auto', 'auto']} tickFormatter={formatTick} />
        <Tooltip {...tooltipProps} cursor={false} formatter={(v) => [formatValue(v), name]} />
        <Line type="monotone" dataKey={dataKey} className={`line-${color}`} strokeWidth={2.5} connectNulls
          dot={{ r: 3, className: `chart-dot-${color}` }} activeDot={{ r: 5, className: `chart-dot-${color}` }} />
      </LineChart>
    </ResponsiveContainer>
  )
}

function TrendBar({ data, dataKey, name, formatValue }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
        <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={24} />
        <YAxis {...axisProps} width={40} allowDecimals={false} />
        <Tooltip {...tooltipProps} cursor={false} formatter={(v) => [formatValue(v), name]} />
        <Bar dataKey={dataKey} fill="url(#gradBar)" radius={[6, 6, 0, 0]} maxBarSize={24} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Analisis: rekor pribadi (PB), prediksi Riegel, dan tren mingguan 12 minggu. */
export default function AnalysisSection({ activities, settings, today, factor }) {
  const [raceOnly, setRaceOnly] = useState(false)
  const [histKey, setHistKey] = useState('5K')
  const [refId, setRefId] = useState(null)

  const efforts = useMemo(() => effortsFromActivities(activities, { raceOnly }), [activities, raceOnly])
  const allEfforts = useMemo(() => effortsFromActivities(activities), [activities])
  const pb = useMemo(() => personalBests(efforts), [efforts])
  const history = useMemo(
    () => pbHistory(efforts, histKey).map((e) => ({ label: formatShortDate(e.date), timeSec: e.timeSec })),
    [efforts, histKey],
  )
  const candidates = useMemo(() => riegelCandidates(allEfforts, today), [allEfforts, today])
  const reference = candidates.find((e) => effortId(e) === refId) ?? defaultRiegelReference(candidates)
  const predictions = useMemo(() => riegelPredict(reference, settings.riegelExponent), [reference, settings.riegelExponent])
  const weekly = useMemo(() => weeklySeries(activities, today, 12, factor), [activities, today, factor])
  const noLoad = weekly.reduce((s, w) => s + w.noLoadCount, 0)

  return (
    <div className="flex flex-col gap-4">
      <GlassCard className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Rekor pribadi</h2>
          <label className="flex min-h-[44px] items-center gap-2 text-sm">
            <input type="checkbox" checked={raceOnly} onChange={(e) => setRaceOnly(e.target.checked)} className="h-5 w-5 accent-accent-cyan" />
            Hanya sesi Race
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {BEST_DISTANCES.map(({ key }) => {
            const e = pb[key]
            return (
              <div key={key} className="rounded-2xl border border-surface-border bg-surface p-3">
                <p className="text-sm text-accent-cyan">{key}</p>
                <p className="text-xl font-semibold tabular-nums">{e ? formatRaceTime(e.timeSec) : '—'}</p>
                {e ? (
                  <>
                    <p className="text-xs tabular-nums text-text-muted">{formatPace(e.paceSec)} /km</p>
                    <p className="truncate text-xs text-text-muted">{e.date} · {e.title || 'Lari'}</p>
                    {e.estimated && <span className="mt-1 inline-block rounded-full border border-warn px-2 text-xs text-warn">perkiraan</span>}
                  </>
                ) : (
                  <p className="text-xs text-text-muted">Belum ada data</p>
                )}
              </div>
            )
          })}
        </div>
      </GlassCard>

      <ChartCard
        title="Riwayat rekor"
        subtitle="Setiap kali rekor terpecahkan"
        empty={history.length === 0}
        footer={<div className="mt-3"><PillTabs tabs={KEY_TABS} value={histKey} onChange={setHistKey} label="Pilih jarak" /></div>}
      >
        <TrendLine data={history} dataKey="timeSec" color="cyan" name="Waktu" formatTick={formatRaceTime} formatValue={formatRaceTime} />
      </ChartCard>

      <GlassCard className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Prediksi Riegel</h2>
        {candidates.length === 0 ? (
          <p className="text-sm text-text-muted">Belum ada best effort dalam 90 hari terakhir.</p>
        ) : (
          <>
            <label className="flex flex-col gap-1 text-sm">
              Referensi (best effort 90 hari terakhir)
              <select className={inputClass} value={reference ? effortId(reference) : ''} onChange={(e) => setRefId(e.target.value)}>
                {candidates.map((e) => (
                  <option key={effortId(e)} value={effortId(e)}>
                    {`${e.key} · ${formatRaceTime(e.timeSec)} · ${formatShortDate(e.date)}${e.estimated ? ' (perkiraan)' : ''}`}
                  </option>
                ))}
              </select>
            </label>
            <ul className="divide-y divide-surface-border">
              {predictions.map((p) => (
                <li key={p.key} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="font-medium">{p.key}</span>
                  <span className="text-right tabular-nums">
                    {formatRaceTime(p.timeSec)}
                    <span className="block text-xs text-text-muted">{formatPace(p.paceSec)} /km</span>
                    {p.unreliable && (
                      <span className="flex items-center justify-end gap-1 text-xs text-warn">
                        <TriangleAlert size={16} strokeWidth={1.75} aria-hidden="true" />
                        prediksi kurang andal
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-text-muted">
              Eksponen k = {formatKm(settings.riegelExponent)}. Ini perkiraan, bukan jaminan hasil lomba.
            </p>
          </>
        )}
      </GlassCard>

      <ChartCard title="Volume mingguan" subtitle="Km per minggu, 12 minggu terakhir" empty={weekly.every((w) => w.count === 0)}>
        <TrendBar data={weekly} dataKey="km" name="Volume" formatValue={(v) => `${formatKm(v)} km`} />
      </ChartCard>
      <ChartCard
        title="Beban mingguan"
        subtitle="TRIMP (atau sRPE terkonversi)"
        empty={weekly.every((w) => w.load === null)}
        footer={noLoad > 0 ? <p className="mt-2 text-xs text-text-muted">{noLoad} sesi tanpa data beban</p> : null}
      >
        <TrendBar data={weekly} dataKey="load" name="Beban" formatValue={(v) => String(Math.round(v))} />
      </ChartCard>
      <ChartCard title="Tren pace" subtitle="Rata-rata mingguan; lebih tinggi = lebih cepat" empty={weekly.every((w) => w.avgPaceSec === null)}>
        <TrendLine data={weekly} dataKey="avgPaceSec" color="pink" name="Pace" reversed
          formatTick={(v) => formatPace(v)} formatValue={(v) => `${formatPace(v)} /km`} />
      </ChartCard>
      <ChartCard title="Tren EF" subtitle="Hanya Easy Run dan Long Run" empty={weekly.every((w) => w.avgEF === null)}>
        <TrendLine data={weekly} dataKey="avgEF" color="cyan" name="EF"
          formatTick={(v) => formatKm(v)} formatValue={(v) => formatKm(v, 3)} />
      </ChartCard>
      <ChartCard title="Tren cadence" subtitle="Rata-rata mingguan (spm)" empty={weekly.every((w) => w.avgCadence === null)}>
        <TrendLine data={weekly} dataKey="avgCadence" color="coral" name="Cadence"
          formatTick={(v) => String(Math.round(v))} formatValue={(v) => `${Math.round(v)} spm`} />
      </ChartCard>
    </div>
  )
}
