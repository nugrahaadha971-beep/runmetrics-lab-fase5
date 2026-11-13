import { useEffect, useState } from 'react'
import { CalendarCheck, History, Home, Menu, Plus, Settings, User } from 'lucide-react'
import GlassCard from './components/ui/GlassCard'
import GradientDefs from './components/ui/GradientDefs'
import Button from './components/ui/Button'
import BottomNav from './components/ui/BottomNav'
import RunFileUploader from './components/RunFileUploader'
import ManualRunModal from './components/ManualRunModal'
import ProfileSettings from './components/ProfileSettings'
import RunAnalyticsDashboard from './components/RunAnalyticsDashboard'
import RunHistoryWithModal from './components/RunHistoryWithModal'
import DataBackupControls from './components/DataBackupControls'
import BackupReminderBanner from './components/BackupReminderBanner'
import { backfillBestEfforts } from './db/recompute'

const NAV = [
  { id: 'home', label: 'Beranda', icon: Home },
  { id: 'program', label: 'Program', icon: CalendarCheck },
  { id: 'history', label: 'Riwayat', icon: History },
  { id: 'backup', label: 'Backup', icon: Settings },
]

function Header() {
  return (
    <header className="flex items-center gap-3">
      <div className="grid h-12 w-12 place-items-center rounded-full border-2 border-accent-cyan bg-surface">
        <User size={24} strokeWidth={1.75} className="text-accent-cyan" aria-hidden="true" />
      </div>
      <div className="flex-1">
        <p className="text-base font-semibold">Pelari</p>
        <p className="text-sm text-text-muted">
          Latihan <span className="text-accent-cyan">Lari</span>
        </p>
      </div>
      <button type="button" aria-label="Menu" className="grid h-11 w-11 place-items-center rounded-full">
        <Menu size={24} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </header>
  )
}

function ComingSoon({ title, phase }) {
  return (
    <GlassCard>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-text-muted">Bagian ini dibangun pada Fase {phase}.</p>
    </GlassCard>
  )
}

const NO_FILTER = { category: '', workoutType: '' }

export default function App() {
  const [tab, setTab] = useState('home')
  const [manualOpen, setManualOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [filter, setFilter] = useState(NO_FILTER)

  useEffect(() => {
    backfillBestEfforts().catch(() => {}) // isi cache best effort untuk aktivitas lama
  }, [])

  useEffect(() => {
    if (!notice) return undefined
    const id = setTimeout(() => setNotice(''), 5000)
    return () => clearTimeout(id)
  }, [notice])

  const pickCategory = (category) => {
    setFilter({ category, workoutType: '' })
    setTab('history')
  }

  return (
    <div className="min-h-dvh bg-app lg:pl-20">
      <GradientDefs />
      <main className="mx-auto flex w-full max-w-[480px] flex-col gap-4 p-4 pb-28 lg:max-w-7xl lg:pb-8">
        <Header />
        {tab !== 'backup' && <BackupReminderBanner onOpen={() => setTab('backup')} />}
        {notice && <p role="status" className="rounded-xl border border-ok p-3 text-sm text-ok">{notice}</p>}

        {tab === 'home' && (
          <RunAnalyticsDashboard
            onPickCategory={pickCategory}
            onOpenManual={() => setManualOpen(true)}
            onGoUpload={() => setTab('history')}
          />
        )}
        {tab === 'program' && <div className="mx-auto w-full lg:max-w-2xl"><ComingSoon title="Program latihan" phase={7} /></div>}
        {tab === 'history' && (
          <div className="mx-auto flex w-full flex-col gap-4 lg:max-w-2xl">
            <GlassCard className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Tambah lari</h2>
                <p className="text-sm text-text-muted">Untuk lari tanpa file, mis. treadmill.</p>
              </div>
              <Button onClick={() => setManualOpen(true)}>
                <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
                Input manual
              </Button>
            </GlassCard>
            <RunFileUploader />
            <RunHistoryWithModal filter={filter} onFilterChange={setFilter} />
          </div>
        )}
        {tab === 'backup' && (
          <div className="mx-auto flex w-full flex-col gap-4 lg:max-w-2xl">
            <ProfileSettings />
            <DataBackupControls />
          </div>
        )}
      </main>
      <BottomNav items={NAV} active={tab} onChange={setTab} />
      <ManualRunModal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        onSaved={(res) => setNotice(res.status === 'saved' ? 'Lari tersimpan' : 'Lari ini sudah ada')}
      />
    </div>
  )
}
