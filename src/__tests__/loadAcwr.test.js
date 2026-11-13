import { describe, it, expect } from 'vitest'
import { addDays } from '../utils/dateUtils.js'
import { srpeToTrimpFactor, resolveLoad, calcAcwr, acwrZone, ACWR_INSUFFICIENT } from '../utils/runAnalytics.js'

const TODAY = '2026-11-12'
const day = (n, load) => ({ date: addDays(TODAY, -n), trimp: load })

describe('srpeToTrimpFactor', () => {
  const both = (trimp, srpe) => ({ trimp, srpe })
  it('kurang dari 5 sesi: 0.25', () => {
    expect(srpeToTrimpFactor([both(50, 100), both(60, 100)])).toBe(0.25)
    expect(srpeToTrimpFactor([])).toBe(0.25)
  })
  it('median dari trimp/srpe (5 sesi atau lebih), mengabaikan yang tidak punya keduanya', () => {
    const acts = [both(40, 100), both(50, 100), both(30, 100), both(60, 100), both(50, 100), { trimp: 90 }, { srpe: 80 }]
    expect(srpeToTrimpFactor(acts)).toBe(0.5)
  })
  it('jumlah genap: rata-rata dua nilai tengah', () => {
    const acts = [both(30, 100), both(40, 100), both(50, 100), both(60, 100), both(70, 100), both(80, 100)]
    expect(srpeToTrimpFactor(acts)).toBeCloseTo(0.55, 10)
  })
})

describe('resolveLoad', () => {
  it('trimp didahulukan', () => expect(resolveLoad({ trimp: 80, srpe: 200 }, 0.5)).toEqual({ load: 80, loadSource: 'trimp' }))
  it('tanpa trimp: srpe x faktor, sumber srpe', () => expect(resolveLoad({ trimp: null, srpe: 200 }, 0.5)).toEqual({ load: 100, loadSource: 'srpe' }))
  it('tanpa keduanya: null', () => expect(resolveLoad({}, 0.5)).toEqual({ load: null, loadSource: null }))
  it('trimp 0 tetap dipakai (bukan dianggap kosong)', () => expect(resolveLoad({ trimp: 0, srpe: 200 }, 0.5).load).toBe(0))
})

describe('ACWR', () => {
  it('beban 100 setiap hari selama 28 hari = 1.00', () => {
    const acts = Array.from({ length: 28 }, (_, i) => day(i, 100))
    const r = calcAcwr(acts, TODAY)
    expect(r.status).toBe('ok')
    expect(r.acwr).toBeCloseTo(1.0, 10)
    expect(r.zone.label).toBe('Optimal')
  })
  it('100 selama 21 hari lalu 200 selama 7 hari terakhir: akut 200, kronis 125, ACWR 1.60', () => {
    const acts = [...Array.from({ length: 7 }, (_, i) => day(i, 200)), ...Array.from({ length: 21 }, (_, i) => day(i + 7, 100))]
    const r = calcAcwr(acts, TODAY)
    expect(r.acute).toBe(200)
    expect(r.chronic).toBe(125)
    expect(r.acwr).toBeCloseTo(1.6, 10)
    expect(r.zone.label).toBe('Risiko tinggi')
  })
  it('aktivitas pertama 20 hari lalu: data belum cukup', () => {
    const acts = Array.from({ length: 21 }, (_, i) => day(i, 100))
    const r = calcAcwr(acts, TODAY)
    expect(r.status).toBe('insufficient')
    expect(r.acwr).toBeNull()
    expect(r.message).toBe(ACWR_INSUFFICIENT)
  })
  it('batas: aktivitas pertama tepat 27 hari lalu cukup, 26 hari lalu belum', () => {
    expect(calcAcwr([day(27, 100), day(0, 100)], TODAY).status).toBe('ok')
    expect(calcAcwr([day(26, 100), day(0, 100)], TODAY).status).toBe('insufficient')
  })
  it('tanpa aktivitas sama sekali: data belum cukup', () => expect(calcAcwr([], TODAY).status).toBe('insufficient'))
  it('kronis 0: tampil "—" bukan Infinity atau NaN', () => {
    const r = calcAcwr([day(27, 0), day(0, 0)], TODAY)
    expect(r.status).toBe('chronic_zero')
    expect(r.acwr).toBeNull()
    expect(r.message).toBe('—')
  })
  it('beban dikelompokkan per tanggal lokal dan dijumlahkan', () => {
    const acts = [day(27, 100), { date: TODAY, trimp: 70 }, { date: TODAY, trimp: 30 }]
    expect(calcAcwr(acts, TODAY).acute).toBeCloseTo(100 / 7, 10)
  })
  it('sesi tanpa beban dihitung 0 dan dilaporkan jumlahnya; srpe dikali faktor', () => {
    const acts = [day(27, 100), day(3, null), { date: addDays(TODAY, -2) }, { date: addDays(TODAY, -1), srpe: 200 }]
    const r = calcAcwr(acts, TODAY, 0.5)
    expect(r.noLoadCount).toBe(2)
    expect(r.acute).toBeCloseTo(100 / 7, 10)
  })
  it('aktivitas lebih dari 27 hari lalu tidak ikut jendela', () => {
    expect(calcAcwr([day(40, 999), day(27, 100), day(0, 100)], TODAY).chronic).toBeCloseTo(200 / 28, 10)
  })
})

describe('zona ACWR', () => {
  it('batas zona', () => {
    const z = (v) => acwrZone(v).key
    expect([z(0.79), z(0.8), z(1.3), z(1.31), z(1.5), z(1.51)]).toEqual(['low', 'optimal', 'optimal', 'caution', 'caution', 'high'])
    expect(acwrZone(NaN)).toBeNull()
  })
})
