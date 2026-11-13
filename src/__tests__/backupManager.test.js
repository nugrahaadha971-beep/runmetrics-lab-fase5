import 'fake-indexeddb/auto' // sebelum modul Dexie dimuat
import { describe, it, expect, beforeEach } from 'vitest'
import { db, saveRunActivity, setSetting, getSetting } from '../db/runDatabase.js'
import { exportBackup, exportBackupLines, importBackupLines } from '../utils/backupManager.js'
import { constStream } from './helpers/streams.js'

const SIX_AM_WIB = Date.UTC(2026, 2, 10, 23, 0, 0)

async function seed() {
  await setSetting('hrMax', 190)
  await setSetting('hrRest', 60)
  await setSetting('sex', 'male')
  const withGps = constStream(3000).map((r, i) => ({ ...r, lat: -0.06 + i * 1e-5, lng: 109.3 }))
  const a = await saveRunActivity(
    { startTimeMs: SIX_AM_WIB, tzOffsetMin: 420, distanceKm: 3, durationSec: 750, source: 'fit', title: 'Lari =A', workoutType: 'Easy Run', distanceCategory: 'Pendek', avgHr: 150 },
    { records: withGps, laps: [{ km: 1 }] },
  )
  const b = await saveRunActivity({ startTimeMs: SIX_AM_WIB + 86400000, distanceKm: 5.02, durationSec: 1500, source: 'manual', createdAt: 111, title: 'Manual', rpe: 5 })
  const planId = await db.plans.add({ name: 'Contoh', source: 'sample', totalWeeks: 8, raceDate: '2026-12-20', status: 'aktif', paceBasis: null, createdAt: 222 })
  await db.plannedWorkouts.bulkAdd([
    { planId, weekNo: 1, date: '2026-12-20', kind: 'race', subtype: null, steps: [{ type: 'steady', distance: 5000, pace: 'effort' }], notes: '', status: 'done', activityFingerprint: a.fingerprint },
    { planId, weekNo: 2, date: '2026-12-13', kind: 'long', subtype: null, steps: [], notes: '', status: 'planned', activityFingerprint: null },
  ])
  return { a, b }
}
const collect = async (opts) => {
  const out = []
  for await (const l of exportBackupLines(opts)) out.push(l)
  return out
}
const clearAll = () => Promise.all([db.activities.clear(), db.streams.clear(), db.settings.clear(), db.plans.clear(), db.plannedWorkouts.clear()])
const counts = async () => ({
  activities: await db.activities.count(), streams: await db.streams.count(),
  plans: await db.plans.count(), workouts: await db.plannedWorkouts.count(),
})

beforeEach(clearAll)

describe('ekspor', () => {
  it('header lalu satu baris per aktivitas; id dan cache tidak diekspor; stream menempel; program ikut', async () => {
    await seed()
    const parsed = (await collect({ mode: 'full' })).map((l) => JSON.parse(l))
    expect(parsed[0]).toMatchObject({ type: 'header', app: 'runmetricslab', formatVersion: 1, mode: 'full' })
    expect(parsed[0].settings).toMatchObject({ hrMax: 190, hrRest: 60, sex: 'male' })
    const runs = parsed.filter((l) => l.type === 'run')
    expect(runs).toHaveLength(2)
    expect('id' in runs[0].activity).toBe(false)
    expect('bestEfforts' in runs[0].activity).toBe(false)
    expect(runs.filter((r) => r.stream)).toHaveLength(1)
    expect(runs.find((r) => r.stream).stream.records.length).toBeGreaterThan(100)
    const plans = parsed.filter((l) => l.type === 'plan')
    expect(plans).toHaveLength(1)
    expect(plans[0].workouts).toHaveLength(2)
    expect('planId' in plans[0].workouts[0]).toBe(false)
  })
  it('mode ringkas: tanpa stream', async () => {
    await seed()
    const runs = (await collect({ mode: 'compact' })).map((l) => JSON.parse(l)).filter((l) => l.type === 'run')
    expect(runs.every((r) => r.stream === null)).toBe(true)
  })
  it('exportBackup menghasilkan Blob dan mencatat lastBackupAt', async () => {
    await seed()
    const { blob, counts: c, filename } = await exportBackup({ mode: 'full', now: 12345 })
    expect(blob.size).toBeGreaterThan(0)
    expect(c.runs).toBe(2)
    expect(filename.endsWith('-lengkap.jsonl')).toBe(true)
    expect(await getSetting('lastBackupAt')).toBe(12345)
  })
})

