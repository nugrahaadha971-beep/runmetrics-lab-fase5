// Fungsi murni (tanpa DB atau DOM). Nilai yang tidak bisa dihitung = null (tidak pernah NaN, Infinity, atau 0 palsu).
import { addDays, daysBetween } from './dateUtils.js'
import { haversine, movingAverage } from './fileParsers.js'

const finite = Number.isFinite
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

export const TRIMP_COEF = { male: { a: 0.64, b: 1.92 }, female: { a: 0.86, b: 1.67 } }

// 3.1 Pace (detik per km)
export function calcPace(durationSec, distanceKm) {
  if (!finite(durationSec) || !finite(distanceKm) || distanceKm <= 0 || durationSec <= 0) return null
  return durationSec / distanceKm
}

export function isHrProfileValid(p) {
  return !!p && finite(p.hrMax) && finite(p.hrRest) && p.hrRest < p.hrMax && Object.hasOwn(TRIMP_COEF, p.sex)
}

// 3.2 TRIMP Banister: sum( dt_menit * HRr * a * e^(b * HRr) ), HRr dibatasi 0..1
function trimpStep(minutes, hr, p) {
  const { a, b } = TRIMP_COEF[p.sex]
  const r = clamp((hr - p.hrRest) / (p.hrMax - p.hrRest), 0, 1)
  return minutes * r * a * Math.exp(b * r)
}

export function calcTrimpFromAvg(durationSec, avgHr, profile) {
  if (!isHrProfileValid(profile) || !finite(avgHr) || !finite(durationSec) || durationSec <= 0) return null
  return trimpStep(durationSec / 60, avgHr, profile)
}

export function calcTrimpFromStream(records, profile) {
  if (!isHrProfileValid(profile) || !Array.isArray(records)) return null
  let total = 0
  let used = 0
  for (let i = 1; i < records.length; i += 1) {
    const dt = records[i].t - records[i - 1].t
    const hr = records[i].hr
    if (!finite(dt) || dt <= 0 || dt > 30 || !finite(hr)) continue
    total += trimpStep(dt / 60, hr, profile)
    used += 1
  }
  return used > 0 ? total : null
}

// Stream bila ada, jika tidak pakai avgHr dan seluruh durasi.
export function calcTrimp(activity, records, profile) {
  return calcTrimpFromStream(records, profile) ?? calcTrimpFromAvg(activity?.durationSec, activity?.avgHr, profile)
}

// 3.3 sRPE = RPE x durasi (menit)
export function calcSrpe(rpe, durationSec) {
  if (!finite(rpe) || !finite(durationSec) || durationSec <= 0) return null
  return rpe * (durationSec / 60)
}

// 3.5 Efficiency Factor = (jarak m / durasi menit) / HR rata-rata
export function calcEF(distanceKm, durationSec, avgHr) {
  if (!finite(distanceKm) || !finite(durationSec) || !finite(avgHr) || distanceKm <= 0 || durationSec <= 0 || avgHr <= 0) return null
  return (distanceKm * 1000) / (durationSec / 60) / avgHr
}

export function buildMetrics({ distanceKm, durationSec, avgHr, rpe }, records, profile) {
  return {
    avgPaceSec: calcPace(durationSec, distanceKm),
    efficiencyFactor: calcEF(distanceKm, durationSec, avgHr),
    srpe: calcSrpe(rpe, durationSec),
    trimp: calcTrimp({ durationSec, avgHr }, records, profile),
  }
}

// ======================================================================
// 3.3 Beban latihan (load) dan fallback sRPE
// ======================================================================
const median = (arr) => {
  const a = [...arr].sort((x, y) => x - y)
  const m = Math.floor(a.length / 2)
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2
}

/** Median trimp/srpe pada aktivitas yang punya keduanya (minimal 5 sesi); jika kurang, 0.25. */
export function srpeToTrimpFactor(activities) {
  const ratios = (activities ?? [])
    .filter((a) => finite(a.trimp) && a.trimp > 0 && finite(a.srpe) && a.srpe > 0)
    .map((a) => a.trimp / a.srpe)
  return ratios.length >= 5 ? median(ratios) : 0.25
}

/** trimp bila ada; jika tidak, srpe x factor (loadSource 'srpe'); jika tidak ada keduanya, load null. */
export function resolveLoad(activity, factor = 0.25) {
  if (finite(activity?.trimp)) return { load: activity.trimp, loadSource: 'trimp' }
  if (finite(activity?.srpe)) return { load: activity.srpe * factor, loadSource: 'srpe' }
  return { load: null, loadSource: null }
}

