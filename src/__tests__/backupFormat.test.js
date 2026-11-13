import { describe, it, expect } from 'vitest'
import { buildCsv, backupReminder, readLines, validateHeader, sanitizeProfile, planKey } from '../utils/backupFormat.js'

const DAY = 86400000
const act = (over = {}) => ({
  date: '2026-03-11', startTimeMs: 1, title: 'Lari pagi', workoutType: 'Easy Run', distanceCategory: '5K',
  distanceKm: 5.01, durationSec: 1500, avgPaceSec: 299.4, avgHr: 150, maxHr: null, avgCadence: null, elevationGain: null,
  trimp: null, efficiencyFactor: null, rpe: null, source: 'fit', ...over,
})

describe('CSV', () => {
  it('UTF-8 dengan BOM, baris judul kolom, pemisah baris CRLF', () => {
    const csv = buildCsv([act()])
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    const rows = csv.slice(1).split('\r\n')
    expect(rows[0]).toBe('tanggal,judul,workoutType,distanceCategory,jarak km,durasi hh:mm:ss,pace m:ss,avgHr,maxHr,avgCadence,elevationGain,trimp,efficiencyFactor,rpe,source')
    expect(rows[1]).toBe('2026-03-11,Lari pagi,Easy Run,5K,5.01,00:25:00,4:59,150,,,,,,,fit')
    expect(rows[2]).toBe('')
  })
  it("judul berawalan =SUM(1) diekspor sebagai '=SUM(1)", () => {
    const rows = buildCsv([act({ title: '=SUM(1)' })]).slice(1).split('\r\n')
    expect(rows[1].split(',')[1]).toBe("'=SUM(1)")
  })
  it('awalan + - @ juga diberi tanda petik; angka negatif bukan teks tidak terpengaruh', () => {
    for (const t of ['+1', '-5K', '@x']) expect(buildCsv([act({ title: t })]).includes(`,'${t},`)).toBe(true)
  })
  it('tanda kutip di-escape dan sel berisi pemisah dibungkus kutip', () => {
    const row = buildCsv([act({ title: 'Lari "cepat", pagi' })]).slice(1).split('\r\n')[1]
    expect(row.startsWith('2026-03-11,"Lari ""cepat"", pagi",Easy Run')).toBe(true)
  })
  it('titik koma: desimal memakai koma dan sel tidak perlu dikutip', () => {
    const row = buildCsv([act({ efficiencyFactor: 1.111 })], { delimiter: ';' }).slice(1).split('\r\n')[1]
    expect(row).toBe('2026-03-11;Lari pagi;Easy Run;5K;5,01;00:25:00;4:59;150;;;;;1,111;;fit')
  })
  it('judul berisi pemisah titik koma dikutip pada mode titik koma', () => {
    const row = buildCsv([act({ title: 'a;b' })], { delimiter: ';' }).slice(1).split('\r\n')[1]
    expect(row.startsWith('2026-03-11;"a;b";')).toBe(true)
  })
  it('diurutkan menurut tanggal; null menjadi sel kosong, bukan NaN atau 0', () => {
    const csv = buildCsv([act({ date: '2026-03-12', title: 'B' }), act({ date: '2026-03-10', title: 'A', avgPaceSec: null, durationSec: null })])
    const rows = csv.slice(1).split('\r\n')
    expect(rows[1].startsWith('2026-03-10,A')).toBe(true)
    expect(rows[1]).toBe('2026-03-10,A,Easy Run,5K,5.01,,,150,,,,,,,fit')
    expect(csv.includes('NaN')).toBe(false)
  })
})

