const M_PER_DEG = 111194.927 // 6.371.000 m * pi / 180

/** GPX sintetis: lari lurus ke utara, langkah tetap. 119 langkah x 15 m = 1785 m, 595 detik. */
export function gpxFixture({
  points = 120, stepM = 15, dtSec = 5, cad = 85, hr = 150, withTime = true,
  startIso = '2026-03-10T23:00:00Z', spikeAt = null, pauseAt = null, pauseSec = 60,
} = {}) {
  const t0 = Date.parse(startIso)
  let offset = 0
  const pts = []
  for (let i = 0; i < points; i += 1) {
    if (pauseAt === i) offset += pauseSec
    const lat = ((spikeAt === i ? i * stepM + 1000 : i * stepM) / M_PER_DEG).toFixed(7)
    const time = withTime ? `<time>${new Date(t0 + (i * dtSec + offset) * 1000).toISOString()}</time>` : ''
    pts.push(
      `<trkpt lat="${lat}" lon="106.8"><ele>${10 + (i % 2) * 0.5}</ele>${time}` +
        `<extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${hr}</gpxtpx:hr><gpxtpx:cad>${cad}</gpxtpx:cad>` +
        `</gpxtpx:TrackPointExtension></extensions></trkpt>`,
    )
  }
  return (
    '<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="tes" xmlns="http://www.topografix.com/GPX/1/1" ' +
    'xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"><wpt lat="1" lon="1"><name>Titik</name></wpt>' +
    `<trk><name>Lari Tes</name><trkseg>${pts.join('')}</trkseg></trk></gpx>`
  )
}

/** Titik mentah (tanpa DOM) dengan pola yang sama, untuk processTrackPoints. */
export function rawPoints(opts = {}) {
  const { points = 120, stepM = 15, dtSec = 5, cad = 85, hr = 150, spikeAt = null, pauseAt = null, pauseSec = 60 } = opts
  let offset = 0
  return Array.from({ length: points }, (_, i) => {
    if (pauseAt === i) offset += pauseSec
    return {
      lat: (spikeAt === i ? i * stepM + 1000 : i * stepM) / M_PER_DEG,
      lng: 106.8,
      timeMs: Date.parse('2026-03-10T23:00:00Z') + (i * dtSec + offset) * 1000,
      alt: 10 + (i % 2) * 0.5,
      hr,
      cad,
    }
  })
}
