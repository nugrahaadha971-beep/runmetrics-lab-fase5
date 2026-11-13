import { describe, it, expect } from 'vitest'
import { tokens } from '../tokens.js'

const parse = (c) => {
  if (c.startsWith('#')) {
    const n = parseInt(c.slice(1), 16)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 }
  }
  const [r, g, b, a] = c.match(/[\d.]+/g).map(Number)
  return { r, g, b, a }
}
const over = (fg, bg) => ({
  r: fg.r * fg.a + bg.r * (1 - fg.a),
  g: fg.g * fg.a + bg.g * (1 - fg.a),
  b: fg.b * fg.a + bg.b * (1 - fg.a),
})
const lum = ({ r, g, b }) => {
  const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const contrast = (fg, bg) => {
  const [a, b] = [lum(over(parse(fg), parse(bg))), lum(parse(bg))].sort((x, y) => y - x)
  return (a + 0.05) / (b + 0.05)
}

describe('design tokens', () => {
  it('memuat semua token Bagian 4A', () => {
    for (const k of ['bg-from', 'bg-to', 'surface', 'accent-from', 'accent-to', 'accent-pink',
      'accent-cyan', 'text-main', 'text-muted', 'track']) {
      expect(tokens[k]).toBeTruthy()
    }
  })

  it('teks utama dan teks redup memenuhi WCAG AA (4.5:1) di kedua ujung gradasi', () => {
    for (const bg of [tokens['bg-from'], tokens['bg-to']]) {
      expect(contrast(tokens['text-main'], bg)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(tokens['text-muted'], bg)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('teks navy di atas gradasi aksen memenuhi AA (tombol utama dan tab aktif)', () => {
    for (const bg of [tokens['accent-from'], tokens['accent-to']]) {
      expect(contrast(tokens['bg-from'], bg)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('aksen cyan terbaca di atas latar', () => {
    expect(contrast(tokens['accent-cyan'], tokens['bg-to'])).toBeGreaterThanOrEqual(4.5)
  })
})