// ======================================================================
// 3.4 ACWR (rolling average 7:28), berdasarkan date lokal
// ======================================================================
export const ACWR_NOTE = 'ACWR adalah indikator tren beban latihan, bukan diagnosis cedera.'
export const ACWR_INSUFFICIENT = 'Data belum cukup (< 4 minggu)'
export const ACWR_ZONES = [
  { key: 'low', label: 'Beban rendah' },
  { key: 'optimal', label: 'Optimal' },
  { key: 'caution', label: 'Waspada' },
  { key: 'high', label: 'Risiko tinggi' },
]

/** < 0.8 rendah, 0.8 sampai 1.3 optimal, di atas 1.3 sampai 1.5 waspada, di atas 1.5 risiko tinggi. */
export function acwrZone(value) {
  if (!finite(value)) return null
  const key = value < 0.8 ? 'low' : value <= 1.3 ? 'optimal' : value <= 1.5 ? 'caution' : 'high'
  return ACWR_ZONES.find((z) => z.key === key)
}

/**
 * today = 'YYYY-MM-DD' lokal. Hari tanpa lari = 0; aktivitas tanpa beban dihitung 0 dan dihitung jumlahnya
 * (noLoadCount hanya untuk jendela 28 hari, karena hanya itu yang memengaruhi ACWR).
 * status: 'ok' | 'insufficient' (aktivitas pertama belum >= 27 hari lalu) | 'chronic_zero'.
 */
export function calcAcwr(activities, today, factor = 0.25) {
  const list = activities ?? []
  const daily = new Map()
  let noLoadCount = 0
  let first = null
  for (const a of list) {
    if (typeof a.date !== 'string') continue
    if (first === null || a.date < first) first = a.date
    const age = daysBetween(a.date, today)
    if (age < 0 || age > 27) continue
    const { load } = resolveLoad(a, factor)
    if (load === null) noLoadCount += 1
    else daily.set(a.date, (daily.get(a.date) ?? 0) + load)
  }
  let acuteSum = 0
  let chronicSum = 0
  for (let i = 0; i < 28; i += 1) {
    const v = daily.get(addDays(today, -i)) ?? 0
    chronicSum += v
    if (i < 7) acuteSum += v
  }
  const acute = acuteSum / 7
  const chronic = chronicSum / 28
  const base = { acute, chronic, noLoadCount }
  if (first === null || daysBetween(first, today) < 27) {
    return { ...base, status: 'insufficient', acwr: null, zone: null, message: ACWR_INSUFFICIENT }
  }
  if (!(chronic > 0)) return { ...base, status: 'chronic_zero', acwr: null, zone: null, message: '—' }
  const acwr = acute / chronic
  return { ...base, status: 'ok', acwr, zone: acwrZone(acwr), message: null }
}

// ======================================================================
// Deret waktu bergerak dari stream (dasar best effort, split, dan drift)
// ======================================================================
const PAUSE_DT = 10 // detik
const PAUSE_SPEED = 0.3 // m/s

/**
 * Jarak kumulatif = integral speed x dt (speed di akhir interval; tanpa speed dipakai haversine GPS).
 * Waktu bergerak (mov) tidak menghitung jeda: dt > 10 detik dan kecepatan < 0.3 m/s.
 * totalDistanceM (opsional) mengkalibrasi jarak ke jarak sesi bila selisihnya <= 10%.
 */
export function buildSeries(records, totalDistanceM = null) {
  const t = []
  const mov = []
  const dist = []
  const speed = []
  const hr = []
  const alt = []
  let prev = null
  for (const r of records ?? []) {
    if (!finite(r?.t)) continue
    const hrV = finite(r.hr) ? r.hr : null
    const altV = finite(r.alt) ? r.alt : null
    if (prev === null) {
      t.push(r.t); mov.push(0); dist.push(0); speed.push(finite(r.speed) ? Math.max(0, r.speed) : 0)
      hr.push(hrV); alt.push(altV); prev = r
      continue
    }
    const dt = r.t - prev.t
    if (dt <= 0) continue
    let v = finite(r.speed) ? Math.max(0, r.speed) : null
    if (v === null) {
      const gps = finite(r.lat) && finite(r.lng) && finite(prev.lat) && finite(prev.lng)
      v = gps ? haversine(prev.lat, prev.lng, r.lat, r.lng) / dt : 0
    }
    const paused = dt > PAUSE_DT && v < PAUSE_SPEED
    t.push(r.t)
    mov.push(mov[mov.length - 1] + (paused ? 0 : dt))
    dist.push(dist[dist.length - 1] + (paused ? 0 : v * dt))
    speed.push(v); hr.push(hrV); alt.push(altV)
    prev = r
  }
  const last = dist[dist.length - 1]
  if (finite(totalDistanceM) && totalDistanceM > 0 && last > 0) {
    const ratio = totalDistanceM / last
    if (ratio >= 0.9 && ratio <= 1.1) for (let i = 0; i < dist.length; i += 1) dist[i] *= ratio
  }
  return { t, mov, dist, speed, hr, alt }
}

