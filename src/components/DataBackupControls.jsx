import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Download, FileSpreadsheet, Upload } from 'lucide-react'
import GlassCard from './ui/GlassCard'
import Button from './ui/Button'
import { inputClass } from './ui/Field'
import { db, getAllSettings } from '../db/runDatabase'
import {
  downloadBlob, exportBackup, exportCsv, getStorageInfo, importBackupFile, requestPersistentStorage,
} from '../utils/backupManager'
import { localDateOf } from '../utils/dateUtils'

const SEX = { male: 'Pria', female: 'Wanita' }
const mb = (b) => (Number.isFinite(b) ? `${(b / 1048576).toFixed(1).replace('.', ',')} MB` : '—')
const show = (v) => (v === null || v === undefined ? '—' : SEX[v] ?? String(v))

export default function DataBackupControls() {
  const settings = useLiveQuery(() => getAllSettings(), [])
  const count = useLiveQuery(() => db.activities.count(), [])
  const [busy, setBusy] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [report, setReport] = useState(null)
  const [delimiter, setDelimiter] = useState(';')
  const [pending, setPending] = useState(null) // { current, incoming, resolve }
  const [storage, setStorage] = useState({ usage: null, quota: null, persisted: null })
  const fileRef = useRef(null)

  const refreshStorage = () => getStorageInfo().then(setStorage)
  useEffect(() => { refreshStorage() }, [count])

  async function run(kind, task) {
    if (busy) return
    setBusy(kind)
    setError('')
    setMessage('')
    setReport(null)
    try {
      await task()
    } catch (err) {
      setError(err?.message || 'Terjadi kesalahan tak terduga')
    } finally {
      setBusy(null)
      refreshStorage()
    }
  }

  const doExport = (mode) => run('export', async () => {
    const { blob, counts, filename } = await exportBackup({ mode })
    downloadBlob(blob, filename)
    setMessage(`Backup ${mode === 'full' ? 'lengkap' : 'ringkas'} dibuat: ${counts.runs} aktivitas, ${counts.plans} program (${mb(blob.size)}).`)
  })

  const doCsv = () => run('csv', async () => {
    const { blob, count: n, filename } = await exportCsv({ delimiter })
    downloadBlob(blob, filename)
    setMessage(`CSV dibuat: ${n} aktivitas.`)
  })

  const doImport = (file) => run('import', async () => {
    setReport(await importBackupFile(file, {
      confirmProfile: (diff) => new Promise((resolve) => setPending({ ...diff, resolve })),
    }))
  })

  const answer = (value) => {
    pending?.resolve(value)
    setPending(null)
  }

  const last = settings?.lastBackupAt
  return (
    <GlassCard className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Backup dan pemulihan</h2>
        <p className="mt-1 text-sm text-text-muted">
          {Number.isFinite(last) ? `Backup terakhir: ${localDateOf(last)}` : 'Belum pernah backup.'} Data hanya tersimpan di
          browser perangkat ini, jadi backup secara rutin.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Button onClick={() => doExport('full')} disabled={!!busy}>
          <Download size={20} strokeWidth={1.75} aria-hidden="true" />
          {busy === 'export' ? 'Menyiapkan…' : 'Backup lengkap (dengan titik GPS)'}
        </Button>
        <Button variant="secondary" onClick={() => doExport('compact')} disabled={!!busy}>
          <Download size={20} strokeWidth={1.75} aria-hidden="true" />
          Backup ringkas (tanpa GPS)
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-sm">
          Pemisah CSV
          <select className={inputClass} value={delimiter} onChange={(e) => setDelimiter(e.target.value)}>
            <option value=";">Titik koma (Excel berlokal Indonesia)</option>
            <option value=",">Koma</option>
          </select>
        </label>
        <Button variant="secondary" onClick={doCsv} disabled={!!busy}>
          <FileSpreadsheet size={20} strokeWidth={1.75} aria-hidden="true" />
          Ekspor CSV
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={!!busy}>
          <Upload size={20} strokeWidth={1.75} aria-hidden="true" />
          {busy === 'import' ? 'Memulihkan…' : 'Pulihkan dari file backup'}
        </Button>
        <input ref={fileRef} type="file" accept=".jsonl,.json,application/x-ndjson,application/json,text/plain,application/octet-stream" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) doImport(f) }} />
        <p className="text-xs text-text-muted">Aktivitas yang sudah ada dilewati, jadi aman diimpor berulang.</p>
      </div>

      {pending && (
        <div role="alertdialog" aria-label="Konfirmasi timpa profil" className="rounded-xl border border-warn p-3 text-sm">
          <p className="font-semibold text-warn">Timpa profil HR yang sudah ada?</p>
          <table className="mt-2 w-full text-left tabular-nums">
            <thead className="text-xs text-text-muted">
              <tr><th scope="col" className="font-normal">Pengaturan</th><th scope="col" className="font-normal">Sekarang</th><th scope="col" className="font-normal">Di backup</th></tr>
            </thead>
            <tbody>
              {[['hrMax', 'HR maks'], ['hrRest', 'HR istirahat'], ['sex', 'Jenis kelamin'], ['riegelExponent', 'Eksponen Riegel'], ['weeklyTargetKm', 'Target mingguan']]
                .filter(([k]) => k in pending.incoming)
                .map(([k, label]) => (
                  <tr key={k} className="border-t border-surface-border">
                    <td className="py-1">{label}</td><td>{show(pending.current[k])}</td><td>{show(pending.incoming[k])}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => answer(false)}>Pertahankan profilku</Button>
            <Button onClick={() => answer(true)}>Timpa dengan backup</Button>
          </div>
        </div>
      )}

      {message && <p role="status" className="text-sm text-ok">{message}</p>}
      {error && <p role="alert" className="text-sm text-accent-pink">{error}</p>}
      {report && (
        <div role="status" className="rounded-xl border border-surface-border bg-surface p-3 text-sm">
          <p className="font-semibold">Hasil pemulihan</p>
          <ul className="mt-1 tabular-nums">
            <li>Ditambahkan: {report.added} aktivitas</li>
            <li>Duplikat dilewati: {report.duplicates}</li>
            <li>Gagal: {report.failed}</li>
            <li>Program: {report.plansAdded} ditambahkan, {report.plansSkipped} dilewati</li>
            <li>Profil HR: {report.profile}</li>
          </ul>
          {report.errors.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs text-accent-pink">
              {report.errors.map((m, i) => <li key={i}>{m}</li>)}
            </ul>
          )}
        </div>
      )}

      <div className="border-t border-surface-border pt-3 text-sm">
        <p className="font-semibold">Penyimpanan perangkat</p>
        <p className="text-text-muted tabular-nums">Terpakai {mb(storage.usage)} dari {mb(storage.quota)}</p>
        <p className="text-text-muted">
          Penyimpanan permanen: {storage.persisted === null ? 'tidak diketahui' : storage.persisted ? 'aktif' : 'belum aktif'}
        </p>
        {storage.persisted === false && (
          <div className="mt-2">
            <Button variant="secondary" onClick={async () => { await requestPersistentStorage(); refreshStorage() }}>Minta penyimpanan permanen</Button>
          </div>
        )}
      </div>
    </GlassCard>
  )
}
