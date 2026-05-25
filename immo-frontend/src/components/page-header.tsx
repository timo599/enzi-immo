interface PageHeaderProps {
  title: string
  description?: string
  action?: React.ReactNode
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="mb-4 md:mb-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-semibold text-slate-900 leading-tight">{title}</h1>
          {description && (
            <p className="text-xs md:text-sm text-slate-500 mt-0.5">{description}</p>
          )}
        </div>
        {/* Desktop: Action rechts neben Titel */}
        {action && (
          <div className="hidden md:flex shrink-0 items-center gap-2">{action}</div>
        )}
      </div>
      {/* Mobile: Action volle Breite unter Titel */}
      {action && (
        <div className="flex flex-wrap gap-2 mt-3 md:hidden [&>*]:flex-1 [&>*]:min-w-[120px]">
          {action}
        </div>
      )}
    </div>
  )
}