// Interpolasi linear y(p) pada xs yang tidak menurun; di luar jangkauan = nilai tepi.
function interp(xs, ys, p) {
  const n = xs.length
  if (p <= xs[0]) return ys[0]
  if (p >= xs[n - 1]) return ys[n - 1]
  let lo = 1
  let hi = n - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (xs[mid] >= p) hi = mid
    else lo = mid + 1
  }
  return ys[lo - 1] + ((ys[lo] - ys[lo - 1]) * (p - xs[lo - 1])) / (xs[lo] - xs[lo - 1])
}

// Bobot interval [mov[i-1], mov[i]] yang beririsan dengan [lo, hi].
const overlap = (mov, i, lo, hi) => Math.max(0, Math.min(mov[i], hi) - Math.max(mov[i - 1], lo))

// ======================================================================
// 3.7 Best effort dan Personal Best
// ======================================================================
export const BEST_DISTANCES = [
  { key: '5K', meters: 5000 },
  { key: '10K', meters: 10000 },
  { key: '21.1K', meters: 21097.5 },
  { key: '42.2K', meters: 42195 },
]

/**
 * Waktu tercepat untuk menempuh tepat D meter. Dua penunjuk pada jarak kumulatif; batas jendela
 * diinterpolasi linear. Sampel yang jarak kumulatifnya turun dibuang. null bila total jarak < D.
 */
export function fastestWindow(dist, time, D) {
  const d = []
  const tm = []
  let maxD = -Infinity
  for (let i = 0; i < dist.length; i += 1) {
    if (!finite(dist[i]) || !finite(time[i]) || dist[i] < maxD) continue
    maxD = dist[i]; d.push(dist[i]); tm.push(time[i])
  }
  const n = d.length
  if (n < 2 || !(D > 0) || d[n - 1] - d[0] < D - 1e-9) return null
  let best = Infinity

  // Akhir jendela di sampel j, awal diinterpolasi.
  let i = 0
  for (let j = 0; j < n; j += 1) {
    const s = d[j] - D
    if (s < d[0] - 1e-9) continue
    const sc = Math.max(s, d[0])
    while (i + 1 < n && d[i + 1] <= sc) i += 1
    if (i + 1 >= n) { best = Math.min(best, tm[j] - tm[i]); continue }
    const ts = tm[i] + ((tm[i + 1] - tm[i]) * (sc - d[i])) / (d[i + 1] - d[i])
    best = Math.min(best, tm[j] - ts)
  }
  // Awal jendela di sampel i, akhir diinterpolasi.
  let j = 0
  for (let k = 0; k < n; k += 1) {
    let e = d[k] + D
    if (e > d[n - 1]) {
      if (e - d[n - 1] > 1e-9) break
      e = d[n - 1]
    }
    while (j < n && d[j] < e) j += 1
    if (j >= n) j = n - 1
    const te = j > 0 && d[j] > d[j - 1] ? tm[j - 1] + ((tm[j] - tm[j - 1]) * (e - d[j - 1])) / (d[j] - d[j - 1]) : tm[j]
    best = Math.min(best, te - tm[k])
  }
  return Number.isFinite(best) ? best : null
}

export function bestEffortFromRecords(records, D, totalDistanceM = null) {
  const s = buildSeries(records, totalDistanceM)
  const timeSec = fastestWindow(s.dist, s.mov, D)
  return timeSec === null ? null : { timeSec, paceSec: timeSec / (D / 1000) }
}

