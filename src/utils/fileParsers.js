// Parser FIT/GPX, elevasi, dan klasifikasi jarak. Hanya parseGpxText yang butuh DOMParser.
const EARTH_R = 6371000
const MAX_SPEED_MS = 12 // lonjakan GPS
const PAUSE_MIN_DT = 10
const PAUSE_MAX_SPEED = 0.3
const finite = Number.isFinite
const numOrNull = (v) => (typeof v === 'number' && finite(v) ? v : null)
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null)
const round1 = (v) => (v == null ? null : Math.round(v * 10) / 10)
const validHr = (v) => (typeof v === 'number' && finite(v) && v >= 30 && v <= 250 ? v : null)

export function classifyDistance(km) {
  if (!finite(km)) return null
  if (km < 4.5) return 'Pendek'
  if (km < 7) return '5K'
  if (km < 14) return '10K'
  if (km < 25) return '21.1K'
  if (km <= 45) return '42.2K'
  return 'Ultra'
}

export function haversine(lat1, lng1, lat2, lng2) {
  const rad = Math.PI / 180
  const dLat = (lat2 - lat1) * rad
  const dLng = (lng2 - lng1) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h)))
}

// Kali 2 (rpm -> spm) hanya bila sport = running dan rata-rata mentah < 120.
// Nilai <= 0 (berhenti) tidak ikut rata-rata agar file yang sudah spm tidak salah dikali 2.
export function cadenceFactor(rawValues, sport) {
  if (sport !== 'running') return 1
  const m = mean(rawValues.filter((v) => finite(v) && v > 0))
  return m !== null && m < 120 ? 2 : 1
}

// Rata-rata bergerak 5 titik (jendela terpusat, dipotong di tepi).
export function movingAverage(values, half = 2) {
  return values.map((_, i) => {
    const from = Math.max(0, i - half)
    const to = Math.min(values.length - 1, i + half)
    let sum = 0
    for (let j = from; j <= to; j += 1) sum += values[j]
    return sum / (to - from + 1)
  })
}

// Altitude diperhalus (5 titik), lalu hysteresis 3 m: tambah ke total hanya bila selisih dari
// titik referensi >= 3 m, lalu referensi digeser. Turunan >= 3 m menggeser referensi ke bawah.
export function calcElevationGain(altitudes) {
  const alts = (altitudes ?? []).filter((v) => typeof v === 'number' && finite(v))
  if (alts.length < 2) return null
  const smooth = movingAverage(alts)
  let ref = smooth[0]
  let gain = 0
  for (let i = 1; i < smooth.length; i += 1) {
    const diff = smooth[i] - ref
    if (Math.abs(diff) >= 3) {
      if (diff > 0) gain += diff
      ref = smooth[i]
    }
  }
  return round1(gain)
}

// ---------- GPX ----------

/** points: [{ lat, lng, timeMs, alt, hr, cad }] -> { summary, stream } */
export function processTrackPoints(points) {
  if (!points.some((p) => finite(p.timeMs))) throw new Error('GPX tanpa waktu tidak bisa dianalisis')
  const pts = points.filter((p) => finite(p.lat) && finite(p.lng) && finite(p.timeMs))
  if (pts.length < 2) throw new Error('GPX tidak berisi cukup titik trek')

  const t0 = pts[0].timeMs
  const records = [{ t: 0, lat: pts[0].lat, lng: pts[0].lng, hr: pts[0].hr, cad: pts[0].cad, speed: null, alt: pts[0].alt }]
  let last = pts[0]
  let distM = 0
  let moving = 0
  for (let i = 1; i < pts.length; i += 1) {
    const p = pts[i]
    const dt = (p.timeMs - last.timeMs) / 1000
    if (dt <= 0) continue
    const d = haversine(last.lat, last.lng, p.lat, p.lng)
    const v = d / dt
    if (v > MAX_SPEED_MS) continue // titik lonjakan dibuang, titik berikutnya dihitung dari titik valid terakhir
    distM += d
    if (!(dt > PAUSE_MIN_DT && v < PAUSE_MAX_SPEED)) moving += dt
    records.push({ t: (p.timeMs - t0) / 1000, lat: p.lat, lng: p.lng, hr: p.hr, cad: p.cad, speed: v, alt: p.alt })
    last = p
  }
  if (distM <= 0 || moving <= 0) throw new Error('Trek GPX tidak memuat jarak atau durasi yang valid')

  const factor = cadenceFactor(records.map((r) => r.cad).filter((c) => c != null), 'running')
  for (const r of records) if (r.cad != null) r.cad = r.cad * factor

  const hrs = records.map((r) => r.hr).filter((h) => h != null)
  const cads = records.map((r) => r.cad).filter((c) => c != null && c > 0)
  return {
    summary: {
      startTimeMs: t0,
      distanceKm: distM / 1000,
      durationSec: moving,
      avgHr: round1(mean(hrs)),
      maxHr: hrs.length ? Math.max(...hrs) : null,
      avgCadence: round1(mean(cads)),
      elevationGain: calcElevationGain(records.map((r) => r.alt)),
      source: 'gpx',
    },
    stream: { records, laps: [] },
  }
}

