import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import Modal from './ui/Modal'
import Button from './ui/Button'
import { inputClass } from './ui/Field'
import RouteMap from './RouteMap'
import { db, deleteRunActivity, updateRunActivity } from '../db/runDatabase'
import { cardiacDrift, splitsPerKm } from '../utils/runAnalytics'
import { routeLatLngs } from '../utils/route'
import { formatDuration, formatKm, formatPace, formatRaceTime } from '../utils/dateUtils'
import { DISTANCE_CATEGORIES, WORKOUT_TYPES } from '../utils/constants'

const num = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—')

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface p-2">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function DetailBody({ activity: a, streamRow, onClose, onDeleted }) {
  const records = streamRow?.records ?? null
  const latlngs = useMemo(() => routeLatLngs(records), [records])
  const splits = useMemo(() => (records ? splitsPerKm(records, a.distanceKm * 1000) : []), [records, a.distanceKm])
  const drift = useMemo(() => (records ? cardiacDrift(a, records) : null), [records, a])
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')

  const change = async (field, value) => {
    try {
      await updateRunActivity(a.id, { [field]: value })
    } catch {
      setError('Gagal menyimpan perubahan')
    }
  }
  const remove = async () => {
    try {
      await deleteRunActivity(a.id)
      onDeleted?.(a.id)
      onClose()
    } catch {
      setError('Gagal menghapus aktivitas')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-base font-semibold">{a.title || 'Lari'}</p>
        <p className="text-sm text-text-muted">{a.date} · {a.source ?? '—'}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Kategori jarak
          <select className={`${inputClass} text-sm`} value={a.distanceCategory ?? ''} onChange={(e) => change('distanceCategory', e.target.value)}>
            {a.distanceCategory ? null : <option value="">—</option>}
            {DISTANCE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Jenis latihan
          <select className={`${inputClass} text-sm`} value={a.workoutType ?? ''} onChange={(e) => change('workoutType', e.target.value)}>
            {a.workoutType ? null : <option value="">—</option>}
            {WORKOUT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stat label="Jarak" value={`${formatKm(a.distanceKm)} km`} />
        <Stat label="Durasi" value={formatDuration(a.durationSec)} />
        <Stat label="Pace" value={`${formatPace(a.avgPaceSec)} /km`} />
        <Stat label="HR rata-rata / maks" value={`${num(a.avgHr)} / ${num(a.maxHr)} bpm`} />
        <Stat label="Cadence" value={Number.isFinite(a.avgCadence) ? `${num(a.avgCadence)} spm` : '—'} />
        <Stat label="Elevasi" value={Number.isFinite(a.elevationGain) ? `${num(a.elevationGain)} m` : '—'} />
        <Stat label="TRIMP" value={num(a.trimp, 1)} />
        <Stat label="EF" value={num(a.efficiencyFactor, 3)} />
        <Stat label="RPE" value={num(a.rpe)} />
        <Stat label="sRPE" value={num(a.srpe)} />
      </div>

      {drift && (
        <div className="rounded-xl border border-surface-border bg-surface p-3 text-sm">
          <p className="font-semibold">Cardiac drift: <span className="tabular-nums">{num(drift.driftPct, 1)}%</span></p>
          {drift.warning && <p className="text-warn">{drift.warning}</p>}
        </div>
      )}

      {latlngs.length >= 2 ? (
        <RouteMap latlngs={latlngs} />
      ) : (
        <p className="rounded-xl border border-dashed border-track p-3 text-sm text-text-muted">
          Tanpa peta: aktivitas ini tidak punya data GPS (input manual atau treadmill).
        </p>
      )}

      {splits.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[320px] text-sm tabular-nums">
            <caption className="mb-1 text-left text-base font-semibold">Split per km</caption>
            <thead className="text-left text-xs text-text-muted">
              <tr>
                <th scope="col" className="py-1 pr-2 font-normal">Km</th>
                <th scope="col" className="font-normal">Waktu</th>
                <th scope="col" className="font-normal">Pace</th>
                <th scope="col" className="font-normal">HR</th>
                <th scope="col" className="font-normal">Elev (m)</th>
              </tr>
            </thead>
            <tbody>
              {splits.map((s) => (
                <tr key={s.km} className="border-t border-surface-border">
                  <td className="py-1.5 pr-2">{s.label}</td>
                  <td>{formatRaceTime(s.timeSec)}</td>
                  <td>{formatPace(s.paceSec)}</td>
                  <td>{s.avgHr === null ? '—' : Math.round(s.avgHr)}</td>
                  <td>{s.elevDelta === null ? '—' : `${s.elevDelta > 0 ? '+' : ''}${formatKm(s.elevDelta, 1)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {error && <p role="alert" className="text-sm text-accent-pink">{error}</p>}

      {confirming ? (
        <div role="alertdialog" aria-label="Konfirmasi hapus" className="rounded-xl border border-accent-pink p-3">
          <p className="text-sm">Hapus aktivitas ini beserta data GPS-nya? Tindakan ini tidak bisa dibatalkan.</p>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirming(false)}>Batal</Button>
            <Button onClick={remove}>Ya, hapus</Button>
          </div>
        </div>
      ) : (
        <div className="flex justify-between gap-2">
          <Button variant="secondary" onClick={() => setConfirming(true)}>Hapus</Button>
          <Button onClick={onClose}>Tutup</Button>
        </div>
      )}
    </div>
  )
}

function DetailContent({ activityId, onClose, onDeleted }) {
  const activity = useLiveQuery(async () => (await db.activities.get(activityId)) ?? null, [activityId])
  const streamRow = useLiveQuery(async () => (await db.streams.get(activityId)) ?? null, [activityId])
  if (activity === undefined || streamRow === undefined) return <p className="text-sm text-text-muted">Memuat…</p>
  if (activity === null) return <p className="text-sm text-text-muted">Aktivitas tidak ditemukan.</p>
  return <DetailBody activity={activity} streamRow={streamRow} onClose={onClose} onDeleted={onDeleted} />
}

/** Konten hanya dipasang saat terbuka, sehingga peta dibuat dan di-remove() tiap buka-tutup. */
export default function RunDetailModal({ activityId, onClose, onDeleted }) {
  const open = activityId !== null && activityId !== undefined
  return (
    <Modal open={open} onClose={onClose} title="Detail lari">
      {open && <DetailContent key={activityId} activityId={activityId} onClose={onClose} onDeleted={onDeleted} />}
    </Modal>
  )
}
