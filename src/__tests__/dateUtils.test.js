import { describe, it, expect } from 'vitest'
import {
  toLocalDateString, localDateOf, getTzOffsetMin, isValidDateString,
  addDays, daysBetween, weekStartMonday, formatPace, formatDuration,
  dayIndexMonday, daysInMonth, monthStart, formatShortDate, formatRaceTime, formatKm,
} from '../utils/dateUtils.js'

describe('tanggal lokal', () => {
  it('2026-03-10 23:30 UTC dengan offset +420 menjadi 2026-03-11', () => {
    expect(toLocalDateString(Date.UTC(2026, 2, 10, 23, 30), 420)).toBe('2026-03-11')
  })
  it('lari 06.00 WIB jatuh di tanggal hari itu, bukan hari sebelumnya', () => {
    const sixAmWib = Date.UTC(2026, 2, 10, 23, 0) // 11 Maret 06:00 WIB
    expect(new Date(sixAmWib).toISOString().slice(0, 10)).toBe('2026-03-10')
    expect(toLocalDateString(sixAmWib, 420)).toBe('2026-03-11')
  })
  it('offset negatif mundur ke hari sebelumnya', () => {
    expect(toLocalDateString(Date.UTC(2026, 2, 11, 2, 0), -300)).toBe('2026-03-10')
  })
  it('localDateOf sama dengan getter tanggal lokal perangkat', () => {
    const ms = Date.UTC(2026, 5, 15, 12, 0)
    const d = new Date(ms)
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    expect(localDateOf(ms)).toBe(expected)
    expect(Number.isInteger(getTzOffsetMin(ms))).toBe(true)
  })
})

describe('aritmetika tanggal', () => {
  it('addDays melewati batas bulan dan tahun', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('daysBetween', () => {
    expect(daysBetween('2026-10-26', '2026-12-14')).toBe(49)
    expect(daysBetween('2026-12-14', '2026-12-14')).toBe(0)
  })
  it('weekStartMonday: Kamis, Minggu, dan Senin', () => {
    expect(weekStartMonday('2026-11-12')).toBe('2026-11-09')
    expect(weekStartMonday('2026-11-15')).toBe('2026-11-09')
    expect(weekStartMonday('2026-11-09')).toBe('2026-11-09')
  })
  it('isValidDateString menolak tanggal yang tidak ada', () => {
    expect(isValidDateString('2026-02-28')).toBe(true)
    expect(isValidDateString('2026-02-30')).toBe(false)
    expect(isValidDateString('11/03/2026')).toBe(false)
    expect(isValidDateString(null)).toBe(false)
  })
})

describe('format', () => {
  it('formatPace', () => {
    expect(formatPace(300)).toBe('5:00')
    expect(formatPace(359.6)).toBe('6:00')
    for (const bad of [null, undefined, NaN, Infinity, 0, -5]) expect(formatPace(bad)).toBe('—')
  })
  it('formatDuration', () => {
    expect(formatDuration(4360)).toBe('01:12:40')
    expect(formatDuration(59)).toBe('00:00:59')
    expect(formatDuration(null)).toBe('—')
  })
})

describe('format dan util Fase 4', () => {
  it('hari, bulan, dan format singkat', () => {
    expect([dayIndexMonday('2026-11-09'), dayIndexMonday('2026-11-12'), dayIndexMonday('2026-11-15')]).toEqual([0, 3, 6])
    expect([daysInMonth('2026-11-12'), daysInMonth('2028-02-10'), daysInMonth('2026-12-01')]).toEqual([30, 29, 31])
    expect(monthStart('2026-11-12')).toBe('2026-11-01')
    expect(formatShortDate('2026-11-05')).toBe('05/11')
  })
  it('formatRaceTime dan formatKm', () => {
    expect(formatRaceTime(1500)).toBe('25:00')
    expect(formatRaceTime(3727)).toBe('1:02:07')
    expect(formatRaceTime(null)).toBe('—')
    expect(formatKm(5.014)).toBe('5,01')
    expect(formatKm(32.44, 1)).toBe('32,4')
    expect(formatKm(NaN)).toBe('—')
  })
})
