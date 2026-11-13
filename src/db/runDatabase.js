import Dexie from 'dexie'
import { bestEffortsForActivity } from '../utils/runAnalytics.js'
import { getTzOffsetMin, toLocalDateString, isValidDateString } from '../utils/dateUtils.js'

export const db = new Dexie('RunAnalyticsDB')

// Kelima tabel dideklarasikan di versi 1 supaya Fase 7 tidak butuh migrasi.
db.version(1).stores({
  activities: '++id, &fingerprint, date, startTimeMs, distanceCategory, workoutType, distanceKm',
  streams: 'activityId',
  settings: 'key',
  plans: '++id, status, raceDate',
  plannedWorkouts: '++id, planId, date, weekNo, [planId+date]',
})

// sex sengaja null: koefisien TRIMP baru valid setelah pengguna memilihnya di profil.
export const DEFAULT_SETTINGS = {
  hrMax: null,
  hrRest: null,
  sex: null,
  riegelExponent: 1.06,
  lastBackupAt: null,
  weeklyTargetKm: 40,
  trimpStale: false, // true setelah profil HR berubah, sampai TRIMP dihitung ulang
}

const OPTIONAL_NUMERIC = [
  'avgPaceSec', 'avgHr', 'maxHr', 'avgCadence', 'elevationGain',
  'srpe', 'trimp', 'efficiencyFactor', 'rpe',
]

const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const round6 = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : null)

// startTimeMs dibulatkan ke detik | jarak (m) | durasi (detik). Input manual ditambah createdAt.
export function makeFingerprint({ startTimeMs, distanceKm, durationSec }, createdAt = null) {
  const base = `${Math.round(startTimeMs / 1000)}|${Math.round(distanceKm * 1000)}|${Math.round(durationSec)}`
  return createdAt == null ? base : `${base}|${createdAt}`
}

function buildActivityRecord(summary) {
  const { id: _ignored, ...rest } = summary ?? {}
  const { startTimeMs, distanceKm, durationSec } = rest
  if (!Number.isFinite(startTimeMs)) throw new Error('Waktu mulai aktivitas tidak valid')
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) throw new Error('Jarak aktivitas harus lebih dari 0')
  if (!Number.isFinite(durationSec) || durationSec <= 0) throw new Error('Durasi aktivitas harus lebih dari 0')

  const createdAt = Number.isFinite(rest.createdAt) ? rest.createdAt : Date.now()
  const tzOffsetMin = Number.isFinite(rest.tzOffsetMin) ? rest.tzOffsetMin : getTzOffsetMin(startTimeMs)
  const date = isValidDateString(rest.date) ? rest.date : toLocalDateString(startTimeMs, tzOffsetMin)
  const source = rest.source ?? 'file'
  const fingerprint =
    rest.fingerprint ||
    makeFingerprint({ startTimeMs, distanceKm, durationSec }, source === 'manual' ? createdAt : null)

  const record = {
    ...rest,
    title: rest.title ?? null,
    distanceCategory: rest.distanceCategory ?? null,
    workoutType: rest.workoutType ?? null,
    source,
    startTimeMs,
    tzOffsetMin,
    date,
    distanceKm,
    durationSec,
    createdAt,
    fingerprint,
  }
  for (const k of OPTIONAL_NUMERIC) record[k] = numOrNull(rest[k])
  return record
}

// t = detik sejak start; lat/lng dibulatkan 6 desimal; nilai tak valid menjadi null.
function buildStreamRow(stream) {
  const records = stream?.records
  if (!Array.isArray(records) || records.length === 0) return null
  return {
    records: records.map((r) => ({
      t: numOrNull(r.t),
      lat: round6(r.lat),
      lng: round6(r.lng),
      hr: numOrNull(r.hr),
      cad: numOrNull(r.cad),
      speed: numOrNull(r.speed),
      alt: numOrNull(r.alt),
    })),
    laps: Array.isArray(stream.laps) ? stream.laps : [],
  }
}

const isConstraintError = (err) =>
  err?.name === 'ConstraintError' || err?.inner?.name === 'ConstraintError'

let persistAttempted = false
export async function requestPersistence() {
  if (persistAttempted) return null
  persistAttempted = true
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return null
    if (await navigator.storage.persisted?.()) return true
    return await navigator.storage.persist()
  } catch {
    return null
  }
}

/**
 * Satu transaksi rw atas activities dan streams: keduanya tersimpan atau keduanya batal.
 * @returns {Promise<{status:'saved', id:number, fingerprint:string} | {status:'duplicate', fingerprint:string}>}
 */
export async function saveRunActivity(summary, stream = null) {
  const record = buildActivityRecord(summary)
  const streamRow = buildStreamRow(stream)
  record.bestEfforts = bestEffortsForActivity(record, streamRow?.records) // cache untuk PB dan Riegel
  try {
    const id = await db.transaction('rw', db.activities, db.streams, async () => {
      const newId = await db.activities.add(record)
      if (streamRow) await db.streams.add({ activityId: newId, ...streamRow })
      return newId
    })
    requestPersistence()
    return { status: 'saved', id, fingerprint: record.fingerprint }
  } catch (err) {
    if (isConstraintError(err)) return { status: 'duplicate', fingerprint: record.fingerprint }
    throw err
  }
}

const EDITABLE_FIELDS = ['distanceCategory', 'workoutType', 'title']

// Hanya field kategori dan judul yang boleh diubah setelah disimpan.
export async function updateRunActivity(id, patch) {
  const clean = Object.fromEntries(Object.entries(patch).filter(([k]) => EDITABLE_FIELDS.includes(k)))
  if (Object.keys(clean).length === 0) return 0
  return db.activities.update(id, clean)
}

export async function deleteRunActivity(id) {
  await db.transaction('rw', db.activities, db.streams, async () => {
    await db.streams.delete(id)
    await db.activities.delete(id)
  })
}

export async function getSetting(key) {
  const row = await db.settings.get(key)
  return row ? row.value : (DEFAULT_SETTINGS[key] ?? null)
}

export async function setSetting(key, value) {
  if (typeof key !== 'string' || key === '') throw new Error('Kunci pengaturan tidak valid')
  await db.settings.put({ key, value })
  return value
}

export async function getAllSettings() {
  const rows = await db.settings.toArray()
  return { ...DEFAULT_SETTINGS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) }
}
