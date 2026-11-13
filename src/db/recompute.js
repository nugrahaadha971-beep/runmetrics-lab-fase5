import { db, getAllSettings, setSetting } from './runDatabase.js'
import { calcTrimp, bestEffortsForActivity } from '../utils/runAnalytics.js'

const BATCH = 50

// Proses aktivitas per 50 per transaksi; worker(activity, records) mengembalikan perubahan field.
async function runBatches(ids, worker, onProgress) {
  let done = 0
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH)
    await db.transaction('rw', db.activities, db.streams, async () => {
      const [acts, streams] = await Promise.all([db.activities.bulkGet(chunk), db.streams.bulkGet(chunk)])
      for (let j = 0; j < chunk.length; j += 1) {
        if (!acts[j]) continue
        await db.activities.update(chunk[j], worker(acts[j], streams[j]?.records))
      }
    })
    done += chunk.length
    onProgress?.(done, ids.length)
  }
}

/** Hitung ulang TRIMP dan best effort semua aktivitas dari stream (atau avgHr / ringkasan). */
export async function recalculateAllTrimp(onProgress) {
  const profile = await getAllSettings()
  const ids = await db.activities.toCollection().primaryKeys()
  await runBatches(
    ids,
    (a, records) => ({ trimp: calcTrimp(a, records, profile), bestEfforts: bestEffortsForActivity(a, records) }),
    onProgress,
  )
  await setSetting('trimpStale', false)
  return { total: ids.length }
}

let backfillRun = null

/** Isi cache best effort untuk aktivitas lama yang belum punya (satu proses pada satu waktu). */
export function backfillBestEfforts(onProgress) {
  if (!backfillRun) {
    backfillRun = (async () => {
      const ids = await db.activities.filter((a) => a.bestEfforts === undefined).primaryKeys()
      if (ids.length > 0) await runBatches(ids, (a, records) => ({ bestEfforts: bestEffortsForActivity(a, records) }), onProgress)
      return { total: ids.length }
    })().finally(() => { backfillRun = null })
  }
  return backfillRun
}
