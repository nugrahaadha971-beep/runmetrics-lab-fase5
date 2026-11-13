// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { parseGpxText } from '../utils/fileParsers.js'
import { gpxFixture } from './helpers/gpxFixture.js'

describe('parseGpxText (DOM)', () => {
  it('membaca trek, HR, cadence (x2 sekali), judul; wpt dan rte diabaikan', () => {
    const xml = gpxFixture().replace('</gpx>', '<rte><rtept lat="50" lon="50"/></rte></gpx>')
    const { summary, stream } = parseGpxText(xml, 'pagi.gpx')
    expect(summary.source).toBe('gpx')
    expect(summary.title).toBe('Lari Tes')
    expect(summary.distanceKm).toBeCloseTo(1.785, 2)
    expect(summary.durationSec).toBe(595)
    expect(summary.avgHr).toBe(150)
    expect(summary.avgCadence).toBe(170)
    expect(stream.records).toHaveLength(120)
  })
  it('menggabungkan beberapa trkseg', () => {
    const parts = gpxFixture().split('</trkpt>')
    const xml = parts.map((p, i) => (i === parts.length - 1 ? p : `${p}</trkpt>${i === 59 ? '</trkseg><trkseg>' : ''}`)).join('')
    expect(parseGpxText(xml).summary.distanceKm).toBeCloseTo(1.785, 2)
  })
  it('cadence yang sudah spm tidak dikali 2', () => {
    expect(parseGpxText(gpxFixture({ cad: 170 })).summary.avgCadence).toBe(170)
  })
  it('GPX rusak ditolak dengan pesan yang bisa dibaca', () => {
    expect(() => parseGpxText('<gpx><trk><trkseg>')).toThrow('rusak')
    expect(() => parseGpxText('bukan xml sama sekali')).toThrow('rusak')
  })
  it('bukan GPX, tanpa trek, dan tanpa waktu ditolak', () => {
    expect(() => parseGpxText('<foo/>')).toThrow('Bukan file GPX')
    expect(() => parseGpxText('<gpx xmlns="http://www.topografix.com/GPX/1/1"></gpx>')).toThrow('tidak berisi trek')
    expect(() => parseGpxText(gpxFixture({ withTime: false }))).toThrow('GPX tanpa waktu tidak bisa dianalisis')
  })
})
