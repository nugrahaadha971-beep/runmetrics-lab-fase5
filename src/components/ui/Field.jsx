export const inputClass =
  'w-full min-h-[44px] rounded-xl border border-surface-border bg-surface px-3 text-text-main placeholder:text-text-muted'

/** children = fungsi yang menerima props input (id, aria-*, className). Pesan error selalu berupa teks. */
export default function Field({ id, label, error, hint, children }) {
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm text-text-main">{label}</label>
      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
        className: `${inputClass} ${error ? 'border-accent-pink' : ''}`,
      })}
      {error ? (
        <p id={`${id}-err`} className="text-sm text-accent-pink">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-text-muted">{hint}</p>
      ) : null}
    </div>
  )
}