describe('impor', () => {
  it('ekspor, impor ke DB kosong memulihkan semuanya; impor dua kali berturut-turut tidak menggandakan', async () => {
    const { a } = await seed()
    const before = await counts()
    const lines = await collect({ mode: 'full' })
    await clearAll()

    const r1 = await importBackupLines(lines)
    expect(r1).toMatchObject({ added: 2, duplicates: 0, failed: 0, plansAdded: 1, profile: 'diterapkan' })
    const after1 = await counts()
    expect(after1).toEqual(before)
    expect(await getSetting('hrMax')).toBe(190)
    expect(await getSetting('hrRest')).toBe(60)
    expect(await getSetting('sex')).toBe('male')

    const r2 = await importBackupLines(lines)
    const r3 = await importBackupLines(lines)
    expect(r2).toMatchObject({ added: 0, duplicates: 2, failed: 0, plansAdded: 0, plansSkipped: 1 })
    expect(r3.added).toBe(0)
    expect(await counts()).toEqual(before)

    const ws = await db.plannedWorkouts.toArray()
    const race = ws.find((w) => w.kind === 'race')
    expect(race.status).toBe('done')
    expect(race.activityFingerprint).toBe(a.fingerprint)
    expect(await db.activities.where('fingerprint').equals(a.fingerprint).count()).toBe(1)
    const restored = (await db.activities.toArray()).find((x) => x.fingerprint === a.fingerprint)
    expect((await db.streams.get(restored.id)).records.length).toBeGreaterThan(100) // ID baru cocok dengan stream
    expect(restored.date).toBe('2026-03-11')
    expect(restored.bestEfforts).toBeTruthy()
  })

  it('profil yang sudah ada: bertanya dulu; ditolak = dipertahankan, diterima = ditimpa, tanpa penjawab = dipertahankan', async () => {
    await seed()
    const lines = await collect({ mode: 'compact' })
    await clearAll()
    await setSetting('hrMax', 180)
    await setSetting('hrRest', 50)
    await setSetting('sex', 'female')
    let asked = 0
    const no = await importBackupLines(lines, { confirmProfile: async () => { asked += 1; return false } })
    expect(asked).toBe(1)
    expect(no.profile).toBe('dipertahankan')
    expect(await getSetting('hrMax')).toBe(180)
    const none = await importBackupLines(lines)
    expect(none.profile).toBe('dipertahankan')
    expect(await getSetting('sex')).toBe('female')
    const yes = await importBackupLines(lines, { confirmProfile: async ({ current, incoming }) => current.hrMax === 180 && incoming.hrMax === 190 })
    expect(yes.profile).toBe('diterapkan')
    expect(await getSetting('hrMax')).toBe(190)
    expect(await getSetting('hrRest')).toBe(60)
    expect(await getSetting('trimpStale')).toBe(true) // ada aktivitas lama dengan TRIMP dari profil sebelumnya
  })

  it('profil sama: tidak bertanya', async () => {
    await seed()
    const lines = await collect({ mode: 'compact' })
    let asked = 0
    const r = await importBackupLines(lines, { confirmProfile: async () => { asked += 1; return true } })
    expect(asked).toBe(0)
    expect(r.profile).toBe('sama')
  })

  it('versi lebih baru ditolak sebelum menulis apa pun', async () => {
    await seed()
    const [header, ...rest] = await collect({ mode: 'compact' })
    await clearAll()
    const newer = JSON.stringify({ ...JSON.parse(header), formatVersion: 99 })
    await expect(importBackupLines([newer, ...rest])).rejects.toThrow('lebih baru')
    expect(await counts()).toEqual({ activities: 0, streams: 0, plans: 0, workouts: 0 })
    expect(await getSetting('hrMax')).toBeNull()
  })

  it('baris pertama bukan header, file kosong, dan bukan JSON ditolak', async () => {
    await expect(importBackupLines(['{"type":"run","activity":{}}'])).rejects.toThrow('backup')
    await expect(importBackupLines(['bukan json'])).rejects.toThrow('backup')
    await expect(importBackupLines([])).rejects.toThrow('kosong')
  })

  it('satu baris rusak tidak menghentikan impor; tipe tak dikenal diabaikan; BOM di baris pertama diterima', async () => {
    await seed()
    const lines = await collect({ mode: 'compact' })
    await clearAll()
    const [header, ...runs] = lines
    const mixed = [`\uFEFF${header}`, '{rusak', JSON.stringify({ type: 'run', activity: { distanceKm: 0 } }), JSON.stringify({ type: 'asing' }), ...runs]
    const r = await importBackupLines(mixed)
    expect(r.failed).toBe(2)
    expect(r.ignored).toBe(1)
    expect(r.added).toBe(2)
    expect(r.errors.length).toBe(2)
    expect((await counts()).activities).toBe(2)
  })
})
