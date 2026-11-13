import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import GlassCard from './ui/GlassCard'
import Button from './ui/Button'
import { inputClass } from './ui/Field'
import RunDetailModal from './RunDetailModal'
import { db } from '../db/runDatabase'
import { formatKm, formatPace } from '../utils/dateUtils'
import { DISTANCE_CATEGORIES, WORKOUT_TYPES } from '../utils/constants'

/** Riwayat: filter distanceCategory dan workoutType, terbaru dulu; ketuk untuk detail (peta, split, drift, hapus). */
export default function RunHistoryWithModal({ filter, onFilterChange }) {
  const activities = useLiveQuery(() => db.activities.orderBy('startTimeMs').reverse().toArray(), [])
  const [selectedId, setSelectedId] = useState(null)

  const filtered = (activities ?? []).filter(
    (a) => (!filter.category || a.distanceCategory === filter.category) && (!filter.workoutType || a.workoutType === filter.workoutType),
  )
  const filtering = !!(filter.category || filter.workoutType)

  return (
    <div className="flex flex-col gap-4">
      <GlassCard className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Riwayat lari</h2>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs text-text-muted">
            Kategori jarak
            <select className={`${inputClass} text-sm`} value={filter.category} onChange={(e) => onFilterChange({ ...filter, category: e.target.value })}>
              <option value="">Semua</option>
              {DISTANCE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-muted">
            Jenis latihan
            <select className={`${inputClass} text-sm`} value={filter.workoutType} onChange={(e) => onFilterChange({ ...filter, workoutType: e.target.value })}>
              <option value="">Semua</option>
              {WORKOUT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        </div>
        {filtering && (
          <div>
            <Button variant="secondary" onClick={() => onFilterChange({ category: '', workoutType: '' })}>Hapus filter</Button>
          </div>
        )}
      </GlassCard>

      {activities === undefined ? (
        <p className="text-sm text-text-muted">Memuat…</p>
      ) : filtered.length === 0 ? (
        <GlassCard>
          <p className="text-sm text-text-muted">
            {activities.length === 0
              ? 'Belum ada aktivitas. Unggah file atau gunakan Input Manual di atas.'
              : 'Tidak ada aktivitas yang cocok dengan filter.'}
          </p>
        </GlassCard>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => setSelectedId(a.id)}
                className="flex min-h-[56px] w-full items-center justify-between gap-3 rounded-2xl border border-surface-border bg-surface p-3 text-left"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{a.title || 'Lari'}</span>
                  <span className="block text-sm text-text-muted">{a.date} · {a.distanceCategory ?? '—'} · {a.workoutType ?? '—'}</span>
                </span>
                <span className="shrink-0 text-right text-sm tabular-nums">
                  {formatKm(a.distanceKm)} km
                  <span className="block text-text-muted">{formatPace(a.avgPaceSec)} /km</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <RunDetailModal activityId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  )
}
