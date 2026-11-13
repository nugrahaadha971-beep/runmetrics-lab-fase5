// Warna lewat CSS variable (tanpa heksadesimal). Warna tick, garis, dan kurva diatur di index.css.
export const tooltipProps = {
  contentStyle: {
    background: 'var(--bg-from)', border: '1px solid var(--surface-border)', borderRadius: 12, color: 'var(--text-main)',
  },
  labelStyle: { color: 'var(--text-muted)' },
  itemStyle: { color: 'var(--text-main)' },
}
export const axisProps = { tickLine: false, axisLine: false, tick: { fontSize: 11 } }
