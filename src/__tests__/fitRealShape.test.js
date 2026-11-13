import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { mapFitData, classifyDistance } from '../utils/fileParsers.js'
import { buildMetrics } from '../utils/runAnalytics.js'
import { toLocalDateString } from '../utils/dateUtils.js'

// Fixture diturunkan dari satu file FIT nyata (Garmin, lari-jalan 3,0 km, 2022 record), didownsample
// tiap 6 record, tanpa GPS, tanggal digeser. Bentuk field mengikuti keluaran fit-file-parser mode 'list':
// hanya enhanced_speed dan enhanced_altitude yang terisi, cadence per kaki (rpm), timestamp berupa Date.
const load = () => {
  const raw = JSON.parse(readFileSync(new URL('./fixtures/run-fit-shape.json', import.meta.url), 'utf8'))
  raw.sessions[0].start_time = new Date(raw.sessions[0].start_time)
  raw.records.forEach((r) => { r.timestamp = new Date(r.timestamp) })
  raw.laps.forEach((l) => { l.start_time = new Date(l.start_time) })
  return raw
}

describe('mapFitData pada data FIT nyata', () => {
  const { summary, stream } = mapFitData(load(), 'pagi.fit')

  it('ringkasan sesuai nilai di perangkat', () => {
    expect(summary.source).toBe('fit')
    expect(summary.distanceKm).toBeCloseTo(3.00166, 4)
    expect(summary.durationSec).toBeCloseTo(2019.21, 2) // total_timer_time, bukan elapsed 2089,9
    expect(summary.avgHr).toBe(128)
    expect(summary.maxHr).toBe(153)
    expect(summary.elevationGain).toBe(0)
    expect(classifyDistance(summary.distanceKm)).toBe('Pendek')
  })
  it('cadence dikali 2 tepat sekali: rpm per kaki menjadi spm', () => {
    const cads = stream.records.map((r) => r.cad).filter((c) => c > 0)
    expect(Math.max(...cads)).toBeLessThanOrEqual(180) // 174 spm; jika dikali 2 dua kali akan 348
    expect(summary.avgCadence).toBeGreaterThanOrEqual(125)
    expect(summary.avgCadence).toBeLessThanOrEqual(145)
  })
  it('memakai enhanced_speed dan enhanced_altitude saat speed dan altitude kosong', () => {
    const last = stream.records[stream.records.length - 1]
    expect(last.speed).toBeGreaterThan(0)
    expect(last.alt).toBeGreaterThanOrEqual(-7)
    expect(last.alt).toBeLessThanOrEqual(-1)
  })
  it('stream: t naik, dimulai 0, memuat celah jeda, tanpa GPS tetap valid', () => {
    const ts = stream.records.map((r) => r.t)
    expect(ts[0]).toBe(0)
    expect(ts.every((t, i) => i === 0 || t > ts[i - 1])).toBe(true)
    expect(ts[ts.length - 1]).toBe(2090) // elapsed, lebih panjang dari timer 2019 s
    expect(stream.records.every((r) => r.lat === null && r.lng === null)).toBe(true)
    expect(stream.laps).toHaveLength(8)
    expect(stream.laps[0].timerSec).toBe(600)
  })
  it('lari 06.00 WIB jatuh di tanggal lokal, bukan tanggal UTC', () => {
    // start digeser ke 2026-03-10 23:00 UTC = 11 Maret 06:00 WIB
    expect(toLocalDateString(summary.startTimeMs, 420)).toBe('2026-03-11')
  })
  it('metrik: pace 11:13/km, EF 0,697; TRIMP null tanpa profil', () => {
    const m = buildMetrics(summary, stream.records, {})
    expect(m.avgPaceSec).toBeCloseTo(672.7, 1)
    expect(m.efficiencyFactor).toBeCloseTo(0.697, 3)
    expect(m.trimp).toBeNull()
    const withProfile = buildMetrics(summary, stream.records, { hrMax: 190, hrRest: 60, sex: 'male' })
    expect(withProfile.trimp).toBeGreaterThan(20)
    expect(withProfile.trimp).toBeLessThan(45)
  })
})
