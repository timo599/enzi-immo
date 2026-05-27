'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Building2, FileText, Users, MoreHorizontal,
  Home, Receipt, CreditCard, TrendingUp, FolderOpen, Brain,
  Settings, Briefcase, X, List, CalendarClock, Wrench,
  ClipboardCheck, Vault, ShieldCheck, KeyRound, CheckSquare, HardHat, BookOpen, GraduationCap,
} from 'lucide-react'
import { useState } from 'react'

const PRIMARY_NAV = [
  { href: '/dashboard',     label: 'Dashboard',   icon: LayoutDashboard },
  { href: '/objekte',       label: 'Objekte',      icon: Building2 },
  { href: '/mietvertraege', label: 'Verträge',     icon: FileText },
  { href: '/mieter',        label: 'Mieter',       icon: Users },
]

const MORE_NAV = [
  { href: '/firmen',          label: 'Firmen',          icon: Briefcase },
  { href: '/einheiten',       label: 'Einheiten',        icon: Home },
  { href: '/dokumente',       label: 'Dokumente',        icon: FolderOpen },
  { href: '/abrechnungen',    label: 'NK-Abrechnungen',  icon: Receipt },
  { href: '/kontoauszuege',   label: 'Kontoauszüge',     icon: CreditCard },
  { href: '/mieterhoehungen', label: 'Mieterhöhungen',   icon: TrendingUp },
  { href: '/mieterliste',     label: 'Mieterliste',       icon: List },
  { href: '/fristen',         label: 'Fristen',           icon: CalendarClock },
  { href: '/reparaturen',     label: 'Reparaturen',       icon: Wrench },
  { href: '/wartung',         label: 'Wartungsplan',      icon: ShieldCheck },
  { href: '/uebergabe',       label: 'Übergaben',         icon: ClipboardCheck },
  { href: '/kaution',         label: 'Kautionen',         icon: Vault },
  { href: '/vpi',             label: 'VPI-Rechner',       icon: TrendingUp },
  { href: '/portal',          label: 'Mieter-Portal',     icon: KeyRound },
  { href: '/todos',           label: 'Aufgaben',           icon: CheckSquare },
  { href: '/baustellen',      label: 'Baustellen',         icon: HardHat },
  { href: '/leitfaden',       label: 'Leitfaden',          icon: BookOpen },
  { href: '/einarbeitung',    label: 'Einarbeitung',       icon: GraduationCap },
  { href: '/lernmodus',       label: 'Lernmodus',         icon: Brain },
  { href: '/einstellungen',   label: 'Einstellungen',     icon: Settings },
]

export function MobileNav() {
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)

  const isMoreActive = MORE_NAV.some(n => pathname.startsWith(n.href))

  return (
    <>
      {/* Bottom Nav Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-border md:hidden">
        <div className="flex items-center justify-around h-16 px-2 safe-area-pb">
          {PRIMARY_NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all min-w-0',
                  active ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <Icon className={cn('h-5 w-5 shrink-0', active && 'stroke-[2.5]')} />
                <span className="text-[10px] font-medium leading-tight truncate">{label}</span>
              </Link>
            )
          })}
          {/* More button */}
          <button
            onClick={() => setMoreOpen(true)}
            className={cn(
              'flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all',
              isMoreActive ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            <MoreHorizontal className="h-5 w-5 shrink-0" />
            <span className="text-[10px] font-medium leading-tight">Mehr</span>
          </button>
        </div>
      </nav>

      {/* More Drawer */}
      {moreOpen && (
        <div className="fixed inset-0 z-[60] md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setMoreOpen(false)}
          />
          {/* Sheet */}
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl">
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <span className="text-sm font-semibold text-foreground">Alle Bereiche</span>
              <button
                onClick={() => setMoreOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1 px-3 pb-6 pt-2 safe-area-pb">
              {MORE_NAV.map(({ href, label, icon: Icon }) => {
                const active = pathname.startsWith(href)
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      'flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all',
                      active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent'
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span className="text-[10px] font-medium text-center leading-tight">{label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
