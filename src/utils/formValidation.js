import { isValidDateString, getTzOffsetMin, formatPace } from './dateUtils.js'
import { classifyDistance } from './fileParsers.js'
import { buildMetrics, calcPace } from './runAnalytics.js'
import { WORKOUT_TYPES, DISTANCE_CATEGORIES } from './constants.js'

const DEC = /^-?\d+([.,]\d+)?$/
const INT = /^\d+$/
const s = (v) => String(v ?? '').trim()
const num = (v) => Number(v.replace(',', '.'))

/** Validasi form input manual. Semua nilai form berupa string. */
export function validateManualRun(form, profile = {}) {
  const errors = {}
  const warnings = []

  if (!isValidDateString(form.date)) errors.date = 'Pilih tanggal yang valid'
  if (!WORKOUT_TYPES.includes(form.workoutType)) errors.workoutType = 'Pilih jenis latihan'
  if (form.distanceCategory && !DISTANCE_CATEGORIES.includes(form.distanceCategory)) errors.distanceCategory = 'Kategori jarak tidak dikenal'

  let distanceKm = null
  const dist = s(form.distance)
  if (dist === '') errors.distance = 'Isi jarak'
  else if (!DEC.test(dist)) errors.distance = 'Jarak harus berupa angka, mis. 5,2'
  else {
    const km = num(dist)
    if (km <= 0) errors.distance = 'Jarak harus lebih dari 0'
    else if (km < 0.1 || km > 500) errors.distance = 'Jarak harus antara 0,1 dan 500 km'
    else distanceKm = km
  }

  let durationSec = null
  const [h, m, sec] = [s(form.hours), s(form.minutes), s(form.seconds)]
  if ([h, m, sec].some((x) => x !== '' && !INT.test(x))) errors.duration = 'Jam, menit, dan detik harus bilangan bulat'
  else {
    const [H, M, S] = [h, m, sec].map((x) => (x === '' ? 0 : Number(x)))
    if (M > 59 || S > 59) errors.duration = 'Menit dan detik harus 0–59'
    else if (H > 99) errors.duration = 'Jam maksimal 99'
    else if (H * 3600 + M * 60 + S <= 0) errors.duration = 'Durasi harus lebih dari 0'
    else durationSec = H * 3600 + M * 60 + S
  }

  let avgHr = null
  const hrStr = s(form.avgHr)
  if (hrStr !== '') {
    const hr = Number(hrStr)
    if (!INT.test(hrStr) || hr < 30 || hr > 250) errors.avgHr = 'HR harus bilangan bulat 30–250 bpm'
    else if (Number.isFinite(profile?.hrMax) && hr >= profile.hrMax) {
      errors.avgHr = `HR rata-rata harus di bawah HR maks profil (${profile.hrMax} bpm)`
    } else avgHr = hr
  }

  let rpe = null
  const rpeStr = s(form.rpe)
  if (rpeStr === '') {
    if (hrStr === '') errors.rpe = 'Isi RPE (1–10) bila HR kosong'
  } else if (!INT.test(rpeStr) || Number(rpeStr) < 1 || Number(rpeStr) > 10) errors.rpe = 'RPE harus bilangan bulat 1–10'
  else rpe = Number(rpeStr)

  const pace = calcPace(durationSec, distanceKm)
  if (pace !== null && (pace < 120 || pace > 1200)) {
    warnings.push(`Pace ${formatPace(pace)} /km di luar 2:00–20:00. Pastikan jarak dan durasi sudah benar.`)
  }

  const ok = Object.keys(errors).length === 0
  return {
    ok,
    errors,
    warnings,
    values: ok
      ? { distanceKm, durationSec, avgHr, rpe, distanceCategory: form.distanceCategory || classifyDistance(distanceKm) }
      : null,
  }
}

/** Susun ringkasan aktivitas manual lengkap dengan metrik; yang tak bisa dihitung = null. */
export function buildManualSummary(values, form, profile = {}, now = Date.now()) {
  const [y, mo, d] = form.date.split('-').map(Number)
  const startTimeMs = new Date(y, mo - 1, d, 12, 0, 0).getTime() // siang lokal, agar tanggal pasti benar
  return {
    title: s(form.title) || 'Lari manual',
    source: 'manual',
    startTimeMs,
    tzOffsetMin: getTzOffsetMin(startTimeMs),
    date: form.date,
    createdAt: now,
    distanceKm: values.distanceKm,
    durationSec: values.durationSec,
    distanceCategory: values.distanceCategory,
    workoutType: form.workoutType,
    avgHr: values.avgHr,
    maxHr: null,
    avgCadence: null,
    elevationGain: null,
    rpe: values.rpe,
    ...buildMetrics(values, null, profile),
  }
}

/** Validasi profil. Mengembalikan nilai bertipe angka bila lolos. */
export function validateProfile(form) {
  const errors = {}
  const [hrMaxS, hrRestS, sex] = [s(form.hrMax), s(form.hrRest), s(form.sex)]
  let hrMax = null
  let hrRest = null

  if (hrMaxS !== '') {
    if (!INT.test(hrMaxS) || Number(hrMaxS) < 100 || Number(hrMaxS) > 230) errors.hrMax = 'HR maks harus bilangan bulat 100–230 bpm'
    else hrMax = Number(hrMaxS)
  }
  if (hrRestS !== '') {
    if (!INT.test(hrRestS) || Number(hrRestS) < 30 || Number(hrRestS) > 120) errors.hrRest = 'HR istirahat harus bilangan bulat 30–120 bpm'
    else hrRest = Number(hrRestS)
  }
  if ((hrMaxS === '') !== (hrRestS === '')) {
    if (hrMaxS === '') errors.hrMax = 'Isi HR maks juga'
    else errors.hrRest = 'Isi HR istirahat juga'
  }
  if (hrMax !== null && hrRest !== null && hrRest >= hrMax) errors.hrRest = 'HR istirahat harus lebih kecil dari HR maks'
  if (sex !== '' && sex !== 'male' && sex !== 'female') errors.sex = 'Pilih jenis kelamin'
  if (hrMaxS !== '' && sex === '') errors.sex = 'Pilih jenis kelamin untuk koefisien TRIMP'

  let riegelExponent = null
  const rS = s(form.riegelExponent)
  if (!DEC.test(rS) || num(rS) < 1 || num(rS) > 1.2) errors.riegelExponent = 'Eksponen Riegel harus antara 1,00 dan 1,20'
  else riegelExponent = num(rS)

  let weeklyTargetKm = null
  const wS = s(form.weeklyTargetKm)
  if (!DEC.test(wS) || num(wS) < 1 || num(wS) > 500) errors.weeklyTargetKm = 'Target mingguan harus antara 1 dan 500 km'
  else weeklyTargetKm = num(wS)

  const ok = Object.keys(errors).length === 0
  return { ok, errors, values: ok ? { hrMax, hrRest, sex: sex || null, riegelExponent, weeklyTargetKm } : null }
}