/** Aktivitas tanpa stream: kandidat bila jarak di [0.995 D, 1.02 D]; waktu = durasi x D / jarak (perkiraan). */
export function bestEffortFromSummary(activity, D) {
  const m = (activity?.distanceKm ?? NaN) * 1000
  if (!finite(m) || !finite(activity?.durationSec) || activity.durationSec <= 0) return null
  if (m < 0.995 * D || m > 1.02 * D) return null
  const timeSec = (activity.durationSec * D) / m
  return { timeSec, paceSec: timeSec / (D / 1000) }
}

/** Best effort satu aktivitas (disimpan di baris aktivitas): [{ key, distanceM, timeSec, paceSec, estimated }]. */
export function bestEffortsForActivity(activity, records) {
  const hasStream = Array.isArray(records) && records.length > 1
  const out = []
  for (const { key, meters } of BEST_DISTANCES) {
    const r = hasStream
      ? bestEffortFromRecords(records, meters, (activity?.distanceKm ?? NaN) * 1000)
      : bestEffortFromSummary(activity, meters)
    if (r) out.push({ key, distanceM: meters, timeSec: r.timeSec, paceSec: r.paceSec, estimated: !hasStream })
  }
  return out
}

const withMeta = (a, e) => ({
  key: e.key, distanceM: e.distanceM, activityId: a.id ?? null, date: a.date ?? null,
  startTimeMs: a.startTimeMs ?? null, title: a.title ?? null, workoutType: a.workoutType ?? null,
  timeSec: e.timeSec, paceSec: e.paceSec, estimated: !!e.estimated,
})

/** items: [{ activity, records }]. Satu baris per (aktivitas, jarak). raceOnly = hanya workoutType 'Race'. */
export function collectBestEfforts(items, { raceOnly = false } = {}) {
  const out = []
  for (const { activity, records } of items ?? []) {
    if (raceOnly && activity.workoutType !== 'Race') continue
    for (const e of bestEffortsForActivity(activity, records)) out.push(withMeta(activity, e))
  }
  return out
}

/** Sama seperti collectBestEfforts tetapi membaca cache `bestEfforts` di baris aktivitas (tanpa membuka stream). */
export function effortsFromActivities(activities, { raceOnly = false } = {}) {
  const out = []
  for (const a of activities ?? []) {
    if (raceOnly && a.workoutType !== 'Race') continue
    for (const e of a.bestEfforts ?? []) out.push(withMeta(a, e))
  }
  return out
}

/** PB per jarak = waktu terkecil (seri: yang lebih awal). Hasil: { '5K': effort|null, ... }. */
export function personalBests(efforts) {
  const pb = Object.fromEntries(BEST_DISTANCES.map((b) => [b.key, null]))
  for (const e of efforts ?? []) {
    const cur = pb[e.key]
    if (!cur || e.timeSec < cur.timeSec || (e.timeSec === cur.timeSec && (e.startTimeMs ?? 0) < (cur.startTimeMs ?? 0))) pb[e.key] = e
  }
  return pb
}

/** Riwayat PB untuk satu jarak: setiap kali rekor terpecahkan, urut waktu. */
export function pbHistory(efforts, key) {
  const list = (efforts ?? []).filter((e) => e.key === key).sort((a, b) => (a.startTimeMs ?? 0) - (b.startTimeMs ?? 0))
  const out = []
  let best = Infinity
  for (const e of list) {
    if (e.timeSec < best) { best = e.timeSec; out.push(e) }
  }
  return out
}

// ======================================================================
// 3.8 Prediksi Riegel
// ======================================================================
export const RIEGEL_TARGETS = BEST_DISTANCES

export function riegelTime(t1, d1, d2, k = 1.06) {
  if (![t1, d1, d2, k].every(finite) || t1 <= 0 || d1 <= 0 || d2 <= 0) return null
  return t1 * (d2 / d1) ** k
}

/** Kandidat referensi: best effort dalam `days` hari terakhir, terbaru dulu (seri: jarak lebih panjang dulu). */
export function riegelCandidates(efforts, today, days = 90) {
  return (efforts ?? [])
    .filter((e) => typeof e.date === 'string' && daysBetween(e.date, today) >= 0 && daysBetween(e.date, today) <= days)
    .sort((a, b) => (b.startTimeMs ?? 0) - (a.startTimeMs ?? 0) || b.distanceM - a.distanceM)
}

/** Default: best effort terbaru dengan D >= 5 km. */
export function defaultRiegelReference(candidates) {
  return (candidates ?? []).find((e) => e.distanceM >= 5000) ?? null
}

