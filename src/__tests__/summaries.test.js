import { describe, it, expect } from 'vitest'
import {
  periodRange, periodTarget, summarizePeriod, volumeByDay, volumeByWeek, categoryShares,
  workoutDistribution, weekDots, weeklySeries, dailyVolume,
} from '../utils/summaries.js'
import { routeLatLngs } from '../utils/route.js'

const TODAY = '2026-11-12' // Kamis
const acts = [
  { date: '2026-11-10', distanceKm: 10, durationSec: 3000, trimp: 80, elevationGain: 50, avgCadence: 170, workoutType: 'Easy Run', efficiencyFactor: 1.2, distanceCategory: '10K' },
  { date: '2026-11-12', distanceKm: 5, durationSec: 1800, srpe: 200, elevationGain: 20, avgCadence: 160, workoutType: 'Tempo', efficiencyFactor: 1.5, distanceCategory: '5K' },
  { date: '2026-11-14', distanceKm: 8, durationSec: 2400, workoutType: 'Long Run', efficiencyFactor: 1.0, distanceCategory: '10K' },
  { date: '2026-11-02', distanceKm: 20, durationSec: 6000, workoutType: 'Easy Run', distanceCategory: '21.1K' },
]

describe('periodRange dan periodTarget', () => {
  it('hari, minggu (Senin sampai Minggu), dan bulan', () => {
    expect(periodRange('day', TODAY)).toEqual({ from: TODAY, to: TODAY })
    expect(periodRange('week', TODAY)).toEqual({ from: '2026-11-09', to: '2026-11-15' })
    expect(periodRange('month', TODAY)).toEqual({ from: '2026-11-01', to: '2026-11-30' })
    expect(periodRange('month', '2028-02-10').to).toBe('2028-02-29')
  })
  it('target diturunkan dari target mingguan', () => {
    expect(periodTarget('week', 40, TODAY)).toBe(40)
    expect(periodTarget('day', 70, TODAY)).toBe(10)
    expect(periodTarget('month', 40, TODAY)).toBeCloseTo((40 * 30) / 7, 10)
    expect(periodTarget('week', null, TODAY)).toBeNull()
  })
})

describe('summarizePeriod', () => {
  it('minggu ini: total, pace, beban (srpe x faktor), elevasi, cadence berbobot durasi', () => {
    const { from, to } = periodRange('week', TODAY)
    const s = summarizePeriod(acts, from, to, 0.5)
    expect(s.count).toBe(3)
    expect(s.km).toBe(23)
    expect(s.durationSec).toBe(7200)
    expect(s.avgPaceSec).toBeCloseTo(7200 / 23, 10)
    expect(s.load).toBe(180)
    expect(s.noLoadCount).toBe(1)
    expect(s.elevationGain).toBe(70)
    expect(s.avgCadence).toBeCloseTo((170 * 3000 + 160 * 1800) / 4800, 10)
  })
  it('periode kosong menghasilkan null, bukan 0 atau NaN', () => {
    const s = summarizePeriod(acts, '2025-01-01', '2025-01-07')
    expect(s.count).toBe(0)
    expect(s.avgPaceSec).toBeNull()
    expect(s.load).toBeNull()
    expect(s.elevationGain).toBeNull()
    expect(s.avgCadence).toBeNull()
  })
})

describe('volume', () => {
  it('per hari, hari kosong = 0, dengan nama hari', () => {
    const v = volumeByDay(acts, '2026-11-09', 7)
    expect(v.map((x) => x.km)).toEqual([0, 10, 0, 5, 0, 8, 0])
    expect(v.map((x) => x.name).join(' ')).toBe('Sen Sel Rab Kam Jum Sab Min')
  })
  it('per minggu dalam satu bulan, dipotong di tepi bulan', () => {
    const w = volumeByWeek(acts, '2026-11-01', '2026-11-30')
    expect(w.map((x) => x.label)).toEqual(['01/11', '02/11', '09/11', '16/11', '23/11', '30/11'])
    expect(w.map((x) => x.km)).toEqual([0, 20, 23, 0, 0, 0])
  })
  it('dailyVolume memuat 30 hari berakhir hari ini', () => {
    const d = dailyVolume(acts, TODAY, 30)
    expect(d).toHaveLength(30)
    expect(d[29].date).toBe(TODAY)
    expect(d[29].km).toBe(5)
  })
})

