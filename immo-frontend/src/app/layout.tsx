import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/providers'

const geist = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })

export const metadata: Metadata = {
  title: "Enzi's Immobilienverwaltung",
  description: "Enzi's Immobilienverwaltung — KI-gestützte Hausverwaltung",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={`${geist.variable} h-full antialiased`}>
      <body className="h-full bg-slate-50">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
