'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { isLoggedIn } from '@/lib/auth'

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [ok, setOk] = useState(false)

  useEffect(() => {
    if (!isLoggedIn()) {
      router.replace('/login')
    } else {
      setOk(true)
    }
  }, [router])

  if (!ok) return null
  return <>{children}</>
}
