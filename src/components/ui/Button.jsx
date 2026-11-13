const base =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full px-5 text-sm font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-50'
const variants = {
  primary: 'bg-accent font-semibold text-bg-from', // teks navy: putih di atas koral tidak lolos kontras AA
  secondary: 'border border-surface-border bg-surface text-text-main',
  ghost: 'text-text-muted',
}

export default function Button({ variant = 'primary', className = '', type = 'button', ...rest }) {
  return <button type={type} className={`${base} ${variants[variant]} ${className}`} {...rest} />
}
