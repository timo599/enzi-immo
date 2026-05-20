'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { clearAuth, getUser } from '@/lib/auth'
import {
  LayoutDashboard,
  Building2,
  Briefcase,
  Home,
  Users,
  FileText,
  FolderOpen,
  CreditCard,
  TrendingUp,
  Receipt,
  LogOut,
  ChevronRight,
} from 'lucide-react'
import { QuickSearch } from './quick-search'

const NAV = [
  { href: '/dashboard',       label: 'Dashboard',       icon: LayoutDashboard },
  { href: '/firmen',          label: 'Firmen',           icon: Briefcase },
  { href: '/objekte',         label: 'Objekte',          icon: Building2 },
  { href: '/einheiten',       label: 'Einheiten',        icon: Home },
  { href: '/mieter',          label: 'Mieter',           icon: Users },
  { href: '/mietvertraege',   label: 'Mietverträge',     icon: FileText },
  { href: '/dokumente',       label: 'Dokumente',        icon: FolderOpen },
  { href: '/abrechnungen',    label: 'NK-Abrechnungen',  icon: Receipt },
  { href: '/kontoauszuege',   label: 'Kontoauszüge',     icon: CreditCard },
  { href: '/mieterhoehungen', label: 'Mieterhöhungen',   icon: TrendingUp },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const user = getUser()

  function logout() {
    clearAuth()
    router.push('/login')
  }

  return (
    <aside className="flex h-screen w-60 flex-col border-r bg-sidebar text-sidebar-foreground border-border">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-[18px] border-b border-border">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary shadow-sm">
          <Building2 className="h-4 w-4 text-white" />
        </div>
        <span className="font-semibold text-[13px] tracking-tight">Enzi&apos;s Immobilienverwaltung</span>
      </div>

      {/* Quick Search */}
      <div className="px-3 pt-3 pb-1">
        <QuickSearch />
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-[7px] text-[13px] font-medium transition-all duration-150',
                active
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <Icon className="h-[15px] w-[15px] shrink-0" />
              <span>{label}</span>
              {active && <ChevronRight className="ml-auto h-3 w-3 opacity-70" />}
            </Link>
          )
        })}
      </nav>

      {/* User + Logout */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-accent transition-colors group">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-semibold shrink-0">
            {(user?.email ?? 'U').charAt(0).toUpperCase()}
          </div>
          <span className="text-xs text-muted-foreground truncate flex-1">{user?.email ?? ''}</span>
          <button onClick={logout} title="Abmelden">
            <LogOut className="h-3.5 w-3.5 text-muted-foreground group-hover:text-destructive transition-colors" />
          </button>
        </div>
      </div>
    </aside>
  )
}