describe('porsi kategori dan distribusi latihan', () => {
  const a = [
    { date: '2026-11-10', distanceKm: 10, distanceCategory: '5K', durationSec: 600, workoutType: 'Easy Run' },
    { date: '2026-11-11', distanceKm: 20, distanceCategory: '10K', durationSec: 1200, workoutType: 'Tempo' },
    { date: '2026-11-01', distanceKm: 10, distanceCategory: 'Pendek', durationSec: 1200, workoutType: 'Easy Run' },
    { date: '2026-09-01', distanceKm: 99, distanceCategory: '42.2K', durationSec: 9999, workoutType: 'Race' },
  ]
  it('porsi volume 30 hari terakhir per kategori (penyebut semua kategori)', () => {
    const s = categoryShares(a, TODAY)
    expect(s.total).toBe(40)
    expect(s.byKey['5K'].share).toBe(0.25)
    expect(s.byKey['10K'].share).toBe(0.5)
    expect(s.byKey.Pendek.share).toBe(0.25)
    expect(s.byKey.Ultra.share).toBe(0)
  })
  it('tanpa data: share null', () => {
    expect(categoryShares([], TODAY).byKey['5K'].share).toBeNull()
    expect(workoutDistribution([], TODAY).byType.Tempo.share).toBeNull()
  })
  it('distribusi waktu 28 hari terakhir per workoutType', () => {
    const d = workoutDistribution(a, TODAY)
    expect(d.total).toBe(3000)
    expect(d.byType['Easy Run'].share).toBe(0.6)
    expect(d.byType.Tempo.share).toBe(0.4)
    expect(d.byType.Race.share).toBe(0)
  })
})

describe('weekDots dan weeklySeries', () => {
  it('tujuh hari Sen sampai Min dengan penanda sesi dan hari ini', () => {
    const d = weekDots(acts, TODAY)
    expect(d.map((x) => x.has)).toEqual([false, true, false, true, false, true, false])
    expect(d.map((x) => x.isToday)).toEqual([false, false, false, true, false, false, false])
  })
  it('deret 3 minggu: km, pace, load null bila tak ada beban, EF hanya Easy/Long Run', () => {
    const w = weeklySeries(acts, TODAY, 3, 0.5)
    expect(w.map((x) => x.weekStart)).toEqual(['2026-10-26', '2026-11-02', '2026-11-09'])
    expect(w[0].km).toBe(0)
    expect(w[0].avgPaceSec).toBeNull()
    expect(w[1].km).toBe(20)
    expect(w[1].avgPaceSec).toBe(300)
    expect(w[1].load).toBeNull()
    expect(w[1].noLoadCount).toBe(1)
    expect(w[1].avgEF).toBeNull()
    expect(w[2].km).toBe(23)
    expect(w[2].load).toBe(180)
    expect(w[2].avgEF).toBeCloseTo(1.1, 10)
  })
})

describe('routeLatLngs', () => {
  it('membuang titik tanpa GPS', () => {
    const r = routeLatLngs([{ lat: 1, lng: 2 }, { lat: null, lng: null }, { lat: 3, lng: 4 }, {}])
    expect(r).toEqual([[1, 2], [3, 4]])
  })
  it('membatasi jumlah titik dan tetap memuat titik terakhir', () => {
    const recs = Array.from({ length: 10001 }, (_, i) => ({ lat: i, lng: i }))
    const r = routeLatLngs(recs, 3000)
    expect(r.length).toBeLessThanOrEqual(3001)
    expect(r[r.length - 1]).toEqual([10000, 10000])
    expect(r[0]).toEqual([0, 0])
  })
})
