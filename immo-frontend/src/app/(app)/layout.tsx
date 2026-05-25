import { AuthGuard } from '@/components/guard'
import { Sidebar } from '@/components/sidebar'
import { MobileNav } from '@/components/mobile-nav'
import { EnziChat } from '@/components/enzi-chat'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden">
        {/* Sidebar: nur Desktop */}
        <div className="hidden md:block shrink-0">
          <Sidebar />
        </div>
        {/* Hauptinhalt – auf Mobile extra Padding unten für Bottom-Nav */}
        <main className="flex-1 overflow-y-auto p-3 md:p-6 pb-20 md:pb-6">
          {children}
        </main>
        <EnziChat />
        {/* Bottom-Navigation: nur Mobile */}
        <MobileNav />
      </div>
    </AuthGuard>
  )
}
