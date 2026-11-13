import { parseFitFile, parseGpxFile, classifyDistance } from './fileParsers.js'
import { buildMetrics } from './runAnalytics.js'
import { saveRunActivity } from '../db/runDatabase.js'

export const MAX_FILE_BYTES = 25 * 1024 * 1024

const fail = (message) => ({ status: 'gagal', message })

/** Impor satu file .fit/.gpx. Tidak pernah melempar error: hasilnya selalu objek status. */
export async function importRunFile(file, { workoutType = 'Easy Run', profile = {} } = {}) {
  try {
    if (file.size > MAX_FILE_BYTES) {
      return fail(`Ukuran file ${(file.size / 1048576).toFixed(1)} MB melebihi batas 25 MB`)
    }
    const ext = String(file.name).split('.').pop().toLowerCase()
    if (ext !== 'fit' && ext !== 'gpx') return fail('Format tidak didukung. Gunakan file .fit atau .gpx')

    const { summary, stream } = ext === 'fit' ? await parseFitFile(file) : await parseGpxFile(file)
    const distanceCategory = classifyDistance(summary.distanceKm)
    const full = {
      ...summary,
      rpe: null,
      ...buildMetrics(summary, stream?.records, profile),
      distanceCategory,
      workoutType,
    }
    const res = await saveRunActivity(full, stream)
    if (res.status === 'duplicate') return { status: 'duplikat', message: 'Sudah ada, dilewati' }
    return {
      status: 'berhasil',
      message: `${summary.distanceKm.toFixed(2).replace('.', ',')} km`,
      id: res.id,
      distanceCategory,
      workoutType,
    }
  } catch (err) {
    if (err?.name === 'QuotaExceededError') return fail('Penyimpanan perangkat penuh')
    return fail(err?.message || 'Gagal memproses file')
  }
}
