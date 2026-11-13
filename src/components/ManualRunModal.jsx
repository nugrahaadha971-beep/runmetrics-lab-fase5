import { useEffect, useState } from 'react'
import Modal from './ui/Modal'
import Field, { inputClass } from './ui/Field'
import Button from './ui/Button'
import { getAllSettings, saveRunActivity } from '../db/runDatabase'
import { todayLocal } from '../utils/dateUtils'
import { classifyDistance } from '../utils/fileParsers'
import { WORKOUT_TYPES, DISTANCE_CATEGORIES } from '../utils/constants'
import { validateManualRun, buildManualSummary } from '../utils/formValidation'

const emptyForm = () => ({
  date: todayLocal(), title: '', workoutType: 'Easy Run', distanceCategory: '', distance: '',
  hours: '', minutes: '', seconds: '', avgHr: '', rpe: '',
})
const DURATION_FIELDS = [['hours', 'Jam', 'mr-h'], ['minutes', 'Menit', 'mr-m'], ['seconds', 'Detik', 'mr-s']]

export default function ManualRunModal({ open, onClose, onSaved }) {
  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState({})
  const [warnings, setWarnings] = useState([])
  const [saving, setSaving] = useState(false)
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    if (!open) return
    setForm(emptyForm())
    setErrors({})
    setWarnings([])
    setSubmitError('')
  }, [open])

  const change = (name) => (e) => {
    const { value } = e.target
    setForm((f) => ({ ...f, [name]: value }))
    setWarnings([])
    setSubmitError('')
    setErrors((prev) => ({ ...prev, [DURATION_FIELDS.some(([n]) => n === name) ? 'duration' : name]: undefined }))
  }

  async function submit(e) {
    e.preventDefault()
    if (saving) return
    const profile = await getAllSettings()
    const result = validateManualRun(form, profile)
    setErrors(result.errors)
    if (!result.ok) return
    if (result.warnings.length > 0 && warnings.length === 0) {
      setWarnings(result.warnings) // konfirmasi: tekan simpan sekali lagi
      return
    }
    setSaving(true)
    try {
      const summary = buildManualSummary(result.values, form, profile)
      const res = await saveRunActivity(summary, null)
      onSaved?.(res, summary)
      onClose()
    } catch (err) {
      setSubmitError(err?.message || 'Gagal menyimpan lari')
    } finally {
      setSaving(false)
    }
  }

  const km = Number(form.distance.replace(',', '.'))
  const autoCategory = Number.isFinite(km) && km > 0 ? classifyDistance(km) : null

  return (
    <Modal open={open} onClose={onClose} title="Input manual">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field id="mr-date" label="Tanggal" error={errors.date}>
          {(p) => <input {...p} type="date" value={form.date} onChange={change('date')} />}
        </Field>
        <Field id="mr-title" label="Judul (opsional)">
          {(p) => <input {...p} type="text" maxLength={80} value={form.title} onChange={change('title')} />}
        </Field>
        <Field id="mr-type" label="Jenis latihan" error={errors.workoutType}>
          {(p) => (
            <select {...p} value={form.workoutType} onChange={change('workoutType')}>
              {WORKOUT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
        </Field>
        <Field id="mr-distance" label="Jarak (km)" error={errors.distance}>
          {(p) => <input {...p} type="text" inputMode="decimal" placeholder="5,2" value={form.distance} onChange={change('distance')} />}
        </Field>
        <Field id="mr-cat" label="Kategori jarak" error={errors.distanceCategory}
          hint="Otomatis dari jarak; ubah bila perlu.">
          {(p) => (
            <select {...p} value={form.distanceCategory} onChange={change('distanceCategory')}>
              <option value="">{autoCategory ? `Otomatis (${autoCategory})` : 'Otomatis'}</option>
              {DISTANCE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </Field>

        <fieldset className="flex flex-col gap-1" aria-describedby={errors.duration ? 'mr-duration-err' : undefined}>
          <legend className="mb-1 text-sm text-text-main">Durasi</legend>
          <div className="grid grid-cols-3 gap-2">
            {DURATION_FIELDS.map(([name, label, id]) => (
              <label key={id} className="flex flex-col gap-1 text-xs text-text-muted">
                {label}
                <input id={id} type="text" inputMode="numeric" placeholder="0" value={form[name]} onChange={change(name)}
                  aria-invalid={errors.duration ? true : undefined}
                  className={`${inputClass} text-sm ${errors.duration ? 'border-accent-pink' : ''}`} />
              </label>
            ))}
          </div>
          {errors.duration && <p id="mr-duration-err" className="text-sm text-accent-pink">{errors.duration}</p>}
        </fieldset>

        <Field id="mr-hr" label="HR rata-rata (opsional, bpm)" error={errors.avgHr}>
          {(p) => <input {...p} type="text" inputMode="numeric" value={form.avgHr} onChange={change('avgHr')} />}
        </Field>
        <Field id="mr-rpe" label="RPE (1–10)" error={errors.rpe}
          hint="Seberapa berat latihan terasa. Wajib bila HR kosong.">
          {(p) => <input {...p} type="text" inputMode="numeric" value={form.rpe} onChange={change('rpe')} />}
        </Field>

        {warnings.length > 0 && (
          <div role="alert" className="rounded-xl border border-warn p-3 text-sm text-warn">
            {warnings.map((w) => <p key={w}>{w}</p>)}
            <p className="mt-1 text-text-muted">Tekan &quot;Simpan tetap&quot; bila datanya memang benar.</p>
          </div>
        )}
        {submitError && <p role="alert" className="text-sm text-accent-pink">{submitError}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : warnings.length > 0 ? 'Simpan tetap' : 'Simpan'}</Button>
        </div>
      </form>
    </Modal>
  )
}
