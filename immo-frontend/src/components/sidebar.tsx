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
    <aside className="flex h-screen w-60 flex-col border-r bg-slate-950 text-slate-100">
      {/* Logo */}
      <div className="flex items-center gap-2 px-5 py-5 border-b border-slate-800">
        <Building2 className="h-6 w-6 text-blue-400" />
        <span className="font-semibold text-sm">Enzi&apos;s Immobilienverwaltung</span>
      </div>

      {/* Quick Search */}
      <div className="px-3 pt-3 pb-1">
        <QuickSearch />
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{label}</span>
              {active && <ChevronRight className="ml-auto h-3 w-3" />}
            </Link>
          )
        })}
      </nav>

      {/* User + Logout */}
      <div className="border-t border-slate-800 p-4">
        <div className="text-xs text-slate-400 mb-1 truncate">{user?.email ?? ''}</div>
        <button
          onClick={logout}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-red-400 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Abmelden
        </button>
      </div>
    </aside>
  )
}
