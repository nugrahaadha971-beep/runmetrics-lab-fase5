import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { DatabaseBackup } from 'lucide-react'
import Button from './ui/Button'
import { db, getAllSettings } from '../db/runDatabase'
import { backupReminder } from '../utils/backupFormat'

/** Banner bila backup terakhir > 30 hari atau ada >= 20 sesi baru sejak backup terakhir. */
export default function BackupReminderBanner({ onOpen }) {
  const data = useLiveQuery(async () => {
    const createdAts = []
    await db.activities.each((a) => createdAts.push(a.createdAt))
    return { createdAts, settings: await getAllSettings() }
  }, [])
  const [dismissed, setDismissed] = useState(false)
  if (!data || dismissed) return null
  const reminder = backupReminder({ lastBackupAt: data.settings.lastBackupAt, createdAts: data.createdAts })
  if (!reminder) return null
  return (
    <div role="status" className="flex flex-col gap-3 rounded-2xl border border-warn p-3 text-sm">
      <p className="flex items-start gap-2 text-warn">
        <DatabaseBackup size={20} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>{reminder.message}</span>
      </p>
      <div className="flex gap-2">
        <Button onClick={onOpen}>Buka Backup</Button>
        <Button variant="secondary" onClick={() => setDismissed(true)}>Nanti</Button>
      </div>
    </div>
  )
}
