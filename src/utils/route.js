/** Titik [lat, lng] untuk polyline; titik tanpa GPS dibuang, dan jumlahnya dibatasi agar peta tetap ringan. */
export function routeLatLngs(records, max = 3000) {
  const pts = (records ?? []).filter((r) => Number.isFinite(r?.lat) && Number.isFinite(r?.lng)).map((r) => [r.lat, r.lng])
  if (pts.length <= max) return pts
  const step = Math.ceil(pts.length / max)
  const out = pts.filter((_, i) => i % step === 0)
  const last = pts[pts.length - 1]
  if (out[out.length - 1] !== last) out.push(last)
  return out
}
