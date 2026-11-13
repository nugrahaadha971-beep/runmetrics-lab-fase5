/** Stream sintetis 1 Hz. segments: [{ secs, speed, hr }] atau [{ pause: detik }] (satu record 'diam' setelah jeda). */
export function profileStream(segments, { altPerM = 0 } = {}) {
  const recs = [{ t: 0, speed: 0, hr: null, alt: 0 }]
  let t = 0
  let dist = 0
  for (const seg of segments) {
    if (seg.pause) {
      t += seg.pause
      recs.push({ t, speed: 0, hr: null, alt: dist * altPerM })
      continue
    }
    for (let k = 0; k < seg.secs; k += 1) {
      t += 1
      dist += seg.speed
      const hr = typeof seg.hr === 'function' ? seg.hr(t) : seg.hr ?? null
      recs.push({ t, speed: seg.speed, hr, alt: dist * altPerM })
    }
  }
  return recs
}

/** 4 m/s konstan sepanjang distM meter. */
export const constStream = (distM, speed = 4, opts) => profileStream([{ secs: Math.round(distM / speed), speed, hr: 150 }], opts)
