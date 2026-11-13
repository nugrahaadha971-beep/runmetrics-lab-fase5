import { describe, it, expect } from 'vitest'
import {
  classifyDistance, haversine, cadenceFactor, calcElevationGain, processTrackPoints, mapFitData,
} from '../utils/fileParsers.js'
import { rawPoints } from './helpers/gpxFixture.js'

describe('klasifikasi jarak', () => {
  it('batas kategori', () => {
    const cases = [[4.49, 'Pendek'], [4.5, '5K'], [6.99, '5K'], [7, '10K'], [13.99, '10K'], [14, '21.1K'],
      [24.99, '21.1K'], [25, '42.2K'], [45, '42.2K'], [45.01, 'Ultra']]
    for (const [km, cat] of cases) expect(classifyDistance(km)).toBe(cat)
    expect(classifyDistance(NaN)).toBeNull()
  })
})

describe('haversine', () => {
  it('(0,0) ke (0.01,0) = 1111.95 m', () => {
    expect(Math.abs(haversine(0, 0, 0.01, 0) - 1111.95)).toBeLessThanOrEqual(1)
  })
})

describe('cadence', () => {
  it('rpm < 120 dikali 2, spm >= 120 tidak, bukan running tidak', () => {
    expect(cadenceFactor([85, 86, 0, 84], 'running')).toBe(2)
    expect(cadenceFactor([170, 172, 0, 168], 'running')).toBe(1)
    expect(cadenceFactor([85], 'cycling')).toBe(1)
    expect(cadenceFactor([], 'running')).toBe(1)
  })
})

describe('elevasi', () => {
  it('derau kecil tidak dihitung', () => {
    expect(calcElevationGain(Array.from({ length: 40 }, (_, i) => 100 + (i % 2)))).toBe(0)
  })
  it('tanjakan landai 0 sampai 20 m terhitung mendekati 20', () => {
    const g = calcElevationGain(Array.from({ length: 21 }, (_, i) => i))
    expect(g).toBeGreaterThanOrEqual(15)
    expect(g).toBeLessThanOrEqual(20)
  })
  it('tanpa data altitude menghasilkan null', () => {
    expect(calcElevationGain([])).toBeNull()
    expect(calcElevationGain([null, undefined, NaN])).toBeNull()
  })
})

describe('processTrackPoints (GPX)', () => {
  it('jarak, durasi bergerak, HR, dan cadence dikali 2 tepat sekali', () => {
    const { summary, stream } = processTrackPoints(rawPoints())
    expect(summary.distanceKm).toBeCloseTo(1.785, 2)
    expect(summary.durationSec).toBe(595)
    expect(summary.avgHr).toBe(150)
    expect(summary.avgCadence).toBe(170)
    expect(stream.records[5].cad).toBe(170)
    expect(stream.records[0].t).toBe(0)
  })
  it('cadence yang sudah spm tidak dikali 2', () => {
    expect(processTrackPoints(rawPoints({ cad: 170 })).summary.avgCadence).toBe(170)
  })
  it('lonjakan GPS dibuang dan tidak mengubah jarak', () => {
    const base = processTrackPoints(rawPoints()).summary
    const spiky = processTrackPoints(rawPoints({ spikeAt: 50 })).summary
    expect(spiky.distanceKm).toBeCloseTo(base.distanceKm, 3)
  })
  it('segmen jeda (dt > 10 detik dan kecepatan < 0,3 m/s) dibuang seluruhnya dari waktu bergerak', () => {
    // Titik 60 datang 65 detik setelah titik 59 (5 detik normal + jeda 60 detik): seluruh segmen 65 detik dibuang.
    const paused = processTrackPoints(rawPoints({ pauseAt: 60, pauseSec: 60 })).summary
    expect(paused.durationSec).toBe(595 - 5)
  })
  it('tanpa waktu ditolak dengan pesan', () => {
    const pts = rawPoints().map((p) => ({ ...p, timeMs: NaN }))
    expect(() => processTrackPoints(pts)).toThrow('GPX tanpa waktu tidak bisa dianalisis')
  })
})

describe('mapFitData', () => {
  const rec = (i, extra = {}) => ({
    timestamp: new Date(Date.UTC(2026, 2, 10, 23, 0, i * 5)), position_lat: -6.2 + i * 1e-4, position_long: 106.8,
    heart_rate: 150, cadence: 85, enhanced_speed: 3.3, altitude: 10, enhanced_altitude: 12 + (i % 2), distance: i * 16.5, ...extra,
  })
  const data = (over = {}) => ({
    sessions: [{ sport: 'running', start_time: new Date(Date.UTC(2026, 2, 10, 23, 0, 0)), total_timer_time: 1500,
      total_distance: 5000, avg_heart_rate: 150, max_heart_rate: 172, total_ascent: 33, ...over }],
    records: Array.from({ length: 30 }, (_, i) => rec(i)),
    laps: [{ start_time: new Date(Date.UTC(2026, 2, 10, 23, 0, 0)), total_timer_time: 300, total_distance: 1000, avg_heart_rate: 148 }],
  })

  it('memetakan ringkasan, stream, dan cadence x2 sekali saja', () => {
    const { summary, stream } = mapFitData(data(), 'pagi.fit')
    expect(summary.source).toBe('fit')
    expect(summary.title).toBe('pagi')
    expect(summary.distanceKm).toBe(5)
    expect(summary.durationSec).toBe(1500)
    expect(summary.avgHr).toBe(150)
    expect(summary.avgCadence).toBe(170)
    expect(stream.records[3].cad).toBe(170)
    expect(stream.records[3].speed).toBe(3.3)
    expect(stream.records[3].alt).toBe(13)
    expect(stream.records[3].t).toBe(15)
    expect(stream.laps[0].distanceM).toBe(1000)
  })
  it('cadence yang sudah spm tidak dikali 2', () => {
    const d = data()
    d.records = d.records.map((r) => ({ ...r, cadence: 172 }))
    expect(mapFitData(d).summary.avgCadence).toBe(172)
  })
  it('menolak sport selain running', () => {
    expect(() => mapFitData(data({ sport: 'cycling' }))).toThrow('Bukan aktivitas lari')
  })
  it('tanpa stream altitude memakai total_ascent', () => {
    const d = data()
    d.records = d.records.map((r) => ({ ...r, altitude: undefined, enhanced_altitude: undefined }))
    expect(mapFitData(d).summary.elevationGain).toBe(33)
  })
  it('tanpa jarak sesi memakai jarak record terakhir; tanpa keduanya ditolak', () => {
    expect(mapFitData(data({ total_distance: 0 })).summary.distanceKm).toBeCloseTo(29 * 16.5 / 1000, 4)
    const d = data({ total_distance: 0 })
    d.records = d.records.map((r) => ({ ...r, distance: undefined, position_lat: undefined, position_long: undefined }))
    expect(() => mapFitData(d)).toThrow('jarak')
  })
})