const textOf = (el, name) => {
  const n = el.getElementsByTagNameNS('*', name)[0]
  return n ? n.textContent.trim() : null
}
const numText = (el, name) => {
  const t = textOf(el, name)
  if (t === null || t === '') return null
  const n = Number(t)
  return finite(n) ? n : null
}

// Gabungkan semua trkseg; rte dan wpt diabaikan karena bukan trkpt.
export function extractGpxPoints(doc) {
  return Array.from(doc.getElementsByTagNameNS('*', 'trkpt')).map((el) => {
    const time = textOf(el, 'time')
    return {
      lat: Number(el.getAttribute('lat')),
      lng: Number(el.getAttribute('lon')),
      timeMs: time ? Date.parse(time) : NaN,
      alt: numText(el, 'ele'),
      hr: validHr(numText(el, 'hr')),
      cad: numText(el, 'cad'),
    }
  })
}

export function parseGpxText(text, fileName = '') {
  let doc
  try {
    doc = new DOMParser().parseFromString(text, 'application/xml')
  } catch {
    throw new Error('File GPX rusak atau bukan XML yang valid')
  }
  if (doc.getElementsByTagNameNS('*', 'parsererror').length > 0) throw new Error('File GPX rusak atau bukan XML yang valid')
  if (doc.documentElement?.localName !== 'gpx') throw new Error('Bukan file GPX yang valid')
  const points = extractGpxPoints(doc)
  if (points.length === 0) throw new Error('GPX tidak berisi trek lari')
  const result = processTrackPoints(points)
  const trk = doc.getElementsByTagNameNS('*', 'trk')[0]
  const name = trk ? Array.from(trk.children).find((c) => c.localName === 'name')?.textContent.trim() : ''
  result.summary.title = name || fileName.replace(/\.[^.]+$/, '') || 'Lari'
  return result
}

export async function parseGpxFile(file) {
  return parseGpxText(await file.text(), file.name)
}

// ---------- FIT ----------

const toMs = (v) => {
  if (v instanceof Date) return v.getTime()
  if (typeof v === 'number') return v
  if (typeof v === 'string') return Date.parse(v)
  return NaN
}
// Jaga-jaga bila posisi masih dalam semicircle (nilai > 180).
const toDegrees = (v) => (typeof v === 'number' && finite(v) ? (Math.abs(v) > 180 ? v * (180 / 2 ** 31) : v) : null)

/** Bungkus pustaka fit-file-parser dalam Promise; mendukung varian callback maupun Promise. */
export async function fitParseRaw(arrayBuffer) {
  const mod = await import('fit-file-parser')
  const Parser = mod.default?.default ?? mod.default ?? mod.FitParser
  if (typeof Parser !== 'function') throw new Error('Pustaka pembaca FIT gagal dimuat')
  const parser = new Parser({
    force: true, speedUnit: 'm/s', lengthUnit: 'm', temperatureUnit: 'celsius', elapsedRecordField: true, mode: 'list',
  })
  return new Promise((resolve, reject) => {
    let settled = false
    const done = (err, data) => {
      if (settled) return
      settled = true
      if (err) reject(err instanceof Error ? err : new Error(String(err)))
      else resolve(data)
    }
    try {
      const maybe = parser.parse(arrayBuffer, done)
      if (maybe && typeof maybe.then === 'function') maybe.then((d) => done(null, d), (e) => done(e))
    } catch (e) {
      done(e)
    }
  })
}