describe('backupReminder', () => {
  const now = 1000 * DAY
  it('tanpa aktivitas: tidak ada banner', () => expect(backupReminder({ lastBackupAt: null, createdAts: [], now })).toBeNull())
  it('lebih dari 30 hari sejak backup terakhir: banner usia; tepat 30 hari: belum', () => {
    expect(backupReminder({ lastBackupAt: now - 31 * DAY, createdAts: [now - 40 * DAY], now }).reason).toBe('age')
    expect(backupReminder({ lastBackupAt: now - 30 * DAY, createdAts: [now - 40 * DAY], now })).toBeNull()
  })
  it('20 sesi baru sejak backup terakhir: banner; 19 sesi: belum', () => {
    const sessions = (n) => Array.from({ length: n }, (_, i) => now - 5 * DAY + i)
    expect(backupReminder({ lastBackupAt: now - 6 * DAY, createdAts: sessions(20), now }).reason).toBe('sessions')
    expect(backupReminder({ lastBackupAt: now - 6 * DAY, createdAts: sessions(19), now })).toBeNull()
  })
  it('sesi yang dibuat sebelum backup terakhir tidak dihitung baru', () => {
    expect(backupReminder({ lastBackupAt: now - 1 * DAY, createdAts: Array.from({ length: 30 }, () => now - 5 * DAY), now })).toBeNull()
  })
  it('belum pernah backup: acuan data tertua', () => {
    expect(backupReminder({ lastBackupAt: null, createdAts: [now - 2 * DAY], now })).toBeNull()
    expect(backupReminder({ lastBackupAt: null, createdAts: [now - 31 * DAY], now }).reason).toBe('never')
    expect(backupReminder({ lastBackupAt: null, createdAts: Array.from({ length: 20 }, () => now - DAY), now }).reason).toBe('never')
  })
})

describe('header, profil, kunci program', () => {
  it('validateHeader menolak bukan header, app lain, dan versi lebih baru', () => {
    const ok = { type: 'header', app: 'runmetricslab', formatVersion: 1 }
    expect(validateHeader(ok)).toBe(ok)
    expect(() => validateHeader({ type: 'run' })).toThrow('backup')
    expect(() => validateHeader({ ...ok, app: 'lain' })).toThrow('backup')
    expect(() => validateHeader({ ...ok, formatVersion: 2 })).toThrow('lebih baru')
    expect(() => validateHeader({ ...ok, formatVersion: 'x' })).toThrow('formatVersion')
    expect(() => validateHeader(null)).toThrow('backup')
  })
  it('sanitizeProfile hanya meloloskan nilai valid', () => {
    expect(sanitizeProfile({ hrMax: 190, hrRest: 60, sex: 'male', riegelExponent: 1.06, weeklyTargetKm: 40, lastBackupAt: 5 }))
      .toEqual({ hrMax: 190, hrRest: 60, sex: 'male', riegelExponent: 1.06, weeklyTargetKm: 40 })
    expect(sanitizeProfile({ hrMax: 999, hrRest: 'x', sex: 'lain', riegelExponent: 3, weeklyTargetKm: 0 })).toEqual({})
    expect(sanitizeProfile({ hrMax: null, hrRest: null, sex: null })).toEqual({ hrMax: null, hrRest: null, sex: null })
    expect(sanitizeProfile(undefined)).toEqual({})
  })
  it('planKey stabil', () => expect(planKey({ createdAt: 1, name: 'A', totalWeeks: 8, raceDate: '2026-12-20' })).toBe('1|A|8|2026-12-20'))
})

describe('readLines', () => {
  const fakeStream = (chunks) => ({
    getReader() {
      let i = 0
      return { read: async () => (i < chunks.length ? { done: false, value: chunks[i++] } : { done: true, value: undefined }), releaseLock() {} }
    },
  })
  it('memotong per baris lintas potongan, termasuk karakter UTF-8 yang terpotong; baris kosong dilewati', async () => {
    const bytes = new TextEncoder().encode('{"a":"é"}\n{"b":1}\n\n{"c":2}')
    const cut = bytes.indexOf(0xc3) + 1 // di tengah karakter 2 byte
    const out = []
    for await (const l of readLines(fakeStream([bytes.slice(0, cut), bytes.slice(cut, cut + 7), bytes.slice(cut + 7)]))) out.push(l)
    expect(out).toEqual(['{"a":"é"}', '{"b":1}', '{"c":2}'])
  })
})
