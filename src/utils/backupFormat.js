// Format backup JSON Lines, CSV, dan pengingat. Fungsi murni (tanpa DB) agar bisa diuji unit.
import { formatPace, formatDuration } from './dateUtils.js'

export const BACKUP_APP = 'runmetricslab'
export const BACKUP_FORMAT_VERSION = 1
export const PROFILE_KEYS = ['hrMax', 'hrRest', 'sex', 'riegelExponent', 'weeklyTargetKm']
const DAY_MS = 86400000

export class BackupError extends Error {
  constructor(message) {
    super(message)
    this.name = 'BackupError'
  }
}

/** Validasi baris header; menolak versi yang lebih baru dari yang didukung. */
export function validateHeader(obj) {
  if (!obj || obj.type !== 'header' || obj.app !== BACKUP_APP) {
    throw new BackupError('Bukan file backup RunMetrics Lab (header tidak dikenali).')
  }
  if (!Number.isInteger(obj.formatVersion) || obj.formatVersion < 1) throw new BackupError('Header backup tidak valid (formatVersion).')
  if (obj.formatVersion > BACKUP_FORMAT_VERSION) {
    throw new BackupError(
      `Backup berformat versi ${obj.formatVersion}, lebih baru dari yang didukung aplikasi ini (versi ${BACKUP_FORMAT_VERSION}). Perbarui aplikasi lalu coba lagi.`,
    )
  }
  return obj
}

/** Ambil hanya kunci profil yang valid dari settings backup; kunci tak valid atau hilang dilewati. */
export function sanitizeProfile(s = {}) {
  const out = {}
  const range = (key, lo, hi) => {
    if (s[key] === null) out[key] = null
    else if (typeof s[key] === 'number' && Number.isFinite(s[key]) && s[key] >= lo && s[key] <= hi) out[key] = s[key]
  }
  range('hrMax', 100, 230)
  range('hrRest', 30, 120)
  if (s.sex === null || s.sex === 'male' || s.sex === 'female') out.sex = s.sex
  if (typeof s.riegelExponent === 'number' && s.riegelExponent >= 1 && s.riegelExponent <= 1.2) out.riegelExponent = s.riegelExponent
  if (typeof s.weeklyTargetKm === 'number' && s.weeklyTargetKm >= 1 && s.weeklyTargetKm <= 500) out.weeklyTargetKm = s.weeklyTargetKm
  return out
}

/** Program tidak punya fingerprint; identitasnya dari kombinasi field ini (mencegah duplikat saat impor ulang). */
export const planKey = (p) => `${p?.createdAt}|${p?.name}|${p?.totalWeeks}|${p?.raceDate}`

/** Baca ReadableStream (atau objek dengan getReader) per baris, aman untuk karakter UTF-8 yang terpotong antar potongan. */
export async function* readLines(readable) {
  const reader = readable.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let idx = buf.indexOf('\n')
      while (idx >= 0) {
        const line = buf.slice(0, idx)
        buf = buf.slice(idx + 1)
        if (line.trim()) yield line
        idx = buf.indexOf('\n')
      }
    }
    buf += decoder.decode()
    if (buf.trim()) yield buf
  } finally {
    reader.releaseLock?.()
  }
}

export function* linesFromText(text) {
  for (const line of text.split('\n')) if (line.trim()) yield line
}

// ---------- CSV ----------
const CSV_COLUMNS = [
  'tanggal', 'judul', 'workoutType', 'distanceCategory', 'jarak km', 'durasi hh:mm:ss', 'pace m:ss',
  'avgHr', 'maxHr', 'avgCadence', 'elevationGain', 'trimp', 'efficiencyFactor', 'rpe', 'source',
]

/**
 * CSV UTF-8 dengan BOM. delimiter ',' atau ';' (Excel berlokal Indonesia memakai ';' dan koma desimal).
 * Teks yang diawali = + - @ diberi awalan ' (mencegah formula injection); tanda kutip di-escape.
 */
export function buildCsv(activities, { delimiter = ',' } = {}) {
  const dec = delimiter === ';' ? ',' : '.'
  const quote = (s) => (s.includes('"') || s.includes(delimiter) || /[\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const text = (v) => {
    let s = v === null || v === undefined ? '' : String(v)
    if (/^[=+\-@]/.test(s)) s = `'${s}`
    return quote(s)
  }
  const fixed = (v, d) => (Number.isFinite(v) ? v.toFixed(d).replace('.', dec) : '')
  const trim = (v, d) => (Number.isFinite(v) ? String(Number(v.toFixed(d))).replace('.', dec) : '')
  const sorted = [...(activities ?? [])].sort((a, b) => String(a.date).localeCompare(String(b.date)) || (a.startTimeMs ?? 0) - (b.startTimeMs ?? 0))
  const rows = sorted.map((a) => [
    text(a.date), text(a.title), text(a.workoutType), text(a.distanceCategory),
    fixed(a.distanceKm, 2),
    Number.isFinite(a.durationSec) ? formatDuration(a.durationSec) : '',
    Number.isFinite(a.avgPaceSec) && a.avgPaceSec > 0 ? formatPace(a.avgPaceSec) : '',
    trim(a.avgHr, 1), trim(a.maxHr, 1), trim(a.avgCadence, 1), trim(a.elevationGain, 1),
    trim(a.trimp, 1), trim(a.efficiencyFactor, 3), trim(a.rpe, 0), text(a.source),
  ].join(delimiter))
  return `\uFEFF${[CSV_COLUMNS.map(quote).join(delimiter), ...rows].join('\r\n')}\r\n`
}

// ---------- Pengingat backup ----------
/**
 * Banner bila backup terakhir > 30 hari atau ada >= 20 sesi baru sejak backup terakhir.
 * Belum pernah backup: acuannya data tertua. createdAts = createdAt semua aktivitas (ms).
 */
export function backupReminder({ lastBackupAt, createdAts, now = Date.now() }) {
  const list = (createdAts ?? []).filter(Number.isFinite)
  if (list.length === 0) return null
  const hasBackup = Number.isFinite(lastBackupAt)
  const newSessions = hasBackup ? list.filter((c) => c > lastBackupAt).length : list.length
  const ref = hasBackup ? lastBackupAt : Math.min(...list)
  const daysSince = Math.floor((now - ref) / DAY_MS)
  if (hasBackup && now - lastBackupAt > 30 * DAY_MS) {
    return { reason: 'age', daysSince, newSessions, message: `Backup terakhir ${daysSince} hari lalu. Simpan backup agar datamu aman.` }
  }
  if (newSessions >= 20) {
    return {
      reason: hasBackup ? 'sessions' : 'never', daysSince, newSessions,
      message: hasBackup ? `${newSessions} sesi baru sejak backup terakhir. Saatnya backup.` : `Kamu punya ${newSessions} sesi yang belum pernah dibackup.`,
    }
  }
  if (!hasBackup && now - ref > 30 * DAY_MS) {
    return { reason: 'never', daysSince, newSessions, message: 'Datamu belum pernah dibackup. Data hanya ada di browser ini.' }
  }
  return null
}
