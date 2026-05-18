import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface StatCardProps {
  title: string
  value: string | number
  sub?: string
  color?: 'default' | 'green' | 'red' | 'yellow'
  icon?: React.ReactNode
}

export function StatCard({ title, value, sub, color = 'default', icon }: StatCardProps) {
  const colors = {
    default: 'text-slate-900',
    green:   'text-green-600',
    red:     'text-red-600',
    yellow:  'text-yellow-600',
  }

  return (
    <Card>
      <CardContent className="pt-5 pb-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{title}</p>
            <p className={cn('mt-1 text-2xl font-bold', colors[color])}>{value}</p>
            {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
          </div>
          {icon && <div className="text-slate-300">{icon}</div>}
        </div>
      </CardContent>
    </Card>
  )
}