/** Ubah keluaran parser FIT (mode 'list') menjadi { summary, stream }. */
export function mapFitData(data, fileName = '') {
  const session = data?.sessions?.[0] ?? {}
  const sport = session.sport ?? data?.sports?.[0]?.sport ?? null
  if (typeof sport === 'string' && sport.toLowerCase() !== 'running') {
    throw new Error(`Bukan aktivitas lari (sport: ${sport}). Hanya lari yang didukung.`)
  }
  const sportName = typeof sport === 'string' ? 'running' : null // sport tak diketahui: cadence tidak dikali 2

  const raw = Array.isArray(data?.records) ? data.records : []
  const startMs = [toMs(session.start_time), toMs(raw[0]?.timestamp)].find(finite)
  if (!finite(startMs)) throw new Error('File FIT tidak memuat waktu mulai')

  const records = []
  let lastDist = null
  for (const r of raw) {
    const t = (toMs(r.timestamp) - startMs) / 1000
    if (!finite(t) || t < 0) continue
    if (finite(r.distance)) lastDist = r.distance
    records.push({
      t,
      lat: toDegrees(r.position_lat),
      lng: toDegrees(r.position_long),
      hr: validHr(r.heart_rate),
      cad: numOrNull(r.cadence),
      speed: numOrNull(r.enhanced_speed ?? r.speed),
      alt: numOrNull(r.enhanced_altitude ?? r.altitude),
    })
  }

  const factor = cadenceFactor(records.map((r) => r.cad).filter((c) => c != null), sportName)
  for (const r of records) if (r.cad != null) r.cad = r.cad * factor
  let avgCadence = round1(mean(records.map((r) => r.cad).filter((c) => c != null && c > 0)))
  if (avgCadence === null && finite(session.avg_cadence) && session.avg_cadence > 0) {
    avgCadence = session.avg_cadence * cadenceFactor([session.avg_cadence], sportName)
  }

  let distanceM = session.total_distance
  if (!(distanceM > 0)) distanceM = lastDist
  if (!(distanceM > 0)) {
    const gps = records.filter((r) => r.lat != null && r.lng != null)
    distanceM = 0
    for (let i = 1; i < gps.length; i += 1) distanceM += haversine(gps[i - 1].lat, gps[i - 1].lng, gps[i].lat, gps[i].lng)
  }
  if (!(distanceM > 0)) throw new Error('File FIT tidak memuat data jarak')

  let durationSec = [session.total_timer_time, session.total_elapsed_time, records[records.length - 1]?.t].find((v) => finite(v) && v > 0)
  if (!(durationSec > 0)) throw new Error('File FIT tidak memuat durasi')

  const hrs = records.map((r) => r.hr).filter((h) => h != null)
  const avgHr = finite(session.avg_heart_rate) && session.avg_heart_rate > 0 ? session.avg_heart_rate : round1(mean(hrs))
  const maxHr = finite(session.max_heart_rate) && session.max_heart_rate > 0 ? session.max_heart_rate : hrs.length ? Math.max(...hrs) : null

  const laps = (Array.isArray(data?.laps) ? data.laps : []).map((l, i) => ({
    index: i + 1,
    t: numOrNull((toMs(l.start_time) - startMs) / 1000),
    timerSec: numOrNull(l.total_timer_time),
    distanceM: numOrNull(l.total_distance),
    avgHr: numOrNull(l.avg_heart_rate),
    maxHr: numOrNull(l.max_heart_rate),
  }))

  return {
    summary: {
      title: fileName.replace(/\.[^.]+$/, '') || 'Lari',
      startTimeMs: startMs,
      distanceKm: distanceM / 1000,
      durationSec,
      avgHr,
      maxHr,
      avgCadence,
      elevationGain: calcElevationGain(records.map((r) => r.alt)) ?? numOrNull(session.total_ascent),
      source: 'fit',
    },
    stream: records.length ? { records, laps } : null,
  }
}

export async function parseFitFile(file) {
  let raw
  try {
    raw = await fitParseRaw(await file.arrayBuffer())
  } catch (err) {
    throw new Error(`File FIT tidak bisa dibaca: ${err?.message || 'format tidak dikenali'}`)
  }
  return mapFitData(raw, file.name)
}
