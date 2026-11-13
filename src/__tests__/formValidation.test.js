import { describe, it, expect } from 'vitest'
import { validateManualRun, buildManualSummary, validateProfile } from '../utils/formValidation.js'

const form = (over = {}) => ({
  date: '2026-11-12', title: '', workoutType: 'Easy Run', distanceCategory: '', distance: '5',
  hours: '', minutes: '25', seconds: '0', avgHr: '', rpe: '5', ...over,
})

describe('validateManualRun', () => {
  it('input valid: pace 300 dan kategori otomatis 5K', () => {
    const v = validateManualRun(form())
    expect(v.ok).toBe(true)
    expect(v.values.distanceCategory).toBe('5K')
    expect(v.warnings).toHaveLength(0)
  })
  it('menolak jarak 0, negatif, bukan angka, dan di luar 0,1 sampai 500', () => {
    for (const bad of ['0', '0,0', '-3', 'abc', '0,05', '500,1']) {
      const v = validateManualRun(form({ distance: bad }))
      expect(v.ok).toBe(false)
      expect(typeof v.errors.distance).toBe('string')
    }
  })
  it('menerima koma desimal', () => {
    expect(validateManualRun(form({ distance: '5,25' })).values.distanceKm).toBe(5.25)
  })
  it('durasi harus > 0 dan menit/detik 0 sampai 59', () => {
    expect(validateManualRun(form({ minutes: '0', seconds: '0' })).errors.duration).toBe('Durasi harus lebih dari 0')
    expect(validateManualRun(form({ minutes: '60' })).errors.duration).toBe('Menit dan detik harus 0–59')
    expect(validateManualRun(form({ seconds: '75' })).errors.duration).toBe('Menit dan detik harus 0–59')
  })
  it('pace di luar 2:00 sampai 20:00 hanya peringatan, bukan blokir', () => {
    const v = validateManualRun(form({ distance: '50', minutes: '25' }))
    expect(v.ok).toBe(true)
    expect(v.warnings).toHaveLength(1)
  })
  it('HR 30 sampai 250 dan harus di bawah HRmax profil', () => {
    expect(validateManualRun(form({ avgHr: '20' })).ok).toBe(false)
    expect(validateManualRun(form({ avgHr: '190' }), { hrMax: 190 }).ok).toBe(false)
    expect(validateManualRun(form({ avgHr: '189' }), { hrMax: 190 }).ok).toBe(true)
  })
  it('RPE wajib bila HR kosong, dan harus bilangan bulat 1 sampai 10', () => {
    expect(validateManualRun(form({ rpe: '' })).errors.rpe).toBeTruthy()
    expect(validateManualRun(form({ rpe: '', avgHr: '150' })).ok).toBe(true)
    for (const bad of ['0', '11', '5,5', 'x']) expect(validateManualRun(form({ rpe: bad })).ok).toBe(false)
  })
})

describe('buildManualSummary', () => {
  it('menghitung pace, sRPE, dan menyimpan null untuk yang tidak bisa dihitung', () => {
    const f = form({ title: '  Lari sore  ' })
    const v = validateManualRun(f)
    const s = buildManualSummary(v.values, f, {}, 123456)
    expect(s.avgPaceSec).toBe(300)
    expect(s.srpe).toBe(125)
    expect(s.trimp).toBeNull()
    expect(s.efficiencyFactor).toBeNull()
    expect(s.title).toBe('Lari sore')
    expect(s.date).toBe('2026-11-12')
    expect(s.source).toBe('manual')
    expect(s.createdAt).toBe(123456)
  })
  it('dengan HR dan profil, TRIMP dan EF terisi', () => {
    const f = form({ distance: '10', hours: '1', minutes: '0', seconds: '0', avgHr: '150', rpe: '' })
    const s = buildManualSummary(validateManualRun(f).values, f, { hrMax: 190, hrRest: 60, sex: 'male' })
    expect(s.efficiencyFactor).toBeCloseTo(1.111, 3)
    expect(s.trimp).toBeCloseTo(100.44, 1)
    expect(s.srpe).toBeNull()
  })
})

describe('validateProfile', () => {
  const base = { hrMax: '190', hrRest: '60', sex: 'male', riegelExponent: '1,06', weeklyTargetKm: '40' }
  it('profil valid', () => {
    const v = validateProfile(base)
    expect(v.ok).toBe(true)
    expect(v.values).toEqual({ hrMax: 190, hrRest: 60, sex: 'male', riegelExponent: 1.06, weeklyTargetKm: 40 })
  })
  it('HR istirahat harus lebih kecil dari HR maks', () => {
    expect(validateProfile({ ...base, hrRest: '190' }).errors.hrRest).toBeTruthy()
  })
  it('HR maks dan HR istirahat harus diisi berpasangan, boleh dikosongkan keduanya', () => {
    expect(validateProfile({ ...base, hrRest: '' }).ok).toBe(false)
    expect(validateProfile({ ...base, hrMax: '', hrRest: '', sex: '' }).ok).toBe(true)
  })
  it('jenis kelamin wajib bila HR diisi, eksponen Riegel 1,00 sampai 1,20', () => {
    expect(validateProfile({ ...base, sex: '' }).errors.sex).toBeTruthy()
    expect(validateProfile({ ...base, riegelExponent: '1,5' }).ok).toBe(false)
  })
})
