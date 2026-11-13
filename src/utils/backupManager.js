import { db, getAllSettings, setSetting, saveRunActivity, DEFAULT_SETTINGS } from '../db/runDatabase.js'
import {
  BACKUP_APP, BACKUP_FORMAT_VERSION, PROFILE_KEYS, BackupError, validateHeader, sanitizeProfile, planKey,
  readLines, linesFromText, buildCsv,
} from './backupFormat.js'
import { localDateOf } from './dateUtils.js'

export * from './backupFormat.js'

const HR_KEYS = ['hrMax', 'hrRest', 'sex']
const EXPORT_BATCH = 20

// ---------- Ekspor ----------

/**
 * Menghasilkan baris JSONL satu per satu (satu aktivitas per iterasi) agar memori terjaga.
 * mode 'full' = dengan stream GPS, 'compact' = tanpa stream. `id` tidak diekspor; stream menempel pada aktivitasnya.
 */
export async function* exportBackupLines({ mode = 'full', now = Date.now(), counts = {} } = {}) {
  counts.runs = 0
  counts.plans = 0
  const settings = await getAllSettings()
  yield `${JSON.stringify({
    type: 'header', app: BACKUP_APP, formatVersion: BACKUP_FORMAT_VERSION, exportedAt: new Date(now).toISOString(),
    mode, settings: { ...settings, lastBackupAt: now },
  })}\n`

  const ids = await db.activities.orderBy('startTimeMs').primaryKeys()
  for (let i = 0; i < ids.length; i += EXPORT_BATCH) {
    const chunk = ids.slice(i, i + EXPORT_BATCH)
    const [acts, streams] = await Promise.all([
      db.activities.bulkGet(chunk),
      mode === 'full' ? db.streams.bulkGet(chunk) : Promise.resolve([]),
    ])
    for (let j = 0; j < chunk.length; j += 1) {
      if (!acts[j]) continue
      const { id: _id, bestEfforts: _cache, ...activity } = acts[j] // cache dihitung ulang saat impor
      const row = streams[j]
      const stream = mode === 'full' && row ? { records: row.records, laps: row.laps ?? [] } : null
      counts.runs += 1
      yield `${JSON.stringify({ type: 'run', activity, stream })}\n`
    }
  }

  for (const plan of await db.plans.toArray()) {
    const workouts = (await db.plannedWorkouts.where('planId').equals(plan.id).toArray()).map(({ id: _w, planId: _p, ...w }) => w)
    const { id: _id, ...planRow } = plan
    counts.plans += 1
    yield `${JSON.stringify({ type: 'plan', plan: planRow, workouts })}\n`
  }
}

/** Bangun Blob dari potongan baris, lalu catat settings.lastBackupAt. */
export async function exportBackup({ mode = 'full', now = Date.now() } = {}) {
  const chunks = []
  const counts = {}
  for await (const line of exportBackupLines({ mode, now, counts })) chunks.push(line)
  const blob = new Blob(chunks, { type: 'application/x-ndjson' })
  await setSetting('lastBackupAt', now)
  return { blob, counts, filename: `runmetrics-backup-${localDateOf(now)}-${mode === 'full' ? 'lengkap' : 'ringkas'}.jsonl` }
}

export async function exportCsv({ delimiter = ',' } = {}) {
  const activities = await db.activities.orderBy('startTimeMs').toArray()
  const blob = new Blob([buildCsv(activities, { delimiter })], { type: 'text/csv;charset=utf-8' })
  return { blob, count: activities.length, filename: `runmetrics-aktivitas-${localDateOf(Date.now())}.csv` }
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30000) // ditunda agar unduhan sempat dimulai
}

// ---------- Impor ----------

const isCustomized = (s) =>
  s.hrMax !== null || s.hrRest !== null || s.sex !== null ||
  s.riegelExponent !== DEFAULT_SETTINGS.riegelExponent || s.weeklyTargetKm !== DEFAULT_SETTINGS.weeklyTargetKm

