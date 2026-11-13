// @vitest-environment jsdom
import 'fake-indexeddb/auto' // sebelum modul Dexie dimuat
import { describe, it, expect, beforeEach } from 'vitest'
import { importRunFile, MAX_FILE_BYTES } from '../utils/importFile.js'
import { db } from '../db/runDatabase.js'
import { localDateOf } from '../utils/dateUtils.js'
import { gpxFixture } from './helpers/gpxFixture.js'

const fakeFile = (name, text) => ({ name, size: text.length, text: async () => text })
const run = () => gpxFixture({ points: 340 }) // 5.085 m, kategori 5K

beforeEach(async () => {
  await Promise.all([db.activities.clear(), db.streams.clear(), db.settings.clear()])
})

describe('importRunFile', () => {
  it('GPX valid tersimpan lengkap dengan stream, kategori otomatis, dan tanggal lokal', async () => {
    const out = await importRunFile(fakeFile('a.gpx', run()), { workoutType: 'Tempo' })
    expect(out.status).toBe('berhasil')
    expect(out.distanceCategory).toBe('5K')
    const row = await db.activities.get(out.id)
    expect(row.workoutType).toBe('Tempo')
    expect(row.date).toBe(localDateOf(Date.parse('2026-03-10T23:00:00Z')))
    expect(row.trimp).toBeNull() // tanpa profil HR
    expect(row.avgCadence).toBe(170)
    expect((await db.streams.get(out.id)).records.length).toBe(340)
  })
  it('dengan profil HR, TRIMP dan EF terisi', async () => {
    const out = await importRunFile(fakeFile('a.gpx', run()), { profile: { hrMax: 190, hrRest: 60, sex: 'male' } })
    const row = await db.activities.get(out.id)
    expect(row.trimp).toBeGreaterThan(0)
    expect(row.efficiencyFactor).toBeGreaterThan(0)
  })
  it('file yang sama dua kali: kedua dilewati sebagai duplikat', async () => {
    await importRunFile(fakeFile('a.gpx', run()))
    expect((await importRunFile(fakeFile('b.gpx', run()))).status).toBe('duplikat')
    expect(await db.activities.count()).toBe(1)
  })
  it('file rusak gagal dengan alasan dan tidak menghentikan file berikutnya', async () => {
    const bad = await importRunFile(fakeFile('x.gpx', '<gpx><trk>'))
    expect(bad.status).toBe('gagal')
    expect(bad.message).toContain('rusak')
    expect((await importRunFile(fakeFile('ok.gpx', run()))).status).toBe('berhasil')
    expect(await db.activities.count()).toBe(1)
  })
  it('menolak file > 25 MB dan format selain .fit/.gpx', async () => {
    const big = await importRunFile({ name: 'besar.fit', size: MAX_FILE_BYTES + 1 })
    expect(big.status).toBe('gagal')
    expect(big.message).toContain('25 MB')
    expect((await importRunFile(fakeFile('a.txt', 'x'))).message).toContain('Format tidak didukung')
  })
})