/** Prediksi untuk 5K, 10K, 21,0975 km, 42,195 km; unreliable bila D2/D1 > 2. */
export function riegelPredict(ref, k = 1.06) {
  if (!ref) return []
  return RIEGEL_TARGETS.map(({ key, meters }) => {
    const timeSec = riegelTime(ref.timeSec, ref.distanceM, meters, k)
    return {
      key, distanceM: meters, timeSec,
      paceSec: timeSec === null ? null : timeSec / (meters / 1000),
      unreliable: meters / ref.distanceM > 2,
    }
  })
}

// ======================================================================
// 3.9 Split per km
// ======================================================================
/** [{ km, label, distanceKm, timeSec, paceSec, avgHr, elevDelta, partial }]; km terakhir tak penuh berlabel mis. '0.42 km'. */
export function splitsPerKm(records, totalDistanceM = null) {
  const s = buildSeries(records, totalDistanceM)
  const n = s.t.length
  const total = n > 1 ? s.dist[n - 1] : 0
  if (!(total > 0)) return []

  const altIdx = s.alt.map((a, i) => (a === null ? -1 : i)).filter((i) => i >= 0)
  const altD = altIdx.map((i) => s.dist[i])
  const altV = altIdx.length >= 2 ? movingAverage(altIdx.map((i) => s.alt[i])) : null

  const bounds = [0]
  for (let m = 1000; m <= total + 1e-9; m += 1000) bounds.push(Math.min(m, total))
  if (total - bounds[bounds.length - 1] >= 10) bounds.push(total)

  const out = []
  for (let b = 1; b < bounds.length; b += 1) {
    const [d0, d1] = [bounds[b - 1], bounds[b]]
    const [t0, t1] = [interp(s.dist, s.mov, d0), interp(s.dist, s.mov, d1)]
    let wSum = 0
    let hrSum = 0
    for (let i = 1; i < n; i += 1) {
      if (s.hr[i] === null) continue
      const w = overlap(s.mov, i, t0, t1)
      wSum += w; hrSum += w * s.hr[i]
    }
    const distanceKm = (d1 - d0) / 1000
    const partial = d1 - d0 < 1000 - 1e-6
    const timeSec = t1 - t0
    out.push({
      km: b,
      label: partial ? `${distanceKm.toFixed(2)} km` : String(b),
      distanceKm,
      timeSec,
      paceSec: timeSec > 0 ? timeSec / distanceKm : null,
      avgHr: wSum > 0 ? hrSum / wSum : null,
      elevDelta: altV ? Math.round((interp(altD, altV, d1) - interp(altD, altV, d0)) * 10) / 10 : null,
      partial,
    })
  }
  return out
}

// ======================================================================
// 3.6 Cardiac drift (Pa:HR)
// ======================================================================
export const DRIFT_WARNING = 'ketahanan aerobik perlu diperhatikan'

/**
 * Syarat: stream dengan HR dan speed, waktu bergerak >= 40 menit, workoutType Easy Run atau Long Run.
 * Buang 10 menit pertama, bagi sisanya dua paruh sama panjang; EF paruh = rata-rata speed (m/menit) / rata-rata HR.
 */
export function cardiacDrift(activity, records) {
  if (activity?.workoutType !== 'Easy Run' && activity?.workoutType !== 'Long Run') return null
  if (!Array.isArray(records) || !records.some((r) => finite(r.hr)) || !records.some((r) => finite(r.speed))) return null
  const s = buildSeries(records, (activity.distanceKm ?? NaN) * 1000)
  const n = s.t.length
  const total = n > 1 ? s.mov[n - 1] : 0
  if (total < 40 * 60) return null

  const lo = 600
  const mid = lo + (total - lo) / 2
  const efOf = (from, to) => {
    let w = 0
    let sp = 0
    let hr = 0
    for (let i = 1; i < n; i += 1) {
      if (s.hr[i] === null) continue
      const wi = overlap(s.mov, i, from, to)
      w += wi; sp += wi * s.speed[i]; hr += wi * s.hr[i]
    }
    return w > 0 && hr > 0 && sp > 0 ? ((sp / w) * 60) / (hr / w) : null
  }
  const ef1 = efOf(lo, mid)
  const ef2 = efOf(mid, total)
  if (ef1 === null || ef2 === null) return null
  const driftPct = ((ef1 - ef2) / ef1) * 100
  return { driftPct, ef1, ef2, warning: driftPct > 5 ? DRIFT_WARNING : null }
}
