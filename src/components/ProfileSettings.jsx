import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import GlassCard from './ui/GlassCard'
import Field from './ui/Field'
import Button from './ui/Button'
import ThinProgressBar from './ui/ThinProgressBar'
import { db, getAllSettings, setSetting } from '../db/runDatabase'
import { recalculateAllTrimp } from '../db/recompute'
import { validateProfile } from '../utils/formValidation'

const str = (v) => (v === null || v === undefined ? '' : String(v).replace('.', ','))
const toForm = (st) => ({
  hrMax: str(st.hrMax), hrRest: str(st.hrRest), sex: st.sex ?? '',
  riegelExponent: str(st.riegelExponent), weeklyTargetKm: str(st.weeklyTargetKm),
})

export default function ProfileSettings() {
  const settings = useLiveQuery(() => getAllSettings(), [])
  const peakHr = useLiveQuery(async () => {
    let max = null
    await db.activities.each((a) => {
      if (Number.isFinite(a.maxHr) && (max === null || a.maxHr > max)) max = a.maxHr
    })
    return max
  }, [], null)
  const [form, setForm] = useState(null)
  const [errors, setErrors] = useState({})
  const [saved, setSaved] = useState(false)
  const [progress, setProgress] = useState(null)
  const [recalcError, setRecalcError] = useState('')

  useEffect(() => {
    if (settings && form === null) setForm(toForm(settings))
  }, [settings, form])

  if (!settings || !form) {
    return <GlassCard><p className="text-sm text-text-muted">Memuat profil…</p></GlassCard>
  }

  const change = (name) => (e) => {
    const { value } = e.target
    setForm((f) => ({ ...f, [name]: value }))
    setErrors((p) => ({ ...p, [name]: undefined }))
    setSaved(false)
  }

  async function submit(e) {
    e.preventDefault()
    const v = validateProfile(form)
    setErrors(v.errors)
    if (!v.ok) return
    const hrChanged = ['hrMax', 'hrRest', 'sex'].some((k) => (settings[k] ?? null) !== v.values[k])
    await db.transaction('rw', db.settings, async () => {
      for (const [k, val] of Object.entries(v.values)) await setSetting(k, val)
      if (hrChanged) await setSetting('trimpStale', true)
    })
    setSaved(true)
  }

  async function recalc() {
    setRecalcError('')
    setProgress({ done: 0, total: 0 })
    try {
      await recalculateAllTrimp((done, total) => setProgress({ done, total }))
    } catch (err) {
      setRecalcError(err?.message || 'Gagal menghitung ulang TRIMP')
    } finally {
      setProgress(null)
    }
  }

  return (
    <GlassCard className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Profil dan pengaturan</h2>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field id="pf-hrmax" label="HR maks (bpm)" error={errors.hrMax}
          hint="Pakai HR maks hasil tes lapangan atau data terbaikmu, bukan rumus 220 dikurangi usia.">
          {(p) => <input {...p} type="text" inputMode="numeric" value={form.hrMax} onChange={change('hrMax')} />}
        </Field>
        {Number.isFinite(peakHr) && (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-surface p-3 text-sm">
            <span className="text-text-muted">
              HR tertinggi tercatat: <span className="font-semibold tabular-nums text-text-main">{peakHr} bpm</span> (hanya saran)
            </span>
            <Button variant="secondary" onClick={() => setForm((f) => ({ ...f, hrMax: String(peakHr) }))}>Pakai</Button>
          </div>
        )}
        <Field id="pf-hrrest" label="HR istirahat (bpm)" error={errors.hrRest}>
          {(p) => <input {...p} type="text" inputMode="numeric" value={form.hrRest} onChange={change('hrRest')} />}
        </Field>
        <Field id="pf-sex" label="Jenis kelamin (koefisien TRIMP)" error={errors.sex}>
          {(p) => (
            <select {...p} value={form.sex} onChange={change('sex')}>
              <option value="">Pilih…</option>
              <option value="male">Pria</option>
              <option value="female">Wanita</option>
            </select>
          )}
        </Field>
        <Field id="pf-riegel" label="Eksponen Riegel" error={errors.riegelExponent} hint="Bawaan 1,06. Rentang 1,00–1,20.">
          {(p) => <input {...p} type="text" inputMode="decimal" value={form.riegelExponent} onChange={change('riegelExponent')} />}
        </Field>
        <Field id="pf-target" label="Target mingguan (km)" error={errors.weeklyTargetKm}>
          {(p) => <input {...p} type="text" inputMode="decimal" value={form.weeklyTargetKm} onChange={change('weeklyTargetKm')} />}
        </Field>
        <div className="flex items-center gap-3">
          <Button type="submit">Simpan profil</Button>
          {saved && <p role="status" className="text-sm text-ok">Profil disimpan</p>}
        </div>
      </form>

      {(settings.trimpStale || progress) && (
        <div className="flex flex-col gap-2 rounded-xl border border-warn p-3 text-sm">
          <p className="text-warn">Profil HR berubah. TRIMP dan best effort aktivitas lama perlu dihitung ulang.</p>
          {progress && (
            <ThinProgressBar value={progress.total ? progress.done / progress.total : null} name="Menghitung" />
          )}
          <Button variant="secondary" onClick={recalc} disabled={!!progress}>Hitung ulang TRIMP</Button>
          {recalcError && <p role="alert" className="text-accent-pink">{recalcError}</p>}
        </div>
      )}
    </GlassCard>
  )
}
