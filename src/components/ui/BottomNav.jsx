export default function BottomNav({ items, active, onChange }) {
  return (
    <nav
      aria-label="Navigasi utama"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-surface-border bg-bg-from/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:inset-y-0 lg:right-auto lg:w-20 lg:border-r lg:border-t-0 lg:pb-0 lg:pt-6"
    >
      <ul className="mx-auto flex max-w-[480px] justify-around lg:max-w-none lg:flex-col lg:items-center lg:gap-2">
        {items.map(({ id, label, icon: Icon }) => {
          const on = id === active
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onChange(id)}
                aria-current={on ? 'page' : undefined}
                className={`flex min-h-[56px] min-w-[64px] flex-col items-center justify-center gap-0.5 px-2 text-xs ${
                  on ? 'text-accent-cyan' : 'text-text-muted'
                }`}
              >
                <Icon size={24} strokeWidth={1.75} aria-hidden="true" />
                <span>{label}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
