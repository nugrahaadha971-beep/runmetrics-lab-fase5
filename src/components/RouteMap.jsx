import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const BOUNDS_OPTS = { padding: [24, 24] }

/**
 * Peta rute: polyline + circleMarker (tanpa L.marker agar tidak ada ikon 404 setelah bundling).
 * Instance disimpan di ref dan selalu di-remove() saat cleanup, sehingga aman dibuka-tutup berulang.
 */
export default function RouteMap({ latlngs }) {
  const elRef = useRef(null)
  const mapRef = useRef(null)

  useEffect(() => {
    const el = elRef.current
    if (!el || latlngs.length < 2) return undefined

    const map = L.map(el, { zoomControl: true, attributionControl: true })
    mapRef.current = map
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    }).addTo(map)
    const line = L.polyline(latlngs, { className: 'route-line', interactive: false }).addTo(map)
    L.circleMarker(latlngs[0], { className: 'route-start', radius: 7, interactive: false }).addTo(map)
    L.circleMarker(latlngs[latlngs.length - 1], { className: 'route-end', radius: 7, interactive: false }).addTo(map)
    map.setView(line.getBounds().getCenter(), 14) // tampilan awal aman walau wadah belum berukuran

    const fit = () => {
      if (el.clientWidth === 0 || el.clientHeight === 0) return // fitBounds pada wadah 0 px menghasilkan NaN
      map.invalidateSize()
      map.fitBounds(line.getBounds(), BOUNDS_OPTS)
    }
    fit()
    const timer = setTimeout(fit, 60) // setelah modal terbuka dan terlihat
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => map.invalidateSize())
    observer?.observe(el)

    return () => {
      clearTimeout(timer)
      observer?.disconnect()
      map.remove()
      mapRef.current = null
    }
  }, [latlngs])

  return <div ref={elRef} role="group" aria-label="Peta rute lari" className="h-56 w-full overflow-hidden rounded-2xl" />
}
