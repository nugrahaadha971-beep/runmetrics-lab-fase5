import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import GlassCard from './ui/GlassCard'
import PillTabs from './ui/PillTabs'
import ActivityScreen from './dashboard/ActivityScreen'
import SummaryScreen from './dashboard/SummaryScreen'
import LoadScreen from './dashboard/LoadScreen'
import AnalysisSection from './dashboard/AnalysisSection'
import { db, getAllSettings } from '../db/runDatabase'
import { srpeToTrimpFactor } from '../utils/runAnalytics'
import useIsDesktop from '../hooks/useIsDesktop'
import useToday from '../hooks/useToday'

const SCREENS = [
  { id: 'activity', label: 'Aktivitas' },
  { id: 'summary', label: 'Ringkasan' },
  { id: 'load', label: 'Beban' },
  { id: 'analysis', label: 'Analisis' },
]

/** Mobile: satu layar per sub-tab. Desktop (>= 1024 px): layar 1, 2, 3 sebagai tiga kolom, Analisis di bawahnya. */
export default function RunAnalyticsDashboard({ onPickCategory, onOpenManual, onGoUpload }) {
  const activities = useLiveQuery(() => db.activities.orderBy('startTimeMs').toArray(), [])
  const settings = useLiveQuery(() => getAllSettings(), [])
  const today = useToday()
  const isDesktop = useIsDesktop()
  const [screen, setScreen] = useState('activity')

  if (!activities || !settings) {
    return <GlassCard><p className="text-sm text-text-muted">Memuat…</p></GlassCard>
  }
  const factor = srpeToTrimpFactor(activities)
  const common = { activities, settings, today, factor }
  const activityScreen = <ActivityScreen {...common} onPickCategory={onPickCategory} onOpenManual={onOpenManual} onGoUpload={onGoUpload} />

  if (isDesktop) {
    return (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-3 items-start gap-4">
          {activityScreen}
          <SummaryScreen {...common} />
          <LoadScreen {...common} />
        </div>
        <AnalysisSection {...common} />
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      <PillTabs tabs={SCREENS} value={screen} onChange={setScreen} label="Pilih layar" />
      {screen === 'activity' && activityScreen}
      {screen === 'summary' && <SummaryScreen {...common} />}
      {screen === 'load' && <LoadScreen {...common} />}
      {screen === 'analysis' && <AnalysisSection {...common} />}
    </div>
  )
}
