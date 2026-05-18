import { AuthGuard } from '@/components/guard'
import { Sidebar } from '@/components/sidebar'
import { EnziChat } from '@/components/enzi-chat'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
        <EnziChat />
      </div>
    </AuthGuard>
  )
}