async function applyProfile(headerSettings, confirmProfile, report) {
  const incoming = sanitizeProfile(headerSettings)
  const current = await getAllSettings()
  const changed = PROFILE_KEYS.filter((k) => k in incoming && (current[k] ?? null) !== (incoming[k] ?? null))
  if (changed.length === 0) {
    report.profile = 'sama'
    return
  }
  let apply = true
  if (isCustomized(current)) {
    // Profil sudah ada dan berbeda: tanya dulu. Tanpa penjawab, profil yang ada dipertahankan.
    apply = confirmProfile
      ? await confirmProfile({ current: Object.fromEntries(PROFILE_KEYS.map((k) => [k, current[k] ?? null])), incoming })
      : false
  }
  if (!apply) {
    report.profile = 'dipertahankan'
    return
  }
  const hadActivities = (await db.activities.count()) > 0
  await db.transaction('rw', db.settings, async () => {
    for (const k of changed) await setSetting(k, incoming[k])
    if (hadActivities && changed.some((k) => HR_KEYS.includes(k))) await setSetting('trimpStale', true)
  })
  report.profile = 'diterapkan'
}

async function importRun(obj, report) {
  const a = obj.activity
  if (!a || typeof a !== 'object') throw new Error('Baris run tanpa data activity')
  if (a.fingerprint && (await db.activities.where('fingerprint').equals(a.fingerprint).count()) > 0) {
    report.duplicates += 1
    return
  }
  const res = await saveRunActivity(a, obj.stream ?? null) // ID baru otomatis cocok dengan stream-nya
  if (res.status === 'duplicate') report.duplicates += 1
  else report.added += 1
}

async function importPlan(obj, report) {
  const plan = obj.plan
  if (!plan || typeof plan !== 'object') throw new Error('Baris plan tanpa data program')
  const key = planKey(plan)
  if ((await db.plans.filter((p) => planKey(p) === key).count()) > 0) {
    report.plansSkipped += 1
    return
  }
  const workouts = Array.isArray(obj.workouts) ? obj.workouts : []
  await db.transaction('rw', db.plans, db.plannedWorkouts, async () => {
    const { id: _id, ...planRow } = plan
    const planId = await db.plans.add(planRow)
    await db.plannedWorkouts.bulkAdd(workouts.map(({ id: _w, planId: _p, ...w }) => ({ ...w, planId }))) // activityFingerprint ikut
  })
  report.plansAdded += 1
}

/**
 * lines: iterable/async iterable string JSONL. Mengembalikan laporan; melempar BackupError bila header tidak valid
 * (sebelum menulis apa pun). Tiap baris diproses dalam try/catch sehingga satu baris rusak tidak menghentikan impor.
 * confirmProfile({ current, incoming }) -> Promise<boolean> dipanggil sebelum menimpa profil yang sudah ada.
 */
export async function importBackupLines(lines, { confirmProfile } = {}) {
  const report = { added: 0, duplicates: 0, failed: 0, ignored: 0, plansAdded: 0, plansSkipped: 0, profile: 'tidak ada', errors: [] }
  const fail = (msg) => {
    report.failed += 1
    if (report.errors.length < 5) report.errors.push(msg)
  }
  let headerSeen = false
  for await (const raw of lines) {
    const text = String(raw).replace(/^\uFEFF/, '')
    if (!text.trim()) continue
    let obj
    try {
      obj = JSON.parse(text)
    } catch {
      if (!headerSeen) throw new BackupError('Bukan file backup RunMetrics Lab (baris pertama bukan JSON).')
      fail('Baris bukan JSON yang valid')
      continue
    }
    if (!headerSeen) {
      validateHeader(obj)
      headerSeen = true
      await applyProfile(obj.settings, confirmProfile, report)
      continue
    }
    try {
      if (obj?.type === 'run') await importRun(obj, report)
      else if (obj?.type === 'plan') await importPlan(obj, report)
      else report.ignored += 1
    } catch (err) {
      fail(err?.message || 'Baris gagal diimpor')
    }
  }
  if (!headerSeen) throw new BackupError('File kosong atau bukan backup RunMetrics Lab.')
  return report
}

export async function importBackupFile(file, options) {
  const lines = typeof file.stream === 'function' ? readLines(file.stream()) : linesFromText(await file.text())
  return importBackupLines(lines, options)
}

// ---------- Penyimpanan ----------
export async function getStorageInfo() {
  const info = { usage: null, quota: null, persisted: null }
  try {
    if (typeof navigator === 'undefined' || !navigator.storage) return info
    const est = await navigator.storage.estimate?.()
    info.usage = est?.usage ?? null
    info.quota = est?.quota ?? null
    info.persisted = (await navigator.storage.persisted?.()) ?? null
  } catch {
    /* abaikan: tidak semua browser mendukung */
  }
  return info
}

export async function requestPersistentStorage() {
  try {
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}
