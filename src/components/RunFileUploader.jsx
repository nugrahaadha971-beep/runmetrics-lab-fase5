import { useRef, useState } from 'react'
import { Check, Clock, Copy, Loader2, TriangleAlert, Upload } from 'lucide-react'
import GlassCard from './ui/GlassCard'
import Button from './ui/Button'
import ThinProgressBar from './ui/ThinProgressBar'
import { inputClass } from './ui/Field'
import { getAllSettings, updateRunActivity } from '../db/runDatabase'
import { importRunFile } from '../utils/importFile'
import { WORKOUT_TYPES, DISTANCE_CATEGORIES } from '../utils/constants'

const STATUS = {
  menunggu: { label: 'Menunggu', Icon: Clock, tone: 'text-text-muted' },
  memproses: { label: 'Memproses…', Icon: Loader2, tone: 'text-accent-cyan', spin: true },
  berhasil: { label: 'Berhasil', Icon: Check, tone: 'text-ok' },
  duplikat: { label: 'Duplikat dilewati', Icon: Copy, tone: 'text-warn' },
  gagal: { label: 'Gagal', Icon: TriangleAlert, tone: 'text-accent-pink' },
}
const ACCEPT = '.fit,.gpx,application/octet-stream,application/gpx+xml,application/xml,text/xml'

export default function RunFileUploader({ onBatchDone }) {
  const [items, setItems] = useState([])
  const [running, setRunning] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [defaultType, setDefaultType] = useState('Easy Run')
  const [error, setError] = useState('')
  const inputRef = useRef(null)
  const busy = useRef(false)

  const patch = (key, p) => setItems((list) => list.map((it) => (it.key === key ? { ...it, ...p } : it)))

  async function handleFiles(fileList) {
    const files = Array.from(fileList ?? [])
    if (files.length === 0 || busy.current) return
    busy.current = true
    setRunning(true)
    setError('')
    const stamp = Date.now()
    const queue = files.map((f, i) => ({ key: `${stamp}-${i}`, name: f.name, status: 'menunggu', message: '' }))
    setItems(queue)
    const counts = { berhasil: 0, duplikat: 0, gagal: 0 }
    try {
      const profile = await getAllSettings()
      for (let i = 0; i < files.length; i += 1) { // berurutan, bukan paralel, agar memori aman
        patch(queue[i].key, { status: 'memproses' })
        const out = await importRunFile(files[i], { workoutType: defaultType, profile })
        counts[out.status] += 1
        patch(queue[i].key, out)
      }
    } catch (err) {
      setError(err?.message || 'Impor terhenti karena kesalahan tak terduga')
    } finally {
      busy.current = false
      setRunning(false)
    }
    onBatchDone?.(counts)
  }

  async function changeField(item, field, value) {
    patch(item.key, { [field]: value })
    try {
      await updateRunActivity(item.id, { [field]: value })
    } catch {
      patch(item.key, { message: 'Gagal menyimpan perubahan' })
    }
  }

  const finished = items.filter((it) => it.status !== 'menunggu' && it.status !== 'memproses').length

  return (
    <GlassCard className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Unggah file lari</h2>

      <label className="flex flex-col gap-1 text-sm">
        Jenis latihan untuk file yang diunggah
        <select className={inputClass} value={defaultType} onChange={(e) => setDefaultType(e.target.value)} disabled={running}>
          {WORKOUT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>

      <div
        onDragOver={(e) => { e.preventDefault(); if (!running) setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
        className={`flex flex-col items-center gap-3 rounded-card border-2 border-dashed p-6 text-center ${dragOver ? 'border-accent-cyan' : 'border-surface-border'}`}
      >
        <Upload size={24} strokeWidth={1.75} className="text-accent-cyan" aria-hidden="true" />
        <p className="text-sm text-text-muted">Seret file .fit atau .gpx ke sini (maks. 25 MB per file), atau pilih dari perangkat.</p>
        <Button onClick={() => inputRef.current?.click()} disabled={running}>Pilih file</Button>
        <input ref={inputRef} type="file" multiple accept={ACCEPT} className="hidden"
          onChange={(e) => { handleFiles(e.target.files); e.target.value = '' }} />
      </div>

      {items.length > 0 && (
        <div className="flex flex-col gap-3" aria-live="polite">
          <div>
            <p className="mb-1 text-sm text-text-muted">{running ? `Memproses ${finished} dari ${items.length}` : `Selesai: ${finished} dari ${items.length}`}</p>
            <ThinProgressBar value={finished / items.length} />
          </div>
          <ul className="flex flex-col gap-3">
            {items.map((it) => {
              const { label, Icon, tone, spin } = STATUS[it.status]
              return (
                <li key={it.key} className="rounded-xl border border-surface-border p-3">
                  <p className="break-all text-sm font-medium">{it.name}</p>
                  <p className={`mt-1 flex items-center gap-2 text-sm ${tone}`}>
                    <Icon size={20} strokeWidth={1.75} aria-hidden="true" className={spin ? 'animate-spin motion-reduce:animate-none' : ''} />
                    <span>{label}{it.message ? ` · ${it.message}` : ''}</span>
                  </p>
                  {it.status === 'berhasil' && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <select aria-label={`Kategori jarak ${it.name}`} className={`${inputClass} text-sm`} value={it.distanceCategory ?? ''}
                        onChange={(e) => changeField(it, 'distanceCategory', e.target.value)}>
                        {DISTANCE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <select aria-label={`Jenis latihan ${it.name}`} className={`${inputClass} text-sm`} value={it.workoutType}
                        onChange={(e) => changeField(it, 'workoutType', e.target.value)}>
                        {WORKOUT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-accent-pink">{error}</p>}
    </GlassCard>
  )
}
