import { describe, it, expect } from 'vitest'
import {
  calcPace, calcTrimpFromAvg, calcTrimpFromStream, calcTrimp, calcSrpe, calcEF, buildMetrics,
} from '../utils/runAnalytics.js'

const male = { hrMax: 190, hrRest: 60, sex: 'male' }

describe('pace', () => {
  it('5 km dalam 25:00 = 300 detik/km', () => expect(calcPace(1500, 5)).toBe(300))
  it('jarak 0, negatif, atau NaN menghasilkan null', () => {
    expect(calcPace(1500, 0)).toBeNull()
    expect(calcPace(1500, -1)).toBeNull()
    expect(calcPace(NaN, 5)).toBeNull()
    expect(calcPace(0, 5)).toBeNull()
  })
})

describe('TRIMP', () => {
  // Rumus Bagian 3.2: HRr = 90/130 = 0.6923; 60 x 0.6923 x 0.64 x e^(1.92 x 0.6923) = 100.4.
  // Nilai 145.1 di dokumen tidak cocok dengan rumus itu, menunggu konfirmasi.
  it('60 menit, HR 150, HRrest 60, HRmax 190, pria', () => {
    expect(calcTrimpFromAvg(3600, 150, male)).toBeCloseTo(100.44, 1)
  })
  it('koefisien wanita berbeda', () => {
    expect(calcTrimpFromAvg(3600, 150, { ...male, sex: 'female' })).toBeCloseTo(113.5, 0)
  })
  it('stream konstan memberi hasil mendekati rumus rata-rata', () => {
    const records = Array.from({ length: 721 }, (_, i) => ({ t: i * 5, hr: 150 }))
    expect(calcTrimpFromStream(records, male)).toBeCloseTo(100.44, 0)
  })
  it('selisih waktu > 30 detik diabaikan', () => {
    expect(calcTrimpFromStream([{ t: 0, hr: 150 }, { t: 60, hr: 150 }], male)).toBeNull()
  })
  it('profil tidak lengkap atau HR kosong menghasilkan null', () => {
    expect(calcTrimpFromAvg(3600, 150, { hrMax: 190, hrRest: 60, sex: null })).toBeNull()
    expect(calcTrimpFromAvg(3600, 150, { hrMax: 190, hrRest: 200, sex: 'male' })).toBeNull()
    expect(calcTrimpFromAvg(3600, null, male)).toBeNull()
    expect(calcTrimpFromAvg(3600, 150, {})).toBeNull()
  })
  it('HR di bawah HRrest dibatasi ke 0', () => {
    expect(calcTrimpFromAvg(3600, 40, male)).toBe(0)
  })
  it('calcTrimp jatuh ke avgHr bila stream tidak punya HR', () => {
    expect(calcTrimp({ durationSec: 3600, avgHr: 150 }, [{ t: 0 }, { t: 5 }], male)).toBeCloseTo(100.44, 1)
  })
})

describe('sRPE, EF, metrik', () => {
  it('sRPE = RPE x menit', () => {
    expect(calcSrpe(6, 1800)).toBe(180)
    expect(calcSrpe(null, 1800)).toBeNull()
  })
  it('EF: 10 km dalam 60 menit, HR 150 = 1.111', () => {
    expect(calcEF(10, 3600, 150)).toBeCloseTo(1.111, 3)
    expect(calcEF(10, 3600, null)).toBeNull()
    expect(calcEF(0, 3600, 150)).toBeNull()
  })
  it('buildMetrics menyimpan null untuk yang tidak bisa dihitung', () => {
    const m = buildMetrics({ distanceKm: 5, durationSec: 1500, avgHr: null, rpe: 5 }, null, {})
    expect(m).toEqual({ avgPaceSec: 300, efficiencyFactor: null, srpe: 125, trimp: null })
  })
})
