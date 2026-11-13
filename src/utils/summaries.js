// Agregasi untuk dashboard. Fungsi murni; semua pengelompokan memakai `date` lokal (minggu mulai Senin).
import { addDays, weekStartMonday, daysInMonth, monthStart, formatShortDate, dayIndexMonday, DAY_NAMES } from './dateUtils.js'
import { calcPace, resolveLoad } from './runAnalytics.js'
import { DISTANCE_CATEGORIES, WORKOUT_TYPES } from './constants.js'

const finite = Number.isFinite
const inRange = (a, from, to) => typeof a.date === 'string' && a.date >= from && a.date <= to
const sumKm = (activities, from, to) =>
  activities.reduce((s, a) => (inRange(a, from, to) && finite(a.distanceKm) ? s + a.distanceKm : s), 0)

export function periodRange(period, today) {
  if (period === 'day') return { from: today, to: today }
  if (period === 'week') {
    const from = weekStartMonday(today)
    return { from, to: addDays(from, 6) }
  }
  const from = monthStart(today)
  return { from, to: addDays(from, daysInMonth(today) - 1) }
}

/** Target mengikuti target mingguan: hari = mingguan/7, minggu = mingguan, bulan = mingguan x hari-dalam-bulan/7. */
export function periodTarget(period, weeklyKm, today) {
  if (!finite(weeklyKm) || weeklyKm <= 0) return null
  if (period === 'day') return weeklyKm / 7
  if (period === 'week') return weeklyKm
  return (weeklyKm * daysInMonth(today)) / 7
}

export function summarizePeriod(activities, from, to, factor = 0.25) {
  let count = 0, km = 0, dur = 0, load = 0, loadN = 0, noLoad = 0, elev = 0, elevN = 0, cadW = 0, cadT = 0
  for (const a of activities ?? []) {
    if (!inRange(a, from, to)) continue
    count += 1
    km += finite(a.distanceKm) ? a.distanceKm : 0
    const d = finite(a.durationSec) ? a.durationSec : 0
    dur += d
    const l = resolveLoad(a, factor).load
    if (l === null) noLoad += 1
    else { load += l; loadN += 1 }
    if (finite(a.elevationGain)) { elev += a.elevationGain; elevN += 1 }
    if (finite(a.avgCadence) && a.avgCadence > 0 && d > 0) { cadW += a.avgCadence * d; cadT += d }
  }
  return {
    count, km, durationSec: dur, avgPaceSec: calcPace(dur, km),
    load: loadN > 0 ? load : null, noLoadCount: noLoad,
    elevationGain: elevN > 0 ? elev : null, avgCadence: cadT > 0 ? cadW / cadT : null,
  }
}

/** Volume km per hari selama `days` hari mulai `from`; hari kosong = 0. */
export function volumeByDay(activities, from, days) {
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(from, i)
    return { date, name: DAY_NAMES[dayIndexMonday(date)], label: formatShortDate(date), km: sumKm(activities ?? [], date, date) }
  })
}

export const dailyVolume = (activities, today, days = 30) => volumeByDay(activities, addDays(today, -(days - 1)), days)

/** Volume per minggu (Senin sampai Minggu) yang beririsan dengan [from, to], dipotong di tepi rentang. */
export function volumeByWeek(activities, from, to) {
  const out = []
  for (let ws = weekStartMonday(from); ws <= to; ws = addDays(ws, 7)) {
    const start = ws < from ? from : ws
    const we = addDays(ws, 6)
    const end = we > to ? to : we
    out.push({ date: start, name: formatShortDate(start), label: formatShortDate(start), km: sumKm(activities ?? [], start, end) })
  }
  return out
}

/** Porsi volume (km) per distanceCategory dalam `days` hari terakhir; penyebut = semua kategori. */
export function categoryShares(activities, today, days = 30) {
  const from = addDays(today, -(days - 1))
  const byKey = Object.fromEntries(DISTANCE_CATEGORIES.map((k) => [k, { km: 0, share: null }]))
  let total = 0
  for (const a of activities ?? []) {
    if (!inRange(a, from, today)) continue
    const km = finite(a.distanceKm) ? a.distanceKm : 0
    total += km
    if (byKey[a.distanceCategory]) byKey[a.distanceCategory].km += km
  }
  for (const k of DISTANCE_CATEGORIES) byKey[k].share = total > 0 ? byKey[k].km / total : null
  return { total, byKey }
}

/** Porsi waktu (durasi) per workoutType dalam `days` hari terakhir. */
export function workoutDistribution(activities, today, days = 28) {
  const from = addDays(today, -(days - 1))
  const byType = Object.fromEntries(WORKOUT_TYPES.map((t) => [t, { sec: 0, share: null }]))
  let total = 0
  for (const a of activities ?? []) {
    if (!inRange(a, from, today)) continue
    const d = finite(a.durationSec) ? a.durationSec : 0
    total += d
    if (byType[a.workoutType]) byType[a.workoutType].sec += d
  }
  for (const t of WORKOUT_TYPES) byType[t].share = total > 0 ? byType[t].sec / total : null
  return { total, byType }
}

/** Tujuh hari minggu ini (Sen sampai Min): ada sesi atau tidak, dan penanda hari ini. */
export function weekDots(activities, today) {
  const start = weekStartMonday(today)
  const dates = new Set((activities ?? []).map((a) => a.date))
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i)
    return { date, name: DAY_NAMES[i], has: dates.has(date), isToday: date === today }
  })
}

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null)

/** Deret mingguan (terlama dulu): km, beban, pace, EF (hanya Easy Run dan Long Run), cadence. */
export function weeklySeries(activities, today, weeks = 12, factor = 0.25) {
  const thisWeek = weekStartMonday(today)
  const out = []
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const start = addDays(thisWeek, -7 * i)
    const end = addDays(start, 6)
    const s = summarizePeriod(activities, start, end, factor)
    const efs = (activities ?? [])
      .filter((a) => inRange(a, start, end) && (a.workoutType === 'Easy Run' || a.workoutType === 'Long Run') && finite(a.efficiencyFactor))
      .map((a) => a.efficiencyFactor)
    out.push({
      weekStart: start, label: formatShortDate(start), km: s.km, load: s.load, count: s.count, noLoadCount: s.noLoadCount,
      avgPaceSec: s.avgPaceSec, avgEF: mean(efs), avgCadence: s.avgCadence,
    })
  }
  return out
}
