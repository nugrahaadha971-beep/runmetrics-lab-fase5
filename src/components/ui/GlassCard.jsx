export default function GlassCard({ as: Tag = 'section', className = '', children, ...rest }) {
  return (
    <Tag
      className={`rounded-card border border-surface-border bg-surface p-4 backdrop-blur-md ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  )
}
