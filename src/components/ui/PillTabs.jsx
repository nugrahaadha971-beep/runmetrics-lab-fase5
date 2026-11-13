export default function PillTabs({ tabs, value, onChange, label = 'Pilih periode' }) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 rounded-full bg-surface p-1">
      {tabs.map((t) => {
        const active = t.id === value
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={`min-h-[44px] flex-1 rounded-full px-3 text-sm font-medium transition-colors motion-reduce:transition-none ${
              active ? 'bg-accent font-semibold text-bg-from' : 'text-text-muted'
            }`}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
