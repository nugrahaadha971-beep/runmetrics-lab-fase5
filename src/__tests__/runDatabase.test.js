import 'fake-indexeddb/auto' // wajib sebelum modul Dexie dimuat
import { describe, it, expect, beforeEach } from 'vitest'
import {
  db, saveRunActivity, deleteRunActivity, getSetting, setSetting, getAllSettings, makeFingerprint,
} from '../db/runDatabase.js'
import { localDateOf } from '../utils/dateUtils.js'
import { backfillBestEfforts } from '../db/recompute.js'
import { constStream } from './helpers/streams.js'

const SIX_AM_WIB = Date.UTC(2026, 2, 10, 23, 0, 0) // 11 Maret 2026 06:00 WIB

const summary = (over = {}) => ({
  startTimeMs: SIX_AM_WIB,
  tzOffsetMin: 420,
  distanceKm: 5.01,
  durationSec: 1500,
  source: 'fit',
  title: 'Lari pagi',
  ...over,
})
const stream = () => ({
  records: [
    { t: 0, lat: -6.2088888888, lng: 106.8455555555, hr: 120, cad: 170, speed: 3.3, alt: 10 },
    { t: 5, lat: -6.2089, lng: 106.8456, hr: NaN, cad: 171, speed: 3.4, alt: 11 },
  ],
  laps: [{ km: 1 }],
})

beforeEach(async () => {
  await Promise.all([db.activities.clear(), db.streams.clear(), db.settings.clear()])
})

describe('saveRunActivity', () => {
  it('menyimpan aktivitas dan stream, lari 06.00 WIB masuk tanggal lokal yang benar', async () => {
    const res = await saveRunActivity(summary(), stream())
    expect(res.status).toBe('saved')
    const row = await db.activities.get(res.id)
    expect(row.date).toBe('2026-03-11')
    expect(row.fingerprint).toBe(`${SIX_AM_WIB / 1000}|5010|1500`)
    const s = await db.streams.get(res.id)
    expect(s.records[0].lat).toBe(-6.208889)
    expect(s.records[0].lng).toBe(106.845556)
    expect(s.records[1].hr).toBeNull()
    expect(s.laps).toEqual([{ km: 1 }])
  })

  it('tanpa tzOffsetMin memakai offset perangkat', async () => {
    const { tzOffsetMin: _drop, ...noTz } = summary()
    const res = await saveRunActivity(noTz)
    expect((await db.activities.get(res.id)).date).toBe(localDateOf(SIX_AM_WIB))
  })

  it('duplikat mengembalikan status duplicate, bukan melempar error', async () => {
    await saveRunActivity(summary(), stream())
    const again = await saveRunActivity(summary(), stream())
    expect(again.status).toBe('duplicate')
    expect(await db.activities.count()).toBe(1)
    expect(await db.streams.count()).toBe(1)
  })

  it('transaksi gagal di tengah: kedua tabel tetap kosong', async () => {
    // Fungsi tidak bisa di-clone IndexedDB, jadi streams.add gagal SETELAH activities.add berhasil.
    const broken = { ...stream(), laps: [{ boom() {} }] }
    await expect(saveRunActivity(summary(), broken)).rejects.toBeTruthy()
    expect(await db.activities.count()).toBe(0)
    expect(await db.streams.count()).toBe(0)
  })

  it('input manual dengan createdAt berbeda tidak dianggap duplikat', async () => {
    const a = await saveRunActivity(summary({ source: 'manual', createdAt: 1000 }))
    const b = await saveRunActivity(summary({ source: 'manual', createdAt: 2000 }))
    expect([a.status, b.status]).toEqual(['saved', 'saved'])
    expect(await db.activities.count()).toBe(2)
  })

  it('menolak data wajib yang tidak valid dan tidak menulis apa pun', async () => {
    await expect(saveRunActivity(summary({ distanceKm: 0 }))).rejects.toThrow('Jarak')
    await expect(saveRunActivity(summary({ durationSec: NaN }))).rejects.toThrow('Durasi')
    await expect(saveRunActivity(summary({ startTimeMs: undefined }))).rejects.toThrow('Waktu')
    expect(await db.activities.count()).toBe(0)
  })

  it('field opsional yang tidak bisa dihitung disimpan null, bukan NaN atau 0', async () => {
    const res = await saveRunActivity(summary({ avgHr: NaN, trimp: Infinity, rpe: undefined }))
    const row = await db.activities.get(res.id)
    expect(row.avgHr).toBeNull()
    expect(row.trimp).toBeNull()
    expect(row.rpe).toBeNull()
    expect(row.avgPaceSec).toBeNull()
  })

  it('menyimpan cache best effort: dari stream (tepat) dan tanpa stream (perkiraan)', async () => {
    const a = await saveRunActivity(summary({ distanceKm: 6, durationSec: 1500, startTimeMs: SIX_AM_WIB + 1000 }), { records: constStream(6000), laps: [] })
    const e5 = (await db.activities.get(a.id)).bestEfforts.find((e) => e.key === '5K')
    expect(e5.timeSec).toBeCloseTo(1250, 3)
    expect(e5.estimated).toBe(false)
    const b = await saveRunActivity(summary({ distanceKm: 5.02, durationSec: 1500, source: 'manual', createdAt: 5 }))
    expect((await db.activities.get(b.id)).bestEfforts[0].estimated).toBe(true)
  })

  it('id dari luar diabaikan (id dibuat ulang saat impor backup)', async () => {
    const res = await saveRunActivity(summary({ id: 999 }))
    expect(res.id).not.toBe(999)
  })
})

describe('backfillBestEfforts', () => {
  it('mengisi aktivitas lama yang belum punya cache, lalu tidak mengulang', async () => {
    const id = await db.activities.add({ fingerprint: 'lama', date: '2026-03-11', startTimeMs: 1, distanceKm: 5.02, durationSec: 1500 })
    expect((await backfillBestEfforts()).total).toBe(1)
    expect((await db.activities.get(id)).bestEfforts[0].key).toBe('5K')
    expect((await backfillBestEfforts()).total).toBe(0)
  })
})

describe('deleteRunActivity', () => {
  it('menghapus aktivitas dan stream sekaligus', async () => {
    const { id } = await saveRunActivity(summary(), stream())
    await deleteRunActivity(id)
    expect(await db.activities.count()).toBe(0)
    expect(await db.streams.count()).toBe(0)
  })
})

describe('settings', () => {
  it('memakai nilai default bila belum diset', async () => {
    expect(await getSetting('riegelExponent')).toBe(1.06)
    expect(await getSetting('hrMax')).toBeNull()
    expect(await getSetting('tidakAda')).toBeNull()
  })
  it('set lalu get, dan getAllSettings menggabungkan default', async () => {
    await setSetting('hrMax', 190)
    await setSetting('sex', 'female')
    expect(await getSetting('hrMax')).toBe(190)
    expect(await getAllSettings()).toMatchObject({ hrMax: 190, sex: 'female', hrRest: null, riegelExponent: 1.06 })
  })
})

describe('makeFingerprint', () => {
  it('membulatkan detik, meter, dan durasi', () => {
    expect(makeFingerprint({ startTimeMs: 1773183600123, distanceKm: 5.0004, durationSec: 1500.4 }))
      .toBe('1773183600|5000|1500')
  })
  it('menambahkan createdAt bila diberikan', () => {
    expect(makeFingerprint({ startTimeMs: 1000, distanceKm: 1, durationSec: 60 }, 42)).toBe('1|1000|60|42')
  })
})
